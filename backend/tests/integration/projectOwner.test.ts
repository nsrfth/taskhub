import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { prisma } from '../../src/data/prisma.js';
import { bootstrapUser } from '../helpers/bootstrapUser.js';

// v1.85: selectable project OWNER at creation (was ignored — owner was always
// forced to the creator). Owner = FULL project access, so a chosen owner must
// be a team member; default (no ownerId) = the creator (non-breaking).

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(loadEnv());
});
afterAll(async () => {
  if (app) await app.close();
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
const H = (t: string) => ({ authorization: `Bearer ${t}` });

// creator = first user → global ADMIN; member = a regular team member who can
// be chosen as owner; both share one team.
async function setup() {
  const creator = await bootstrapUser(app, { email: 'creator@example.com', name: 'Creator', password: PASSWORD });
  const member = await bootstrapUser(app, { email: 'member@example.com', name: 'Member', password: PASSWORD });
  const team = await app.inject({
    method: 'POST', url: '/api/teams', headers: H(creator.token), payload: { name: 'OwnTeam', slug: 'own-team' },
  });
  const teamId = team.json().id as string;
  await app.inject({
    method: 'POST', url: `/api/teams/${teamId}/members`, headers: H(creator.token),
    payload: { email: 'member@example.com', role: 'MEMBER' },
  });
  return {
    creatorToken: creator.token, creatorId: creator.userId,
    memberToken: member.token, memberId: member.userId,
    teamId,
  };
}
function createProject(token: string, teamId: string, payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: `/api/teams/${teamId}/projects`, headers: H(token), payload: { name: 'P', ...payload } });
}

describe('Project owner — selectable at creation (v1.85)', () => {
  it('1. create WITHOUT ownerId → owner defaults to the creator (unchanged behaviour)', async () => {
    const s = await setup();
    const res = await createProject(s.creatorToken, s.teamId, {});
    expect(res.statusCode).toBe(201);
    expect(res.json().ownerId).toBe(s.creatorId);
  });

  it('2. choosing an eligible team member as owner PERSISTS that ownerId (field now honored)', async () => {
    const s = await setup();
    const res = await createProject(s.creatorToken, s.teamId, { ownerId: s.memberId });
    expect(res.statusCode).toBe(201);
    expect(res.json().ownerId).toBe(s.memberId);
    // Proven via the DB too, not just the projection.
    const row = await prisma.project.findUnique({ where: { id: res.json().id }, select: { ownerId: true } });
    expect(row?.ownerId).toBe(s.memberId);
  });

  it('3. ownerId that is NOT a team member → 400', async () => {
    const s = await setup();
    const outsider = await bootstrapUser(app, { email: 'outsider@example.com', name: 'Outsider', password: PASSWORD });
    const res = await createProject(s.creatorToken, s.teamId, { ownerId: outsider.userId });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toMatch(/team/i);
  });

  it('4. the chosen owner has FULL project access — edit + nested task write', async () => {
    const s = await setup();
    const created = await createProject(s.creatorToken, s.teamId, { ownerId: s.memberId });
    const projectId = created.json().id as string;
    // As the chosen owner (a plain MEMBER): rename the project (edit)…
    const edit = await app.inject({
      method: 'PATCH', url: `/api/teams/${s.teamId}/projects/${projectId}`, headers: H(s.memberToken),
      payload: { name: 'Renamed by owner' },
    });
    expect(edit.statusCode).toBe(200);
    expect(edit.json().name).toBe('Renamed by owner');
    // …and create a task under it (nested write).
    const task = await app.inject({
      method: 'POST', url: `/api/teams/${s.teamId}/projects/${projectId}/tasks`, headers: H(s.memberToken),
      payload: { title: 'Owner task' },
    });
    expect(task.statusCode).toBe(201);
  });

  it('5. creator stays distinct from a changed owner (not conflated)', async () => {
    const s = await setup();
    const res = await createProject(s.creatorToken, s.teamId, { ownerId: s.memberId });
    const ownerId = res.json().ownerId as string;
    expect(ownerId).toBe(s.memberId);
    expect(ownerId).not.toBe(s.creatorId); // the requester (creator) is NOT the owner
  });

  it('6. ownerId: null → falls back to the creator (nullish default)', async () => {
    const s = await setup();
    const res = await createProject(s.creatorToken, s.teamId, { ownerId: null });
    expect(res.statusCode).toBe(201);
    expect(res.json().ownerId).toBe(s.creatorId);
  });
});
