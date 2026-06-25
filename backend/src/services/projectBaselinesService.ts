import type { BaselineSource, Prisma } from '@prisma/client';
import { prisma } from '../data/prisma.js';
import { Errors } from '../lib/errors.js';

export interface BaselineView {
  id: string;
  name: string;
  source: BaselineSource;
  isCurrent: boolean;
  taskCount: number;
  capturedById: string | null;
  capturedByName: string | null;
  capturedAt: string;
}

// One captured task's frozen plan/progress. ISO strings keep the JSON portable.
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
  source: BaselineSource;
  isCurrent: boolean;
  snapshot: unknown;
  capturedById: string | null;
  capturedAt: Date;
  capturedBy: { name: string | null } | null;
}): BaselineView {
  const snap = row.snapshot as { taskCount?: unknown; tasks?: unknown } | null;
  const taskCount =
    typeof snap?.taskCount === 'number'
      ? snap.taskCount
      : Array.isArray(snap?.tasks)
        ? snap!.tasks!.length
        : 0;
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

// v1.96 (PMIS R1 — neutral core): capture + list project schedule baselines.
// The route layer already enforced project access; this service additionally
// re-asserts the project↔team chain so a cross-tenant id can never read or
// write another team's baselines (404, no leak — mirrors the RACI service).
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
      include: { capturedBy: { select: { name: true } } },
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

    // Snapshot every live task's planned/baseline dates + progress at this moment.
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

    // Exactly one current baseline per project: demote the rest, then create the
    // new current one — atomically so a reader never sees zero or two currents.
    const created = await prisma.$transaction(async (tx) => {
      await tx.projectBaseline.updateMany({
        where: { projectId, isCurrent: true },
        data: { isCurrent: false },
      });
      return tx.projectBaseline.create({
        data: {
          projectId,
          teamId,
          name,
          source: 'MANUAL',
          isCurrent: true,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          capturedById,
        },
        include: { capturedBy: { select: { name: true } } },
      });
    });

    return toView(created);
  }
}
