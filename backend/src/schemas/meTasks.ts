import { z } from 'zod';
import { taskLabelResponse, taskPriorityEnum, taskStatusEnum, taskSubtaskResponse } from './tasks.js';

export const meTasksQuery = z.object({
  status: taskStatusEnum.optional(),
  priority: taskPriorityEnum.optional(),
  projectId: z.string().optional(),
  teamId: z.string().optional(),
  q: z.string().max(200).trim().optional(),
  // Quick filters for My Tasks.
  filter: z.enum(['due_today', 'overdue', 'upcoming', 'completed', 'high_priority']).optional(),
  sort: z.enum(['dueDate', 'priority', 'status', 'createdAt']).optional().default('dueDate'),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  cursor: z.string().optional(),
});

export const meTaskRow = z.object({
  id: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  teamId: z.string(),
  teamName: z.string(),
  creatorId: z.string().nullable(),
  assigneeId: z.string().nullable(),
  assigneeName: z.string().nullable(),
  technicianId: z.string().nullable(),
  technicianName: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  status: taskStatusEnum,
  priority: taskPriorityEnum,
  startDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  plannedDate: z.string().nullable(),
  completedAt: z.string().nullable(),
  plannedBudget: z.string().nullable(),
  actualSpent: z.string().nullable(),
  position: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  labels: z.array(taskLabelResponse),
  subtasks: z.array(taskSubtaskResponse),
  incompleteBlockerCount: z.number().int(),
});

export const meTasksResponse = z.object({
  items: z.array(meTaskRow),
  nextCursor: z.string().nullable(),
  total: z.number().int(),
});

export type MeTasksQuery = z.infer<typeof meTasksQuery>;
