import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { TaskRaciService } from '../services/taskRaciService.js';
import { TaskRaciController } from '../controllers/taskRaciController.js';
import { requireAuth, requireTeamRoleOrGrantedProject } from '../middleware/auth.js';
import { requireProjectAccess, requireProjectWriteAccess } from '../middleware/requireProjectAccess.js';
import { requireScope } from '../middleware/requireScope.js';
import { raciParams, raciResponse, updateRaciBody } from '../schemas/taskRaci.js';

// v1.94 (PMIS R1 — neutral core): task RACI (Consulted/Informed) routes. Mounted
// at /api/teams/:teamId/projects/:projectId/tasks/:taskId/raci, mirroring the
// dependencies nesting so the requireTeamRole + project-access cascade carries
// through. Responsible (R) and Accountable (A) stay on the task itself; only the
// many-per-task C and I legs live here. Replace-set semantics (like project
// delegates / task labels): GET reads, PUT replaces the whole set. Writes reuse
// the project write gate — the same gate that guards changing the responsible.
export async function taskRaciRoutes(app: FastifyInstance): Promise<void> {
  const svc = new TaskRaciService();
  const ctrl = new TaskRaciController(svc);
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.addHook('preHandler', requireAuth);
  r.addHook('preHandler', requireTeamRoleOrGrantedProject('MEMBER', 'MANAGER'));
  r.addHook('preHandler', requireProjectAccess());

  r.get('/', {
    preHandler: requireScope('tasks:read'),
    schema: {
      tags: ['tasks'],
      summary: 'List the Consulted/Informed RACI assignments for this task',
      params: raciParams,
      response: { 200: raciResponse },
      security: [{ bearerAuth: [] }],
    },
    handler: ctrl.list,
  });

  r.put('/', {
    preHandler: [requireProjectWriteAccess(), requireScope('tasks:write')],
    schema: {
      tags: ['tasks'],
      summary:
        'Replace the Consulted/Informed RACI set for this task. ' +
        'Every user must be a member of this team (400 otherwise); ' +
        'cross-team / wrong-project task ids return 404.',
      params: raciParams,
      body: updateRaciBody,
      response: { 200: raciResponse },
      security: [{ bearerAuth: [] }],
    },
    handler: ctrl.replace,
  });
}
