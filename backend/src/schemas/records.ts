import { z } from 'zod';

export const createRecordTypeBody = z.object({
  key: z.string().min(1).max(50).trim().toLowerCase(),
  name: z.string().min(1).max(100).trim(),
  statusSet: z.array(z.string().min(1).max(50)).min(1).max(20),
  transitions: z.array(z.object({
    from: z.string(),
    to: z.string(),
    permission: z.string().optional(),
  })).max(100).optional(),
  position: z.number().int().nonnegative().optional(),
});
export type CreateRecordTypeBody = z.infer<typeof createRecordTypeBody>;

export const updateRecordTypeBody = createRecordTypeBody.partial().refine(
  (v) => Object.values(v).some((x) => x !== undefined),
  'Provide at least one field',
);
export type UpdateRecordTypeBody = z.infer<typeof updateRecordTypeBody>;

export const recordTypeResponse = z.object({
  id: z.string(),
  teamId: z.string().nullable(),
  key: z.string(),
  name: z.string(),
  kind: z.enum(['BUILTIN', 'CUSTOM']),
  statusSet: z.array(z.string()),
  transitions: z.array(z.object({ from: z.string(), to: z.string(), permission: z.string().optional() })),
  position: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createRecordBody = z.object({
  recordTypeId: z.string(),
  title: z.string().min(1).max(500).trim(),
  description: z.string().max(5000).nullable().optional(),
  status: z.string().min(1).max(50).optional(),
  fieldValues: z.record(z.unknown()).optional(),
  assigneeId: z.string().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
});
export type CreateRecordBody = z.infer<typeof createRecordBody>;

export const updateRecordBody = z.object({
  title: z.string().min(1).max(500).trim().optional(),
  description: z.string().max(5000).nullable().optional(),
  status: z.string().min(1).max(50).optional(),
  fieldValues: z.record(z.unknown()).optional(),
  assigneeId: z.string().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
}).refine((v) => Object.values(v).some((x) => x !== undefined), 'Provide at least one field');
export type UpdateRecordBody = z.infer<typeof updateRecordBody>;

export const transitionRecordBody = z.object({
  toStatus: z.string().min(1).max(50),
});
export type TransitionRecordBody = z.infer<typeof transitionRecordBody>;

export const recordResponse = z.object({
  id: z.string(),
  teamId: z.string(),
  projectId: z.string(),
  recordTypeId: z.string(),
  recordTypeKey: z.string(),
  recordTypeName: z.string(),
  reference: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  fieldValues: z.record(z.unknown()),
  assigneeId: z.string().nullable(),
  assigneeName: z.string().nullable(),
  dueDate: z.string().nullable(),
  closedAt: z.string().nullable(),
  createdById: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const listRecordsQuery = z.object({
  typeKey: z.string().optional(),
  status: z.string().optional(),
});
export type ListRecordsQuery = z.infer<typeof listRecordsQuery>;

export const createRecordCommentBody = z.object({
  body: z.string().min(1).max(5000).trim(),
});
export type CreateRecordCommentBody = z.infer<typeof createRecordCommentBody>;

export const recordCommentResponse = z.object({
  id: z.string(),
  recordId: z.string(),
  authorId: z.string().nullable(),
  authorName: z.string().nullable(),
  body: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
