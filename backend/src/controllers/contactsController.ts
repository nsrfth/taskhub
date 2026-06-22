import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ContactsService, ContactView } from '../services/contactsService.js';
import type { CreateContactBody, UpdateContactBody } from '../schemas/contacts.js';
import { Errors } from '../lib/errors.js';

type TeamParams = { teamId: string };
type ContactParams = TeamParams & { contactId: string };

function serialize(c: ContactView) {
  return {
    ...c,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export class ContactsController {
  constructor(private readonly svc: ContactsService) {}

  list = async (req: FastifyRequest<{ Params: TeamParams }>, reply: FastifyReply) => {
    const items = await this.svc.list(req.params.teamId);
    return reply.send(items.map(serialize));
  };

  get = async (req: FastifyRequest<{ Params: ContactParams }>, reply: FastifyReply) => {
    const c = await this.svc.get(req.params.teamId, req.params.contactId);
    return reply.send(serialize(c));
  };

  create = async (
    req: FastifyRequest<{ Params: TeamParams; Body: CreateContactBody }>,
    reply: FastifyReply,
  ) => {
    if (!req.user) throw Errors.unauthorized();
    const c = await this.svc.create(req.params.teamId, req.user.sub, req.body);
    return reply.status(201).send(serialize(c));
  };

  update = async (
    req: FastifyRequest<{ Params: ContactParams; Body: UpdateContactBody }>,
    reply: FastifyReply,
  ) => {
    const c = await this.svc.update(req.params.teamId, req.params.contactId, req.body);
    return reply.send(serialize(c));
  };

  remove = async (req: FastifyRequest<{ Params: ContactParams }>, reply: FastifyReply) => {
    await this.svc.remove(req.params.teamId, req.params.contactId);
    return reply.status(204).send();
  };
}
