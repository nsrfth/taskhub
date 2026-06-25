import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ProjectsService } from '../services/projectsService.js';
import { ProjectsController } from '../controllers/projectsController.js';
import { requireAuth, requireTeamRole } from '../middleware/auth.js';
import { requireScope } from '../middleware/requireScope.js';
import {
  createProjectBody,
  projectCrossTeamResponse,
  projectDelegatesBody,
  projectDelegatesResponse,
  projectMyDelegateResponse,
  projectResponse,
  updateProjectBody,
  updateProjectHealthBody,
} from '../schemas/projects.js';

// Projects mount under /api/teams/:teamId/projects so requireTeamRole can
// enforce membership uniformly. Owner-or-MANAGER for mutating individual
// projects is checked one layer deeper inside the service.
export async function projectsRoutes(app: FastifyInstance): Promise<void> {
  const svc = new ProjectsService();
  const ctrl = new ProjectsController(svc);
  const r = app.withTypeProvider<ZodTypeProvider>();

  // Auth + team membership required on every endpoint. MEMBER is sufficient
  // for read; the service further restricts writes to owner-or-MANAGER.
  r.addHook('preHandler', requireAuth);
  r.addHook('preHandler', requireTeamRole('MEMBER', 'MANAGER'));

  r.post('/', {
    preHandler: requireScope('projects:write'),
    schema: {
      tags: ['projects'],
      summary: 'Create a project inside this team — caller becomes owner',
      params: z.object({ teamId: z.string() }),
      body: createProjectBody,
      response: { 201: projectResponse },
      security: [{ bearerAuth: [] }],
    },
    handler: ctrl.create,
  });

  r.get('/', {
    preHandler: requireScope('projects:read'),
    schema: {
      tags: ['projects'],
      summary: 'List projects in this team',
      params: z.object({ teamId: z.string() }),
      response: { 200: z.array(projectResponse) },
      security: [{ bearerAuth: [] }],
    },
    handler: ctrl.list,
  });

  r.get('/:projectId', {
    preHandler: requireScope('projects:read'),
    schema: {
      tags: ['projects'],
      summary: 'Get a project (must belong to this team)',
      params: z.object({ teamId: z.string(), projectId: z.string() }),
      response: { 200: projectResponse },
      security: [{ bearerAuth: [] }],
    },
    handler: ctrl.get,
  });

  r.patch('/:projectId', {
    preHandler: requireScope('projects:write'),
    schema: {
      tags: ['projects'],
      summary: 'Update a project (owner or ADMIN: full edit; manager: rename only)',
      params: z.object({ teamId: z.string(), projectId: z.string() }),
      body: updateProjectBody,
      response: { 200: projectResponse },
      security: [{ bearerAuth: [] }],
    },
    handler: ctrl.update,
  });

  // v1.91 (PMIS R1): set project health (RAG) for portfolio roll-up. Requires
  // project WRITE access (enforced in the service) — not a rename-only manager.
  r.put('/:projectId/health', {
    preHandler: requireScope('projects:write'),
    schema: {
      tags: ['projects'],
      summary: 'Set a project\'s health (RAG) — requires project WRITE access',
      params: z.object({ teamId: z.string(), projectId: z.string() }),
      body: updateProjectHealthBody,
      response: { 200: projectResponse },
      security: [{ bearerAuth: [] }],
    },
    handler: ctrl.setHealth,
  });

  r.delete('/:projectId', {
    preHandler: requireScope('projects:write'),
    schema: {
      tags: ['projects'],
      summary: 'Delete a project (owner OR team MANAGER)',
      params: z.object({ teamId: z.string(), projectId: z.string() }),
      security: [{ bearerAuth: [] }],
    },
    handler: ctrl.remove,
  });

  // v1.86: per-project "full-edit" delegates. Read/replace the set of users the
  // owner (or a global ADMIN) lets fully edit tasks/subtasks on this project —
  // owner/admin authority is enforced in the service layer.
  r.get('/:projectId/delegates', {
    preHandler: requireScope('projects:read'),
    schema: {
      tags: ['projects'],
      summary: 'List the full-edit delegates for a project (owner/admin only)',
      params: z.object({ teamId: z.string(), projectId: z.string() }),
      response: { 200: projectDelegatesResponse },
      security: [{ bearerAuth: [] }],
    },
    handler: ctrl.listDelegates,
  });

  r.put('/:projectId/delegates', {
    preHandler: requireScope('projects:write'),
    schema: {
      tags: ['projects'],
      summary: 'Replace the full-edit delegates for a project (owner/admin only)',
      params: z.object({ teamId: z.string(), projectId: z.string() }),
      body: projectDelegatesBody,
      response: { 200: projectDelegatesResponse },
      security: [{ bearerAuth: [] }],
    },
    handler: ctrl.setDelegates,
  });

  // Self-scoped: any team member may check whether THEY are a delegate so the
  // task/subtask UI can unlock the manager-only controls for them.
  r.get('/:projectId/delegates/me', {
    preHandler: requireScope('projects:read'),
    schema: {
      tags: ['projects'],
      summary: 'Whether the caller is a full-edit delegate on this project',
      params: z.object({ teamId: z.string(), projectId: z.string() }),
      response: { 200: projectMyDelegateResponse },
      security: [{ bearerAuth: [] }],
    },
    handler: ctrl.myDelegateStatus,
  });
}

// v1.40: cross-team list mounted at /api/projects (no :teamId). The SPA's
// Projects page is now team-agnostic — it shows every project the user
// can see across the teams they belong to. Auth-only (no requireTeamRole)
// because the visibility filter inside the service already scopes by
// caller; team membership is enforced implicitly via that scope.
export async function projectsCrossTeamRoutes(app: FastifyInstance): Promise<void> {
  const svc = new ProjectsService();
  const ctrl = new ProjectsController(svc);
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.addHook('preHandler', requireAuth);

  r.get('/', {
    preHandler: requireScope('projects:read'),
    schema: {
      tags: ['projects'],
      summary:
        'List every project the caller can see across all teams (cross-team). ' +
        'Non-ADMIN sees only projects they own; global ADMIN sees every project.',
      response: { 200: z.array(projectCrossTeamResponse) },
      security: [{ bearerAuth: [] }],
    },
    handler: ctrl.listAll,
  });
}
