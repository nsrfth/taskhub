import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { Errors } from '../lib/errors.js';
import { UserGroupsService } from '../services/userGroupsService.js';
import { requireAuth } from '../middleware/auth.js';
import { requireScope } from '../middleware/requireScope.js';
import { groupInvitesListResponse } from '../schemas/userGroups.js';

export async function groupInvitesRoutes(app: FastifyInstance): Promise<void> {
  const svc = new UserGroupsService();
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.addHook('preHandler', requireAuth);

  r.get('/', {
    preHandler: requireScope('projects:read'),
    schema: {
      tags: ['groups'],
      summary: 'List pending group invitations for the caller',
      response: { 200: groupInvitesListResponse },
      security: [{ bearerAuth: [] }],
    },
    handler: async (req: FastifyRequest, reply: FastifyReply) => {
      if (!req.user) throw Errors.unauthorized();
      const items = await svc.listPendingInvites(req.user.sub);
      return reply.send({
        items: items.map((i) => ({
          ...i,
          invitedAt: i.invitedAt.toISOString(),
        })),
      });
    },
  });

  r.post('/:memberId/accept', {
    preHandler: requireScope('projects:read'),
    schema: {
      tags: ['groups'],
      summary: 'Accept a group invitation',
      params: z.object({ memberId: z.string() }),
      response: { 204: z.null() },
      security: [{ bearerAuth: [] }],
    },
    handler: async (req: FastifyRequest<{ Params: { memberId: string } }>, reply: FastifyReply) => {
      if (!req.user) throw Errors.unauthorized();
      await svc.acceptInvite(req.user.sub, req.params.memberId);
      return reply.status(204).send();
    },
  });

  r.post('/:memberId/decline', {
    preHandler: requireScope('projects:read'),
    schema: {
      tags: ['groups'],
      summary: 'Decline a group invitation',
      params: z.object({ memberId: z.string() }),
      response: { 204: z.null() },
      security: [{ bearerAuth: [] }],
    },
    handler: async (req: FastifyRequest<{ Params: { memberId: string } }>, reply: FastifyReply) => {
      if (!req.user) throw Errors.unauthorized();
      await svc.declineInvite(req.user.sub, req.params.memberId);
      return reply.status(204).send();
    },
  });
}
