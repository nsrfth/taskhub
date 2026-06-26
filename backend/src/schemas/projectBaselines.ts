import { z } from 'zod';

// v1.96 (PMIS R1 — neutral core): project schedule baselines.
export const baselineSourceEnum = z.enum(['MANUAL', 'CHANGE_REQUEST']);

export const baselineParams = z.object({
  teamId: z.string(),
  projectId: z.string(),
});

export const captureBaselineBody = z.object({
  name: z.string().min(1).max(200).trim(),
});

export const baselineResponse = z.object({
  id: z.string(),
  name: z.string(),
  source: baselineSourceEnum,
  isCurrent: z.boolean(),
  // Number of live tasks captured in the snapshot (derived; the heavy per-task
  // detail blob is intentionally not returned in the list).
  taskCount: z.number().int().nonnegative(),
  capturedById: z.string().nullable(),
  capturedByName: z.string().nullable(),
  capturedAt: z.string(),
});

export const baselineListResponse = z.object({
  items: z.array(baselineResponse),
});

export const baselineIdParams = baselineParams.extend({ baselineId: z.string() });

export const baselineCompareResponse = z.object({
  baselineId: z.string(),
  baselineName: z.string(),
  isCurrent: z.boolean(),
  rows: z.array(
    z.object({
      taskId: z.string(),
      title: z.string(),
      baselineStart: z.string().nullable(),
      baselineEnd: z.string().nullable(),
      currentStart: z.string().nullable(),
      currentEnd: z.string().nullable(),
      slipStartDays: z.number().nullable(),
      slipEndDays: z.number().nullable(),
    }),
  ),
});

export type CaptureBaselineBody = z.infer<typeof captureBaselineBody>;
