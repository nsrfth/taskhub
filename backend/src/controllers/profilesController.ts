import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ProfilesService } from '../services/profilesService.js';
import type {
  AssignProjectProfileBody,
  CreateProfileBody,
  ProjectOverridesBody,
  SetGroupDefaultBody,
  SetTeamDefaultBody,
  UpdateProfileBody,
} from '../schemas/profiles.js';
import { Errors } from '../lib/errors.js';

type TeamParams = { teamId: string };
type ProfileParams = { teamId: string; profileId: string };
type GroupParams = { teamId: string; groupId: string };
type ProjectParams = { teamId: string; projectId: string };

export class ProfilesController {
  constructor(private readonly svc: ProfilesService) {}

  // ── system ─────────────────────────────────────────────────────────────────
  listSystem = async (_req: FastifyRequest, reply: FastifyReply) => {
    const items = await this.svc.listSystemProfiles();
    return reply.send({ items });
  };

  // ── team profile CRUD ──────────────────────────────────────────────────────
  list = async (req: FastifyRequest<{ Params: TeamParams }>, reply: FastifyReply) => {
    const items = await this.svc.listTeamProfiles(req.params.teamId);
    return reply.send({ items });
  };

  get = async (req: FastifyRequest<{ Params: ProfileParams }>, reply: FastifyReply) => {
    const profile = await this.svc.getProfile(req.params.teamId, req.params.profileId);
    return reply.send(profile);
  };

  create = async (
    req: FastifyRequest<{ Params: TeamParams; Body: CreateProfileBody }>,
    reply: FastifyReply,
  ) => {
    if (!req.user) throw Errors.unauthorized();
    const created = await this.svc.createProfile(req.params.teamId, req.user.sub, req.body);
    return reply.status(201).send(created);
  };

  update = async (
    req: FastifyRequest<{ Params: ProfileParams; Body: UpdateProfileBody }>,
    reply: FastifyReply,
  ) => {
    if (!req.user) throw Errors.unauthorized();
    const updated = await this.svc.updateProfile(
      req.params.teamId,
      req.params.profileId,
      req.user.sub,
      req.body,
    );
    return reply.send(updated);
  };

  publish = async (req: FastifyRequest<{ Params: ProfileParams }>, reply: FastifyReply) => {
    if (!req.user) throw Errors.unauthorized();
    const updated = await this.svc.publishProfile(
      req.params.teamId,
      req.params.profileId,
      req.user.sub,
    );
    return reply.send(updated);
  };

  deprecate = async (req: FastifyRequest<{ Params: ProfileParams }>, reply: FastifyReply) => {
    if (!req.user) throw Errors.unauthorized();
    const updated = await this.svc.deprecateProfile(
      req.params.teamId,
      req.params.profileId,
      req.user.sub,
    );
    return reply.send(updated);
  };

  // ── defaulting carriers ────────────────────────────────────────────────────
  setTeamDefault = async (
    req: FastifyRequest<{ Params: TeamParams; Body: SetTeamDefaultBody }>,
    reply: FastifyReply,
  ) => {
    if (!req.user) throw Errors.unauthorized();
    await this.svc.setTeamDefault(req.params.teamId, req.body.profileId, req.user.sub);
    return reply.send({ profileId: req.body.profileId });
  };

  setGroupDefault = async (
    req: FastifyRequest<{ Params: GroupParams; Body: SetGroupDefaultBody }>,
    reply: FastifyReply,
  ) => {
    if (!req.user) throw Errors.unauthorized();
    await this.svc.setGroupDefault(
      req.params.teamId,
      req.params.groupId,
      req.body.profileId,
      req.user.sub,
    );
    return reply.send({ profileId: req.body.profileId });
  };

  // ── per-project ─────────────────────────────────────────────────────────────
  assignProjectProfile = async (
    req: FastifyRequest<{ Params: ProjectParams; Body: AssignProjectProfileBody }>,
    reply: FastifyReply,
  ) => {
    if (!req.user) throw Errors.unauthorized();
    const view = await this.svc.assignProjectProfile(
      req.params.teamId,
      req.params.projectId,
      req.body.profileId,
      req.user.sub,
    );
    return reply.send(view);
  };

  setProjectOverrides = async (
    req: FastifyRequest<{ Params: ProjectParams; Body: ProjectOverridesBody }>,
    reply: FastifyReply,
  ) => {
    if (!req.user) throw Errors.unauthorized();
    const view = await this.svc.setProjectOverrides(
      req.params.teamId,
      req.params.projectId,
      req.body.overrides,
      req.user.sub,
    );
    return reply.send(view);
  };

  getProjectProfile = async (
    req: FastifyRequest<{ Params: ProjectParams }>,
    reply: FastifyReply,
  ) => {
    const view = await this.svc.getProjectProfile(req.params.teamId, req.params.projectId);
    return reply.send(view);
  };

  effectiveConfig = async (
    req: FastifyRequest<{ Params: ProjectParams }>,
    reply: FastifyReply,
  ) => {
    const cfg = await this.svc.getEffectiveConfig(req.params.teamId, req.params.projectId);
    return reply.send(cfg);
  };
}
