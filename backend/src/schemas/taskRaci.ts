import { z } from 'zod';

// v1.94 (PMIS R1 — neutral core): Consulted / Informed RACI legs on a task.
export const raciRoleEnum = z.enum(['CONSULTED', 'INFORMED']);

export const raciParams = z.object({
  teamId: z.string(),
  projectId: z.string(),
  taskId: z.string(),
});

export const raciEntryInput = z.object({
  userId: z.string().min(1),
  role: raciRoleEnum,
});

// Replace-set semantics (mirrors project delegates / task labels): the whole
// RACI set for the task is replaced by `entries`.
export const updateRaciBody = z.object({
  entries: z.array(raciEntryInput).max(100),
});

export const raciResponse = z.object({
  entries: z.array(
    z.object({
      userId: z.string(),
      userName: z.string().nullable(),
      role: raciRoleEnum,
    }),
  ),
});

export type UpdateRaciBody = z.infer<typeof updateRaciBody>;
