import type { RaciRole } from '@prisma/client';
import { prisma } from '../data/prisma.js';
import { Errors } from '../lib/errors.js';

export interface RaciEntryView {
  userId: string;
  userName: string | null;
  role: RaciRole;
}

// v1.94 (PMIS R1 — neutral core): Consulted/Informed RACI assignments on a task.
// The route layer already enforced team membership + project access; this
// service additionally verifies the (teamId, projectId, taskId) chain so a
// cross-tenant id can never read or mutate another team's task (404, no leak).
export class TaskRaciService {
  private async assertTaskInProjectTeam(
    teamId: string,
    projectId: string,
    taskId: string,
  ): Promise<void> {
    const t = await prisma.task.findUnique({
      where: { id: taskId },
      select: { teamId: true, projectId: true, deletedAt: true },
    });
    if (!t || t.teamId !== teamId || t.projectId !== projectId || t.deletedAt) {
      throw Errors.notFound('Task not found');
    }
  }

  async list(teamId: string, projectId: string, taskId: string): Promise<RaciEntryView[]> {
    await this.assertTaskInProjectTeam(teamId, projectId, taskId);
    const rows = await prisma.taskRaci.findMany({
      where: { taskId },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({ userId: r.userId, userName: r.user?.name ?? null, role: r.role }));
  }

  async replace(
    teamId: string,
    projectId: string,
    taskId: string,
    entries: { userId: string; role: RaciRole }[],
  ): Promise<RaciEntryView[]> {
    await this.assertTaskInProjectTeam(teamId, projectId, taskId);

    // Dedupe by (userId, role) — a user may hold at most one row per role.
    const byKey = new Map<string, { userId: string; role: RaciRole }>();
    for (const e of entries) byKey.set(`${e.userId}:${e.role}`, e);
    const unique = [...byKey.values()];

    const userIds = [...new Set(unique.map((e) => e.userId))];
    if (userIds.length > 0) {
      const count = await prisma.teamMembership.count({
        where: { teamId, userId: { in: userIds } },
      });
      if (count !== userIds.length) {
        throw Errors.badRequest('Every RACI user must be a member of this team');
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.taskRaci.deleteMany({ where: { taskId } });
      if (unique.length > 0) {
        await tx.taskRaci.createMany({
          data: unique.map((e) => ({ taskId, userId: e.userId, role: e.role })),
        });
      }
    });
    return this.list(teamId, projectId, taskId);
  }
}
