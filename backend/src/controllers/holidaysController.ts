import type { FastifyReply, FastifyRequest } from 'fastify';
import type { HolidaysService } from '../services/holidaysService.js';
import type { CreateHolidayBody, UpdateHolidayBody } from '../schemas/holidays.js';

type HolidayParams = { id: string };

export class HolidaysController {
  constructor(private readonly svc: HolidaysService) {}

  list = async (
    req: FastifyRequest<{ Querystring: { year?: string; from?: string; to?: string } }>,
    reply: FastifyReply,
  ) => {
    const year = req.query.year ? Number(req.query.year) : undefined;
    const items = await this.svc.list({
      year: Number.isInteger(year) ? year : undefined,
      from: req.query.from,
      to: req.query.to,
    });
    return reply.send(items);
  };

  listRange = async (
    req: FastifyRequest<{ Querystring: { from: string; to: string } }>,
    reply: FastifyReply,
  ) => {
    const items = await this.svc.list({ from: req.query.from, to: req.query.to });
    return reply.send(items);
  };

  create = async (
    req: FastifyRequest<{ Body: CreateHolidayBody }>,
    reply: FastifyReply,
  ) => {
    const row = await this.svc.create(req.user!.sub, req.body);
    return reply.status(201).send(row);
  };

  update = async (
    req: FastifyRequest<{ Params: HolidayParams; Body: UpdateHolidayBody }>,
    reply: FastifyReply,
  ) => {
    const row = await this.svc.update(req.params.id, req.user!.sub, req.body);
    return reply.send(row);
  };

  remove = async (req: FastifyRequest<{ Params: HolidayParams }>, reply: FastifyReply) => {
    await this.svc.remove(req.params.id, req.user!.sub);
    return reply.status(204).send();
  };
}
