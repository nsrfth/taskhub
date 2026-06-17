import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { prisma } from '../../src/data/prisma.js';
import { bootstrapUser } from '../helpers/bootstrapUser.js';

// v1.79: project.write_all — permission-gated team-wide project WRITE.
// Regression coverage for the "Project not found" 404 a non-owner MANAGER hit
// when adding a task to a team project (the v1.39 owner-scoping side effect).

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
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.teamMembership.deleteMany();
  // Team delete cascades Role/RolePermission/UserGroup for the team.
  await prisma.team.deleteMany();
  await prisma.user.deleteMany();
});

const PASSWORD = 'CorrectHorseBattery9';

async function register(email: string, globalRole: 'ADMIN' | 'MEMBER') {
  const r = await bootstrapUser(app, {
    email,
    name: email.split('@')[0],
    password: PASSWORD,
    globalRole,
  });
  return { token: r.token, userId: r.userId };
}

async function createTeam(token: string, slug: string): Promise<{ id: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/teams',
    headers: { authorization: `Bearer ${token}` },
    payload: { name: slug, slug },
  });
  if (res.statusCode !== 201) throw new Error(`createTeam failed: ${res.statusCode} ${res.body}`);
  return res.json() as { id: string };
}

async function createProject(
  token: string,
  teamId: string,
  name = 'P1',
): Promise<{ id: string; ownerId: string | null }> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/teams/${teamId}/projects`,
    headers: { authorization: `Bearer ${token}` },
    payload: { name },
  });
  if (res.statusCode !== 201) throw new Error(`createProject failed: ${res.statusCode} ${res.body}`);
  return res.json() as { id: string; ownerId: string | null };
}

async function addMember(
  adminToken: string,
  teamId: string,
  email: string,
  role: 'MEMBER' | 'MANAGER',
): Promise<void> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/teams/${teamId}/members`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { email, role },
  });
  if (res.statusCode !== 201) throw new Error(`addMember failed: ${res.statusCode} ${res.body}`);
}

function createTask(token: string, teamId: string, projectId: string, title = 'New task') {
  return app.inject({
    method: 'POST',
    url: `/api/teams/${teamId}/projects/${projectId}/tasks`,
    headers: { authorization: `Bearer ${token}` },
    payload: { title },
  });
}

describe('project.write_all — team-wide manager write access', () => {
  it('lets a non-owner team MANAGER add a task (the fix) and do further nested writes', async () => {
    const admin = await register('admin@x.com', 'ADMIN');
    const team = await createTeam(admin.token, 'team-a');
    const project = await createProject(admin.token, team.id); // owned by admin
    const mgr = await register('mgr@x.com', 'MEMBER');
    await addMember(admin.token, team.id, 'mgr@x.com', 'MANAGER');

    const res = await createTask(mgr.token, team.id, project.id, 'Manager task');
    expect(res.statusCode).toBe(201);

    // Same manager can also update/move the task (nested write).
    const created = res.json() as { id: string };
    const upd = await app.inject({
      method: 'PATCH',
      url: `/api/teams/${team.id}/projects/${project.id}/tasks/${created.id}`,
      headers: { authorization: `Bearer ${mgr.token}` },
      payload: { title: 'renamed by manager' },
    });
    expect(upd.statusCode).toBe(200);
  });

  it('still returns 404 for a plain MEMBER without ownership or grant', async () => {
    const admin = await register('admin@x.com', 'ADMIN');
    const team = await createTeam(admin.token, 'team-a');
    const project = await createProject(admin.token, team.id);
    const mem = await register('mem@x.com', 'MEMBER');
    await addMember(admin.token, team.id, 'mem@x.com', 'MEMBER');

    const res = await createTask(mem.token, team.id, project.id);
    expect(res.statusCode).toBe(404);
  });

  it('keeps project.edit distinct: an edit-only custom role gets no nested write (404)', async () => {
    const admin = await register('admin@x.com', 'ADMIN');
    const team = await createTeam(admin.token, 'team-a');
    const project = await createProject(admin.token, team.id);
    const editor = await register('editor@x.com', 'MEMBER');
    await addMember(admin.token, team.id, 'editor@x.com', 'MEMBER');

    // Custom role with ONLY project.edit (no project.write_all).
    const role = await prisma.role.create({
      data: {
        teamId: team.id,
        name: 'Editors',
        permissions: { create: [{ permission: 'project.edit' }] },
      },
    });
    await prisma.teamMembership.update({
      where: { userId_teamId: { userId: editor.userId, teamId: team.id } },
      data: { roleId: role.id },
    });

    const res = await createTask(editor.token, team.id, project.id);
    expect(res.statusCode).toBe(404);
  });

  it('does not leak write_all across teams', async () => {
    const admin = await register('admin@x.com', 'ADMIN');
    const teamA = await createTeam(admin.token, 'team-a');
    const teamB = await createTeam(admin.token, 'team-b');
    const projectB = await createProject(admin.token, teamB.id, 'PB'); // owned by admin in B
    const user = await register('u@x.com', 'MEMBER');
    await addMember(admin.token, teamA.id, 'u@x.com', 'MANAGER'); // write_all in A
    await addMember(admin.token, teamB.id, 'u@x.com', 'MEMBER'); // plain member in B

    const res = await createTask(user.token, teamB.id, projectB.id);
    expect(res.statusCode).toBe(404);
  });

  it("seeds project.write_all on a new team's Manager system role by default", async () => {
    const admin = await register('admin@x.com', 'ADMIN');
    const team = await createTeam(admin.token, 'team-a');
    const role = await prisma.role.findUnique({
      where: { teamId_name: { teamId: team.id, name: 'Manager' } },
      include: { permissions: true },
    });
    const perms = role?.permissions.map((p) => p.permission) ?? [];
    expect(perms).toContain('project.write_all');
  });

  it('leaves the project-owner path intact (non-admin owner can write)', async () => {
    const admin = await register('admin@x.com', 'ADMIN');
    const team = await createTeam(admin.token, 'team-a');
    const owner = await register('owner@x.com', 'MEMBER');
    await addMember(admin.token, team.id, 'owner@x.com', 'MEMBER');
    const project = await prisma.project.create({
      data: { teamId: team.id, ownerId: owner.userId, name: 'Owned' },
    });

    const res = await createTask(owner.token, team.id, project.id);
    expect(res.statusCode).toBe(201);
  });

  it('leaves the global ADMIN path intact', async () => {
    const admin = await register('admin@x.com', 'ADMIN');
    const team = await createTeam(admin.token, 'team-a');
    const project = await createProject(admin.token, team.id);

    const res = await createTask(admin.token, team.id, project.id);
    expect(res.statusCode).toBe(201);
  });

  it('shows team projects to a write_all manager in the project list', async () => {
    const admin = await register('admin@x.com', 'ADMIN');
    const team = await createTeam(admin.token, 'team-a');
    const project = await createProject(admin.token, team.id, 'Visible');
    const mgr = await register('mgr@x.com', 'MEMBER');
    await addMember(admin.token, team.id, 'mgr@x.com', 'MANAGER');

    const res = await app.inject({
      method: 'GET',
      url: `/api/teams/${team.id}/projects`,
      headers: { authorization: `Bearer ${mgr.token}` },
    });
    expect(res.statusCode).toBe(200);
    const ids = (res.json() as Array<{ id: string }>).map((p) => p.id);
    expect(ids).toContain(project.id);
  });
});
