import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AdminService } from '../services/adminService.js';
import { AdminController } from '../controllers/adminController.js';
import { requireAuth, requireGlobalRole } from '../middleware/auth.js';
import {
  adminUserResponse,
  listQuery,
  teamsPage,
  updateUserRoleBody,
  usersPage,
} from '../schemas/admin.js';

// Admin endpoints are gated by GlobalRole=ADMIN. There is no team-level RBAC
// here; an admin operates above the tenant boundary by definition.
export async function adminRoutes(app: FastifyInstance): Promise<void> {
  const svc = new AdminService();
  const ctrl = new AdminController(svc);
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.addHook('preHandler', requireAuth);
  r.addHook('preHandler', requireGlobalRole('ADMIN'));

  r.get('/users', {
    schema: {
      tags: ['admin'],
      summary: 'List users (ADMIN only) — cursor pagination',
      querystring: listQuery,
      response: { 200: usersPage },
      security: [{ bearerAuth: [] }],
    },
    handler: ctrl.listUsers,
  });

  r.patch('/users/:userId', {
    schema: {
      tags: ['admin'],
      summary: 'Change a user\'s global role (ADMIN only; cannot demote last admin or self)',
      params: z.object({ userId: z.string() }),
      body: updateUserRoleBody,
      response: { 200: adminUserResponse },
      security: [{ bearerAuth: [] }],
    },
    handler: ctrl.updateUserRole,
  });

  r.get('/teams', {
    schema: {
      tags: ['admin'],
      summary: 'List teams (ADMIN only) — cursor pagination',
      querystring: listQuery,
      response: { 200: teamsPage },
      security: [{ bearerAuth: [] }],
    },
    handler: ctrl.listTeams,
  });

  r.delete('/teams/:teamId', {
    schema: {
      tags: ['admin'],
      summary: 'Delete a team and all of its content (ADMIN only; cascades)',
      params: z.object({ teamId: z.string() }),
      security: [{ bearerAuth: [] }],
    },
    handler: ctrl.deleteTeam,
  });

  r.delete('/users/:userId', {
    schema: {
      tags: ['admin'],
      summary:
        'Delete a user account. Project.owner / Task.creator / Task.assignee / Comment.author SetNull; activities + attachments + memberships cascade-delete. Cannot delete self or last ADMIN.',
      params: z.object({ userId: z.string() }),
      security: [{ bearerAuth: [] }],
    },
    handler: ctrl.deleteUser,
  });
}
