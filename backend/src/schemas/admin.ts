import { z } from 'zod';

export const globalRoleEnum = z.enum(['ADMIN', 'MEMBER']);

export const updateUserRoleBody = z.object({
  globalRole: globalRoleEnum,
});

// Cursor pagination — clients pass the last id from the previous page back
// in via `?cursor=…`. `limit` is capped to keep responses fast.
export const listQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(25),
});

export type ListQuery = z.infer<typeof listQuery>;

export const adminUserResponse = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  globalRole: globalRoleEnum,
  emailVerifiedAt: z.string().nullable(),
  createdAt: z.string(),
  membershipCount: z.number().int().nonnegative(),
});

// Paginated envelopes — `nextCursor` is null when there's no more data.
export const usersPage = z.object({
  items: z.array(adminUserResponse),
  nextCursor: z.string().nullable(),
});

export const adminTeamResponse = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  createdAt: z.string(),
  memberCount: z.number().int().nonnegative(),
  projectCount: z.number().int().nonnegative(),
});

export const teamsPage = z.object({
  items: z.array(adminTeamResponse),
  nextCursor: z.string().nullable(),
});
