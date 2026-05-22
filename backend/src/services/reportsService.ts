import type { TaskStatus } from '@prisma/client';
import { prisma } from '../data/prisma.js';

export interface DoneTaskRow {
  taskId: string;
  taskTitle: string;
  projectId: string;
  projectName: string;
  assigneeId: string | null;
  assigneeName: string | null;
  doneAt: Date;
}

export interface WorkloadRow {
  assigneeId: string | null;
  assigneeName: string | null;
  total: number;
  byStatus: { TODO: number; IN_PROGRESS: number; REVIEW: number };
}

export interface OverdueTaskRow {
  taskId: string;
  taskTitle: string;
  projectId: string;
  projectName: string;
  status: TaskStatus;
  assigneeId: string | null;
  assigneeName: string | null;
  dueDate: Date;
  daysOverdue: number;
}

export interface SummaryReport {
  doneLast7Days: number;
  overdueCount: number;
  openCount: number;
  byStatus: { TODO: number; IN_PROGRESS: number; REVIEW: number; DONE: number };
}

const OPEN_STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'REVIEW'];

export class ReportsService {
  // Returns every task in this team whose doneAt is within the trailing N
  // days. Sorted newest-first so the typical "what happened this week" view
  // reads naturally. Caller (route layer) already enforces team membership.
  async listDoneTasks(teamId: string, days: number): Promise<DoneTaskRow[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await prisma.task.findMany({
      where: { teamId, doneAt: { gte: since } },
      include: {
        project: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
      },
      orderBy: { doneAt: 'desc' },
    });
    return rows
      .filter((r): r is typeof r & { doneAt: Date } => r.doneAt !== null)
      .map((r) => ({
        taskId: r.id,
        taskTitle: r.title,
        projectId: r.project.id,
        projectName: r.project.name,
        assigneeId: r.assignee?.id ?? null,
        assigneeName: r.assignee?.name ?? null,
        doneAt: r.doneAt,
      }));
  }

  // Workload: open tasks (status != DONE) grouped by assignee with a
  // per-status breakdown. Group in-memory rather than via groupBy because we
  // also need to materialize the assignee name, and the team size is small.
  async listWorkload(teamId: string): Promise<WorkloadRow[]> {
    const rows = await prisma.task.findMany({
      where: { teamId, status: { in: OPEN_STATUSES } },
      include: { assignee: { select: { id: true, name: true } } },
    });
    const buckets = new Map<string, WorkloadRow>();
    for (const r of rows) {
      const key = r.assignee?.id ?? '__unassigned__';
      let b = buckets.get(key);
      if (!b) {
        b = {
          assigneeId: r.assignee?.id ?? null,
          assigneeName: r.assignee?.name ?? null,
          total: 0,
          byStatus: { TODO: 0, IN_PROGRESS: 0, REVIEW: 0 },
        };
        buckets.set(key, b);
      }
      b.total += 1;
      // The status is one of OPEN_STATUSES by construction, so the keyed
      // access is always defined.
      b.byStatus[r.status as 'TODO' | 'IN_PROGRESS' | 'REVIEW'] += 1;
    }
    return [...buckets.values()].sort((a, b) => b.total - a.total);
  }

  async listOverdue(teamId: string): Promise<OverdueTaskRow[]> {
    const now = new Date();
    const rows = await prisma.task.findMany({
      where: {
        teamId,
        status: { in: OPEN_STATUSES },
        dueDate: { lt: now, not: null },
      },
      include: {
        project: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: 'asc' },
    });
    return rows
      .filter((r): r is typeof r & { dueDate: Date } => r.dueDate !== null)
      .map((r) => ({
        taskId: r.id,
        taskTitle: r.title,
        projectId: r.project.id,
        projectName: r.project.name,
        status: r.status,
        assigneeId: r.assignee?.id ?? null,
        assigneeName: r.assignee?.name ?? null,
        dueDate: r.dueDate,
        daysOverdue: Math.floor((now.getTime() - r.dueDate.getTime()) / (24 * 60 * 60 * 1000)),
      }));
  }

  // Summary — cheap aggregates used by the Dashboard widget. Single endpoint
  // so the widget doesn't have to hit four others on every navigation.
  async summary(teamId: string): Promise<SummaryReport> {
    const now = new Date();
    const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Three counts in parallel — groupBy gives byStatus + total in one query.
    const [doneLast7Days, overdueCount, statusCounts] = await Promise.all([
      prisma.task.count({ where: { teamId, doneAt: { gte: since7d } } }),
      prisma.task.count({
        where: {
          teamId,
          status: { in: OPEN_STATUSES },
          dueDate: { lt: now, not: null },
        },
      }),
      prisma.task.groupBy({
        by: ['status'],
        where: { teamId },
        _count: { _all: true },
      }),
    ]);

    const byStatus = { TODO: 0, IN_PROGRESS: 0, REVIEW: 0, DONE: 0 };
    for (const c of statusCounts) {
      byStatus[c.status as keyof typeof byStatus] = c._count._all;
    }
    return {
      doneLast7Days,
      overdueCount,
      openCount: byStatus.TODO + byStatus.IN_PROGRESS + byStatus.REVIEW,
      byStatus,
    };
  }
}
