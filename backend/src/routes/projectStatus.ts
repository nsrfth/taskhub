import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ProjectStatusService } from '../services/projectStatusService.js';
import { requireAuth, requireTeamRoleOrGrantedProject } from '../middleware/auth.js';
import { requireProjectAccess } from '../middleware/requireProjectAccess.js';
import { requireScope } from '../middleware/requireScope.js';
import { Errors } from '../lib/errors.js';
import { projectStatusResponse } from '../schemas/reports.js';

// v1.81: per-project one-page status report. Mounted at
// /api/teams/:teamId/projects/:projectId/reports/status — same nesting +
// auth hooks as the Gantt report, so the v1.39 requireProjectAccess cascade
// applies and a caller who can't access the project gets the standard 404
// (no leak). Read-only — tasks:read scope.
export async function projectStatusRoutes(app: FastifyInstance): Promise<void> {
  const svc = new ProjectStatusService();
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.addHook('preHandler', requireAuth);
  r.addHook('preHandler', requireTeamRoleOrGrantedProject('MEMBER', 'MANAGER'));
  r.addHook('preHandler', requireProjectAccess());

  r.get('/', {
    preHandler: requireScope('tasks:read'),
    schema: {
      tags: ['reports'],
      summary:
        'One-page project status: task counts by status, overdue count, % complete, ' +
        'start/end dates, planned budget, and owner + accountable.',
      params: z.object({ teamId: z.string(), projectId: z.string() }),
      response: { 200: projectStatusResponse },
      security: [{ bearerAuth: [] }],
    },
    handler: async (req, reply) => {
      const params = req.params as { teamId: string; projectId: string };
      if (!req.user) throw Errors.unauthorized();
      return reply.send(await svc.forProject(params.teamId, params.projectId));
    },
  });
}
