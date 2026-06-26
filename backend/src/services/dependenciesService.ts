import { Prisma, type DependencyType, type TaskStatus } from '@prisma/client';
import { prisma } from '../data/prisma.js';
import { AppError, Errors } from '../lib/errors.js';
import { bumpScheduleVersion } from '../lib/scheduleVersion.js';
import { invalidateCpmCache } from '../lib/cpm.js';
import { logActivity } from './activityLogger.js';
import { notifications } from './notificationsService.js';
import { WebhookService } from './webhookService.js';

// v1.29: task dependency edges. A row taskId → dependsOnId means
// "taskId is BLOCKED by dependsOnId". The service layer owns:
//   - cycle prevention (DFS reachability before insert)
//   - cross-tenant safety (both tasks must share the caller's teamId)
//   - self-loop rejection (no taskId === dependsOnId edges)
//   - the status guard (callable from tasksService.update via
//     assertStatusTransitionAllowed)
//   - the unblock notification fan-out when a task transitions to DONE
//
// The route layer wraps every write with the `task.manage_dependencies`
// permission gate; reads are open to any team member.

// Webhook event names — same naming pattern as `task.created` / `task.updated`.
const EVENT_ADDED = 'task.dependency_added';
const EVENT_REMOVED = 'task.dependency_removed';

const _webhooks = new WebhookService();

// Setting values for tasks.dependencyEnforcement. Mirrors v1.18's
// tasks.dateEditRestriction pattern: an InstanceSetting key with a constrained
// enum of string values. Default = off, so the feature is opt-in per instance.
export type DependencyEnforcement = 'off' | 'warn' | 'block';
const ENFORCEMENT_KEY = 'tasks.dependencyEnforcement';

export async function readDependencyEnforcement(): Promise<DependencyEnforcement> {
  try {
    const row = await prisma.instanceSetting.findUnique({ where: { key: ENFORCEMENT_KEY } });
    const raw = row?.value;
    if (raw === 'warn' || raw === 'block') return raw;
    return 'off';
  } catch {
    return 'off';
  }
}

// One side of the GET / response. The other task on the edge is joined in.
export interface DependencyEdgeView {
  id: string;
  type: DependencyType;
  lag: number;
  lagUnit: 'DAY' | 'HOUR';
  calendarMode: 'WORKING' | 'CALENDAR';
  createdAt: Date;
  // The OTHER task on the edge — for `blockedBy` it's the blocker; for
  // `blocking` it's the dependent. Always the task the UI wants to render
  // a link to.
  task: { id: string; title: string; status: TaskStatus; projectId: string };
}

export interface DependencyListView {
  blockedBy: DependencyEdgeView[];
  blocking: DependencyEdgeView[];
  enforcement: DependencyEnforcement;
}

const EDGE_SELECT = {
  id: true,
  type: true,
  lag: true,
  lagUnit: true,
  calendarMode: true,
  createdAt: true,
  taskId: true,
  dependsOnId: true,
} as const;

function edgeView(
  row: {
    id: string;
    type: DependencyType;
    lag: number;
    lagUnit: 'DAY' | 'HOUR';
    calendarMode: 'WORKING' | 'CALENDAR';
    createdAt: Date;
  },
  task: { id: string; title: string; status: TaskStatus; projectId: string },
): DependencyEdgeView {
  return {
    id: row.id,
    type: row.type,
    lag: row.lag,
    lagUnit: row.lagUnit,
    calendarMode: row.calendarMode,
    createdAt: row.createdAt,
    task,
  };
}

export class DependenciesService {
  // Reads BOTH directions in a single round-trip so the UI can render
  // "Blocked by" + "Blocking" side-by-side.
  async list(teamId: string, taskId: string): Promise<DependencyListView> {
    const [blockedBy, blocking, enforcement] = await Promise.all([
      prisma.taskDependency.findMany({
        where: { teamId, taskId },
        select: {
          ...EDGE_SELECT,
          dependsOn: { select: { id: true, title: true, status: true, projectId: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.taskDependency.findMany({
        where: { teamId, dependsOnId: taskId },
        select: {
          ...EDGE_SELECT,
          task: { select: { id: true, title: true, status: true, projectId: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      readDependencyEnforcement(),
    ]);

    return {
      blockedBy: blockedBy.map((r) => edgeView(r, r.dependsOn)),
      blocking: blocking.map((r) => edgeView(r, r.task)),
      enforcement,
    };
  }

  // Insert one edge taskId → dependsOnId. Throws:
  //   400 BAD_REQUEST       on self-loop
  //   403 FORBIDDEN         on cross-team mismatch
  //   404 NOT_FOUND         on either endpoint missing / not-in-team
  //   409 DEPENDENCY_CYCLE  if the edge would create a cycle
  //   409 CONFLICT          if the edge already exists (idempotent caller
  //                         can choose to swallow this)
  async add(args: {
    teamId: string;
    projectId: string; // the BLOCKED task's project — must match
    taskId: string;
    dependsOnId: string;
    type: DependencyType;
    lag?: number;
    lagUnit?: 'DAY' | 'HOUR';
    calendarMode?: 'WORKING' | 'CALENDAR';
    actorId: string;
  }): Promise<DependencyEdgeView> {
    if (args.taskId === args.dependsOnId) {
      throw Errors.badRequest('A task cannot depend on itself');
    }

    // Load both endpoints under one tenant scope. Either being null means
    // "the caller's teamId doesn't own that task" — 404 to keep cross-
    // tenant probes opaque.
    // Both endpoints scoped by teamId at the query layer so a cross-team
    // probe surfaces as 404 (opaque) rather than 403 (which would confirm
    // that a task with that id exists in some other tenant).
    const [task, dep] = await Promise.all([
      prisma.task.findFirst({
        where: { id: args.taskId, teamId: args.teamId, projectId: args.projectId },
        select: { id: true, teamId: true, projectId: true, status: true, title: true },
      }),
      prisma.task.findFirst({
        where: { id: args.dependsOnId, teamId: args.teamId },
        select: { id: true, teamId: true, projectId: true, status: true, title: true },
      }),
    ]);
    if (!task) throw Errors.notFound('Task not found');
    if (!dep) throw Errors.notFound('Dependency target not found');
    // We also require both tasks to be in the SAME project. Cross-project
    // dependencies within a team are a niche case that complicates the
    // notification fan-out without obvious user value; revisit if asked.
    if (dep.projectId !== task.projectId) {
      throw Errors.badRequest('Dependency target is in a different project');
    }

    // Cycle check: walking forward from dependsOnId along the edge set,
    // does any path reach taskId? If yes, inserting this edge closes a
    // cycle. Iterative BFS over a Set so we stop the moment we see taskId.
    if (await this.wouldCreateCycle(args.teamId, args.taskId, args.dependsOnId)) {
      throw new AppError(409, 'DEPENDENCY_CYCLE', 'This dependency would create a cycle');
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        const created = await tx.taskDependency.create({
          data: {
            teamId: args.teamId,
            taskId: args.taskId,
            dependsOnId: args.dependsOnId,
            type: args.type,
            lag: args.lag ?? 0,
            lagUnit: args.lagUnit ?? 'DAY',
            calendarMode: args.calendarMode ?? 'WORKING',
          },
          select: {
            ...EDGE_SELECT,
            dependsOn: { select: { id: true, title: true, status: true, projectId: true } },
          },
        });
        await bumpScheduleVersion(tx, args.projectId);
        await logActivity(tx, {
          taskId: args.taskId,
          teamId: args.teamId,
          actorId: args.actorId,
          action: 'task.dependency_added',
          meta: { dependsOnId: args.dependsOnId, type: args.type },
        });
        return created;
      });
      invalidateCpmCache(args.projectId);

      const view = edgeView(result, result.dependsOn);
      // Post-commit emit so a webhook subscriber reading the same row
      // doesn't race the transaction.
      await _webhooks.emit(args.teamId, EVENT_ADDED, {
        teamId: args.teamId,
        taskId: args.taskId,
        dependsOnId: args.dependsOnId,
        type: args.type,
        dependencyId: view.id,
      });
      return view;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Unique (taskId, dependsOnId) violated — edge already exists.
        throw Errors.conflict('Dependency already exists');
      }
      throw err;
    }
  }

  // Remove an edge by id, scoped to teamId so a forged id from another
  // team 404s.
  async remove(args: {
    teamId: string;
    dependencyId: string;
    actorId: string;
  }): Promise<void> {
    const existing = await prisma.taskDependency.findFirst({
      where: { id: args.dependencyId, teamId: args.teamId },
      select: { id: true, taskId: true, dependsOnId: true, type: true, task: { select: { projectId: true } } },
    });
    if (!existing) throw Errors.notFound('Dependency not found');

    await prisma.$transaction(async (tx) => {
      await tx.taskDependency.delete({ where: { id: existing.id } });
      await bumpScheduleVersion(tx, existing.task.projectId);
      await logActivity(tx, {
        taskId: existing.taskId,
        teamId: args.teamId,
        actorId: args.actorId,
        action: 'task.dependency_removed',
        meta: { dependsOnId: existing.dependsOnId, type: existing.type },
      });
    });

    invalidateCpmCache(existing.task.projectId);

    await _webhooks.emit(args.teamId, EVENT_REMOVED, {
      teamId: args.teamId,
      taskId: existing.taskId,
      dependsOnId: existing.dependsOnId,
      type: existing.type,
      dependencyId: existing.id,
    });
  }

  // Status-guard helper called from tasksService.update. Returns silently
  // when the transition is allowed; throws 403 when enforcement=block and a
  // per-type status rule is violated. enforcement=warn/off never throws here
  // — 'warn' shows a soft UI advisory; 'off' is a no-op.
  //
  // v1.83 status-rule mapping for task B transitioning to `nextStatus`, per
  // each outgoing edge "B depends on A":
  //   FS (FINISH_TO_START):  block IN_PROGRESS|DONE while A is not DONE.
  //   SS (START_TO_START):   block IN_PROGRESS while A is still TODO.
  //   FF (FINISH_TO_FINISH): block DONE while A is not DONE.
  //   RELATES_TO: informational, never blocks.
  async assertStatusTransitionAllowed(
    taskId: string,
    nextStatus: TaskStatus,
  ): Promise<void> {
    // Only IN_PROGRESS / DONE transitions are gated. Moving BACK to TODO
    // or REVIEW from anywhere is always allowed.
    if (nextStatus !== 'IN_PROGRESS' && nextStatus !== 'DONE') return;
    const enforcement = await readDependencyEnforcement();
    if (enforcement !== 'block') return;
    const { fs, ss, ff } = await this.countBlockersFor(taskId, nextStatus);
    if (fs + ss + ff === 0) return;
    const parts: string[] = [];
    if (fs > 0) parts.push(`${fs} finish-to-start predecessor${fs === 1 ? '' : 's'} not done`);
    if (ss > 0) parts.push(`${ss} start-to-start predecessor${ss === 1 ? '' : 's'} not started`);
    if (ff > 0) parts.push(`${ff} finish-to-finish predecessor${ff === 1 ? '' : 's'} not done`);
    throw new AppError(
      403,
      'DEPENDENCY_BLOCKED',
      `Cannot move to ${nextStatus}: ${parts.join('; ')}`,
    );
  }

  // v1.83: per-type blocker counts for a transition of `taskId` to `nextStatus`.
  //   IN_PROGRESS → FS predecessors not DONE + SS predecessors still TODO.
  //   DONE        → FS predecessors not DONE + FF predecessors not DONE.
  // (SS never gates DONE; FF never gates IN_PROGRESS.)
  async countBlockersFor(
    taskId: string,
    nextStatus: TaskStatus,
  ): Promise<{ fs: number; ss: number; ff: number }> {
    const notDone = { status: { not: 'DONE' as TaskStatus }, deletedAt: null };
    const stillTodo = { status: 'TODO' as TaskStatus, deletedAt: null };
    if (nextStatus === 'IN_PROGRESS') {
      const [fs, ss] = await Promise.all([
        prisma.taskDependency.count({ where: { taskId, type: 'FINISH_TO_START', dependsOn: notDone } }),
        prisma.taskDependency.count({ where: { taskId, type: 'START_TO_START', dependsOn: stillTodo } }),
      ]);
      return { fs, ss, ff: 0 };
    }
    if (nextStatus === 'DONE') {
      const [fs, ff] = await Promise.all([
        prisma.taskDependency.count({ where: { taskId, type: 'FINISH_TO_START', dependsOn: notDone } }),
        prisma.taskDependency.count({ where: { taskId, type: 'FINISH_TO_FINISH', dependsOn: notDone } }),
      ]);
      return { fs, ss: 0, ff };
    }
    return { fs: 0, ss: 0, ff: 0 };
  }

  // Count FINISH_TO_START edges OUT of taskId whose blocker is not DONE
  // and not soft-deleted. Used by the status guard + the unblock checker.
  async countIncompleteBlockers(taskId: string): Promise<number> {
    return prisma.taskDependency.count({
      where: {
        taskId,
        type: 'FINISH_TO_START',
        dependsOn: { status: { not: 'DONE' }, deletedAt: null },
      },
    });
  }

  // Bulk version for kanban list pages — one round-trip yields a map of
  // `{ taskId → incompleteBlockerCount }`. Tasks with zero blockers are
  // omitted from the map; callers should default missing keys to 0.
  async loadIncompleteBlockerCounts(taskIds: string[]): Promise<Map<string, number>> {
    if (taskIds.length === 0) return new Map();
    const rows = await prisma.taskDependency.findMany({
      where: {
        taskId: { in: taskIds },
        type: 'FINISH_TO_START',
        dependsOn: { status: { not: 'DONE' }, deletedAt: null },
      },
      select: { taskId: true },
    });
    const out = new Map<string, number>();
    for (const r of rows) out.set(r.taskId, (out.get(r.taskId) ?? 0) + 1);
    return out;
  }

  // Called from tasksService.update inside the transaction that just moved
  // `transitionedTaskId` to `newStatus`. v1.83 per-type unblocking:
  //   newStatus DONE        → frees FS + FF dependents (their A-must-finish met)
  //   newStatus IN_PROGRESS → frees SS dependents (their A-must-start met)
  // For each dependent now clear of the relevant blockers, writes a
  // TASK_UNBLOCKED notification to its assignee + responsible (excl. actor).
  async notifyUnblocked(
    tx: Prisma.TransactionClient,
    transitionedTaskId: string,
    newStatus: TaskStatus,
    actorId: string,
  ): Promise<void> {
    let freedTypes: DependencyType[];
    if (newStatus === 'DONE') freedTypes = ['FINISH_TO_START', 'FINISH_TO_FINISH'];
    else if (newStatus === 'IN_PROGRESS') freedTypes = ['START_TO_START'];
    else return;

    const dependents = await tx.taskDependency.findMany({
      where: { dependsOnId: transitionedTaskId, type: { in: freedTypes } },
      select: {
        taskId: true,
        task: {
          select: {
            id: true,
            title: true,
            projectId: true,
            teamId: true,
            assigneeId: true,
            responsibleId: true,
          },
        },
      },
    });
    if (dependents.length === 0) return;

    // A dependent may have multiple freeing edges — notify it at most once.
    const seen = new Set<string>();
    for (const dep of dependents) {
      if (seen.has(dep.taskId)) continue;
      seen.add(dep.taskId);
      // Count the dependent's remaining blockers of the kinds this transition
      // could clear. Within this tx the donor is already at `newStatus`.
      const remaining =
        newStatus === 'DONE'
          ? await tx.taskDependency.count({
              where: {
                taskId: dep.taskId,
                type: { in: ['FINISH_TO_START', 'FINISH_TO_FINISH'] },
                dependsOn: { status: { not: 'DONE' }, deletedAt: null },
              },
            })
          : await tx.taskDependency.count({
              where: {
                taskId: dep.taskId,
                type: 'START_TO_START',
                dependsOn: { status: 'TODO', deletedAt: null },
              },
            });
      if (remaining > 0) continue;
      const recipients = [dep.task.assigneeId, dep.task.responsibleId]
        .filter((id): id is string => !!id && id !== actorId)
        .filter((id, i, arr) => arr.indexOf(id) === i);
      if (recipients.length === 0) continue;
      try {
        await tx.notification.createMany({
          data: recipients.map((userId) => ({
            userId,
            teamId: dep.task.teamId,
            type: 'TASK_UNBLOCKED',
            payload: {
              taskId: dep.task.id,
              taskTitle: dep.task.title,
              projectId: dep.task.projectId,
              unblockedBy: transitionedTaskId,
            } as Prisma.InputJsonValue,
          })),
        });
      } catch {
        // Best-effort — notification failures must not roll back the
        // status transition that triggered them.
      }
    }
  }

  // BFS from `start` over the existing edge set. Returns true if `target`
  // is reachable. Used to detect cycles BEFORE insert:
  //   adding (taskId → dependsOnId) closes a cycle iff there's an existing
  //   path from dependsOnId back to taskId.
  //
  // Worst-case visits every edge in the team's dependency graph, which is
  // bounded by the project's task count and is tiny in practice. A
  // strictly cycle-free guarantee requires the check + the insert to be
  // serialised; in this single-instance deployment a concurrent insert is
  // unlikely enough that we don't bother with row-level locking. If two
  // edges race and BOTH would close a cycle, the second insert will
  // succeed and we'll have a 2-cycle. The fix is a periodic janitor;
  // tracked under the v1.30 phase boundary.
  async wouldCreateCycle(
    teamId: string,
    candidateTaskId: string,
    candidateDependsOnId: string,
  ): Promise<boolean> {
    if (candidateTaskId === candidateDependsOnId) return true;
    const visited = new Set<string>([candidateDependsOnId]);
    let frontier: string[] = [candidateDependsOnId];
    while (frontier.length > 0) {
      // One DB round per BFS layer — much cheaper than per-node for
      // graphs that aren't deep.
      const next = await prisma.taskDependency.findMany({
        where: { teamId, taskId: { in: frontier } },
        select: { dependsOnId: true },
      });
      const newFrontier: string[] = [];
      for (const row of next) {
        if (row.dependsOnId === candidateTaskId) return true;
        if (!visited.has(row.dependsOnId)) {
          visited.add(row.dependsOnId);
          newFrontier.push(row.dependsOnId);
        }
      }
      frontier = newFrontier;
    }
    return false;
  }
}
