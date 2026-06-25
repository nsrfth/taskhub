import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ProjectBaselinesService } from '../services/projectBaselinesService.js';
import { ProjectBaselinesController } from '../controllers/projectBaselinesController.js';
import { requireAuth, requireTeamRoleOrGrantedProject } from '../middleware/auth.js';
import { requireProjectAccess, requireProjectWriteAccess } from '../middleware/requireProjectAccess.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { requireScope } from '../middleware/requireScope.js';
import {
  baselineListResponse,
  baselineParams,
  baselineResponse,
  captureBaselineBody,
} from '../schemas/projectBaselines.js';

// v1.96 (PMIS R1 — neutral core): project schedule baselines. Mounted at
// /api/teams/:teamId/projects/:projectId/baselines, same per-project nesting +
// access cascade as the Gantt/status reports. Reads need project READ; capture
// needs project WRITE *and* the new `core.capture_baseline` permission (the
// same dual-gate shape as task dependencies — global ADMIN bypasses the perm).
export async function projectBaselinesRoutes(app: FastifyInstance): Promise<void> {
  const svc = new ProjectBaselinesService();
  const ctrl = new ProjectBaselinesController(svc);
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.addHook('preHandler', requireAuth);
  r.addHook('preHandler', requireTeamRoleOrGrantedProject('MEMBER', 'MANAGER'));
  r.addHook('preHandler', requireProjectAccess());

  r.get('/', {
    preHandler: requireScope('projects:read'),
    schema: {
      tags: ['projects'],
      summary: 'List captured schedule baselines for this project (newest first)',
      params: baselineParams,
      response: { 200: baselineListResponse },
      security: [{ bearerAuth: [] }],
    },
    handler: ctrl.list,
  });

  r.post('/', {
    preHandler: [
      requireProjectWriteAccess(),
      requirePermission('core.capture_baseline'),
      requireScope('projects:write'),
    ],
    schema: {
      tags: ['projects'],
      summary:
        'Capture a new schedule baseline — snapshots every live task\'s plan/progress ' +
        'and becomes the project\'s current baseline (demoting the previous one).',
      params: baselineParams,
      body: captureBaselineBody,
      response: { 201: baselineResponse },
      security: [{ bearerAuth: [] }],
    },
    handler: ctrl.capture,
  });
}
