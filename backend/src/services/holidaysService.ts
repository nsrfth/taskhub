import { Prisma } from '@prisma/client';
import { prisma } from '../data/prisma.js';
import { Errors } from '../lib/errors.js';
import { logActivity } from './activityLogger.js';
import type { CreateHolidayBody, UpdateHolidayBody } from '../schemas/holidays.js';

export interface HolidayView {
  id: string;
  date: string;
  name: string;
  recurring: boolean;
  source: 'MANUAL' | 'IMPORT' | 'SYNC';
  createdAt: string;
  updatedAt: string;
}

/** Calendar dates only — anchor to UTC midnight (matches task dueDate rule). */
export function normalizeUtcMidnight(input: string | Date): Date {
  const d = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) throw Errors.badRequest('Invalid date');
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function toView(row: {
  id: string;
  date: Date;
  name: string;
  recurring: boolean;
  source: 'MANUAL' | 'IMPORT' | 'SYNC';
  createdAt: Date;
  updatedAt: Date;
}): HolidayView {
  return {
    id: row.id,
    date: row.date.toISOString(),
    name: row.name,
    recurring: row.recurring,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class HolidaysService {
  async list(opts?: { year?: number; from?: string; to?: string }): Promise<HolidayView[]> {
    const where: Prisma.HolidayWhereInput = {};
    if (opts?.year !== undefined) {
      where.date = {
        gte: new Date(Date.UTC(opts.year, 0, 1)),
        lte: new Date(Date.UTC(opts.year, 11, 31, 23, 59, 59, 999)),
      };
    } else if (opts?.from || opts?.to) {
      where.date = {};
      if (opts.from) where.date.gte = normalizeUtcMidnight(opts.from);
      if (opts.to) where.date.lte = normalizeUtcMidnight(opts.to);
    }
    const rows = await prisma.holiday.findMany({ where, orderBy: { date: 'asc' } });
    return rows.map(toView);
  }

  async listForBootstrap(): Promise<HolidayView[]> {
    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1));
    const to = new Date(Date.UTC(now.getUTCFullYear() + 2, 11, 31));
    const rows = await prisma.holiday.findMany({
      where: { date: { gte: from, lte: to } },
      orderBy: { date: 'asc' },
    });
    return rows.map(toView);
  }

  async create(actorId: string, input: CreateHolidayBody): Promise<HolidayView> {
    const date = normalizeUtcMidnight(input.date);
    try {
      const row = await prisma.holiday.create({
        data: {
          date,
          name: input.name,
          recurring: input.recurring ?? false,
          source: input.source ?? 'MANUAL',
          createdById: actorId,
        },
      });
      await logActivity(prisma, {
        actorId,
        action: 'holiday.created',
        meta: { holidayId: row.id, name: row.name, date: row.date.toISOString() },
      });
      return toView(row);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw Errors.conflict('A holiday already exists on that date');
      }
      throw err;
    }
  }

  async update(holidayId: string, actorId: string, input: UpdateHolidayBody): Promise<HolidayView> {
    const existing = await prisma.holiday.findUnique({ where: { id: holidayId } });
    if (!existing) throw Errors.notFound('Holiday not found');
    const data: Prisma.HolidayUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.recurring !== undefined) data.recurring = input.recurring;
    if (input.date !== undefined) data.date = normalizeUtcMidnight(input.date);
    try {
      const row = await prisma.holiday.update({ where: { id: holidayId }, data });
      await logActivity(prisma, {
        actorId,
        action: 'holiday.updated',
        meta: { holidayId: row.id, name: row.name, date: row.date.toISOString() },
      });
      return toView(row);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw Errors.conflict('A holiday already exists on that date');
      }
      throw err;
    }
  }

  async remove(holidayId: string, actorId: string): Promise<void> {
    const existing = await prisma.holiday.findUnique({ where: { id: holidayId } });
    if (!existing) throw Errors.notFound('Holiday not found');
    await prisma.holiday.delete({ where: { id: holidayId } });
    await logActivity(prisma, {
      actorId,
      action: 'holiday.deleted',
      meta: { holidayId, name: existing.name, date: existing.date.toISOString() },
    });
  }
}
