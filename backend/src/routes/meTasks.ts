import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { requireAuth } from '../middleware/auth.js';
import { requireScope } from '../middleware/requireScope.js';
import { Errors } from '../lib/errors.js';
import { meTasksQuery, meTasksResponse } from '../schemas/meTasks.js';
import { MeTasksService } from '../services/meTasksService.js';

const svc = new MeTasksService();

export async function meTasksRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.addHook('preHandler', requireAuth);
  r.addHook('preHandler', requireScope('tasks:read'));

  r.get('/tasks', {
    schema: {
      tags: ['me'],
      summary: 'Tasks assigned to the current user across all teams',
      querystring: meTasksQuery,
      response: { 200: meTasksResponse },
      security: [{ bearerAuth: [] }],
    },
    handler: async (req, reply) => {
      if (!req.user) throw Errors.unauthorized();
      const result = await svc.listForUser(req.user.sub, req.query);
      return reply.send(result);
    },
  });
}
