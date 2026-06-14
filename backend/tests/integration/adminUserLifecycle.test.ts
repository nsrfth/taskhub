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
  await prisma.activity.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.projectGroupGrant.deleteMany();
  await prisma.userGroupMember.deleteMany();
  await prisma.userGroup.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.teamMembership.deleteMany();
  await prisma.team.deleteMany();
  await prisma.user.deleteMany();
  await prisma.directory.deleteMany();
});

async function inject(opts: Parameters<FastifyInstance['inject']>[0]) {
  return app.inject(opts);
}

const PASSWORD = 'CorrectHorseBattery9';

async function adminUser() {
  return bootstrapUser(app, {
    email: 'admin@example.com',
    name: 'Admin',
    password: PASSWORD,
    globalRole: GlobalRole.ADMIN,
  });
}

async function memberUser(email: string) {
  return bootstrapUser(app, {
    email,
    name: email.split('@')[0]!,
    password: PASSWORD,
    globalRole: GlobalRole.MEMBER,
  });
}

describe('Admin user lifecycle v1.53', () => {
  it('1. disable sets disabledAt, revokes refresh tokens, rejects access token', async () => {
    const admin = await adminUser();
    const victim = await memberUser('victim@example.com');
    const tokenCountBefore = await prisma.refreshToken.count({ where: { userId: victim.userId } });
    expect(tokenCountBefore).toBeGreaterThan(0);

    const disable = await inject({
      method: 'POST',
      url: `/api/admin/users/${victim.userId}/disable`,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { disabled: true },
    });
    expect(disable.statusCode).toBe(200);

    const row = await prisma.user.findUnique({ where: { id: victim.userId } });
    expect(row!.disabledAt).not.toBeNull();

    const activeTokens = await prisma.refreshToken.count({
      where: { userId: victim.userId, revokedAt: null },
    });
    expect(activeTokens).toBe(0);

    const blocked = await inject({
      method: 'GET',
      url: '/api/projects',
      headers: { authorization: `Bearer ${victim.token}` },
    });
    expect(blocked.statusCode).toBe(401);
  });

  it('2. disabled group member loses access via token revocation + front door', async () => {
    const admin = await adminUser();
    const owner = await memberUser('owner@example.com');
    const grantee = await memberUser('grantee@example.com');
    const teamRes = await inject({
      method: 'POST',
      url: '/api/teams',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { name: 'T', slug: 'team-lc-2' },
    });
    const team = teamRes.json() as { id: string };
    for (const u of [owner, grantee]) {
      await inject({
        method: 'POST',
        url: `/api/teams/${team.id}/members`,
        headers: { authorization: `Bearer ${admin.token}` },
        payload: { email: u.email, role: 'MEMBER' },
      });
    }
    const proj = (
      await inject({
        method: 'POST',
        url: `/api/teams/${team.id}/projects`,
        headers: { authorization: `Bearer ${owner.token}` },
        payload: { name: 'G' },
      })
    ).json() as { id: string };
    const group = (
      await inject({
        method: 'POST',
        url: `/api/teams/${team.id}/groups`,
        headers: { authorization: `Bearer ${admin.token}` },
        payload: { name: 'G' },
      })
    ).json() as { id: string };
    await inject({
      method: 'POST',
      url: `/api/teams/${team.id}/groups/${group.id}/members`,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { userId: grantee.userId, accessLevel: 'FULL' },
    });
    await inject({
      method: 'PUT',
      url: `/api/teams/${team.id}/groups/${group.id}/projects`,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { projectIds: [proj.id] },
    });

    expect(
      (
        await inject({
          method: 'GET',
          url: `/api/teams/${team.id}/projects/${proj.id}/tasks`,
          headers: { authorization: `Bearer ${grantee.token}` },
        })
      ).statusCode,
    ).toBe(200);

    await inject({
      method: 'POST',
      url: `/api/admin/users/${grantee.userId}/disable`,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { disabled: true },
    });

    expect(
      (
        await inject({
          method: 'GET',
          url: `/api/teams/${team.id}/projects/${proj.id}/tasks`,
          headers: { authorization: `Bearer ${grantee.token}` },
        })
      ).statusCode,
    ).toBe(401);
  });

  it('3. enable clears disabledAt and user can log in again', async () => {
    const admin = await adminUser();
    const victim = await memberUser('reenable@example.com');
    await inject({
      method: 'POST',
      url: `/api/admin/users/${victim.userId}/disable`,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { disabled: true },
    });
    await inject({
      method: 'POST',
      url: `/api/admin/users/${victim.userId}/disable`,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { disabled: false },
    });
    const row = await prisma.user.findUnique({ where: { id: victim.userId } });
    expect(row!.disabledAt).toBeNull();

    const login = await inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: victim.email, password: PASSWORD },
    });
    expect(login.statusCode).toBe(200);
  });

  it('4. cannot disable self or last enabled admin; can disable non-last admin', async () => {
    const adminA = await adminUser();
    const adminB = await bootstrapUser(app, {
      email: 'adminb@example.com',
      name: 'B',
      password: PASSWORD,
      globalRole: GlobalRole.ADMIN,
    });

    const self = await inject({
      method: 'POST',
      url: `/api/admin/users/${adminA.userId}/disable`,
      headers: { authorization: `Bearer ${adminA.token}` },
      payload: { disabled: true },
    });
    expect(self.statusCode).toBe(409);

    await inject({
      method: 'POST',
      url: `/api/admin/users/${adminB.userId}/disable`,
      headers: { authorization: `Bearer ${adminA.token}` },
      payload: { disabled: true },
    });

    const last = await inject({
      method: 'POST',
      url: `/api/admin/users/${adminA.userId}/disable`,
      headers: { authorization: `Bearer ${adminA.token}` },
      payload: { disabled: true },
    });
    expect(last.statusCode).toBe(409);
  });

  it('5. unlock clears lockout and login succeeds; idempotent on non-locked user', async () => {
    const admin = await adminUser();
    const victim = await memberUser('locked@example.com');
    const future = new Date(Date.now() + 60 * 60_000);
    await prisma.user.update({
      where: { id: victim.userId },
      data: { lockedUntil: future, failedLoginAttempts: 5 },
    });

    const unlock = await inject({
      method: 'POST',
      url: `/api/admin/users/${victim.userId}/unlock`,
      headers: { authorization: `Bearer ${admin.token}` },
    });
    expect(unlock.statusCode).toBe(200);
    const row = await prisma.user.findUnique({ where: { id: victim.userId } });
    expect(row!.lockedUntil).toBeNull();
    expect(row!.failedLoginAttempts).toBe(0);

    const login = await inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: victim.email, password: PASSWORD },
    });
    expect(login.statusCode).toBe(200);

    const again = await inject({
      method: 'POST',
      url: `/api/admin/users/${victim.userId}/unlock`,
      headers: { authorization: `Bearer ${admin.token}` },
    });
    expect(again.statusCode).toBe(200);
  });

  it('6. force-logout revokes tokens without disabling; user can re-login', async () => {
    const admin = await adminUser();
    const victim = await memberUser('logout@example.com');
    expect(
      await prisma.refreshToken.count({ where: { userId: victim.userId, revokedAt: null } }),
    ).toBeGreaterThan(0);

    const res = await inject({
      method: 'POST',
      url: `/api/admin/users/${victim.userId}/force-logout`,
      headers: { authorization: `Bearer ${admin.token}` },
    });
    expect(res.statusCode).toBe(200);

    const row = await prisma.user.findUnique({ where: { id: victim.userId } });
    expect(row!.disabledAt).toBeNull();
    expect(
      await prisma.refreshToken.count({ where: { userId: victim.userId, revokedAt: null } }),
    ).toBe(0);

    const login = await inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: victim.email, password: PASSWORD },
    });
    expect(login.statusCode).toBe(200);
  });

  it('7. cannot force-logout self', async () => {
    const admin = await adminUser();
    const res = await inject({
      method: 'POST',
      url: `/api/admin/users/${admin.userId}/force-logout`,
      headers: { authorization: `Bearer ${admin.token}` },
    });
    expect(res.statusCode).toBe(409);
  });

  it('8. edit local profile updates fields; duplicate email 409; bad email 400', async () => {
    const admin = await adminUser();
    const victim = await memberUser('local@example.com');
    await memberUser('other@example.com');

    const ok = await inject({
      method: 'PATCH',
      url: `/api/admin/users/${victim.userId}/profile`,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { name: 'New Name', department: 'Eng' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().name).toBe('New Name');
    expect(ok.json().department).toBe('Eng');

    const dup = await inject({
      method: 'PATCH',
      url: `/api/admin/users/${victim.userId}/profile`,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { email: 'other@example.com' },
    });
    expect(dup.statusCode).toBe(409);

    const bad = await inject({
      method: 'PATCH',
      url: `/api/admin/users/${victim.userId}/profile`,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { email: 'not-an-email' },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('9. edit profile on LDAP user returns 409', async () => {
    const admin = await adminUser();
    const dir = await prisma.directory.create({
      data: {
        name: 'AD',
        slug: 'ad-lc',
        kind: 'LDAP',
        host: 'ldap.test',
        baseDN: 'dc=test',
        bindDN: 'cn=admin',
        bindPasswordEnc: 'enc',
      },
    });
    const ldapUser = await prisma.user.create({
      data: {
        email: 'ldap@corp.com',
        name: 'LDAP',
        authSource: 'LDAP',
        directoryId: dir.id,
      },
    });

    const res = await inject({
      method: 'PATCH',
      url: `/api/admin/users/${ldapUser.id}/profile`,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { name: 'Changed' },
    });
    expect(res.statusCode).toBe(409);
    const unchanged = await prisma.user.findUnique({ where: { id: ldapUser.id } });
    expect(unchanged!.name).toBe('LDAP');
  });

  it('10. system user rejected on disable/unlock/force-logout/profile', async () => {
    const sys = await prisma.user.create({
      data: {
        email: SYSTEM_USER_EMAIL,
        name: 'System',
        passwordHash: 'x',
        globalRole: GlobalRole.ADMIN,
        isSystemUser: true,
      },
    });
    const admin = await adminUser();

    for (const [method, url, body] of [
      ['POST', `/api/admin/users/${sys.id}/disable`, { disabled: true }],
      ['POST', `/api/admin/users/${sys.id}/unlock`, undefined],
      ['POST', `/api/admin/users/${sys.id}/force-logout`, undefined],
      ['PATCH', `/api/admin/users/${sys.id}/profile`, { name: 'X' }],
    ] as const) {
      const res = await inject({
        method,
        url,
        headers: { authorization: `Bearer ${admin.token}` },
        ...(body ? { payload: body } : {}),
      });
      expect(res.statusCode).toBeGreaterThanOrEqual(404);
      expect(res.statusCode).toBeLessThan(500);
    }
  });

  it('11. lifecycle actions write activity-log entries', async () => {
    const admin = await adminUser();
    const victim = await memberUser('audit@example.com');

    await inject({
      method: 'POST',
      url: `/api/admin/users/${victim.userId}/disable`,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { disabled: true },
    });
    await inject({
      method: 'POST',
      url: `/api/admin/users/${victim.userId}/disable`,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { disabled: false },
    });
    await inject({
      method: 'POST',
      url: `/api/admin/users/${victim.userId}/unlock`,
      headers: { authorization: `Bearer ${admin.token}` },
    });
    await inject({
      method: 'POST',
      url: `/api/admin/users/${victim.userId}/force-logout`,
      headers: { authorization: `Bearer ${admin.token}` },
    });
    await inject({
      method: 'PATCH',
      url: `/api/admin/users/${victim.userId}/profile`,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { jobTitle: 'Lead' },
    });

    const actions = (
      await prisma.activity.findMany({
        where: { actorId: admin.userId, action: { startsWith: 'admin.user.' } },
        orderBy: { createdAt: 'asc' },
      })
    ).map((a) => a.action);

    expect(actions).toEqual(
      expect.arrayContaining([
        'admin.user.disabled',
        'admin.user.enabled',
        'admin.user.unlocked',
        'admin.user.force_logout',
        'admin.user.profile_updated',
      ]),
    );
  });
});
