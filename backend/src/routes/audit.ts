import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { AuditService } from '../services/auditService.js';
import { AuditController } from '../controllers/auditController.js';
import { requireAuth } from '../middleware/auth.js';
import { auditPage, auditQuery } from '../schemas/audit.js';

// Audit log read surface. Mounted at /api/audit. Authz is performed inside
// the service (ADMIN sees everything; MANAGER sees their teams only; MEMBER
// is rejected with 403) because the rule depends on dynamic team
// membership, not just the user's globalRole.
export async function auditRoutes(app: FastifyInstance): Promise<void> {
  const svc = new AuditService();
  const ctrl = new AuditController(svc);
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.addHook('preHandler', requireAuth);

  r.get('/', {
    schema: {
      tags: ['audit'],
      summary: 'Paginated activity log. ADMIN: instance-wide. MANAGER: their teams.',
      querystring: auditQuery,
      response: { 200: auditPage },
      security: [{ bearerAuth: [] }],
    },
    handler: ctrl.list,
  });
}
