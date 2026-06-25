import { api } from '@/lib/api';

// v1.98 (PMIS R2 — project profiles): typed client for the profile admin screen,
// the project-create picker, and the per-project profile tab.

export type ProfileKind = 'BUILTIN' | 'CUSTOM';
export type ProfileOwnerScope = 'SYSTEM' | 'TEAM';
export type ProfileStatus = 'DRAFT' | 'PUBLISHED' | 'DEPRECATED';

export interface ModuleDef {
  key: string;
  label: string;
  wave: 'B' | 'C';
  dependsOn: string[];
  managePermission: string | null;
}

export interface ProfileModuleSetting {
  moduleKey: string;
  enabled: boolean;
  requiredFields: string[];
  defaults: Record<string, unknown>;
  config: Record<string, unknown>;
}

export interface Profile {
  id: string;
  key: string;
  name: string;
  kind: ProfileKind;
  ownerScope: ProfileOwnerScope;
  teamId: string | null;
  version: number;
  status: ProfileStatus;
  basedOnProfileId: string | null;
  createdAt: string;
  updatedAt: string;
  modules: ProfileModuleSetting[];
}

export interface ModuleEffectiveConfig {
  enabled: boolean;
  requiredFields: string[];
  defaults: Record<string, unknown>;
  config: Record<string, unknown>;
}

export interface EffectiveConfig {
  profileId: string | null;
  profileName: string | null;
  profileVersion: number | null;
  modules: Record<string, ModuleEffectiveConfig>;
}

export interface ProjectProfile {
  profileId: string | null;
  profileName: string | null;
  profileVersion: number | null;
  overrides: Record<string, Partial<ModuleEffectiveConfig>>;
}

export interface ModuleSettingInput {
  moduleKey: string;
  enabled: boolean;
  requiredFields?: string[];
  defaults?: Record<string, unknown>;
  config?: Record<string, unknown>;
}

// ── system (auth-less, code-bound) ───────────────────────────────────────────
export async function listModules(): Promise<ModuleDef[]> {
  return (await api.get<{ modules: ModuleDef[] }>('/system/modules')).data.modules;
}

export async function listSystemProfiles(): Promise<Profile[]> {
  return (await api.get<{ items: Profile[] }>('/system/profiles')).data.items;
}

// ── team profile CRUD ────────────────────────────────────────────────────────
export async function listTeamProfiles(teamId: string): Promise<Profile[]> {
  return (await api.get<{ items: Profile[] }>(`/teams/${teamId}/profiles`)).data.items;
}

export async function getProfile(teamId: string, profileId: string): Promise<Profile> {
  return (await api.get<Profile>(`/teams/${teamId}/profiles/${profileId}`)).data;
}

export async function createProfile(
  teamId: string,
  input: { name: string; key: string; basedOnProfileId?: string; modules?: ModuleSettingInput[] },
): Promise<Profile> {
  return (await api.post<Profile>(`/teams/${teamId}/profiles`, input)).data;
}

export async function updateProfile(
  teamId: string,
  profileId: string,
  input: { name?: string; modules?: ModuleSettingInput[] },
): Promise<Profile> {
  return (await api.put<Profile>(`/teams/${teamId}/profiles/${profileId}`, input)).data;
}

export async function publishProfile(teamId: string, profileId: string): Promise<Profile> {
  return (await api.post<Profile>(`/teams/${teamId}/profiles/${profileId}/publish`, {})).data;
}

export async function deprecateProfile(teamId: string, profileId: string): Promise<Profile> {
  return (await api.post<Profile>(`/teams/${teamId}/profiles/${profileId}/deprecate`, {})).data;
}

// ── defaulting carriers ──────────────────────────────────────────────────────
export async function setTeamDefaultProfile(teamId: string, profileId: string): Promise<void> {
  await api.put(`/teams/${teamId}/defaults/profile`, { profileId });
}

export async function setGroupDefaultProfile(
  teamId: string,
  groupId: string,
  profileId: string | null,
): Promise<void> {
  await api.put(`/teams/${teamId}/groups/${groupId}/default-profile`, { profileId });
}

// ── per-project ───────────────────────────────────────────────────────────────
export async function getProjectProfile(teamId: string, projectId: string): Promise<ProjectProfile> {
  return (await api.get<ProjectProfile>(`/teams/${teamId}/projects/${projectId}/profile`)).data;
}

export async function assignProjectProfile(
  teamId: string,
  projectId: string,
  profileId: string,
): Promise<ProjectProfile> {
  return (
    await api.put<ProjectProfile>(`/teams/${teamId}/projects/${projectId}/profile`, { profileId })
  ).data;
}

export async function setProjectOverrides(
  teamId: string,
  projectId: string,
  overrides: Record<string, Partial<ModuleEffectiveConfig>>,
): Promise<ProjectProfile> {
  return (
    await api.put<ProjectProfile>(`/teams/${teamId}/projects/${projectId}/profile/overrides`, {
      overrides,
    })
  ).data;
}

export async function getEffectiveConfig(
  teamId: string,
  projectId: string,
): Promise<EffectiveConfig> {
  return (
    await api.get<EffectiveConfig>(`/teams/${teamId}/projects/${projectId}/effective-config`)
  ).data;
}
