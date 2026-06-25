import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { prisma } from '../../src/data/prisma.js';
import { bootstrapUser } from '../helpers/bootstrapUser.js';

// v1.94 (PMIS R1 — neutral core): task RACI (Consulted/Informed) legs.
//
// Covers:
//   - PUT sets the C/I set; GET reads it back (replace-set semantics)
//   - PUT replaces the whole set (not append); empty entries clears it
//   - the same user may hold both CONSULTED and INFORMED (per-(task,user,role))
//   - duplicate (userId, role) entries are deduped to one row
//   - an entry user who is not a team member → 400
//   - a task id from another project in the same team → 404 (chain mismatch)
//   - cross-team caller → 404 (opaque; project existence is hidden)
//   - hard-deleting the task cascades the RACI rows away

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
  await prisma.taskRaci.deleteMany();
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
  const fullSlug = slug.length < 3 ? `raci-team-${slug}` : slug;
  const r = await app.inject({
    method: 'POST',
    url: '/api/teams',
    headers: { authorization: `Bearer ${token}` },
    payload: { name: fullSlug, slug: fullSlug },
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

async function createTask(
  token: string,
  teamId: string,
  projectId: string,
  title: string,
): Promise<string> {
  const r = await app.inject({
    method: 'POST',
    url: `/api/teams/${teamId}/projects/${projectId}/tasks`,
    headers: { authorization: `Bearer ${token}` },
    payload: { title },
  });
  if (r.statusCode !== 201) throw new Error(`createTask failed: ${r.statusCode} ${r.body}`);
  return r.json().id as string;
}

type Entry = { userId: string; role: 'CONSULTED' | 'INFORMED' };

async function putRaci(
  token: string,
  teamId: string,
  projectId: string,
  taskId: string,
  entries: Entry[],
): Promise<ReturnType<typeof app.inject> extends Promise<infer R> ? R : never> {
  return app.inject({
    method: 'PUT',
    url: `/api/teams/${teamId}/projects/${projectId}/tasks/${taskId}/raci`,
    headers: { authorization: `Bearer ${token}` },
    payload: { entries },
  });
}

async function getRaci(
  token: string,
  teamId: string,
  projectId: string,
  taskId: string,
): Promise<ReturnType<typeof app.inject> extends Promise<infer R> ? R : never> {
  return app.inject({
    method: 'GET',
    url: `/api/teams/${teamId}/projects/${projectId}/tasks/${taskId}/raci`,
    headers: { authorization: `Bearer ${token}` },
  });
}

// First-registered user is global ADMIN; creating a team makes the creator its
// MANAGER (a TeamMembership row), so they pass the entry membership check.
describe('Task RACI (Consulted/Informed)', () => {
  it('PUT sets the C/I set and GET reads it back', async () => {
    const a = await register('a@example.com', 'Alice');
    const b = await register('b@example.com', 'Bob');
    const teamId = await createTeam(a.token, 'raci-a');
    await prisma.teamMembership.create({ data: { userId: b.userId, teamId, role: 'MEMBER' } });
    const projectId = await createProject(a.token, teamId, 'P');
    const taskId = await createTask(a.token, teamId, projectId, 'T');

    const put = await putRaci(a.token, teamId, projectId, taskId, [
      { userId: a.userId, role: 'CONSULTED' },
      { userId: b.userId, role: 'INFORMED' },
    ]);
    expect(put.statusCode).toBe(200);

    const get = await getRaci(a.token, teamId, projectId, taskId);
    expect(get.statusCode).toBe(200);
    const entries = get.json().entries as Array<Entry & { userName: string | null }>;
    expect(entries).toHaveLength(2);
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: a.userId, role: 'CONSULTED', userName: 'Alice' }),
        expect.objectContaining({ userId: b.userId, role: 'INFORMED', userName: 'Bob' }),
      ]),
    );
  });

  it('PUT replaces the whole set (not append); empty clears it', async () => {
    const a = await register('a@example.com');
    const b = await register('b@example.com', 'Bob');
    const teamId = await createTeam(a.token, 'raci-a');
    await prisma.teamMembership.create({ data: { userId: b.userId, teamId, role: 'MEMBER' } });
    const projectId = await createProject(a.token, teamId, 'P');
    const taskId = await createTask(a.token, teamId, projectId, 'T');

    expect((await putRaci(a.token, teamId, projectId, taskId, [
      { userId: a.userId, role: 'CONSULTED' },
    ])).statusCode).toBe(200);

    // Replace with a different single entry — the old one must be gone.
    const replaced = await putRaci(a.token, teamId, projectId, taskId, [
      { userId: b.userId, role: 'INFORMED' },
    ]);
    expect(replaced.statusCode).toBe(200);
    let entries = replaced.json().entries as Entry[];
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ userId: b.userId, role: 'INFORMED' });

    // Empty entries clears the set entirely.
    const cleared = await putRaci(a.token, teamId, projectId, taskId, []);
    expect(cleared.statusCode).toBe(200);
    entries = cleared.json().entries as Entry[];
    expect(entries).toHaveLength(0);
  });

  it('lets the same user be both CONSULTED and INFORMED', async () => {
    const a = await register('a@example.com');
    const teamId = await createTeam(a.token, 'raci-a');
    const projectId = await createProject(a.token, teamId, 'P');
    const taskId = await createTask(a.token, teamId, projectId, 'T');

    const put = await putRaci(a.token, teamId, projectId, taskId, [
      { userId: a.userId, role: 'CONSULTED' },
      { userId: a.userId, role: 'INFORMED' },
    ]);
    expect(put.statusCode).toBe(200);
    expect(put.json().entries).toHaveLength(2);
  });

  it('dedupes a repeated (userId, role) entry to a single row', async () => {
    const a = await register('a@example.com');
    const teamId = await createTeam(a.token, 'raci-a');
    const projectId = await createProject(a.token, teamId, 'P');
    const taskId = await createTask(a.token, teamId, projectId, 'T');

    const put = await putRaci(a.token, teamId, projectId, taskId, [
      { userId: a.userId, role: 'CONSULTED' },
      { userId: a.userId, role: 'CONSULTED' },
    ]);
    expect(put.statusCode).toBe(200);
    expect(put.json().entries).toHaveLength(1);
    expect(await prisma.taskRaci.count({ where: { taskId } })).toBe(1);
  });

  it('rejects an entry user who is not a member of the team with 400', async () => {
    const a = await register('a@example.com');
    const outsider = await register('outsider@example.com');
    const teamId = await createTeam(a.token, 'raci-a');
    const projectId = await createProject(a.token, teamId, 'P');
    const taskId = await createTask(a.token, teamId, projectId, 'T');

    const put = await putRaci(a.token, teamId, projectId, taskId, [
      { userId: outsider.userId, role: 'CONSULTED' },
    ]);
    expect(put.statusCode).toBe(400);
  });

  it('rejects a task id from another project in the same team with 404', async () => {
    const a = await register('a@example.com');
    const teamId = await createTeam(a.token, 'raci-a');
    const projA = await createProject(a.token, teamId, 'PA');
    const projB = await createProject(a.token, teamId, 'PB');
    const taskA = await createTask(a.token, teamId, projA, 'A');

    // Same team + valid project, but the task belongs to projA, not projB.
    const put = await putRaci(a.token, teamId, projB, taskA, [
      { userId: a.userId, role: 'CONSULTED' },
    ]);
    expect(put.statusCode).toBe(404);
  });

  it('hides another team\'s task RACI from a cross-team caller (404)', async () => {
    const a = await register('a@example.com');
    const b = await register('b@example.com', 'Bob');
    const teamA = await createTeam(a.token, 'raci-a');
    await createTeam(b.token, 'raci-b');
    const projA = await createProject(a.token, teamA, 'PA');
    const taskA = await createTask(a.token, teamA, projA, 'A');

    // B is not a member of teamA and has no granted project → opaque 404.
    const get = await getRaci(b.token, teamA, projA, taskA);
    expect(get.statusCode).toBe(404);
    const put = await putRaci(b.token, teamA, projA, taskA, [
      { userId: b.userId, role: 'CONSULTED' },
    ]);
    expect(put.statusCode).toBe(404);
  });

  it('cascades RACI rows when the task is hard-deleted', async () => {
    const a = await register('a@example.com');
    const teamId = await createTeam(a.token, 'raci-a');
    const projectId = await createProject(a.token, teamId, 'P');
    const taskId = await createTask(a.token, teamId, projectId, 'T');
    expect((await putRaci(a.token, teamId, projectId, taskId, [
      { userId: a.userId, role: 'CONSULTED' },
    ])).statusCode).toBe(200);

    await prisma.task.delete({ where: { id: taskId } });
    expect(await prisma.taskRaci.count({})).toBe(0);
  });
});
