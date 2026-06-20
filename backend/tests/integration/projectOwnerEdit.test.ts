import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { prisma } from '../../src/data/prisma.js';
import { bootstrapUser } from '../helpers/bootstrapUser.js';

// v1.86 — Feature 2: the project OWNER can be reassigned from the edit form.
// Owner = FULL access, so only the current owner or a global ADMIN may reassign
// (a rename-only manager cannot), and the new owner must be a team member.

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(loadEnv());
});
afterAll(async () => {
  if (app) await app.close();
});
beforeEach(async () => {
  await prisma.refreshToken.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.teamMembership.deleteMany();
  await prisma.team.deleteMany();
  await prisma.user.deleteMany();
});

const PASSWORD = 'CorrectHorseBattery9';
const H = (t: string) => ({ authorization: `Bearer ${t}` });

async function addMember(adminToken: string, teamId: string, email: string, role: 'MEMBER' | 'MANAGER') {
  await app.inject({
    method: 'POST', url: `/api/teams/${teamId}/members`, headers: H(adminToken), payload: { email, role },
  });
}

async function setup() {
  const admin = await bootstrapUser(app, { email: 'admin@example.com', name: 'Admin', password: PASSWORD, globalRole: 'ADMIN' });
  const alice = await bootstrapUser(app, { email: 'alice@example.com', name: 'Alice', password: PASSWORD, globalRole: 'MEMBER' });
  const bob = await bootstrapUser(app, { email: 'bob@example.com', name: 'Bob', password: PASSWORD, globalRole: 'MEMBER' });
  const mgr = await bootstrapUser(app, { email: 'mgr@example.com', name: 'Mgr', password: PASSWORD, globalRole: 'MEMBER' });
  const plain = await bootstrapUser(app, { email: 'plain@example.com', name: 'Plain', password: PASSWORD, globalRole: 'MEMBER' });
  const outsider = await bootstrapUser(app, { email: 'outsider@example.com', name: 'Outsider', password: PASSWORD, globalRole: 'MEMBER' });

  const team = await app.inject({
    method: 'POST', url: '/api/teams', headers: H(admin.token), payload: { name: 'T1', slug: 'team-1' },
  });
  const teamId = team.json().id as string;
  await addMember(admin.token, teamId, 'alice@example.com', 'MEMBER');
  await addMember(admin.token, teamId, 'bob@example.com', 'MEMBER');
  await addMember(admin.token, teamId, 'mgr@example.com', 'MANAGER');
  await addMember(admin.token, teamId, 'plain@example.com', 'MEMBER');

  // Cross-team user: member of a different team only.
  const team2 = await app.inject({
    method: 'POST', url: '/api/teams', headers: H(admin.token), payload: { name: 'T2', slug: 'team-2' },
  });
  const team2Id = team2.json().id as string;
  const otherTeamUser = await bootstrapUser(app, { email: 'other@example.com', name: 'Other', password: PASSWORD, globalRole: 'MEMBER' });
  await addMember(admin.token, team2Id, 'other@example.com', 'MEMBER');

  // Project owned by alice.
  const project = await app.inject({
    method: 'POST', url: `/api/teams/${teamId}/projects`, headers: H(admin.token),
    payload: { name: 'P', ownerId: alice.userId },
  });
  const projectId = project.json().id as string;

  return {
    adminToken: admin.token, teamId, projectId,
    aliceToken: alice.token, aliceId: alice.userId,
    bobToken: bob.token, bobId: bob.userId,
    mgrToken: mgr.token,
    plainToken: plain.token,
    outsiderId: outsider.userId,
    otherTeamUserToken: otherTeamUser.token,
  };
}

function patchProject(token: string, teamId: string, projectId: string, body: Record<string, unknown>) {
  return app.inject({ method: 'PATCH', url: `/api/teams/${teamId}/projects/${projectId}`, headers: H(token), payload: body });
}

describe('Feature 2 — owner reassignment in project edit', () => {
  it('the current OWNER can reassign ownership to another team member', async () => {
    const s = await setup();
    const res = await patchProject(s.aliceToken, s.teamId, s.projectId, { ownerId: s.bobId });
    expect(res.statusCode).toBe(200);
    expect(res.json().ownerId).toBe(s.bobId);
    const row = await prisma.project.findUnique({ where: { id: s.projectId }, select: { ownerId: true } });
    expect(row?.ownerId).toBe(s.bobId);
  });

  it('a global ADMIN can reassign ownership', async () => {
    const s = await setup();
    const res = await patchProject(s.adminToken, s.teamId, s.projectId, { ownerId: s.bobId });
    expect(res.statusCode).toBe(200);
    expect(res.json().ownerId).toBe(s.bobId);
  });

  it('NEGATIVE: a rename-only MANAGER (not owner) cannot reassign ownership (403)', async () => {
    const s = await setup();
    const res = await patchProject(s.mgrToken, s.teamId, s.projectId, { ownerId: s.bobId });
    expect(res.statusCode).toBe(403);
  });

  it('NEGATIVE: a plain member (not owner/manager) cannot reassign (404)', async () => {
    const s = await setup();
    const res = await patchProject(s.plainToken, s.teamId, s.projectId, { ownerId: s.bobId });
    expect(res.statusCode).toBe(404);
  });

  it('NEGATIVE: reassigning to a non-team-member is rejected (400)', async () => {
    const s = await setup();
    const res = await patchProject(s.aliceToken, s.teamId, s.projectId, { ownerId: s.outsiderId });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toMatch(/team/i);
  });

  it('NEGATIVE: a user from another team cannot touch this project (403)', async () => {
    const s = await setup();
    const res = await patchProject(s.otherTeamUserToken, s.teamId, s.projectId, { ownerId: s.bobId });
    expect(res.statusCode).toBe(403);
  });
});
