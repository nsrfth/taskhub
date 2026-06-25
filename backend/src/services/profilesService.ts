import { Prisma, type ProfileStatus } from '@prisma/client';
import { prisma } from '../data/prisma.js';
import { Errors } from '../lib/errors.js';
import {
  MODULE_KEYS,
  MODULE_REGISTRY,
  isModuleKey,
  type ModuleKey,
} from '../lib/moduleRegistry.js';
import {
  NEUTRAL_PROFILE_ID,
  computeEffectiveModules,
  type EffectiveModules,
  type RawModuleSetting,
} from '../lib/profiles.js';
import type {
  CreateProfileBody,
  ModuleSettingInput,
  ProjectOverridesBody,
  UpdateProfileBody,
} from '../schemas/profiles.js';
import { logActivity } from './activityLogger.js';

export interface ProfileModuleSettingView {
  moduleKey: string;
  enabled: boolean;
  requiredFields: string[];
  defaults: Record<string, unknown>;
  config: Record<string, unknown>;
}

export interface ProfileView {
  id: string;
  key: string;
  name: string;
  kind: 'BUILTIN' | 'CUSTOM';
  ownerScope: 'SYSTEM' | 'TEAM';
  teamId: string | null;
  version: number;
  status: ProfileStatus;
  basedOnProfileId: string | null;
  createdAt: string;
  updatedAt: string;
  modules: ProfileModuleSettingView[];
}

export interface EffectiveConfigView {
  profileId: string | null;
  profileName: string | null;
  profileVersion: number | null;
  modules: EffectiveModules;
}

export interface ProjectProfileView {
  profileId: string | null;
  profileName: string | null;
  profileVersion: number | null;
  overrides: Record<string, RawModuleSetting | Record<string, unknown>>;
}

const PROFILE_INCLUDE = {
  moduleSettings: { orderBy: { moduleKey: 'asc' as const } },
} as const;

type ProfileRow = Prisma.ProjectProfileGetPayload<{ include: typeof PROFILE_INCLUDE }>;

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}
function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function toSettingView(s: ProfileRow['moduleSettings'][number]): ProfileModuleSettingView {
  return {
    moduleKey: s.moduleKey,
    enabled: s.enabled,
    requiredFields: asStringArray(s.requiredFields),
    defaults: asObject(s.defaults),
    config: asObject(s.config),
  };
}

function toProfileView(row: ProfileRow): ProfileView {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    kind: row.kind,
    ownerScope: row.ownerScope,
    teamId: row.teamId,
    version: row.version,
    status: row.status,
    basedOnProfileId: row.basedOnProfileId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    modules: row.moduleSettings
      .filter((s) => isModuleKey(s.moduleKey))
      .map(toSettingView),
  };
}

// Build the nested-create payload for a profile's module settings from a list
// of (validated) inputs, de-duped by moduleKey (last wins). Only known module
// keys survive.
function settingsCreateData(inputs: readonly ModuleSettingInput[]) {
  const byKey = new Map<ModuleKey, ModuleSettingInput>();
  for (const s of inputs) {
    if (isModuleKey(s.moduleKey)) byKey.set(s.moduleKey, s);
  }
  return [...byKey.values()].map((s) => ({
    moduleKey: s.moduleKey,
    enabled: s.enabled,
    requiredFields: s.requiredFields as unknown as Prisma.InputJsonValue,
    defaults: s.defaults as unknown as Prisma.InputJsonValue,
    config: s.config as unknown as Prisma.InputJsonValue,
  }));
}

// v1.98 (PMIS R2 — project profiles): profile definitions + the effective-config
// resolver + the per-project assign/override flow. The route layer enforces the
// pmo.* permissions; this layer re-asserts the team/project/profile chain so a
// cross-tenant id returns an existence-hiding 404 (never a 403 leak), mirroring
// the baselines service.
export class ProfilesService {
  // ── lookups / guards ───────────────────────────────────────────────────────
  private async assertProjectInTeam(teamId: string, projectId: string): Promise<void> {
    const p = await prisma.project.findUnique({
      where: { id: projectId },
      select: { teamId: true },
    });
    if (!p || p.teamId !== teamId) throw Errors.notFound('Project not found');
  }

  // A profile a team may *use* (assign / default to): its own, or any SYSTEM
  // built-in. Cross-team profiles are hidden (404).
  private async getUsableProfile(teamId: string, profileId: string): Promise<ProfileRow> {
    const row = await prisma.projectProfile.findUnique({
      where: { id: profileId },
      include: PROFILE_INCLUDE,
    });
    if (!row) throw Errors.notFound('Profile not found');
    if (row.ownerScope === 'TEAM' && row.teamId !== teamId) {
      throw Errors.notFound('Profile not found');
    }
    return row;
  }

  // A profile a team may *mutate* (edit / publish / deprecate): only its own
  // TEAM-scoped rows. A system id (or another team's) is hidden (404).
  private async getTeamOwnedProfile(teamId: string, profileId: string): Promise<ProfileRow> {
    const row = await prisma.projectProfile.findUnique({
      where: { id: profileId },
      include: PROFILE_INCLUDE,
    });
    if (!row || row.ownerScope !== 'TEAM' || row.teamId !== teamId) {
      throw Errors.notFound('Profile not found');
    }
    return row;
  }

  // ── reads ────────────────────────────────────────────────────────────────
  async listSystemProfiles(): Promise<ProfileView[]> {
    const rows = await prisma.projectProfile.findMany({
      where: { ownerScope: 'SYSTEM' },
      orderBy: { key: 'asc' },
      include: PROFILE_INCLUDE,
    });
    return rows.map(toProfileView);
  }

  async listTeamProfiles(teamId: string): Promise<ProfileView[]> {
    const rows = await prisma.projectProfile.findMany({
      where: { ownerScope: 'TEAM', teamId },
      orderBy: { createdAt: 'desc' },
      include: PROFILE_INCLUDE,
    });
    return rows.map(toProfileView);
  }

  async getProfile(teamId: string, profileId: string): Promise<ProfileView> {
    return toProfileView(await this.getUsableProfile(teamId, profileId));
  }

  // ── profile mutations ──────────────────────────────────────────────────────
  async createProfile(
    teamId: string,
    actorId: string,
    input: CreateProfileBody,
  ): Promise<ProfileView> {
    // Clone the base profile's settings (if any), then layer the supplied ones.
    let baseVersion = 0;
    let clonedSettings: ModuleSettingInput[] = [];
    if (input.basedOnProfileId) {
      const base = await this.getUsableProfile(teamId, input.basedOnProfileId);
      baseVersion = base.version;
      clonedSettings = base.moduleSettings
        .filter((s) => isModuleKey(s.moduleKey))
        .map((s) => ({
          moduleKey: s.moduleKey,
          enabled: s.enabled,
          requiredFields: asStringArray(s.requiredFields),
          defaults: asObject(s.defaults),
          config: asObject(s.config),
        }));
    }
    const merged = [...clonedSettings, ...(input.modules ?? [])];

    try {
      const row = await prisma.$transaction(async (tx) => {
        const created = await tx.projectProfile.create({
          data: {
            key: input.key,
            name: input.name,
            kind: 'CUSTOM',
            ownerScope: 'TEAM',
            teamId,
            version: baseVersion + 1,
            status: 'DRAFT',
            basedOnProfileId: input.basedOnProfileId ?? null,
            createdById: actorId,
            moduleSettings: { create: settingsCreateData(merged) },
          },
          include: PROFILE_INCLUDE,
        });
        await logActivity(tx, {
          teamId,
          actorId,
          action: 'profile.created',
          meta: { profileId: created.id, key: created.key },
        });
        return created;
      });
      return toProfileView(row);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw Errors.conflict('A profile with this key already exists in this team');
      }
      throw err;
    }
  }

  async updateProfile(
    teamId: string,
    profileId: string,
    actorId: string,
    input: UpdateProfileBody,
  ): Promise<ProfileView> {
    const existing = await this.getTeamOwnedProfile(teamId, profileId);
    if (existing.status !== 'DRAFT') {
      throw Errors.conflict('Only draft profiles can be edited; clone it to make changes');
    }
    const row = await prisma.$transaction(async (tx) => {
      if (input.modules !== undefined) {
        await tx.profileModuleSetting.deleteMany({ where: { profileId } });
      }
      await tx.projectProfile.update({
        where: { id: profileId },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.modules !== undefined && {
            moduleSettings: { create: settingsCreateData(input.modules) },
          }),
        },
      });
      return tx.projectProfile.findUniqueOrThrow({
        where: { id: profileId },
        include: PROFILE_INCLUDE,
      });
    });
    return toProfileView(row);
  }

  async publishProfile(teamId: string, profileId: string, actorId: string): Promise<ProfileView> {
    const existing = await this.getTeamOwnedProfile(teamId, profileId);
    if (existing.status !== 'DRAFT') {
      throw Errors.conflict('Only draft profiles can be published');
    }
    const row = await prisma.projectProfile.update({
      where: { id: profileId },
      data: { status: 'PUBLISHED' },
      include: PROFILE_INCLUDE,
    });
    await logActivity(prisma, {
      teamId,
      actorId,
      action: 'profile.published',
      meta: { profileId, key: row.key, version: row.version },
    });
    return toProfileView(row);
  }

  async deprecateProfile(teamId: string, profileId: string, actorId: string): Promise<ProfileView> {
    const existing = await this.getTeamOwnedProfile(teamId, profileId);
    if (existing.status !== 'PUBLISHED') {
      throw Errors.conflict('Only published profiles can be deprecated');
    }
    const row = await prisma.projectProfile.update({
      where: { id: profileId },
      data: { status: 'DEPRECATED' },
      include: PROFILE_INCLUDE,
    });
    await logActivity(prisma, {
      teamId,
      actorId,
      action: 'profile.deprecated',
      meta: { profileId, key: row.key },
    });
    return toProfileView(row);
  }

  // ── defaulting carriers ──────────────────────────────────────────────────
  async setTeamDefault(teamId: string, profileId: string, actorId: string): Promise<void> {
    const profile = await this.getUsableProfile(teamId, profileId);
    if (profile.status !== 'PUBLISHED') {
      throw Errors.badRequest('A team default must be a published profile');
    }
    await prisma.team.update({ where: { id: teamId }, data: { defaultProfileId: profileId } });
    await logActivity(prisma, {
      teamId,
      actorId,
      action: 'profile.team_default_set',
      meta: { profileId },
    });
  }

  async setGroupDefault(
    teamId: string,
    groupId: string,
    profileId: string | null,
    actorId: string,
  ): Promise<void> {
    const group = await prisma.userGroup.findUnique({
      where: { id: groupId },
      select: { teamId: true },
    });
    if (!group || group.teamId !== teamId) throw Errors.notFound('Group not found');
    if (profileId !== null) {
      const profile = await this.getUsableProfile(teamId, profileId);
      if (profile.status !== 'PUBLISHED') {
        throw Errors.badRequest('A group default must be a published profile');
      }
    }
    await prisma.userGroup.update({ where: { id: groupId }, data: { defaultProfileId: profileId } });
    await logActivity(prisma, {
      teamId,
      actorId,
      action: 'profile.group_default_set',
      meta: { groupId, profileId },
    });
  }

  // ── per-project assignment + overrides ──────────────────────────────────────
  async assignProjectProfile(
    teamId: string,
    projectId: string,
    profileId: string,
    actorId: string,
  ): Promise<ProjectProfileView> {
    await this.assertProjectInTeam(teamId, projectId);
    const profile = await this.getUsableProfile(teamId, profileId);
    if (profile.status === 'DRAFT') {
      throw Errors.badRequest('Cannot assign a draft profile to a project');
    }
    // Snapshot profileId + the version it is at NOW, and clear any overrides
    // (they were relative to the previous profile's modules).
    await prisma.project.update({
      where: { id: projectId },
      data: {
        profileId: profile.id,
        profileVersion: profile.version,
        profileOverrides: Prisma.DbNull,
      },
    });
    await logActivity(prisma, {
      teamId,
      actorId,
      action: 'profile.assigned',
      meta: { projectId, profileId, profileVersion: profile.version },
    });
    return this.getProjectProfile(teamId, projectId);
  }

  async setProjectOverrides(
    teamId: string,
    projectId: string,
    overrides: ProjectOverridesBody['overrides'],
    actorId: string,
  ): Promise<ProjectProfileView> {
    await this.assertProjectInTeam(teamId, projectId);
    await prisma.project.update({
      where: { id: projectId },
      data: { profileOverrides: overrides as unknown as Prisma.InputJsonValue },
    });
    await logActivity(prisma, {
      teamId,
      actorId,
      action: 'profile.overrides_set',
      meta: { projectId, moduleKeys: Object.keys(overrides) },
    });
    return this.getProjectProfile(teamId, projectId);
  }

  async getProjectProfile(teamId: string, projectId: string): Promise<ProjectProfileView> {
    await this.assertProjectInTeam(teamId, projectId);
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: {
        profileId: true,
        profileVersion: true,
        profileOverrides: true,
        profile: { select: { name: true } },
      },
    });
    return {
      profileId: project.profileId,
      profileName: project.profile?.name ?? null,
      profileVersion: project.profileVersion,
      overrides: asObject(project.profileOverrides) as ProjectProfileView['overrides'],
    };
  }

  // ── effective-config (the hot path every Wave-B module route calls) ─────────
  async getEffectiveConfig(teamId: string, projectId: string): Promise<EffectiveConfigView> {
    await this.assertProjectInTeam(teamId, projectId);
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { profileId: true, profileVersion: true, profileOverrides: true },
    });

    if (!project.profileId) {
      // No profile pinned (shouldn't happen post-backfill) → everything off.
      return {
        profileId: null,
        profileName: null,
        profileVersion: null,
        modules: computeEffectiveModules([], null),
      };
    }

    const profile = await prisma.projectProfile.findUnique({
      where: { id: project.profileId },
      include: PROFILE_INCLUDE,
    });
    const baseSettings: RawModuleSetting[] = (profile?.moduleSettings ?? []).map((s) => ({
      moduleKey: s.moduleKey,
      enabled: s.enabled,
      requiredFields: s.requiredFields,
      defaults: s.defaults,
      config: s.config,
    }));
    const overrides = asObject(project.profileOverrides) as Record<string, RawModuleSetting>;

    return {
      profileId: project.profileId,
      profileName: profile?.name ?? null,
      profileVersion: project.profileVersion ?? profile?.version ?? null,
      modules: computeEffectiveModules(baseSettings, overrides),
    };
  }

  // Convenience for the requireModule middleware: is one module enabled?
  async isModuleEnabled(teamId: string, projectId: string, moduleKey: ModuleKey): Promise<boolean> {
    const cfg = await this.getEffectiveConfig(teamId, projectId);
    return cfg.modules[moduleKey]?.enabled ?? false;
  }

  // ── snapshot-at-create resolution (group ▸ team ▸ system NEUTRAL) ───────────
  // Called by projectsService.create. `requestedProfileId` (the create picker's
  // choice) wins when valid; otherwise the team default; otherwise NEUTRAL.
  // Returns the id + version to pin onto the new project, or null if nothing
  // resolves (the project still creates — effective-config then reads all-off).
  async resolveBaseProfileForCreate(
    teamId: string,
    requestedProfileId?: string | null,
  ): Promise<{ profileId: string; profileVersion: number } | null> {
    const usePublished = async (id: string): Promise<{ profileId: string; profileVersion: number } | null> => {
      const p = await prisma.projectProfile.findUnique({
        where: { id },
        select: { id: true, version: true, status: true, ownerScope: true, teamId: true },
      });
      if (!p) return null;
      if (p.ownerScope === 'TEAM' && p.teamId !== teamId) return null;
      if (p.status !== 'PUBLISHED') return null;
      return { profileId: p.id, profileVersion: p.version };
    };

    if (requestedProfileId) {
      const r = await usePublished(requestedProfileId);
      if (r) return r;
      throw Errors.badRequest('Requested profile is not available for this team');
    }

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { defaultProfileId: true },
    });
    if (team?.defaultProfileId) {
      const r = await usePublished(team.defaultProfileId);
      if (r) return r;
    }

    return usePublished(NEUTRAL_PROFILE_ID);
  }
}

// Re-export the module registry as the source of the /api/system/modules feed.
export function listModuleDefs() {
  return MODULE_KEYS.map((k) => {
    const def = MODULE_REGISTRY[k];
    return {
      key: def.key,
      label: def.label,
      wave: def.wave,
      dependsOn: [...def.dependsOn],
      managePermission: def.managePermission ?? null,
    };
  });
}
