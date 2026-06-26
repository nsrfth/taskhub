import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { prisma } from '../../src/data/prisma.js';
import { bootstrapUser } from '../helpers/bootstrapUser.js';

let app: FastifyInstance;

beforeAll(async () => {
  process.env.MASTER_KEY ??= '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
  app = await buildApp(loadEnv());
});
afterAll(async () => {
  if (app) await app.close();
});

beforeEach(async () => {
  await prisma.baselineEntry.deleteMany();
  await prisma.projectBaseline.deleteMany();
  await prisma.taskDependency.deleteMany();
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
const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function register(email: string) {
  const r = await bootstrapUser(app, { email, password: PASSWORD });
  return { token: r.token, userId: r.userId };
}
async function createTeam(token: string, slug: string) {
  const r = await app.inject({ method: 'POST', url: '/api/teams', headers: auth(token), payload: { name: slug, slug } });
  return r.json().id as string;
}
async function createProject(token: string, teamId: string, name: string) {
  const r = await app.inject({ method: 'POST', url: `/api/teams/${teamId}/projects`, headers: auth(token), payload: { name } });
  return r.json().id as string;
}
async function enableModules(token: string, teamId: string, projectId: string) {
  await app.inject({
    method: 'PUT',
    url: `/api/teams/${teamId}/projects/${projectId}/profile/overrides`,
    headers: auth(token),
    payload: {
      overrides: { cpm_schedule: { enabled: true }, baselines: { enabled: true } },
    },
  });
}
async function createTask(
  token: string,
  teamId: string,
  projectId: string,
  title: string,
  extra: Record<string, unknown> = {},
) {
  const r = await app.inject({
    method: 'POST',
    url: `/api/teams/${teamId}/projects/${projectId}/tasks`,
    headers: auth(token),
    payload: { title, ...extra },
  });
  if (r.statusCode !== 201) throw new Error(r.body);
  return r.json().id as string;
}

describe('PMIS R5 scheduling', () => {
  it('stores dependency lag and returns it in the list', async () => {
    const a = await register('a@example.com');
    const teamId = await createTeam(a.token, 'sch-a');
    const projectId = await createProject(a.token, teamId, 'P');
    const t1 = await createTask(a.token, teamId, projectId, 'A', {
      startDate: '2026-06-01T00:00:00.000Z',
      dueDate: '2026-06-03T00:00:00.000Z',
    });
    const t2 = await createTask(a.token, teamId, projectId, 'B', {
      startDate: '2026-06-04T00:00:00.000Z',
      dueDate: '2026-06-06T00:00:00.000Z',
    });
    const dep = await app.inject({
      method: 'POST',
      url: `/api/teams/${teamId}/projects/${projectId}/tasks/${t2}/dependencies`,
      headers: auth(a.token),
      payload: { dependsOnId: t1, lag: 2, lagUnit: 'DAY', calendarMode: 'CALENDAR' },
    });
    expect(dep.statusCode).toBe(201);
    expect(dep.json()).toMatchObject({ lag: 2, lagUnit: 'DAY', calendarMode: 'CALENDAR' });
  });

  it('gates gantt criticalPath behind cpm_schedule module', async () => {
    const a = await register('a@example.com');
    const teamId = await createTeam(a.token, 'sch-b');
    const projectId = await createProject(a.token, teamId, 'P');
    const blocked = await app.inject({
      method: 'GET',
      url: `/api/teams/${teamId}/projects/${projectId}/reports/gantt?include=criticalPath`,
      headers: auth(a.token),
    });
    expect(blocked.statusCode).toBe(403);
    await enableModules(a.token, teamId, projectId);
    const ok = await app.inject({
      method: 'GET',
      url: `/api/teams/${teamId}/projects/${projectId}/reports/gantt?include=criticalPath`,
      headers: auth(a.token),
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().scheduleVersion).toBeDefined();
  });

  it('captures BaselineEntry rows and compare reports slip', async () => {
    const a = await register('a@example.com');
    const teamId = await createTeam(a.token, 'sch-c');
    const projectId = await createProject(a.token, teamId, 'P');
    await enableModules(a.token, teamId, projectId);
    await createTask(a.token, teamId, projectId, 'T1', {
      startDate: '2026-06-01T00:00:00.000Z',
      dueDate: '2026-06-05T00:00:00.000Z',
    });
    expect((await app.inject({
      method: 'POST',
      url: `/api/teams/${teamId}/projects/${projectId}/baselines`,
      headers: auth(a.token),
      payload: { name: 'BL1' },
    })).statusCode).toBe(201);
    const cmp = await app.inject({
      method: 'GET',
      url: `/api/teams/${teamId}/projects/${projectId}/baselines/compare`,
      headers: auth(a.token),
    });
    expect(cmp.statusCode).toBe(200);
    expect(cmp.json().rows).toHaveLength(1);
  });

  it('rejects a cyclic dependency with DEPENDENCY_CYCLE', async () => {
    const a = await register('a@example.com');
    const teamId = await createTeam(a.token, 'sch-d');
    const projectId = await createProject(a.token, teamId, 'P');
    const t1 = await createTask(a.token, teamId, projectId, 'A');
    const t2 = await createTask(a.token, teamId, projectId, 'B');
    await app.inject({
      method: 'POST',
      url: `/api/teams/${teamId}/projects/${projectId}/tasks/${t2}/dependencies`,
      headers: auth(a.token),
      payload: { dependsOnId: t1 },
    });
    const cycle = await app.inject({
      method: 'POST',
      url: `/api/teams/${teamId}/projects/${projectId}/tasks/${t1}/dependencies`,
      headers: auth(a.token),
      payload: { dependsOnId: t2 },
    });
    expect(cycle.statusCode).toBe(409);
    expect(cycle.json().error.code).toBe('DEPENDENCY_CYCLE');
  });
});
