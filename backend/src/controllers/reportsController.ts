import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ReportsService } from '../services/reportsService.js';
import type { DoneTasksQuery } from '../schemas/reports.js';

type TeamParams = { teamId: string };

export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  doneTasks = async (
    req: FastifyRequest<{ Params: TeamParams; Querystring: DoneTasksQuery }>,
    reply: FastifyReply,
  ) => {
    const rows = await this.svc.listDoneTasks(req.params.teamId, req.query.days);
    return reply.send({
      windowDays: req.query.days,
      items: rows.map((r) => ({ ...r, doneAt: r.doneAt.toISOString() })),
    });
  };

  workload = async (req: FastifyRequest<{ Params: TeamParams }>, reply: FastifyReply) => {
    const items = await this.svc.listWorkload(req.params.teamId);
    return reply.send({ items });
  };

  overdue = async (req: FastifyRequest<{ Params: TeamParams }>, reply: FastifyReply) => {
    const rows = await this.svc.listOverdue(req.params.teamId);
    return reply.send({
      items: rows.map((r) => ({ ...r, dueDate: r.dueDate.toISOString() })),
    });
  };

  summary = async (req: FastifyRequest<{ Params: TeamParams }>, reply: FastifyReply) => {
    const s = await this.svc.summary(req.params.teamId);
    return reply.send(s);
  };
}
