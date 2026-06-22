import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ContactsService } from '../services/contactsService.js';
import { ContactsController } from '../controllers/contactsController.js';
import { requireAuth, requireTeamRole } from '../middleware/auth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { requireScope } from '../middleware/requireScope.js';
import {
  contactListResponse,
  contactResponse,
  createContactBody,
  updateContactBody,
} from '../schemas/contacts.js';

// v1.90: team-scoped contacts directory. Reads open to any member; writes need
// the `contacts.manage` permission. Mounted at /teams/:teamId/contacts so
// requireTeamRole resolves :teamId.
export async function contactsRoutes(app: FastifyInstance): Promise<void> {
  const svc = new ContactsService();
  const ctrl = new ContactsController(svc);
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.addHook('preHandler', requireAuth);
  r.addHook('preHandler', requireTeamRole('MEMBER', 'MANAGER'));

  r.get('/', {
    preHandler: requireScope('correspondence:read'),
    schema: {
      tags: ['contacts'],
      summary: 'List contacts for this team',
      params: z.object({ teamId: z.string() }),
      response: { 200: contactListResponse },
      security: [{ bearerAuth: [] }],
    },
    handler: ctrl.list,
  });

  r.get('/:contactId', {
    preHandler: requireScope('correspondence:read'),
    schema: {
      tags: ['contacts'],
      summary: 'Get a single contact',
      params: z.object({ teamId: z.string(), contactId: z.string() }),
      response: { 200: contactResponse },
      security: [{ bearerAuth: [] }],
    },
    handler: ctrl.get,
  });

  r.post('/', {
    preHandler: [requirePermission('contacts.manage'), requireScope('correspondence:write')],
    schema: {
      tags: ['contacts'],
      summary: 'Create a contact (needs contacts.manage)',
      params: z.object({ teamId: z.string() }),
      body: createContactBody,
      response: { 201: contactResponse },
      security: [{ bearerAuth: [] }],
    },
    handler: ctrl.create,
  });

  r.patch('/:contactId', {
    preHandler: [requirePermission('contacts.manage'), requireScope('correspondence:write')],
    schema: {
      tags: ['contacts'],
      summary: 'Update a contact (needs contacts.manage)',
      params: z.object({ teamId: z.string(), contactId: z.string() }),
      body: updateContactBody,
      response: { 200: contactResponse },
      security: [{ bearerAuth: [] }],
    },
    handler: ctrl.update,
  });

  r.delete('/:contactId', {
    preHandler: [requirePermission('contacts.manage'), requireScope('correspondence:write')],
    schema: {
      tags: ['contacts'],
      summary: 'Soft-delete a contact (needs contacts.manage)',
      params: z.object({ teamId: z.string(), contactId: z.string() }),
      security: [{ bearerAuth: [] }],
    },
    handler: ctrl.remove,
  });
}
