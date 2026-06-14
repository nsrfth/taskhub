import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { GlobalRole } from '@prisma/client';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { prisma } from '../../src/data/prisma.js';
import { SYSTEM_USER_EMAIL } from '../../src/lib/systemUser.js';
import { bootstrapUser } from '../helpers/bootstrapUser.js';

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
  await prisma.projectGroupGrant.deleteMany();
  await prisma.userGroupMember.deleteMany();
  await prisma.userGroup.deleteMany();
  await prisma.teamMembership.deleteMany();
  await prisma.team.deleteMany();
  await prisma.user.deleteMany();
});

async function inject(opts: Parameters<FastifyInstance['inject']>[0]) {
  return app.inject(opts);
}

const PASSWORD = 'CorrectHorseBattery9';

type MembersPage = {
  items: Array<{
    userId: string;
    email: string;
    name: string;
    role: string;
    external: boolean;
    disabled: boolean;
    locked: boolean;
  }>;
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

async function manager() {
  return bootstrapUser(app, {
    email: 'mgr@example.com',
    name: 'Manager',
    password: PASSWORD,
    globalRole: GlobalRole.MEMBER,
  });
}

async function member(email: string, name?: string) {
  return bootstrapUser(app, {
    email,
    name: name ?? email.split('@')[0]!,
    password: PASSWORD,
    globalRole: GlobalRole.MEMBER,
  });
}

async function createTeamWithMembers(token: string, slug: string) {
  const team = (
    await inject({
      method: 'POST',
      url: '/api/teams',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'T', slug },
    })
  ).json() as { id: string };

  return team;
}

async function addTeamMember(token: string, teamId: string, email: string, role: 'MANAGER' | 'MEMBER' = 'MEMBER') {
  await inject({
    method: 'POST',
    url: `/api/teams/${teamId}/members`,
    headers: { authorization: `Bearer ${token}` },
    payload: { email, role },
  });
}

async function listMembers(token: string, teamId: string, query = ''): Promise<{ status: number; body: MembersPage }> {
  const res = await inject({
    method: 'GET',
    url: `/api/teams/${teamId}/members${query}`,
    headers: { authorization: `Bearer ${token}` },
  });
  return { status: res.statusCode, body: res.json() as MembersPage };
}

describe('GET /api/teams/:teamId/members — search, filter, sort, pagination (v1.55)', () => {
  it('1. no filters: page 1, correct totalItems/totalPages, system user absent', async () => {
    const mgr = await manager();
    const bob = await member('bob@example.com', 'Bob');
    const team = await createTeamWithMembers(mgr.token, 'members-1');
    await addTeamMember(mgr.token, team.id, bob.email);

    const sys = await prisma.user.create({
      data: {
        email: SYSTEM_USER_EMAIL,
        name: 'System',
        passwordHash: 'x',
        globalRole: GlobalRole.ADMIN,
        isSystemUser: true,
      },
    });
    await prisma.teamMembership.create({
      data: { teamId: team.id, userId: sys.id, role: 'MANAGER' },
    });

    const { status, body } = await listMembers(mgr.token, team.id);
    expect(status).toBe(200);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(25);
    expect(body.totalItems).toBe(2);
    expect(body.totalPages).toBe(1);
    expect(body.items).toHaveLength(2);
    expect(body.items.some((m) => m.email === SYSTEM_USER_EMAIL)).toBe(false);
  });

  it('2. search matches name and email case-insensitively; trims whitespace', async () => {
    const mgr = await manager();
    const team = await createTeamWithMembers(mgr.token, 'members-2');
    const alice = await member('alice@example.com', 'Alice Smith');
    const ali = await member('ali.khan@corp.com', 'Khan');
    await addTeamMember(mgr.token, team.id, alice.email);
    await addTeamMember(mgr.token, team.id, ali.email);
    await addTeamMember(mgr.token, team.id, 'bob@example.com');

    const byName = await listMembers(mgr.token, team.id, '?search=ali');
    expect(byName.body.totalItems).toBe(2);
    expect(byName.body.items.map((m) => m.email).sort()).toEqual(
      ['ali.khan@corp.com', 'alice@example.com'].sort(),
    );

    const trimmed = await listMembers(mgr.token, team.id, '?search=%20ALI%20');
    expect(trimmed.body.totalItems).toBe(2);
  });

  it('3. role, status, and kind filters', async () => {
    const mgr = await manager();
    const team = await createTeamWithMembers(mgr.token, 'members-3');
    const mem = await member('mem@example.com', 'Member User');
    const disabled = await member('disabled@example.com', 'Disabled');
    const locked = await member('locked@example.com', 'Locked');
    const external = await member('external@example.com', 'External');
    await addTeamMember(mgr.token, team.id, mem.email, 'MEMBER');
    await addTeamMember(mgr.token, team.id, disabled.email);
    await addTeamMember(mgr.token, team.id, locked.email);
    await prisma.user.update({
      where: { id: disabled.userId },
      data: { disabledAt: new Date() },
    });
    await prisma.user.update({
      where: { id: locked.userId },
      data: { lockedUntil: new Date(Date.now() + 60 * 60_000) },
    });

    const group = (
      await inject({
        method: 'POST',
        url: `/api/teams/${team.id}/groups`,
        headers: { authorization: `Bearer ${mgr.token}` },
        payload: { name: 'G' },
      })
    ).json() as { id: string };
    await inject({
      method: 'POST',
      url: `/api/teams/${team.id}/groups/${group.id}/members`,
      headers: { authorization: `Bearer ${mgr.token}` },
      payload: { userId: external.userId, accessLevel: 'READONLY' },
    });
    const pending = await prisma.userGroupMember.findFirst({
      where: { userId: external.userId, groupId: group.id },
    });
    await inject({
      method: 'POST',
      url: `/api/me/group-invites/${pending!.id}/accept`,
      headers: { authorization: `Bearer ${external.token}` },
    });

    const managers = await listMembers(mgr.token, team.id, '?role=MANAGER');
    expect(managers.body.items.every((m) => m.role === 'MANAGER' && !m.external)).toBe(true);
    expect(managers.body.items.some((m) => m.email === mem.email)).toBe(false);

    const disabledOnly = await listMembers(mgr.token, team.id, '?status=disabled');
    expect(disabledOnly.body.totalItems).toBe(1);
    expect(disabledOnly.body.items[0]!.email).toBe('disabled@example.com');

    const lockedOnly = await listMembers(mgr.token, team.id, '?status=locked');
    expect(lockedOnly.body.totalItems).toBe(1);
    expect(lockedOnly.body.items[0]!.email).toBe('locked@example.com');

    const activeOnly = await listMembers(mgr.token, team.id, '?status=active');
    expect(activeOnly.body.items.some((m) => m.email === 'disabled@example.com')).toBe(false);
    expect(activeOnly.body.items.some((m) => m.email === 'locked@example.com')).toBe(false);

    const membersOnly = await listMembers(mgr.token, team.id, '?kind=member');
    expect(membersOnly.body.items.every((m) => !m.external)).toBe(true);
    expect(membersOnly.body.items.some((m) => m.email === 'external@example.com')).toBe(false);

    const externalOnly = await listMembers(mgr.token, team.id, '?kind=external');
    expect(externalOnly.body.totalItems).toBe(1);
    expect(externalOnly.body.items[0]!.external).toBe(true);

    const allKind = await listMembers(mgr.token, team.id, '?kind=all');
    expect(allKind.body.totalItems).toBe(5);
  });

  it('4. sort by name, email, joinedAt, role asc and desc', async () => {
    const mgr = await manager();
    const team = await createTeamWithMembers(mgr.token, 'members-4');
    const z = await member('z@example.com', 'Zulu');
    const a = await member('a@example.com', 'Alpha');
    await addTeamMember(mgr.token, team.id, z.email);
    await addTeamMember(mgr.token, team.id, a.email);

    const nameAsc = await listMembers(mgr.token, team.id, '?sortBy=name&sortDir=asc&kind=member');
    expect(nameAsc.body.items.map((m) => m.name)).toEqual(['Alpha', 'Manager', 'Zulu']);

    const emailDesc = await listMembers(mgr.token, team.id, '?sortBy=email&sortDir=desc&kind=member');
    expect(emailDesc.body.items[0]!.email).toBe('z@example.com');

    const roleAsc = await listMembers(mgr.token, team.id, '?sortBy=role&sortDir=asc&kind=member');
    expect(roleAsc.body.items[0]!.role).toBe('MANAGER');

    const roleDesc = await listMembers(mgr.token, team.id, '?sortBy=role&sortDir=desc&kind=member');
    expect(roleDesc.body.items[0]!.role).toBe('MEMBER');

    const joinedAsc = await listMembers(mgr.token, team.id, '?sortBy=joinedAt&sortDir=asc&kind=member');
    expect(joinedAsc.body.items[0]!.email).toBe('mgr@example.com');
  });

  it('5. page 2 has no overlap; out-of-range page empty with correct totalPages', async () => {
    const mgr = await manager();
    const team = await createTeamWithMembers(mgr.token, 'members-5');
    for (let i = 0; i < 11; i++) {
      const u = await member(`user${i}@example.com`, `User ${i}`);
      await addTeamMember(mgr.token, team.id, u.email);
    }

    const p1 = await listMembers(mgr.token, team.id, '?page=1&pageSize=10&kind=member');
    expect(p1.body.items).toHaveLength(10);
    expect(p1.body.totalItems).toBe(12);
    expect(p1.body.totalPages).toBe(2);

    const p2 = await listMembers(mgr.token, team.id, '?page=2&pageSize=10&kind=member');
    expect(p2.body.items).toHaveLength(2);
    const ids1 = new Set(p1.body.items.map((m) => m.userId));
    for (const m of p2.body.items) expect(ids1.has(m.userId)).toBe(false);

    const p99 = await listMembers(mgr.token, team.id, '?page=99&pageSize=10&kind=member');
    expect(p99.body.items).toHaveLength(0);
    expect(p99.body.totalPages).toBe(2);
    expect(p99.body.page).toBe(99);
  });

  it('6. pageSize clamped; invalid enum returns 400', async () => {
    const mgr = await manager();
    const team = await createTeamWithMembers(mgr.token, 'members-6');
    await addTeamMember(mgr.token, team.id, 'one@example.com');

    const huge = await listMembers(mgr.token, team.id, '?pageSize=9999');
    expect(huge.body.pageSize).toBe(100);

    const zero = await listMembers(mgr.token, team.id, '?pageSize=0');
    expect(zero.body.pageSize).toBe(25);

    const badKind = await inject({
      method: 'GET',
      url: `/api/teams/${team.id}/members?kind=invalid`,
      headers: { authorization: `Bearer ${mgr.token}` },
    });
    expect(badKind.statusCode).toBe(400);
  });

  it('7. getDetail compat: embeds first page slice (default sort/filter)', async () => {
    const mgr = await manager();
    const team = await createTeamWithMembers(mgr.token, 'members-7');
    for (let i = 0; i < 30; i++) {
      const u = await member(`compat${i}@example.com`, `Compat ${String(i).padStart(2, '0')}`);
      await addTeamMember(mgr.token, team.id, u.email);
    }

    const detailRes = await inject({
      method: 'GET',
      url: `/api/teams/${team.id}`,
      headers: { authorization: `Bearer ${mgr.token}` },
    });
    expect(detailRes.statusCode).toBe(200);
    const detail = detailRes.json() as { members: Array<{ userId: string }> };
    expect(detail.members).toHaveLength(25);

    const paged = await listMembers(mgr.token, team.id, '?page=1&pageSize=25&kind=all&sortBy=joinedAt&sortDir=asc');
    expect(detail.members.map((m) => m.userId)).toEqual(paged.body.items.map((m) => m.userId));
  });

  it('8. system user never appears under any filter combination', async () => {
    const mgr = await manager();
    const team = await createTeamWithMembers(mgr.token, 'members-8');
    await addTeamMember(mgr.token, team.id, 'ali@example.com', 'MEMBER');
    const sys = await prisma.user.create({
      data: {
        email: SYSTEM_USER_EMAIL,
        name: 'System',
        passwordHash: 'x',
        globalRole: GlobalRole.ADMIN,
        isSystemUser: true,
      },
    });
    await prisma.teamMembership.create({
      data: { teamId: team.id, userId: sys.id, role: 'MANAGER' },
    });

    const queries = [
      '',
      '?search=admin',
      '?role=MANAGER',
      '?status=active',
      '?kind=all',
      '?sortBy=name&sortDir=desc',
      '?page=1&pageSize=10',
    ];
    for (const q of queries) {
      const { body } = await listMembers(mgr.token, team.id, q);
      expect(body.items.some((m) => m.email === SYSTEM_USER_EMAIL)).toBe(false);
    }
  });
});
