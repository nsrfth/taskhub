import { z } from 'zod';

// "Tasks done in the last N days" query. Clients always pass a window in days
// rather than an absolute since/until so the server can clip pathological
// inputs (e.g. days=10000) without negotiating ranges.
export const doneTasksQuery = z.object({
  days: z.coerce.number().int().positive().max(365).default(7),
});

export const doneTaskRow = z.object({
  taskId: z.string(),
  taskTitle: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  assigneeId: z.string().nullable(),
  assigneeName: z.string().nullable(),
  doneAt: z.string(),
});

export const doneReportResponse = z.object({
  windowDays: z.number().int().positive(),
  items: z.array(doneTaskRow),
});

// Per-assignee workload: open tasks grouped by assignee with status breakdown.
// Unassigned bucket has assigneeId/assigneeName = null.
export const workloadRow = z.object({
  assigneeId: z.string().nullable(),
  assigneeName: z.string().nullable(),
  total: z.number().int().nonnegative(),
  byStatus: z.object({
    TODO: z.number().int().nonnegative(),
    IN_PROGRESS: z.number().int().nonnegative(),
    REVIEW: z.number().int().nonnegative(),
  }),
});

export const workloadResponse = z.object({
  items: z.array(workloadRow),
});

export const overdueTaskRow = z.object({
  taskId: z.string(),
  taskTitle: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE']),
  assigneeId: z.string().nullable(),
  assigneeName: z.string().nullable(),
  dueDate: z.string(),
  daysOverdue: z.number().int().nonnegative(),
});

export const overdueResponse = z.object({
  items: z.array(overdueTaskRow),
});

// Headline counts for the dashboard widget. One query, all numbers we need
// to render the summary card without hitting four separate endpoints.
export const summaryResponse = z.object({
  doneLast7Days: z.number().int().nonnegative(),
  overdueCount: z.number().int().nonnegative(),
  openCount: z.number().int().nonnegative(),
  byStatus: z.object({
    TODO: z.number().int().nonnegative(),
    IN_PROGRESS: z.number().int().nonnegative(),
    REVIEW: z.number().int().nonnegative(),
    DONE: z.number().int().nonnegative(),
  }),
});

export type DoneTasksQuery = z.infer<typeof doneTasksQuery>;
