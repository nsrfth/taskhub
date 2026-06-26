import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ResourceService } from '../services/resourceService.js';
import type {
  CreateAssignmentBody,
  CreateResourceBody,
  CreateSkillBody,
  SetResourceSkillsBody,
  UpdateAssignmentBody,
  UpdateResourceBody,
  WorkloadQuery,
} from '../schemas/resources.js';
import { Errors } from '../lib/errors.js';

type TeamParams = { teamId: string };
type ResourceParams = { teamId: string; resourceId: string };
type SkillParams = { teamId: string; skillId: string };
type TaskParams = { teamId: string; projectId: string; taskId: string };
type AssignmentParams = { teamId: string; assignmentId: string };

export class ResourceController {
  constructor(private readonly svc: ResourceService) {}

  listResources = async (req: FastifyRequest<{ Params: TeamParams }>, reply: FastifyReply) => {
    const items = await this.svc.listResources(req.params.teamId);
    return reply.send({ items });
  };

  getResource = async (req: FastifyRequest<{ Params: ResourceParams }>, reply: FastifyReply) => {
    const r = await this.svc.getResource(req.params.teamId, req.params.resourceId);
    return reply.send(r);
  };

  createResource = async (
    req: FastifyRequest<{ Params: TeamParams; Body: CreateResourceBody }>,
    reply: FastifyReply,
  ) => {
    if (!req.user) throw Errors.unauthorized();
    const r = await this.svc.createResource(req.params.teamId, req.body);
    return reply.status(201).send(r);
  };

  updateResource = async (
    req: FastifyRequest<{ Params: ResourceParams; Body: UpdateResourceBody }>,
    reply: FastifyReply,
  ) => {
    if (!req.user) throw Errors.unauthorized();
    const r = await this.svc.updateResource(req.params.teamId, req.params.resourceId, req.body);
    return reply.send(r);
  };

  deleteResource = async (req: FastifyRequest<{ Params: ResourceParams }>, reply: FastifyReply) => {
    if (!req.user) throw Errors.unauthorized();
    await this.svc.deleteResource(req.params.teamId, req.params.resourceId);
    return reply.status(204).send();
  };

  listSkills = async (req: FastifyRequest<{ Params: TeamParams }>, reply: FastifyReply) => {
    const items = await this.svc.listSkills(req.params.teamId);
    return reply.send({ items });
  };

  createSkill = async (
    req: FastifyRequest<{ Params: TeamParams; Body: CreateSkillBody }>,
    reply: FastifyReply,
  ) => {
    if (!req.user) throw Errors.unauthorized();
    const s = await this.svc.createSkill(req.params.teamId, req.body);
    return reply.status(201).send(s);
  };

  deleteSkill = async (req: FastifyRequest<{ Params: SkillParams }>, reply: FastifyReply) => {
    if (!req.user) throw Errors.unauthorized();
    await this.svc.deleteSkill(req.params.teamId, req.params.skillId);
    return reply.status(204).send();
  };

  setResourceSkills = async (
    req: FastifyRequest<{ Params: ResourceParams; Body: SetResourceSkillsBody }>,
    reply: FastifyReply,
  ) => {
    if (!req.user) throw Errors.unauthorized();
    await this.svc.setResourceSkills(req.params.teamId, req.params.resourceId, req.body);
    return reply.status(204).send();
  };

  listAssignments = async (req: FastifyRequest<{ Params: TaskParams }>, reply: FastifyReply) => {
    const items = await this.svc.listAssignments(
      req.params.teamId,
      req.params.projectId,
      req.params.taskId,
    );
    return reply.send({ items });
  };

  createAssignment = async (
    req: FastifyRequest<{ Params: TaskParams; Body: CreateAssignmentBody }>,
    reply: FastifyReply,
  ) => {
    if (!req.user) throw Errors.unauthorized();
    const a = await this.svc.createAssignment(
      req.params.teamId,
      req.params.projectId,
      req.params.taskId,
      req.body,
    );
    return reply.status(201).send(a);
  };

  updateAssignment = async (
    req: FastifyRequest<{ Params: AssignmentParams; Body: UpdateAssignmentBody }>,
    reply: FastifyReply,
  ) => {
    if (!req.user) throw Errors.unauthorized();
    const a = await this.svc.updateAssignment(req.params.teamId, req.params.assignmentId, req.body);
    return reply.send(a);
  };

  deleteAssignment = async (
    req: FastifyRequest<{ Params: AssignmentParams }>,
    reply: FastifyReply,
  ) => {
    if (!req.user) throw Errors.unauthorized();
    await this.svc.deleteAssignment(req.params.teamId, req.params.assignmentId);
    return reply.status(204).send();
  };

  workload = async (
    req: FastifyRequest<{ Params: TeamParams; Querystring: WorkloadQuery }>,
    reply: FastifyReply,
  ) => {
    const result = await this.svc.workloadReport(req.params.teamId, req.query);
    return reply.send(result);
  };
}
