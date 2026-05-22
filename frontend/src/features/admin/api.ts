import { api } from '@/lib/api';

export type GlobalRole = 'ADMIN' | 'MEMBER';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  globalRole: GlobalRole;
  emailVerifiedAt: string | null;
  createdAt: string;
  membershipCount: number;
}

export interface AdminTeam {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  memberCount: number;
  projectCount: number;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export async function listUsers(opts?: { cursor?: string; limit?: number }): Promise<Page<AdminUser>> {
  const params: Record<string, string> = {};
  if (opts?.cursor) params.cursor = opts.cursor;
  if (opts?.limit) params.limit = String(opts.limit);
  return (await api.get<Page<AdminUser>>('/admin/users', { params })).data;
}

export async function updateUserRole(userId: string, globalRole: GlobalRole): Promise<AdminUser> {
  return (await api.patch<AdminUser>(`/admin/users/${userId}`, { globalRole })).data;
}

export async function listTeams(opts?: { cursor?: string; limit?: number }): Promise<Page<AdminTeam>> {
  const params: Record<string, string> = {};
  if (opts?.cursor) params.cursor = opts.cursor;
  if (opts?.limit) params.limit = String(opts.limit);
  return (await api.get<Page<AdminTeam>>('/admin/teams', { params })).data;
}

export async function deleteTeam(teamId: string): Promise<void> {
  await api.delete(`/admin/teams/${teamId}`);
}

export async function deleteUser(userId: string): Promise<void> {
  await api.delete(`/admin/users/${userId}`);
}
