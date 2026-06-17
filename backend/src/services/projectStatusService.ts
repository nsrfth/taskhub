import type { Currency, ProjectStatus } from '@prisma/client';
import { prisma } from '../data/prisma.js';
import { Errors } from '../lib/errors.js';

// v1.81: one-page per-project status aggregate. Overview only (no task list):
// task counts by status, overdue count, % complete, dates, budget, and the
// owner + accountable people. Visibility is enforced by requireProjectAccess
// on the route (non-owners 404 before this runs); we re-check teamId here as
// defence-in-depth for direct service calls (tests/scripts).

export interface ProjectStatusReport {
  projectId: string;
  name: string;
  status: ProjectStatus;
  startDate: string | null;
  endDate: string | null;
  ownerName: string | null;
  accountableName: string | null;
  plannedBudget: string | null;
  budgetCurrency: Currency;
  taskCounts: {
    todo: number;
    inProgress: number;
    review: number;
    done: number;
    total: number;
  };
  overdueCount: number;
  percentComplete: number;
}

export class ProjectStatusService {
  async forProject(teamId: string, projectId: string): Promise<ProjectStatusReport> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        teamId: true,
        name: true,
        status: true,
        startDate: true,
        endDate: true,
        plannedBudget: true,
        budgetCurrency: true,
        owner: { select: { name: true } },
        accountable: { select: { name: true } },
      },
    });
    if (!project || project.teamId !== teamId) throw Errors.notFound('Project not found');

    // UTC-midnight "today" so calendar-date dueDates compare cleanly: a task
    // due strictly before today (and not DONE) is overdue; due today is not.
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const [statusCounts, overdueCount] = await Promise.all([
      prisma.task.groupBy({
        by: ['status'],
        where: { projectId, deletedAt: null },
        _count: { _all: true },
      }),
      prisma.task.count({
        where: {
          projectId,
          deletedAt: null,
          status: { not: 'DONE' },
          dueDate: { lt: todayStart },
        },
      }),
    ]);

    const byStatus = { TODO: 0, IN_PROGRESS: 0, REVIEW: 0, DONE: 0 };
    for (const c of statusCounts) {
      byStatus[c.status as keyof typeof byStatus] = c._count._all;
    }
    const total = byStatus.TODO + byStatus.IN_PROGRESS + byStatus.REVIEW + byStatus.DONE;
    // Guard divide-by-zero: 0% when the project has no tasks (never NaN/Infinity).
    const percentComplete = total > 0 ? Math.round((byStatus.DONE / total) * 100) : 0;

    return {
      projectId: project.id,
      name: project.name,
      status: project.status,
      startDate: project.startDate ? project.startDate.toISOString() : null,
      endDate: project.endDate ? project.endDate.toISOString() : null,
      ownerName: project.owner?.name ?? null,
      accountableName: project.accountable?.name ?? null,
      plannedBudget: project.plannedBudget === null ? null : project.plannedBudget.toFixed(2),
      budgetCurrency: project.budgetCurrency,
      taskCounts: {
        todo: byStatus.TODO,
        inProgress: byStatus.IN_PROGRESS,
        review: byStatus.REVIEW,
        done: byStatus.DONE,
        total,
      },
      overdueCount,
      percentComplete,
    };
  }
}
