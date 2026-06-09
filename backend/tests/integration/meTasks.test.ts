import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { prisma } from '../../src/data/prisma.js';
import { bootstrapUser } from '../helpers/bootstrapUser.js';

let app: FastifyInstance;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET ||= 'test_access_secret_at_least_32_chars_long_xx';
  process.env.JWT_REFRESH_SECRET ||= 'test_refresh_secret_at_least_32_chars_long_x';
  process.env.CORS_ORIGINS ||= 'http://localhost:5173';
  process.env.COOKIE_SECURE ||= 'false';
  const env = loadEnv();
  app = await buildApp(env);
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await prisma.refreshToken.deleteMany();
  await prisma.passwordReset.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.teamMembership.deleteMany();
  await prisma.team.deleteMany();
  await prisma.user.deleteMany();
});

async function inject(opts: Parameters<FastifyInstance['inject']>[0]) {
  return app.inject(opts);
}

const PASSWORD = 'CorrectHorseBattery9';

async function registerUser(email: string): Promise<{ token: string; userId: string }> {
  const r = await bootstrapUser(app, { email, name: email.split('@')[0], password: PASSWORD });
  return { token: r.token, userId: r.userId };
}

async function createTeam(token: string, slug = 'team-a') {
  const res = await inject({
    method: 'POST',
    url: '/api/teams',
    headers: { authorization: `Bearer ${token}` },
    payload: { name: 'Team A', slug },
  });
  if (res.statusCode !== 201) throw new Error(`createTeam failed: ${res.statusCode}`);
  return res.json();
}

async function createProject(token: string, teamId: string, name = 'P1') {
  const res = await inject({
    method: 'POST',
    url: `/api/teams/${teamId}/projects`,
    headers: { authorization: `Bearer ${token}` },
    payload: { name },
  });
  if (res.statusCode !== 201) throw new Error(`createProject failed: ${res.statusCode}`);
  return res.json();
}

async function addMember(
  managerToken: string,
  teamId: string,
  email: string,
  role: 'MEMBER' | 'MANAGER' = 'MEMBER',
) {
  const res = await inject({
    method: 'POST',
    url: `/api/teams/${teamId}/members`,
    headers: { authorization: `Bearer ${managerToken}` },
    payload: { email, role },
  });
  if (res.statusCode !== 201) throw new Error(`addMember failed: ${res.statusCode}`);
  return res.json();
}

describe('GET /api/me/tasks', () => {
  it('returns tasks assigned to the caller across teams', async () => {
    const owner = await registerUser('owner@example.com');
    const assignee = await registerUser('assignee@example.com');
    const team = await createTeam(owner.token);
    await addMember(owner.token, team.id, 'assignee@example.com');

    const project = await createProject(owner.token, team.id);
    const createRes = await inject({
      method: 'POST',
      url: `/api/teams/${team.id}/projects/${project.id}/tasks`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { title: 'Mine', assigneeId: assignee.userId },
    });
    expect(createRes.statusCode).toBe(201);

    const listRes = await inject({
      method: 'GET',
      url: '/api/me/tasks',
      headers: { authorization: `Bearer ${assignee.token}` },
    });
    expect(listRes.statusCode).toBe(200);
    const body = listRes.json();
    expect(body.total).toBe(1);
    expect(body.items[0].title).toBe('Mine');
    expect(body.items[0].projectName).toBe('P1');
  });

  it('does not return tasks assigned to other users', async () => {
    const owner = await registerUser('owner2@example.com');
    const a = await registerUser('a2@example.com');
    const b = await registerUser('b2@example.com');
    const team = await createTeam(owner.token, 'team-b');
    await addMember(owner.token, team.id, 'a2@example.com');
    await addMember(owner.token, team.id, 'b2@example.com');

    const project = await createProject(owner.token, team.id, 'P2');
    await inject({
      method: 'POST',
      url: `/api/teams/${team.id}/projects/${project.id}/tasks`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { title: 'For A', assigneeId: a.userId },
    });
    await inject({
      method: 'POST',
      url: `/api/teams/${team.id}/projects/${project.id}/tasks`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { title: 'For B', assigneeId: b.userId },
    });

    const listRes = await inject({
      method: 'GET',
      url: '/api/me/tasks',
      headers: { authorization: `Bearer ${a.token}` },
    });
    const body = listRes.json();
    expect(body.total).toBe(1);
    expect(body.items[0].title).toBe('For A');
  });

  it('returns 403 when filtering by a team the user is not in', async () => {
    const owner = await registerUser('owner3@example.com');
    const outsider = await registerUser('outsider@example.com');
    const team = await createTeam(owner.token, 'team-c');

    const res = await inject({
      method: 'GET',
      url: `/api/me/tasks?teamId=${team.id}`,
      headers: { authorization: `Bearer ${outsider.token}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
