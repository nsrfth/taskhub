import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ProfilesService } from '../services/profilesService.js';
import { ProfilesController } from '../controllers/profilesController.js';
import { requireAuth, requireTeamRole, requireTeamRoleOrGrantedProject } from '../middleware/auth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { requireProjectAccess } from '../middleware/requireProjectAccess.js';
import { requireScope } from '../middleware/requireScope.js';
import {
  assignProjectProfileBody,
  createProfileBody,
  effectiveConfigResponse,
  profileListResponse,
  profileResponse,
  projectOverridesBody,
  projectProfileResponse,
  setGroupDefaultBody,
  setTeamDefaultBody,
  updateProfileBody,
} from '../schemas/profiles.js';

const teamParams = z.object({ teamId: z.string() });
const profileParams = z.object({ teamId: z.string(), profileId: z.string() });
const groupParams = z.object({ teamId: z.string(), groupId: z.string() });
const projectParams = z.object({ teamId: z.string(), projectId: z.string() });
const profileIdAck = z.object({ profileId: z.string().nullable() });

// v1.98 (PMIS R2 — project profiles). Five registrars, mounted at distinct
// nestings in app.ts:
//   /teams/:teamId/profiles                — PMO profile CRUD + publish/deprecate
//   /teams/:teamId/defaults                — PUT /profile (team default)
//   /teams/:teamId/groups/:groupId/default-profile — PUT / (group default)
//   /teams/:teamId/projects/:projectId/profile      — PUT / (assign), PUT /overrides, GET /
//   /teams/:teamId/projects/:projectId/effective-config — GET / (the hot path)
//
// Profile gating is ADDITIVE to RBAC: these endpoints manage the toggles, the
// toggles can only HIDE a capability a role already grants (via requireModule).

// ── /teams/:teamId/profiles ──────────────────────────────────────────────────
export async function teamProfilesRoutes(app: FastifyInstance): Promise<void> {
  const ctrl = new ProfilesController(new ProfilesService());
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.addHook('preHandler', requireAuth);
  r.addHook('preHandler', requireTeamRole('MEMBER', 'MANAGER'));

  const manage = [requirePermission('pmo.manage_profiles'), requireScope('admin')];

  r.get('/', {
    preHandler: manage,
    schema: {
      tags: ['profiles'],
      summary: 'List this team\'s project profiles',
      params: teamParams,
      response: { 200: profileListResponse },
      security: [{ bearerAuth: [] }],
    },
    handler: ctrl.list,
  });

  r.post('/', {
    preHandler: manage,
    schema: {
      tags: ['profiles'],
      summary: 'Create a draft project profile (optionally cloned from another)',
      params: teamParams,
      body: createProfileBody,
      response: { 201: profileResponse },
      security: [{ bearerAuth: [] }],
    },
    handler: ctrl.create,
  });

  r.get('/:profileId', {
    preHandler: manage,
    schema: {
      tags: ['profiles'],
      summary: 'Get a profile (this team\'s or a system built-in)',
      params: profileParams,
      response: { 200: profileResponse },
      security: [{ bearerAuth: [] }],
    },
    handler: ctrl.get,
  });

  r.put('/:profileId', {
    preHandler: manage,
    schema: {
      tags: ['profiles'],
      summary: 'Update a draft profile (name + module settings)',
      params: profileParams,
      body: updateProfileBody,
      response: { 200: profileResponse },
      security: [{ bearerAuth: [] }],
    },
    handler: ctrl.update,
  });

  r.post('/:profileId/publish', {
    preHandler: manage,
    schema: {
      tags: ['profiles'],
      summary: 'Publish a draft profile (makes it assignable + immutable)',
      params: profileParams,
      response: { 200: profileResponse },
      security: [{ bearerAuth: [] }],
    },
    handler: ctrl.publish,
  });

  r.post('/:profileId/deprecate', {
    preHandler: manage,
    schema: {
      tags: ['profiles'],
      summary: 'Deprecate a published profile (hides it from new assignments)',
      params: profileParams,
      response: { 200: profileResponse },
      security: [{ bearerAuth: [] }],
    },
    handler: ctrl.deprecate,
  });
}

// ── /teams/:teamId/defaults ──────────────────────────────────────────────────
export async function teamProfileDefaultsRoutes(app: FastifyInstance): Promise<void> {
  const ctrl = new ProfilesController(new ProfilesService());
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.addHook('preHandler', requireAuth);
  r.addHook('preHandler', requireTeamRole('MEMBER', 'MANAGER'));

  r.put('/profile', {
    preHandler: [requirePermission('pmo.set_team_defaults'), requireScope('admin')],
    schema: {
      tags: ['profiles'],
      summary: 'Set the team\'s default project profile',
      params: teamParams,
      body: setTeamDefaultBody,
      response: { 200: profileIdAck },
      security: [{ bearerAuth: [] }],
    },
    handler: ctrl.setTeamDefault,
  });
}

// ── /teams/:teamId/groups/:groupId/default-profile ───────────────────────────
export async function groupDefaultProfileRoutes(app: FastifyInstance): Promise<void> {
  const ctrl = new ProfilesController(new ProfilesService());
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.addHook('preHandler', requireAuth);
  r.addHook('preHandler', requireTeamRole('MEMBER', 'MANAGER'));

  r.put('/', {
    preHandler: [requirePermission('pmo.set_group_defaults'), requireScope('admin')],
    schema: {
      tags: ['profiles'],
      summary: 'Set (or clear) a user group\'s default project profile',
      params: groupParams,
      body: setGroupDefaultBody,
      response: { 200: profileIdAck },
      security: [{ bearerAuth: [] }],
    },
    handler: ctrl.setGroupDefault,
  });
}

// ── /teams/:teamId/projects/:projectId/profile ───────────────────────────────
export async function projectProfileRoutes(app: FastifyInstance): Promise<void> {
  const ctrl = new ProfilesController(new ProfilesService());
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.addHook('preHandler', requireAuth);
  r.addHook('preHandler', requireTeamRoleOrGrantedProject('MEMBER', 'MANAGER'));
  r.addHook('preHandler', requireProjectAccess());

  r.get('/', {
    preHandler: requireScope('projects:read'),
    schema: {
      tags: ['profiles'],
      summary: 'Get a project\'s assigned profile snapshot + overrides',
      params: projectParams,
      response: { 200: projectProfileResponse },
      security: [{ bearerAuth: [] }],
    },
    handler: ctrl.getProjectProfile,
  });

  r.put('/', {
    preHandler: [requirePermission('pmo.assign_profile'), requireScope('projects:write')],
    schema: {
      tags: ['profiles'],
      summary: 'Assign a profile to a project (snapshots id + version)',
      params: projectParams,
      body: assignProjectProfileBody,
      response: { 200: projectProfileResponse },
      security: [{ bearerAuth: [] }],
    },
    handler: ctrl.assignProjectProfile,
  });

  r.put('/overrides', {
    preHandler: [requirePermission('pmo.override_profile'), requireScope('projects:write')],
    schema: {
      tags: ['profiles'],
      summary: 'Set per-project module overrides on the assigned profile',
      params: projectParams,
      body: projectOverridesBody,
      response: { 200: projectProfileResponse },
      security: [{ bearerAuth: [] }],
    },
    handler: ctrl.setProjectOverrides,
  });
}

// ── /teams/:teamId/projects/:projectId/effective-config ──────────────────────
export async function projectEffectiveConfigRoutes(app: FastifyInstance): Promise<void> {
  const ctrl = new ProfilesController(new ProfilesService());
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.addHook('preHandler', requireAuth);
  r.addHook('preHandler', requireTeamRoleOrGrantedProject('MEMBER', 'MANAGER'));
  r.addHook('preHandler', requireProjectAccess());

  r.get('/', {
    preHandler: requireScope('projects:read'),
    schema: {
      tags: ['profiles'],
      summary:
        'Resolve a project\'s effective module config (profile snapshot + overrides + dependency closure)',
      params: projectParams,
      response: { 200: effectiveConfigResponse },
      security: [{ bearerAuth: [] }],
    },
    handler: ctrl.effectiveConfig,
  });
}
