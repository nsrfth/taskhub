import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { prisma } from '../../src/data/prisma.js';
import { bootstrapUser } from '../helpers/bootstrapUser.js';

// v1.96 (PMIS R1 — neutral core): project schedule baselines.
//
// Covers:
//   - capture snapshots live tasks; returns isCurrent + taskCount + capturedBy
//   - a second capture demotes the previous one (exactly one isCurrent)
//   - GET lists baselines newest-first
//   - cross-team caller → 404 (opaque)
//   - project owner without core.capture_baseline → 403 (the perm half of the
//     dual gate fires after project WRITE passes via ownership)

let app: FastifyInstance;

beforeAll(async () => {
  process.env.MASTER_KEY ??=
    '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
  app = await buildApp(loadEnv());
});

afterAll(async () => {
  if (app) await app.close();
});

beforeEach(async () => {
  await prisma.projectBaseline.deleteMany();
  await prisma.task.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.project.deleteMany();
  await prisma.teamMembership.deleteMany();
  await prisma.role.deleteMany();
  await prisma.team.deleteMany();
  await prisma.user.deleteMany();
  await prisma.instanceSetting.deleteMany();
});

const PASSWORD = 'CorrectHorseBattery9';

async function register(email: string, name = 'User'): Promise<{ token: string; userId: string }> {
  const r = await bootstrapUser(app, { email, name, password: PASSWORD });
  return { token: r.token, userId: r.userId };
}

async function createTeam(token: string, slug: string): Promise<string> {
  const r = await app.inject({
    method: 'POST',
    url: '/api/teams',
    headers: { authorization: `Bearer ${token}` },
    payload: { name: slug, slug },
  });
  if (r.statusCode !== 201) throw new Error(`createTeam failed: ${r.statusCode} ${r.body}`);
  return r.json().id as string;
}

async function createProject(token: string, teamId: string, name: string): Promise<string> {
  const r = await app.inject({
    method: 'POST',
    url: `/api/teams/${teamId}/projects`,
    headers: { authorization: `Bearer ${token}` },
    payload: { name },
  });
  if (r.statusCode !== 201) throw new Error(`createProject failed: ${r.statusCode} ${r.body}`);
  return r.json().id as string;
}

async function createTask(token: string, teamId: string, projectId: string, title: string): Promise<void> {
  const r = await app.inject({
    method: 'POST',
    url: `/api/teams/${teamId}/projects/${projectId}/tasks`,
    headers: { authorization: `Bearer ${token}` },
    payload: { title },
  });
  if (r.statusCode !== 201) throw new Error(`createTask failed: ${r.statusCode} ${r.body}`);
}

async function capture(token: string, teamId: string, projectId: string, name: string) {
  return app.inject({
    method: 'POST',
    url: `/api/teams/${teamId}/projects/${projectId}/baselines`,
    headers: { authorization: `Bearer ${token}` },
    payload: { name },
  });
}

async function list(token: string, teamId: string, projectId: string) {
  return app.inject({
    method: 'GET',
    url: `/api/teams/${teamId}/projects/${projectId}/baselines`,
    headers: { authorization: `Bearer ${token}` },
  });
}

describe('Project baselines', () => {
  it('captures a baseline snapshotting live tasks', async () => {
    const a = await register('a@example.com', 'Alice');
    const teamId = await createTeam(a.token, 'bl-a');
    const projectId = await createProject(a.token, teamId, 'P');
    await createTask(a.token, teamId, projectId, 'T1');
    await createTask(a.token, teamId, projectId, 'T2');

    const res = await capture(a.token, teamId, projectId, 'BL1');
    expect(res.statusCode).toBe(201);
    const bl = res.json();
    expect(bl).toMatchObject({
      name: 'BL1',
      source: 'MANUAL',
      isCurrent: true,
      taskCount: 2,
      capturedByName: 'Alice',
    });
  });

  it('a second capture demotes the previous current baseline', async () => {
    const a = await register('a@example.com');
    const teamId = await createTeam(a.token, 'bl-a');
    const projectId = await createProject(a.token, teamId, 'P');
    await createTask(a.token, teamId, projectId, 'T1');

    expect((await capture(a.token, teamId, projectId, 'BL1')).statusCode).toBe(201);
    expect((await capture(a.token, teamId, projectId, 'BL2')).statusCode).toBe(201);

    const res = await list(a.token, teamId, projectId);
    expect(res.statusCode).toBe(200);
    const items = res.json().items as Array<{ name: string; isCurrent: boolean }>;
    expect(items).toHaveLength(2);
    // Newest first; exactly one current.
    expect(items[0]).toMatchObject({ name: 'BL2', isCurrent: true });
    expect(items.filter((i) => i.isCurrent)).toHaveLength(1);
    expect(items.find((i) => i.name === 'BL1')!.isCurrent).toBe(false);
  });

  it('hides another team\'s baselines from a cross-team caller (404)', async () => {
    const a = await register('a@example.com');
    const b = await register('b@example.com', 'Bob');
    const teamA = await createTeam(a.token, 'bl-a');
    await createTeam(b.token, 'bl-b');
    const projA = await createProject(a.token, teamA, 'PA');

    expect((await list(b.token, teamA, projA)).statusCode).toBe(404);
    expect((await capture(b.token, teamA, projA, 'X')).statusCode).toBe(404);
  });

  it('blocks a project owner who lacks core.capture_baseline (403)', async () => {
    // First user is global ADMIN; the owner B is a plain MEMBER. B owns the
    // project (→ project WRITE), but the Member role lacks core.capture_baseline,
    // so the permission half of the dual gate returns 403 (not 404).
    const admin = await register('admin@example.com');
    const b = await register('owner@example.com', 'Bob');
    const teamId = await createTeam(admin.token, 'bl-a');
    await prisma.teamMembership.create({ data: { userId: b.userId, teamId, role: 'MEMBER' } });
    const projectId = await createProject(b.token, teamId, 'P'); // B is owner

    const res = await capture(b.token, teamId, projectId, 'BL1');
    expect(res.statusCode).toBe(403);
  });
});
