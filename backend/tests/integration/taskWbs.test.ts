import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { prisma } from '../../src/data/prisma.js';
import { bootstrapUser } from '../helpers/bootstrapUser.js';

// v1.97 (PMIS R1 — neutral core): WBS n-level task tree.
//
// Covers:
//   - create with parentId nests; GET /wbs derives wbsCode/wbsDepth/isSummary
//   - leaf-weighted rollupPercentComplete on summary nodes
//   - move reparents + reorders; self-parent and cycles are rejected (400)
//   - an invalid/cross-project parent on create → 400
//   - soft-deleting a summary task floats its children up to roots in /wbs
//   - cross-team caller → 404 on both /wbs and move

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

async function createTask(
  token: string,
  teamId: string,
  projectId: string,
  title: string,
  extra: { parentId?: string; percentComplete?: number } = {},
): Promise<{ statusCode: number; id?: string }> {
  const r = await app.inject({
    method: 'POST',
    url: `/api/teams/${teamId}/projects/${projectId}/tasks`,
    headers: { authorization: `Bearer ${token}` },
    payload: { title, ...extra },
  });
  return { statusCode: r.statusCode, id: r.statusCode === 201 ? (r.json().id as string) : undefined };
}

async function wbs(token: string, teamId: string, projectId: string) {
  return app.inject({
    method: 'GET',
    url: `/api/teams/${teamId}/projects/${projectId}/wbs`,
    headers: { authorization: `Bearer ${token}` },
  });
}

async function move(
  token: string,
  teamId: string,
  projectId: string,
  taskId: string,
  newParentId: string | null,
  position: number,
) {
  return app.inject({
    method: 'POST',
    url: `/api/teams/${teamId}/projects/${projectId}/tasks/${taskId}/move`,
    headers: { authorization: `Bearer ${token}` },
    payload: { newParentId, position },
  });
}

type Node = {
  id: string;
  parentId: string | null;
  wbsCode: string;
  wbsDepth: number;
  isSummary: boolean;
  rollupPercentComplete: number;
};

describe('Task WBS', () => {
  it('derives wbsCode / depth / isSummary for a nested tree', async () => {
    const a = await register('a@example.com');
    const teamId = await createTeam(a.token, 'wbs-a');
    const projectId = await createProject(a.token, teamId, 'P');

    const r1 = await createTask(a.token, teamId, projectId, 'R1');
    const c1 = await createTask(a.token, teamId, projectId, 'C1', { parentId: r1.id });
    const c2 = await createTask(a.token, teamId, projectId, 'C2', { parentId: r1.id });
    const g = await createTask(a.token, teamId, projectId, 'G', { parentId: c1.id });

    const res = await wbs(a.token, teamId, projectId);
    expect(res.statusCode).toBe(200);
    const items = res.json().items as Node[];
    const by = (id: string | undefined) => items.find((n) => n.id === id)!;

    // DFS pre-order: R1, C1, G, C2.
    expect(items.map((n) => n.wbsCode)).toEqual(['1', '1.1', '1.1.1', '1.2']);
    expect(by(r1.id)).toMatchObject({ wbsCode: '1', wbsDepth: 0, isSummary: true });
    expect(by(c1.id)).toMatchObject({ wbsCode: '1.1', wbsDepth: 1, isSummary: true });
    expect(by(g.id)).toMatchObject({ wbsCode: '1.1.1', wbsDepth: 2, isSummary: false });
    expect(by(c2.id)).toMatchObject({ wbsCode: '1.2', wbsDepth: 1, isSummary: false });
  });

  it('rolls up percent-complete as a leaf-weighted average', async () => {
    const a = await register('a@example.com');
    const teamId = await createTeam(a.token, 'wbs-a');
    const projectId = await createProject(a.token, teamId, 'P');

    const r1 = await createTask(a.token, teamId, projectId, 'R1');
    const c1 = await createTask(a.token, teamId, projectId, 'C1', { parentId: r1.id });
    const g = await createTask(a.token, teamId, projectId, 'G', { parentId: c1.id, percentComplete: 50 });
    const c2 = await createTask(a.token, teamId, projectId, 'C2', { parentId: r1.id, percentComplete: 100 });

    const items = (await wbs(a.token, teamId, projectId)).json().items as Node[];
    const by = (id: string | undefined) => items.find((n) => n.id === id)!;
    // R1 has two leaves: G(50) and C2(100) → average 75. C1 has only G → 50.
    expect(by(r1.id).rollupPercentComplete).toBe(75);
    expect(by(c1.id).rollupPercentComplete).toBe(50);
    expect(by(g.id).rollupPercentComplete).toBe(50);
    expect(by(c2.id).rollupPercentComplete).toBe(100);
  });

  it('rejects an invalid / cross-project parent on create with 400', async () => {
    const a = await register('a@example.com');
    const teamId = await createTeam(a.token, 'wbs-a');
    const projA = await createProject(a.token, teamId, 'PA');
    const projB = await createProject(a.token, teamId, 'PB');
    const inB = await createTask(a.token, teamId, projB, 'B-task');

    // Parent lives in projB but we're creating in projA → 400.
    const res = await createTask(a.token, teamId, projA, 'X', { parentId: inB.id });
    expect(res.statusCode).toBe(400);
  });

  it('move reparents a task into the tree', async () => {
    const a = await register('a@example.com');
    const teamId = await createTeam(a.token, 'wbs-a');
    const projectId = await createProject(a.token, teamId, 'P');
    const p = await createTask(a.token, teamId, projectId, 'P1');
    const q = await createTask(a.token, teamId, projectId, 'Q1');

    // Q starts as a root sibling of P; move it under P.
    expect((await move(a.token, teamId, projectId, q.id!, p.id!, 0)).statusCode).toBe(200);
    const items = (await wbs(a.token, teamId, projectId)).json().items as Node[];
    expect(items.find((n) => n.id === q.id)).toMatchObject({
      parentId: p.id,
      wbsCode: '1.1',
      wbsDepth: 1,
    });
    expect(items.find((n) => n.id === p.id)).toMatchObject({ isSummary: true });
  });

  it('rejects self-parent and cycle moves with 400', async () => {
    const a = await register('a@example.com');
    const teamId = await createTeam(a.token, 'wbs-a');
    const projectId = await createProject(a.token, teamId, 'P');
    const p = await createTask(a.token, teamId, projectId, 'P1');
    const x = await createTask(a.token, teamId, projectId, 'X', { parentId: p.id });

    // self-parent
    expect((await move(a.token, teamId, projectId, p.id!, p.id!, 0)).statusCode).toBe(400);
    // cycle: move P under its own child X
    expect((await move(a.token, teamId, projectId, p.id!, x.id!, 0)).statusCode).toBe(400);
  });

  it('floats children up to roots when their parent is soft-deleted', async () => {
    const a = await register('a@example.com');
    const teamId = await createTeam(a.token, 'wbs-a');
    const projectId = await createProject(a.token, teamId, 'P');
    const p = await createTask(a.token, teamId, projectId, 'P1');
    const x = await createTask(a.token, teamId, projectId, 'X', { parentId: p.id });

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/teams/${teamId}/projects/${projectId}/tasks/${p.id}`,
      headers: { authorization: `Bearer ${a.token}` },
    });
    expect(del.statusCode).toBe(204);

    const items = (await wbs(a.token, teamId, projectId)).json().items as Node[];
    // Only X remains, surfaced as a root.
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: x.id, wbsCode: '1', wbsDepth: 0 });
  });

  it('hides another team\'s WBS + blocks cross-team move (404)', async () => {
    const a = await register('a@example.com');
    const b = await register('b@example.com', 'Bob');
    const teamA = await createTeam(a.token, 'wbs-a');
    await createTeam(b.token, 'wbs-b');
    const projA = await createProject(a.token, teamA, 'PA');
    const t = await createTask(a.token, teamA, projA, 'T');

    expect((await wbs(b.token, teamA, projA)).statusCode).toBe(404);
    expect((await move(b.token, teamA, projA, t.id!, null, 0)).statusCode).toBe(404);
  });
});
