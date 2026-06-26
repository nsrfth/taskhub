import type { FastifyReply, FastifyRequest } from 'fastify';
import type { RecordService } from '../services/recordService.js';
import type {
  CreateRecordBody,
  CreateRecordCommentBody,
  CreateRecordTypeBody,
  ListRecordsQuery,
  TransitionRecordBody,
  UpdateRecordBody,
  UpdateRecordTypeBody,
} from '../schemas/records.js';
import { Errors } from '../lib/errors.js';

type TeamParams = { teamId: string };
type TypeParams = { teamId: string; typeId: string };
type ProjectParams = { teamId: string; projectId: string };
type RecordParams = { teamId: string; projectId: string; recordId: string };

export class RecordController {
  constructor(private readonly svc: RecordService) {}

  listTypes = async (req: FastifyRequest<{ Params: TeamParams }>, reply: FastifyReply) => {
    const items = await this.svc.listRecordTypes(req.params.teamId);
    return reply.send({ items });
  };

  createType = async (
    req: FastifyRequest<{ Params: TeamParams; Body: CreateRecordTypeBody }>,
    reply: FastifyReply,
  ) => {
    if (!req.user) throw Errors.unauthorized();
    const rt = await this.svc.createRecordType(req.params.teamId, req.body);
    return reply.status(201).send(rt);
  };

  updateType = async (
    req: FastifyRequest<{ Params: TypeParams; Body: UpdateRecordTypeBody }>,
    reply: FastifyReply,
  ) => {
    if (!req.user) throw Errors.unauthorized();
    const rt = await this.svc.updateRecordType(req.params.teamId, req.params.typeId, req.body);
    return reply.send(rt);
  };

  deleteType = async (req: FastifyRequest<{ Params: TypeParams }>, reply: FastifyReply) => {
    if (!req.user) throw Errors.unauthorized();
    await this.svc.deleteRecordType(req.params.teamId, req.params.typeId);
    return reply.status(204).send();
  };

  listRecords = async (
    req: FastifyRequest<{ Params: ProjectParams; Querystring: ListRecordsQuery }>,
    reply: FastifyReply,
  ) => {
    const items = await this.svc.listRecords(req.params.teamId, req.params.projectId, req.query);
    return reply.send({ items });
  };

  getRecord = async (req: FastifyRequest<{ Params: RecordParams }>, reply: FastifyReply) => {
    const r = await this.svc.getRecord(req.params.teamId, req.params.projectId, req.params.recordId);
    return reply.send(r);
  };

  createRecord = async (
    req: FastifyRequest<{ Params: ProjectParams; Body: CreateRecordBody }>,
    reply: FastifyReply,
  ) => {
    if (!req.user) throw Errors.unauthorized();
    const r = await this.svc.createRecord(req.params.teamId, req.params.projectId, req.user.sub, req.body);
    return reply.status(201).send(r);
  };

  updateRecord = async (
    req: FastifyRequest<{ Params: RecordParams; Body: UpdateRecordBody }>,
    reply: FastifyReply,
  ) => {
    if (!req.user) throw Errors.unauthorized();
    const r = await this.svc.updateRecord(req.params.teamId, req.params.projectId, req.params.recordId, req.body);
    return reply.send(r);
  };

  transitionRecord = async (
    req: FastifyRequest<{ Params: RecordParams; Body: TransitionRecordBody }>,
    reply: FastifyReply,
  ) => {
    if (!req.user) throw Errors.unauthorized();
    const r = await this.svc.transitionRecord(req.params.teamId, req.params.projectId, req.params.recordId, req.body);
    return reply.send(r);
  };

  deleteRecord = async (req: FastifyRequest<{ Params: RecordParams }>, reply: FastifyReply) => {
    if (!req.user) throw Errors.unauthorized();
    await this.svc.deleteRecord(req.params.teamId, req.params.projectId, req.params.recordId);
    return reply.status(204).send();
  };

  listComments = async (req: FastifyRequest<{ Params: RecordParams }>, reply: FastifyReply) => {
    const items = await this.svc.listComments(req.params.teamId, req.params.projectId, req.params.recordId);
    return reply.send({ items });
  };

  createComment = async (
    req: FastifyRequest<{ Params: RecordParams; Body: CreateRecordCommentBody }>,
    reply: FastifyReply,
  ) => {
    if (!req.user) throw Errors.unauthorized();
    const c = await this.svc.createComment(req.params.teamId, req.params.projectId, req.params.recordId, req.user.sub, req.body);
    return reply.status(201).send(c);
  };
}
