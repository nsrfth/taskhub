import { z } from 'zod';
import { currencyEnum } from './currency.js';

export const resourceTypeEnum = z.enum(['HUMAN', 'EQUIPMENT', 'MATERIAL']);

export const createResourceBody = z.object({
  name: z.string().min(1).max(200).trim(),
  type: resourceTypeEnum.optional(),
  userId: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  maxUnits: z.number().positive().max(99).optional(),
  costRateMinor: z.number().int().nonnegative().nullable().optional(),
  currency: currencyEnum.nullable().optional(),
  calendarId: z.string().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type CreateResourceBody = z.infer<typeof createResourceBody>;

export const updateResourceBody = createResourceBody.partial().refine(
  (v) => Object.values(v).some((x) => x !== undefined),
  'Provide at least one field',
);
export type UpdateResourceBody = z.infer<typeof updateResourceBody>;

export const resourceResponse = z.object({
  id: z.string(),
  teamId: z.string(),
  name: z.string(),
  type: resourceTypeEnum,
  userId: z.string().nullable(),
  email: z.string().nullable(),
  maxUnits: z.number(),
  costRateMinor: z.number().nullable(),
  currency: currencyEnum.nullable(),
  calendarId: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// Skills
export const createSkillBody = z.object({
  name: z.string().min(1).max(100).trim(),
});
export type CreateSkillBody = z.infer<typeof createSkillBody>;

export const skillResponse = z.object({
  id: z.string(),
  teamId: z.string(),
  name: z.string(),
  createdAt: z.string(),
});

// Resource–Skill assignment
export const setResourceSkillsBody = z.object({
  skills: z.array(z.object({
    skillId: z.string(),
    level: z.number().int().min(1).max(5).optional(),
  })).max(100),
});
export type SetResourceSkillsBody = z.infer<typeof setResourceSkillsBody>;

// Resource assignment to a task
export const createAssignmentBody = z.object({
  resourceId: z.string(),
  units: z.number().positive().max(99).optional(),
  plannedHours: z.number().nonnegative().nullable().optional(),
});
export type CreateAssignmentBody = z.infer<typeof createAssignmentBody>;

export const updateAssignmentBody = z.object({
  units: z.number().positive().max(99).optional(),
  plannedHours: z.number().nonnegative().nullable().optional(),
  actualHours: z.number().nonnegative().nullable().optional(),
}).refine((v) => Object.values(v).some((x) => x !== undefined), 'Provide at least one field');
export type UpdateAssignmentBody = z.infer<typeof updateAssignmentBody>;

export const assignmentResponse = z.object({
  id: z.string(),
  teamId: z.string(),
  projectId: z.string(),
  taskId: z.string(),
  resourceId: z.string(),
  resourceName: z.string(),
  resourceType: resourceTypeEnum,
  units: z.number(),
  plannedHours: z.number().nullable(),
  actualHours: z.number().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// Workload report
export const workloadQuery = z.object({
  basis: z.enum(['hours', 'count']).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});
export type WorkloadQuery = z.infer<typeof workloadQuery>;

export const workloadResponse = z.object({
  items: z.array(z.object({
    resourceId: z.string(),
    resourceName: z.string(),
    totalPlannedHours: z.number(),
    totalActualHours: z.number(),
    assignmentCount: z.number().int(),
  })),
});
