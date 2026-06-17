import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { prisma } from '../../src/data/prisma.js';
import { bootstrapUser } from '../helpers/bootstrapUser.js';

// v1.84: @-mention autocomplete + group-aware resolution.
// The eligible mention set is the SAME `responsible-candidates` set the picker
// uses (team members ∪ ACCEPTED group members granted the project). A comment
// can carry explicit `mentionedUserIds[]` (picker) OR hand-typed @local-part
// handles (fallback); both are filtered to that eligible set before notifying.

let app: FastifyInstance;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET ||= 'test_access_secret_at_least_32_chars_long_xx';
  process.env.JWT_REFRESH_SECRET ||= 'test_refresh_secret_at_least_32_chars_long_x';
  process.env.CORS_ORIGINS ||= 'http://localhost:5173';
  process.env.COOKIE_SECURE ||= 'false';
  app = await buildApp(loadEnv());
});
afterAll(async () => {
  if (app) await app.close();
});
beforeEach(async () => {
  await prisma.notification.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.passwordReset.deleteMany();
  await prisma.projectGroupGrant.deleteMany();
  await prisma.userGroupMember.deleteMany();
  await prisma.userGroup.deleteMany();
  await prisma.task.deleteMany(); // cascades comment / activity / dependency
  await prisma.project.deleteMany();
  await prisma.teamMembership.deleteMany();
  await prisma.team.deleteMany();
  await prisma.user.deleteMany();
});

const PASSWORD = 'CorrectHorseBattery9';
const H = (t: string) => ({ authorization: `Bearer ${t}` });

async function register(email: string) {
  const r = await bootstrapUser(app, { email, name: email.split('@')[0], password: PASSWORD });
  return { token: r.token, userId: r.userId };
}
async function createTeam(token: string, slug: string): Promise<string> {
  const r = await app.inject({ method: 'POST', url: '/api/teams', headers: H(token), payload: { name: slug, slug } });
  if (r.statusCode !== 201) throw new Error(`createTeam ${r.statusCode} ${r.body}`);
  return r.json().id;
}
async function addTeamMember(mgrToken: string, teamId: string, email: string) {
  const r = await register(email);
  const res = await app.inject({
    method: 'POST', url: `/api/teams/${teamId}/members`, headers: H(mgrToken), payload: { email, role: 'MEMBER' },
  });
  if (res.statusCode >= 300) throw new Error(`addMember ${res.statusCode} ${res.body}`);
  return r;
}
async function createProject(token: string, teamId: string): Promise<string> {
  const r = await app.inject({ method: 'POST', url: `/api/teams/${teamId}/projects`, headers: H(token), payload: { name: 'P' } });
  return r.json().id;
}
async function createTask(token: string, teamId: string, projectId: string, extra: Record<string, unknown> = {}): Promise<string> {
  const r = await app.inject({
    method: 'POST', url: `/api/teams/${teamId}/projects/${projectId}/tasks`, headers: H(token), payload: { title: 'T', ...extra },
  });
  if (r.statusCode !== 201) throw new Error(`createTask ${r.statusCode} ${r.body}`);
  return r.json().id;
}
// Create a group, add `userId` to it, force the membership ACCEPTED (external
// members are PENDING until they accept), and grant it the project. The user
// ends up an ACCEPTED group member with project access but NOT a team member —
// exercising the group path of resolution exclusively.
async function grantViaGroup(mgrToken: string, teamId: string, projectId: string, userId: string) {
  const g = await app.inject({ method: 'POST', url: `/api/teams/${teamId}/groups`, headers: H(mgrToken), payload: { name: 'G' } });
  const groupId = g.json().id as string;
  await app.inject({
    method: 'POST', url: `/api/teams/${teamId}/groups/${groupId}/members`, headers: H(mgrToken),
    payload: { userId, accessLevel: 'FULL' },
  });
  await prisma.userGroupMember.updateMany({ where: { groupId, userId }, data: { status: 'ACCEPTED' } });
  await app.inject({
    method: 'PUT', url: `/api/teams/${teamId}/groups/${groupId}/projects`, headers: H(mgrToken),
    payload: { projectIds: [projectId] },
  });
}
function postComment(token: string, teamId: string, projectId: string, taskId: string, body: string, mentionedUserIds?: string[]) {
  return app.inject({
    method: 'POST', url: `/api/teams/${teamId}/projects/${projectId}/tasks/${taskId}/comments`, headers: H(token),
    payload: mentionedUserIds ? { body, mentionedUserIds } : { body },
  });
}
function getCandidates(token: string, teamId: string, projectId: string) {
  return app.inject({
    method: 'GET', url: `/api/teams/${teamId}/projects/${projectId}/tasks/responsible-candidates`, headers: H(token),
  });
}
async function mentionNotifs(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, type: 'MENTION' } });
}

describe('@-mention candidate endpoint (shared eligibility)', () => {
  it('lists team members AND accepted group members; excludes outsiders (no cross-project leak)', async () => {
    const admin = await register('admin@example.com');
    const teamId = await createTeam(admin.token, 'team-a');
    const projectId = await createProject(admin.token, teamId);
    await createTask(admin.token, teamId, projectId);
    const bob = await addTeamMember(admin.token, teamId, 'bob@example.com');
    const groupie = await register('groupie@example.com');
    await grantViaGroup(admin.token, teamId, projectId, groupie.userId);
    // An unrelated user in another team must never appear.
    const outsider = await register('outsider@example.com');
    const otherTeam = await createTeam(outsider.token, 'team-b');
    await createProject(outsider.token, otherTeam);

    const res = await getCandidates(admin.token, teamId, projectId);
    expect(res.statusCode).toBe(200);
    const ids = (res.json().items as Array<{ userId: string }>).map((c) => c.userId);
    expect(ids).toContain(admin.userId); // team member (owner)
    expect(ids).toContain(bob.userId); // team member
    expect(ids).toContain(groupie.userId); // accepted group member w/ grant
    expect(ids).not.toContain(outsider.userId); // outsider — never eligible
  });
});

describe('end-to-end mention notification', () => {
  it('explicit mentionedUserIds notifies exactly that user (e2e — the original failure fixed)', async () => {
    const admin = await register('admin@example.com');
    const teamId = await createTeam(admin.token, 'team-a');
    const projectId = await createProject(admin.token, teamId);
    const taskId = await createTask(admin.token, teamId, projectId);
    const bob = await addTeamMember(admin.token, teamId, 'bob@example.com');

    const res = await postComment(admin.token, teamId, projectId, taskId, 'hey there', [bob.userId]);
    expect(res.statusCode).toBe(201);
    expect(await mentionNotifs(bob.userId)).toBe(1);
    expect(await mentionNotifs(admin.userId)).toBe(0); // author never self-notified
  });

  it('notifies an ACCEPTED group member (group-aware resolution) via picker id', async () => {
    const admin = await register('admin@example.com');
    const teamId = await createTeam(admin.token, 'team-a');
    const projectId = await createProject(admin.token, teamId);
    const taskId = await createTask(admin.token, teamId, projectId);
    const groupie = await register('groupie@example.com');
    await grantViaGroup(admin.token, teamId, projectId, groupie.userId);

    await postComment(admin.token, teamId, projectId, taskId, 'ping @groupie', [groupie.userId]);
    expect(await mentionNotifs(groupie.userId)).toBe(1);
  });

  it('plain hand-typed @local-part still resolves (backward compatible, no picker ids)', async () => {
    const admin = await register('admin@example.com');
    const teamId = await createTeam(admin.token, 'team-a');
    const projectId = await createProject(admin.token, teamId);
    const taskId = await createTask(admin.token, teamId, projectId);
    const bob = await addTeamMember(admin.token, teamId, 'bob@example.com');

    const res = await postComment(admin.token, teamId, projectId, taskId, 'cc @bob please');
    expect(res.statusCode).toBe(201);
    expect(await mentionNotifs(bob.userId)).toBe(1);
  });

  it('mentioning the assignee yields a distinct MENTION row (dedupe behavior intact)', async () => {
    const admin = await register('admin@example.com');
    const teamId = await createTeam(admin.token, 'team-a');
    const projectId = await createProject(admin.token, teamId);
    const bob = await addTeamMember(admin.token, teamId, 'bob@example.com');
    const taskId = await createTask(admin.token, teamId, projectId, { assigneeId: bob.userId });

    await postComment(admin.token, teamId, projectId, taskId, 'over to you @bob', [bob.userId]);
    // A distinct MENTION row exists regardless of any TASK_COMMENT row.
    expect(await mentionNotifs(bob.userId)).toBe(1);
  });
});

describe('mention eligibility is enforced server-side', () => {
  it('a user with no project access is NOT notified — via picker id OR hand-typed handle', async () => {
    const admin = await register('admin@example.com');
    const teamId = await createTeam(admin.token, 'team-a');
    const projectId = await createProject(admin.token, teamId);
    const taskId = await createTask(admin.token, teamId, projectId);
    // outsider exists + is registered, but is NOT a team or group member here.
    const outsider = await register('outsider@example.com');

    // Forge both vectors: explicit id AND a hand-typed @outsider handle.
    const res = await postComment(
      admin.token, teamId, projectId, taskId, 'sneaky @outsider', [outsider.userId],
    );
    expect(res.statusCode).toBe(201); // ineligible ids are dropped, not 400
    expect(await mentionNotifs(outsider.userId)).toBe(0);
  });
});
