import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { prisma } from '../../src/data/prisma.js';
import { bootstrapUser } from '../helpers/bootstrapUser.js';

// v1.91 (PMIS R1 — neutral core): project health (RAG) for portfolio roll-up.
// PUT /api/teams/:teamId/projects/:projectId/health requires project WRITE
// access; default health is GREEN.

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
  await app.close();
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
function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}
async function register(email: string, globalRole: 'ADMIN' | 'MEMBER') {
  const r = await bootstrapUser(app, { email, name: email.split('@')[0], password: PASSWORD, globalRole });
  return { token: r.token, userId: r.userId };
}
async function createTeam(token: string, slug: string): Promise<{ id: string }> {
  const res = await app.inject({ method: 'POST', url: '/api/teams', headers: auth(token), payload: { name: slug, slug } });
  if (res.statusCode !== 201) throw new Error(`createTeam ${res.statusCode} ${res.body}`);
  return res.json() as { id: string };
}
async function addMember(adminToken: string, teamId: string, email: string, role: 'MEMBER' | 'MANAGER') {
  const res = await app.inject({ method: 'POST', url: `/api/teams/${teamId}/members`, headers: auth(adminToken), payload: { email, role } });
  if (res.statusCode !== 201) throw new Error(`addMember ${res.statusCode} ${res.body}`);
}
async function createProject(token: string, teamId: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await app.inject({ method: 'POST', url: `/api/teams/${teamId}/projects`, headers: auth(token), payload: { name: 'P', ...payload } });
  if (res.statusCode !== 201) throw new Error(`createProject ${res.statusCode} ${res.body}`);
  return res.json() as Record<string, unknown>;
}
function setHealth(token: string, teamId: string, projectId: string, body: Record<string, unknown>) {
  return app.inject({ method: 'PUT', url: `/api/teams/${teamId}/projects/${projectId}/health`, headers: auth(token), payload: body });
}
function getProject(token: string, teamId: string, projectId: string) {
  return app.inject({ method: 'GET', url: `/api/teams/${teamId}/projects/${projectId}`, headers: auth(token) });
}

describe('PUT project health (RAG)', () => {
  it('defaults to GREEN, and the owner can set status + reason', async () => {
    const admin = await register('admin@x.com', 'ADMIN');
    const team = await createTeam(admin.token, 'team-a');
    const project = await createProject(admin.token, team.id, {});

    // Fresh project defaults to GREEN, no reason, no health timestamp.
    expect(project.ragStatus).toBe('GREEN');
    expect(project.ragReason).toBeNull();
    expect(project.healthUpdatedAt).toBeNull();

    const res = await setHealth(admin.token, team.id, project.id as string, {
      ragStatus: 'RED',
      ragReason: 'Vendor slipped the delivery milestone',
    });
    expect(res.statusCode).toBe(200);
    const b = res.json();
    expect(b.ragStatus).toBe('RED');
    expect(b.ragReason).toBe('Vendor slipped the delivery milestone');
    expect(typeof b.healthUpdatedAt).toBe('string');

    // Persisted: a fresh GET reflects the new health.
    const after = (await getProject(admin.token, team.id, project.id as string)).json();
    expect(after.ragStatus).toBe('RED');
    expect(after.ragReason).toBe('Vendor slipped the delivery milestone');
  });

  it('clears the reason when null is sent, keeps the status', async () => {
    const admin = await register('admin@x.com', 'ADMIN');
    const team = await createTeam(admin.token, 'team-a');
    const project = await createProject(admin.token, team.id, {});
    await setHealth(admin.token, team.id, project.id as string, { ragStatus: 'AMBER', ragReason: 'watch' });

    const res = await setHealth(admin.token, team.id, project.id as string, { ragStatus: 'AMBER', ragReason: null });
    expect(res.statusCode).toBe(200);
    expect(res.json().ragReason).toBeNull();
    expect(res.json().ragStatus).toBe('AMBER');
  });

  it('lets a team MANAGER (project.write_all, non-owner) set health', async () => {
    const admin = await register('admin@x.com', 'ADMIN');
    const mgr = await register('mgr@x.com', 'MEMBER');
    const team = await createTeam(admin.token, 'team-a');
    await addMember(admin.token, team.id, 'mgr@x.com', 'MANAGER');
    const project = await createProject(admin.token, team.id, {}); // owned by admin

    const res = await setHealth(mgr.token, team.id, project.id as string, { ragStatus: 'AMBER' });
    expect(res.statusCode).toBe(200);
    expect(res.json().ragStatus).toBe('AMBER');
  });

  it('refuses a member without project write access (no leak)', async () => {
    const admin = await register('admin@x.com', 'ADMIN');
    const member = await register('member@x.com', 'MEMBER');
    const team = await createTeam(admin.token, 'team-a');
    await addMember(admin.token, team.id, 'member@x.com', 'MEMBER');
    const project = await createProject(admin.token, team.id, {}); // owned by admin

    const res = await setHealth(member.token, team.id, project.id as string, { ragStatus: 'RED' });
    expect([403, 404]).toContain(res.statusCode);

    // And the project's health is unchanged.
    const after = (await getProject(admin.token, team.id, project.id as string)).json();
    expect(after.ragStatus).toBe('GREEN');
  });

  it('rejects an unknown RAG value', async () => {
    const admin = await register('admin@x.com', 'ADMIN');
    const team = await createTeam(admin.token, 'team-a');
    const project = await createProject(admin.token, team.id, {});
    const res = await setHealth(admin.token, team.id, project.id as string, { ragStatus: 'PURPLE' });
    expect(res.statusCode).toBe(400);
  });
});
