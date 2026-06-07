import { z } from 'zod';

export const createSubtaskBody = z.object({
  title: z.string().min(1).max(200).trim(),
  done: z.boolean().optional(),
});

export const updateSubtaskBody = z
  .object({
    title: z.string().min(1).max(200).trim().optional(),
    done: z.boolean().optional(),
    // v1.19: technician change is gated server-side (manager/admin only).
    // Undefined = leave as-is; null = clear.
    technicianId: z.string().nullable().optional(),
  })
  .refine(
    (v) => v.title !== undefined || v.done !== undefined || v.technicianId !== undefined,
    'Provide at least one field',
  );

export const subtaskResponse = z.object({
  id: z.string(),
  taskId: z.string(),
  title: z.string(),
  done: z.boolean(),
  technicianId: z.string().nullable(),
  technicianName: z.string().nullable(),
  position: z.number().int(),
});

// v1.35: full-permutation subtask reorder. Mirrors the bucket reorder
// contract: the body must contain every subtaskId for the parent task
// in the desired order (no duplicates, no missing, no foreign ids).
// Partial reorders are rejected with 400 — they invite race conditions
// when two clients reorder concurrently.
export const reorderSubtasksBody = z.object({
  subtaskIds: z.array(z.string().min(1)).min(1).max(200),
});

export const reorderSubtasksResponse = z.object({
  items: z.array(subtaskResponse),
});

export type CreateSubtaskBody = z.infer<typeof createSubtaskBody>;
export type UpdateSubtaskBody = z.infer<typeof updateSubtaskBody>;
export type ReorderSubtasksBody = z.infer<typeof reorderSubtasksBody>;
