import type { GlobalRole } from '@prisma/client';
import { prisma } from '../data/prisma.js';
import { Errors } from '../lib/errors.js';
import {
  assertCanWriteProject,
  listEligibleTaskResponsibleCandidates,
} from '../lib/projectAccess.js';
import { logActivity } from './activityLogger.js';
import { notifications } from './notificationsService.js';
import { WebhookService } from './webhookService.js';
import { userHasPermission } from '../middleware/requirePermission.js';

// Webhook emitter — best-effort post-commit fan-out. Same pattern as
// tasksService: never inside the transaction.
const _webhooks = new WebhookService();

// Extract every distinct `@handle` from a comment body. The handle is the
// local-part of a team member's email (e.g. `@alice` matches `alice@x.com`).
// A real handle field on User would be cleaner — but the email local-part
// works as a stand-in and avoids a schema migration here.
function extractMentions(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(/@([a-zA-Z0-9._-]+)/g)) {
    const handle = m[1];
    if (handle) out.add(handle.toLowerCase());
  }
  return [...out];
}

// v1.84: resolve a comment's mention recipients against the SINGLE eligibility
// rule shared with the @-mention picker — team members ∪ ACCEPTED group members
// granted this project (`listEligibleTaskResponsibleCandidates`, the same set
// the responsible-candidates endpoint serves). Two input sources are unioned:
//   • explicitIds — exact userIds the picker collected (unambiguous; preferred)
//   • handles     — @local-part tokens typed by hand, regex-extracted (fallback)
// Anyone NOT in the eligible set is dropped: a user with no access to the
// project can never be notified, even via a hand-typed handle. This replaces
// the old team-membership-only resolver, under which accepted group-grant
// members were unmentionable, and which matched only the (full) email
// local-part with no picker — the root cause of mentions silently not firing.
async function resolveMentionRecipients(
  teamId: string,
  projectId: string,
  handles: string[],
  explicitIds: string[],
): Promise<string[]> {
  if (handles.length === 0 && explicitIds.length === 0) return [];
  const candidates = await listEligibleTaskResponsibleCandidates(teamId, projectId);
  const eligibleIds = new Set(candidates.map((c) => c.userId));
  // local-part → userIds (a local-part can collide across two eligible users;
  // a hand-typed handle then notifies both — same behaviour as before).
  const byLocalPart = new Map<string, string[]>();
  for (const c of candidates) {
    const local = (c.email.split('@')[0] ?? '').toLowerCase();
    if (!local) continue;
    const arr = byLocalPart.get(local);
    if (arr) arr.push(c.userId);
    else byLocalPart.set(local, [c.userId]);
  }
  const out = new Set<string>();
  // Explicit picker selections — keep only the still-eligible ones.
  for (const id of explicitIds) if (eligibleIds.has(id)) out.add(id);
  // Hand-typed @handles — resolve via email local-part.
  for (const h of handles) for (const id of byLocalPart.get(h) ?? []) out.add(id);
  return [...out];
}

export interface CommentView {
  id: string;
  taskId: string;
  // authorId / authorName become null when the author has been deleted by an
  // admin (FK SetNull). The comment body itself is preserved.
  authorId: string | null;
  authorName: string | null;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}

export class CommentsService {
  // The task's parent chain (team→project→task) is validated by the route layer
  // before this service is called, so we only need to verify that the comment,
  // when fetched, actually belongs to the task in question.

  async create(
    taskId: string,
    authorId: string,
    authorGlobalRole: GlobalRole,
    body: string,
    mentionedUserIds: string[] = [],
  ): Promise<CommentView> {
    const taskRow = await prisma.task.findUnique({
      where: { id: taskId },
      select: { teamId: true, projectId: true },
    });
    if (!taskRow) throw Errors.notFound('Task not found');
    await assertCanWriteProject(taskRow.projectId, taskRow.teamId, authorId, authorGlobalRole);
    // Run the comment insert and the activity log in one transaction so an
    // audit row appears iff the comment is persisted.
    return prisma.$transaction(async (tx) => {
      const c = await tx.comment.create({
        data: { taskId, authorId, body },
        include: {
          author: { select: { name: true } },
          task: { select: { title: true, teamId: true, projectId: true } },
        },
      });
      await logActivity(tx, {
        taskId,
        actorId: authorId,
        action: 'comment.added',
        meta: { commentId: c.id, excerpt: body.slice(0, 120) },
      });
      await notifications.onCommentAdded(tx, {
        taskId,
        projectId: c.task.projectId,
        teamId: c.task.teamId,
        actorId: authorId,
        commentId: c.id,
        excerpt: body.slice(0, 120),
        taskTitle: c.task.title,
      });
      // @mention fan-out — independent of the TASK_COMMENT notification so a
      // mentioned user who is also the assignee gets two distinct rows. Two
      // notifications is the more useful UX (badge counts the events, not the
      // commits) and matches expectations from other tools.
      // v1.84: recipients = picker-selected ids ∪ hand-typed @handles, both
      // filtered to the project's eligible-candidate set (team ∪ accepted group
      // members). See resolveMentionRecipients.
      const recipients = await resolveMentionRecipients(
        c.task.teamId,
        c.task.projectId,
        extractMentions(body),
        mentionedUserIds,
      );
      if (recipients.length > 0) {
        await notifications.onMention(tx, {
          taskId,
          projectId: c.task.projectId,
          teamId: c.task.teamId,
          actorId: authorId,
          commentId: c.id,
          excerpt: body.slice(0, 120),
          taskTitle: c.task.title,
          recipients,
        });
      }
      return {
        view: {
          id: c.id,
          taskId: c.taskId,
          authorId: c.authorId,
          authorName: c.author?.name ?? null,
          body: c.body,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        },
        teamId: c.task.teamId,
        taskTitle: c.task.title,
      };
    }).then(async ({ view, teamId, taskTitle }) => {
      // Post-commit emit. Subscribers get the comment + its task context so
      // they don't need to re-resolve the task themselves. Awaited so the
      // delivery row exists by the time the API response returns.
      await _webhooks.emit(teamId, 'comment.added', {
        comment: view, taskId: view.taskId, taskTitle, teamId,
      });
      return view;
    });
  }

  async list(taskId: string): Promise<CommentView[]> {
    const rows = await prisma.comment.findMany({
      // v1.21: hide soft-deleted comments from the task view. Trash queries
      // opt back in via the trash service.
      where: { taskId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: { author: { select: { name: true } } },
    });
    return rows.map((c) => ({
      id: c.id,
      taskId: c.taskId,
      authorId: c.authorId,
      authorName: c.author?.name ?? null,
      body: c.body,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  async update(
    taskId: string,
    commentId: string,
    callerId: string,
    body: string,
  ): Promise<CommentView> {
    const existing = await prisma.comment.findUnique({ where: { id: commentId } });
    if (!existing || existing.taskId !== taskId) throw Errors.notFound('Comment not found');
    if (existing.authorId !== callerId) {
      // Editing someone else's words is never OK — even a MANAGER can only delete.
      throw Errors.forbidden('Only the author can edit a comment');
    }

    return prisma.$transaction(async (tx) => {
      const c = await tx.comment.update({
        where: { id: commentId },
        data: { body },
        include: { author: { select: { name: true } } },
      });
      await logActivity(tx, {
        taskId,
        actorId: callerId,
        action: 'comment.edited',
        meta: { commentId: c.id, excerpt: body.slice(0, 120) },
      });
      return {
        id: c.id,
        taskId: c.taskId,
        authorId: c.authorId,
        authorName: c.author?.name ?? null,
        body: c.body,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      };
    });
  }

  // v1.21: Delete is now a SOFT delete. The row survives, hidden from list().
  // Restore / purge are exposed via the Trash service.
  // v1.23: "delete someone else's comment" is now gated by the
  // `comment.delete_others` permission (default = Manager only).
  async remove(
    taskId: string,
    commentId: string,
    callerId: string,
    callerGlobalRole: GlobalRole,
    teamId: string,
  ): Promise<void> {
    const existing = await prisma.comment.findUnique({ where: { id: commentId } });
    if (!existing || existing.taskId !== taskId || existing.deletedAt !== null) {
      throw Errors.notFound('Comment not found');
    }
    if (existing.authorId !== callerId) {
      // Not the author — must hold the `comment.delete_others` permission.
      if (
        !(await userHasPermission(callerId, teamId, callerGlobalRole, 'comment.delete_others'))
      ) {
        throw Errors.forbidden('Missing permission: comment.delete_others');
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.comment.update({
        where: { id: commentId },
        data: { deletedAt: new Date(), deletedById: callerId },
      });
      await logActivity(tx, {
        taskId,
        actorId: callerId,
        action: 'comment.deleted',
        meta: { commentId },
      });
    });
  }
}
