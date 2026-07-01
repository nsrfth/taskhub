import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { prisma } from '../../src/data/prisma.js';
import { bootstrapUser } from '../helpers/bootstrapUser.js';

// v2.5.17: bulk Excel export for the Projects page.

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
async function register(email: string, globalRole: 'ADMIN' | 'MEMBER' = 'MEMBER') {
  const r = await bootstrapUser(app, { email, name: email.split('@')[0], password: PASSWORD, globalRole });
  return { token: r.token, userId: r.userId };
}
async function createTeam(token: string, slug: string): Promise<{ id: string }> {
  const res = await app.inject({ method: 'POST', url: '/api/teams', headers: auth(token), payload: { name: slug, slug } });
  if (res.statusCode !== 201) throw new Error(`createTeam: ${res.statusCode} ${res.body}`);
  return res.json() as { id: string };
}
async function addMember(adminToken: string, teamId: string, email: string, role: 'MEMBER' | 'MANAGER' = 'MEMBER') {
  const res = await app.inject({ method: 'POST', url: `/api/teams/${teamId}/members`, headers: auth(adminToken), payload: { email, role } });
  if (res.statusCode !== 201) throw new Error(`addMember: ${res.statusCode} ${res.body}`);
}
async function createProject(token: string, teamId: string, name = 'Test Project'): Promise<{ id: string }> {
  const res = await app.inject({ method: 'POST', url: `/api/teams/${teamId}/projects`, headers: auth(token), payload: { name } });
  if (res.statusCode !== 201) throw new Error(`createProject: ${res.statusCode} ${res.body}`);
  return res.json() as { id: string };
}
async function postExport(token: string, teamId: string, projectIds: string[]) {
  return app.inject({
    method: 'POST',
    url: `/api/teams/${teamId}/projects/export.xlsx`,
    headers: auth(token),
    payload: { projectIds },
  });
}

describe('POST /teams/:teamId/projects/export.xlsx', () => {
  it('returns an xlsx binary for a valid project', async () => {
    const owner = await register('owner@x.test', 'ADMIN');
    const team = await createTeam(owner.token, 'team-export');
    const project = await createProject(owner.token, team.id, 'Alpha');

    const res = await postExport(owner.token, team.id, [project.id]);

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
    expect(res.headers['content-disposition']).toContain('projects-export.xlsx');
    // xlsx files start with the PK zip magic bytes 50 4B 03 04
    const buf = Buffer.from(res.rawPayload);
    expect(buf[0]).toBe(0x50); // P
    expect(buf[1]).toBe(0x4b); // K
  });

  it('silently skips a project the caller cannot access', async () => {
    const owner = await register('owner2@x.test', 'ADMIN');
    const stranger = await register('stranger@x.test', 'MEMBER');
    const ownerTeam = await createTeam(owner.token, 'team-owner');
    const strangerTeam = await createTeam(stranger.token, 'team-stranger');
    const ownerProject = await createProject(owner.token, ownerTeam.id, 'Owned');
    const strangerProject = await createProject(stranger.token, strangerTeam.id, 'Foreign');

    // Owner asks to export their own project AND the foreign one — foreign must be silently skipped.
    // Both projectIds are passed; the foreign project.teamId !== ownerTeam.id so resolveProjectAccess returns NONE.
    const res = await postExport(owner.token, ownerTeam.id, [ownerProject.id, strangerProject.id]);

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
  });

  it('returns 400 when projectIds is empty', async () => {
    const owner = await register('owner3@x.test', 'ADMIN');
    const team = await createTeam(owner.token, 'team-empty');

    const res = await postExport(owner.token, team.id, []);
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when projectIds exceeds the 200-project cap', async () => {
    const owner = await register('owner4@x.test', 'ADMIN');
    const team = await createTeam(owner.token, 'team-cap');
    const tooMany = Array.from({ length: 201 }, (_, i) => `fake-id-${i}`);

    const res = await postExport(owner.token, team.id, tooMany);
    expect(res.statusCode).toBe(400);
  });

  it('returns 401 for unauthenticated requests', async () => {
    const owner = await register('owner5@x.test', 'ADMIN');
    const team = await createTeam(owner.token, 'team-unauth');
    const project = await createProject(owner.token, team.id, 'Proj');

    const res = await app.inject({
      method: 'POST',
      url: `/api/teams/${team.id}/projects/export.xlsx`,
      payload: { projectIds: [project.id] },
    });
    expect(res.statusCode).toBe(401);
  });
});
