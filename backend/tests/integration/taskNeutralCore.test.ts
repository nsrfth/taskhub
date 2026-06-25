import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { prisma } from '../../src/data/prisma.js';
import { bootstrapUser } from '../helpers/bootstrapUser.js';

// v1.93 (PMIS R1 — neutral core): task baseline/actual schedule dates + stored
// percent-complete.

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
async function createProject(token: string, teamId: string): Promise<{ id: string }> {
  const res = await app.inject({ method: 'POST', url: `/api/teams/${teamId}/projects`, headers: auth(token), payload: { name: 'P' } });
  if (res.statusCode !== 201) throw new Error(`createProject ${res.statusCode} ${res.body}`);
  return res.json() as { id: string };
}
function createTaskRaw(token: string, teamId: string, projectId: string, body: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: `/api/teams/${teamId}/projects/${projectId}/tasks`, headers: auth(token), payload: { title: 'T', ...body } });
}
async function createTask(token: string, teamId: string, projectId: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await createTaskRaw(token, teamId, projectId, body);
  if (res.statusCode !== 201) throw new Error(`createTask ${res.statusCode} ${res.body}`);
  return res.json() as Record<string, unknown>;
}
function patchTask(token: string, teamId: string, projectId: string, taskId: string, body: Record<string, unknown>) {
  return app.inject({ method: 'PATCH', url: `/api/teams/${teamId}/projects/${projectId}/tasks/${taskId}`, headers: auth(token), payload: body });
}
function getTask(token: string, teamId: string, projectId: string, taskId: string) {
  return app.inject({ method: 'GET', url: `/api/teams/${teamId}/projects/${projectId}/tasks/${taskId}`, headers: auth(token) });
}

const D1 = '2026-07-01T00:00:00.000Z';
const D2 = '2026-07-10T00:00:00.000Z';

describe('Task neutral-core fields (baseline/actual dates + percentComplete)', () => {
  it('defaults: percentComplete 0, dates null', async () => {
    const admin = await register('admin@x.com', 'ADMIN');
    const team = await createTeam(admin.token, 'team-a');
    const proj = await createProject(admin.token, team.id);
    const t = await createTask(admin.token, team.id, proj.id, {});
    expect(t.percentComplete).toBe(0);
    expect(t.baselineStart).toBeNull();
    expect(t.baselineEnd).toBeNull();
    expect(t.actualStart).toBeNull();
    expect(t.actualEnd).toBeNull();
  });

  it('create accepts baseline/actual dates + percentComplete, and they persist', async () => {
    const admin = await register('admin@x.com', 'ADMIN');
    const team = await createTeam(admin.token, 'team-a');
    const proj = await createProject(admin.token, team.id);
    const t = await createTask(admin.token, team.id, proj.id, {
      baselineStart: D1,
      baselineEnd: D2,
      actualStart: D1,
      percentComplete: 40,
    });
    expect(t.baselineStart).toBe(D1);
    expect(t.baselineEnd).toBe(D2);
    expect(t.actualStart).toBe(D1);
    expect(t.percentComplete).toBe(40);

    const fetched = (await getTask(admin.token, team.id, proj.id, t.id as string)).json();
    expect(fetched.baselineStart).toBe(D1);
    expect(fetched.percentComplete).toBe(40);
  });

  it('update sets and clears the new fields', async () => {
    const admin = await register('admin@x.com', 'ADMIN');
    const team = await createTeam(admin.token, 'team-a');
    const proj = await createProject(admin.token, team.id);
    const t = await createTask(admin.token, team.id, proj.id, { baselineStart: D1 });

    const upd = await patchTask(admin.token, team.id, proj.id, t.id as string, {
      actualEnd: D2,
      percentComplete: 100,
      baselineStart: null,
    });
    expect(upd.statusCode).toBe(200);
    const b = upd.json();
    expect(b.actualEnd).toBe(D2);
    expect(b.percentComplete).toBe(100);
    expect(b.baselineStart).toBeNull();
  });

  it('rejects percentComplete outside 0..100 (400)', async () => {
    const admin = await register('admin@x.com', 'ADMIN');
    const team = await createTeam(admin.token, 'team-a');
    const proj = await createProject(admin.token, team.id);
    const res = await createTaskRaw(admin.token, team.id, proj.id, { percentComplete: 150 });
    expect(res.statusCode).toBe(400);
  });
});
