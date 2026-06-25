import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ProjectBaselinesService } from '../services/projectBaselinesService.js';
import type { CaptureBaselineBody } from '../schemas/projectBaselines.js';
import { Errors } from '../lib/errors.js';

type BaselineParams = { teamId: string; projectId: string };

export class ProjectBaselinesController {
  constructor(private readonly svc: ProjectBaselinesService) {}

  list = async (req: FastifyRequest<{ Params: BaselineParams }>, reply: FastifyReply) => {
    if (!req.user) throw Errors.unauthorized();
    const items = await this.svc.list(req.params.teamId, req.params.projectId);
    return reply.send({ items });
  };

  capture = async (
    req: FastifyRequest<{ Params: BaselineParams; Body: CaptureBaselineBody }>,
    reply: FastifyReply,
  ) => {
    if (!req.user) throw Errors.unauthorized();
    const created = await this.svc.capture(
      req.params.teamId,
      req.params.projectId,
      req.body.name,
      req.user.sub,
    );
    return reply.status(201).send(created);
  };
}
