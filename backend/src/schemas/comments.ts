import { z } from 'zod';

export const createCommentBody = z.object({
  body: z.string().min(1).max(10_000).trim(),
  // v1.84: exact mention targets collected by the @-mention picker. Optional +
  // additive — plain-text comments (and older clients) omit it and still
  // resolve via the @local-part regex fallback. Each id is validated against
  // the project's eligible-candidate set server-side; ineligible ids are
  // silently dropped (never 400) so stale client state can't break posting.
  mentionedUserIds: z.array(z.string()).max(100).optional(),
});

export const updateCommentBody = z.object({
  body: z.string().min(1).max(10_000).trim(),
});

export const commentResponse = z.object({
  id: z.string(),
  taskId: z.string(),
  // Nullable once the author user has been deleted (FK SetNull).
  authorId: z.string().nullable(),
  authorName: z.string().nullable(),
  body: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type CreateCommentBody = z.infer<typeof createCommentBody>;
export type UpdateCommentBody = z.infer<typeof updateCommentBody>;
