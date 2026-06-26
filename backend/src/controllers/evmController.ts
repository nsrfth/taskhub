import type { FastifyReply, FastifyRequest } from 'fastify';
import type { EvmService } from '../services/evmService.js';
import type { EvmQuery, EvmSeriesQuery } from '../schemas/evm.js';
import { Errors } from '../lib/errors.js';

type ProjectParams = { teamId: string; projectId: string };

export class EvmController {
  constructor(private readonly svc: EvmService) {}

  compute = async (
    req: FastifyRequest<{ Params: ProjectParams; Querystring: EvmQuery }>,
    reply: FastifyReply,
  ) => {
    const metrics = await this.svc.computeEvm(req.params.teamId, req.params.projectId, req.query);
    return reply.send(metrics);
  };

  saveSnapshot = async (
    req: FastifyRequest<{ Params: ProjectParams; Querystring: EvmQuery }>,
    reply: FastifyReply,
  ) => {
    if (!req.user) throw Errors.unauthorized();
    const snap = await this.svc.saveSnapshot(req.params.teamId, req.params.projectId, req.query);
    return reply.status(201).send(snap);
  };

  series = async (
    req: FastifyRequest<{ Params: ProjectParams; Querystring: EvmSeriesQuery }>,
    reply: FastifyReply,
  ) => {
    const result = await this.svc.series(req.params.teamId, req.params.projectId, req.query);
    return reply.send(result);
  };
}
