import type { Prisma } from '@prisma/client';
import { prisma } from '../data/prisma.js';
import { Errors } from '../lib/errors.js';
import { bumpScheduleVersion } from '../lib/scheduleVersion.js';

export interface BaselineView {
  id: string;
  name: string;
  source: 'MANUAL' | 'CHANGE_REQUEST';
  isCurrent: boolean;
  taskCount: number;
  capturedById: string | null;
  capturedByName: string | null;
  capturedAt: string;
}

interface SnapshotTask {
  taskId: string;
  title: string;
  status: string;
  startDate: string | null;
  dueDate: string | null;
  baselineStart: string | null;
  baselineEnd: string | null;
  percentComplete: number;
}

interface BaselineSnapshot {
  capturedAt: string;
  taskCount: number;
  tasks: SnapshotTask[];
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

function toView(row: {
  id: string;
  name: string;
  source: 'MANUAL' | 'CHANGE_REQUEST';
  isCurrent: boolean;
  snapshot: unknown;
  capturedById: string | null;
  capturedAt: Date;
  capturedBy: { name: string | null } | null;
  _count?: { entries: number };
}): BaselineView {
  const snap = row.snapshot as { taskCount?: unknown; tasks?: unknown } | null;
  const taskCount =
    row._count?.entries ??
    (typeof snap?.taskCount === 'number'
      ? snap.taskCount
      : Array.isArray(snap?.tasks)
        ? snap!.tasks!.length
        : 0);
  return {
    id: row.id,
    name: row.name,
    source: row.source,
    isCurrent: row.isCurrent,
    taskCount,
    capturedById: row.capturedById,
    capturedByName: row.capturedBy?.name ?? null,
    capturedAt: row.capturedAt.toISOString(),
  };
}

export class ProjectBaselinesService {
  private async assertProjectInTeam(teamId: string, projectId: string): Promise<void> {
    const p = await prisma.project.findUnique({
      where: { id: projectId },
      select: { teamId: true },
    });
    if (!p || p.teamId !== teamId) throw Errors.notFound('Project not found');
  }

  async list(teamId: string, projectId: string): Promise<BaselineView[]> {
    await this.assertProjectInTeam(teamId, projectId);
    const rows = await prisma.projectBaseline.findMany({
      where: { projectId },
      orderBy: { capturedAt: 'desc' },
      include: { capturedBy: { select: { name: true } }, _count: { select: { entries: true } } },
    });
    return rows.map(toView);
  }

  async capture(
    teamId: string,
    projectId: string,
    name: string,
    capturedById: string,
  ): Promise<BaselineView> {
    await this.assertProjectInTeam(teamId, projectId);

    const tasks = await prisma.task.findMany({
      where: { projectId, deletedAt: null },
      select: {
        id: true,
        title: true,
        status: true,
        startDate: true,
        dueDate: true,
        baselineStart: true,
        baselineEnd: true,
        percentComplete: true,
      },
      orderBy: { position: 'asc' },
    });

    const snapshot: BaselineSnapshot = {
      capturedAt: new Date().toISOString(),
      taskCount: tasks.length,
      tasks: tasks.map((t) => ({
        taskId: t.id,
        title: t.title,
        status: t.status,
        startDate: iso(t.startDate),
        dueDate: iso(t.dueDate),
        baselineStart: iso(t.baselineStart),
        baselineEnd: iso(t.baselineEnd),
        percentComplete: t.percentComplete,
      })),
    };

    const created = await prisma.$transaction(async (tx) => {
      await tx.projectBaseline.updateMany({
        where: { projectId, isCurrent: true },
        data: { isCurrent: false },
      });
      const bl = await tx.projectBaseline.create({
        data: {
          projectId,
          teamId,
          name,
          source: 'MANUAL',
          isCurrent: true,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          capturedById,
        },
        include: { capturedBy: { select: { name: true } }, _count: { select: { entries: true } } },
      });
      if (tasks.length) {
        await tx.baselineEntry.createMany({
          data: tasks.map((t) => ({
            baselineId: bl.id,
            taskId: t.id,
            start: t.baselineStart ?? t.startDate,
            end: t.baselineEnd ?? t.dueDate,
          })),
        });
      }
      await bumpScheduleVersion(tx, projectId);
      return bl;
    });

    return toView(created);
  }

  async activate(teamId: string, projectId: string, baselineId: string): Promise<BaselineView> {
    await this.assertProjectInTeam(teamId, projectId);
    const row = await prisma.projectBaseline.findFirst({ where: { id: baselineId, projectId } });
    if (!row) throw Errors.notFound('Baseline not found');
    const updated = await prisma.$transaction(async (tx) => {
      await tx.projectBaseline.updateMany({ where: { projectId, isCurrent: true }, data: { isCurrent: false } });
      return tx.projectBaseline.update({
        where: { id: baselineId },
        data: { isCurrent: true },
        include: { capturedBy: { select: { name: true } }, _count: { select: { entries: true } } },
      });
    });
    return toView(updated);
  }

  async compare(teamId: string, projectId: string, baselineId?: string) {
    await this.assertProjectInTeam(teamId, projectId);
    const baseline = baselineId
      ? await prisma.projectBaseline.findFirst({ where: { id: baselineId, projectId } })
      : await prisma.projectBaseline.findFirst({ where: { projectId, isCurrent: true } });
    if (!baseline) throw Errors.notFound('Baseline not found');

    const [entries, live] = await Promise.all([
      prisma.baselineEntry.findMany({
        where: { baselineId: baseline.id },
        include: { task: { select: { id: true, title: true, startDate: true, dueDate: true, deletedAt: true } } },
      }),
      prisma.task.findMany({
        where: { projectId, deletedAt: null },
        select: { id: true, title: true, startDate: true, dueDate: true },
      }),
    ]);
    const liveById = new Map(live.map((t) => [t.id, t]));
    const rows = entries
      .filter((e) => e.task.deletedAt === null)
      .map((e) => {
        const cur = liveById.get(e.taskId);
        const slipStart =
          e.start && cur?.startDate
            ? Math.round((cur.startDate.getTime() - e.start.getTime()) / 86_400_000)
            : null;
        const slipEnd =
          e.end && cur?.dueDate
            ? Math.round((cur.dueDate.getTime() - e.end.getTime()) / 86_400_000)
            : null;
        return {
          taskId: e.taskId,
          title: e.task.title,
          baselineStart: iso(e.start),
          baselineEnd: iso(e.end),
          currentStart: iso(cur?.startDate ?? null),
          currentEnd: iso(cur?.dueDate ?? null),
          slipStartDays: slipStart,
          slipEndDays: slipEnd,
        };
      });
    return {
      baselineId: baseline.id,
      baselineName: baseline.name,
      isCurrent: baseline.isCurrent,
      rows,
    };
  }

  /** Schedule variance against the current baseline (or a named one). */
  async variance(teamId: string, projectId: string, baselineId?: string) {
    const cmp = await this.compare(teamId, projectId, baselineId);
    const slipped = cmp.rows.filter((r) => (r.slipEndDays ?? 0) > 0 || (r.slipStartDays ?? 0) > 0);
    return {
      ...cmp,
      slippedCount: slipped.length,
      onTrackCount: cmp.rows.length - slipped.length,
    };
  }

  /** Baseline bars keyed by taskId for Gantt overlay. */
  async baselineBarsForProject(projectId: string): Promise<Map<string, { start: string | null; end: string | null }>> {
    const current = await prisma.projectBaseline.findFirst({
      where: { projectId, isCurrent: true },
      select: { id: true },
    });
    if (!current) return new Map();
    const entries = await prisma.baselineEntry.findMany({ where: { baselineId: current.id } });
    return new Map(
      entries.map((e) => [e.taskId, { start: iso(e.start), end: iso(e.end) }]),
    );
  }
}
