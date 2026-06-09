import { z } from 'zod';

export const bucketColor = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/)
  .optional()
  .nullable();

export const createProjectBucketBody = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional().nullable(),
  color: bucketColor,
});

export const updateProjectBucketBody = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  color: bucketColor,
});

export const reorderProjectBucketsBody = z.object({
  bucketIds: z.array(z.string()).min(1),
});

export const reorderBucketProjectsBody = z.object({
  projectIds: z.array(z.string()),
});

export const setProjectBucketsBody = z.object({
  projectId: z.string(),
  bucketIds: z.array(z.string()),
});

export const bucketItemResponse = z.object({
  projectId: z.string(),
  position: z.number().int(),
});

export const projectBucketResponse = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  color: z.string().nullable(),
  position: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  projectIds: z.array(z.string()),
});

export const projectBucketsListResponse = z.object({
  buckets: z.array(projectBucketResponse),
});

export type CreateProjectBucketBody = z.infer<typeof createProjectBucketBody>;
export type UpdateProjectBucketBody = z.infer<typeof updateProjectBucketBody>;
