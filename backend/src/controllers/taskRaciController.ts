import type { FastifyReply, FastifyRequest } from 'fastify';
import type { TaskRaciService } from '../services/taskRaciService.js';
import type { UpdateRaciBody } from '../schemas/taskRaci.js';
import { Errors } from '../lib/errors.js';

type RaciParams = { teamId: string; projectId: string; taskId: string };

export class TaskRaciController {
  constructor(private readonly svc: TaskRaciService) {}

  list = async (req: FastifyRequest<{ Params: RaciParams }>, reply: FastifyReply) => {
    if (!req.user) throw Errors.unauthorized();
    const entries = await this.svc.list(req.params.teamId, req.params.projectId, req.params.taskId);
    return reply.send({ entries });
  };

  replace = async (
    req: FastifyRequest<{ Params: RaciParams; Body: UpdateRaciBody }>,
    reply: FastifyReply,
  ) => {
    if (!req.user) throw Errors.unauthorized();
    const entries = await this.svc.replace(
      req.params.teamId,
      req.params.projectId,
      req.params.taskId,
      req.body.entries,
    );
    return reply.send({ entries });
  };
}
