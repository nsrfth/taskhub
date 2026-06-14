import { z } from 'zod';

export const groupAccessLevelEnum = z.enum(['FULL', 'READONLY']);
export const groupInviteStatusEnum = z.enum(['PENDING', 'ACCEPTED', 'DECLINED']);

export const createUserGroupBody = z.object({
  name: z.string().min(1).max(120).trim(),
  description: z.string().max(2000).trim().nullable().optional(),
});

export const updateUserGroupBody = z.object({
  name: z.string().min(1).max(120).trim().optional(),
  description: z.string().max(2000).trim().nullable().optional(),
}).refine(
  (v) => v.name !== undefined || v.description !== undefined,
  'Provide at least one field to update',
);

export const addGroupMemberBody = z.object({
  userId: z.string().min(1),
  accessLevel: groupAccessLevelEnum.default('FULL'),
});

export const updateGroupMemberBody = z.object({
  accessLevel: groupAccessLevelEnum,
});

export const setGroupProjectsBody = z.object({
  projectIds: z.array(z.string().min(1)).max(500),
});

export const userSearchQuery = z.object({
  q: z.string().min(2).max(120),
});

export const userGroupSummaryResponse = z.object({
  id: z.string(),
  teamId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  memberCount: z.number().int(),
  grantedProjectCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const userGroupMemberResponse = z.object({
  id: z.string(),
  userId: z.string(),
  email: z.string(),
  name: z.string(),
  accessLevel: groupAccessLevelEnum,
  status: groupInviteStatusEnum,
  external: z.boolean(),
  invitedAt: z.string(),
  respondedAt: z.string().nullable(),
});

export const userGroupProjectResponse = z.object({
  projectId: z.string(),
  name: z.string(),
  ownerId: z.string().nullable(),
  grantedAt: z.string(),
});

export const userGroupDetailResponse = userGroupSummaryResponse.extend({
  members: z.array(userGroupMemberResponse),
  projects: z.array(userGroupProjectResponse),
});

export const userGroupsListResponse = z.object({
  items: z.array(userGroupSummaryResponse),
});

export const userSearchResponse = z.object({
  items: z.array(z.object({ id: z.string(), email: z.string(), name: z.string() })),
});

export const groupInviteResponse = z.object({
  id: z.string(),
  groupId: z.string(),
  groupName: z.string(),
  teamId: z.string(),
  teamName: z.string(),
  accessLevel: groupAccessLevelEnum,
  invitedAt: z.string(),
  invitedByName: z.string().nullable(),
});

export const groupInvitesListResponse = z.object({
  items: z.array(groupInviteResponse),
});

export type CreateUserGroupBody = z.infer<typeof createUserGroupBody>;
export type UpdateUserGroupBody = z.infer<typeof updateUserGroupBody>;
export type AddGroupMemberBody = z.infer<typeof addGroupMemberBody>;
export type UpdateGroupMemberBody = z.infer<typeof updateGroupMemberBody>;
export type SetGroupProjectsBody = z.infer<typeof setGroupProjectsBody>;
