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
  await prisma.userProjectBucketItem.deleteMany();
  await prisma.userProjectBucket.deleteMany();
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

describe('Personal project buckets', () => {
  it('creates buckets with unique names per user', async () => {
    const { token } = await registerUser('a@example.com');
    const res = await inject({
      method: 'POST',
      url: '/api/me/project-buckets',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'My Priorities', color: '#6366f1' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().name).toBe('My Priorities');

    const dup = await inject({
      method: 'POST',
      url: '/api/me/project-buckets',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'My Priorities' },
    });
    expect(dup.statusCode).toBe(409);
  });

  it('assigns visible projects to buckets without affecting other users', async () => {
    const owner = await registerUser('owner@example.com');
    const other = await registerUser('other@example.com');
    const team = await createTeam(owner.token);
    const project = await createProject(owner.token, team.id);

    const bucketRes = await inject({
      method: 'POST',
      url: '/api/me/project-buckets',
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: 'Q3' },
    });
    const bucketId = bucketRes.json().id;

    const add = await inject({
      method: 'POST',
      url: `/api/me/project-buckets/${bucketId}/projects/${project.id}`,
      headers: { authorization: `Bearer ${owner.token}` },
    });
    expect(add.statusCode).toBe(200);
    expect(add.json().projectIds).toContain(project.id);

    const list = await inject({
      method: 'GET',
      url: '/api/me/project-buckets',
      headers: { authorization: `Bearer ${owner.token}` },
    });
    expect(list.json().buckets[0].projectIds).toEqual([project.id]);

    const otherList = await inject({
      method: 'GET',
      url: '/api/me/project-buckets',
      headers: { authorization: `Bearer ${other.token}` },
    });
    expect(otherList.json().buckets).toEqual([]);

    const forbidden = await inject({
      method: 'POST',
      url: `/api/me/project-buckets/${bucketId}/projects/${project.id}`,
      headers: { authorization: `Bearer ${other.token}` },
    });
    expect(forbidden.statusCode).toBe(404);
  });

  it('deletes bucket without deleting projects', async () => {
    const { token } = await registerUser('del@example.com');
    const team = await createTeam(token);
    const project = await createProject(token, team.id);
    const bucketRes = await inject({
      method: 'POST',
      url: '/api/me/project-buckets',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Temp' },
    });
    const bucketId = bucketRes.json().id;
    await inject({
      method: 'POST',
      url: `/api/me/project-buckets/${bucketId}/projects/${project.id}`,
      headers: { authorization: `Bearer ${token}` },
    });

    const del = await inject({
      method: 'DELETE',
      url: `/api/me/project-buckets/${bucketId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(del.statusCode).toBe(204);

    const proj = await prisma.project.findUnique({ where: { id: project.id } });
    expect(proj).not.toBeNull();
  });

  it('sets multiple bucket assignments for one project', async () => {
    const { token } = await registerUser('multi@example.com');
    const team = await createTeam(token);
    const project = await createProject(token, team.id);

    const b1 = (
      await inject({
        method: 'POST',
        url: '/api/me/project-buckets',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'A' },
      })
    ).json();
    const b2 = (
      await inject({
        method: 'POST',
        url: '/api/me/project-buckets',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'B' },
      })
    ).json();

    const set = await inject({
      method: 'PUT',
      url: '/api/me/project-buckets/assignments',
      headers: { authorization: `Bearer ${token}` },
      payload: { projectId: project.id, bucketIds: [b1.id, b2.id] },
    });
    expect(set.statusCode).toBe(200);
    const buckets = set.json().buckets as { id: string; projectIds: string[] }[];
    expect(buckets.find((b) => b.id === b1.id)?.projectIds).toContain(project.id);
    expect(buckets.find((b) => b.id === b2.id)?.projectIds).toContain(project.id);
  });
});
