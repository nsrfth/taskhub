import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { TasksService } from '../services/tasksService.js';
import { TasksController } from '../controllers/tasksController.js';
import { requireAuth, requireTeamRoleOrGrantedProject } from '../middleware/auth.js';
import { requireProjectAccess } from '../middleware/requireProjectAccess.js';
import { requireScope } from '../middleware/requireScope.js';
import { wbsResponse } from '../schemas/tasks.js';

// v1.97 (PMIS R1 — neutral core): the project's Work Breakdown Structure tree.
// Mounted at /api/teams/:teamId/projects/:projectId/wbs — same per-project
// nesting + access cascade as the Gantt/status reports. Read-only: returns the
// task tree flat in DFS pre-order with derived outline codes + % rollups.
export async function wbsRoutes(app: FastifyInstance): Promise<void> {
  const svc = new TasksService();
  const ctrl = new TasksController(svc);
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.addHook('preHandler', requireAuth);
  r.addHook('preHandler', requireTeamRoleOrGrantedProject('MEMBER', 'MANAGER'));
  r.addHook('preHandler', requireProjectAccess());

  r.get('/', {
    preHandler: requireScope('tasks:read'),
    schema: {
      tags: ['tasks'],
      summary: 'Project WBS tree (flat DFS pre-order, derived codes + % rollups)',
      params: z.object({ teamId: z.string(), projectId: z.string() }),
      response: { 200: wbsResponse },
      security: [{ bearerAuth: [] }],
    },
    handler: ctrl.wbs,
  });
}
