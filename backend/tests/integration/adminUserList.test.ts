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
  const env = loadEnv();
  app = await buildApp(env);
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.directory.deleteMany();
});

async function inject(opts: Parameters<FastifyInstance['inject']>[0]) {
  return app.inject(opts);
}

const PASSWORD = 'CorrectHorseBattery9';

async function adminToken(): Promise<string> {
  const r = await bootstrapUser(app, {
    email: 'admin@example.com',
    name: 'Admin',
    password: PASSWORD,
    globalRole: GlobalRole.ADMIN,
  });
  return r.token;
}

type UsersPage = {
  items: Array<{ id: string; email: string; name: string; globalRole: string; authSource: string }>;
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

async function listUsers(token: string, query = ''): Promise<{ status: number; body: UsersPage }> {
  const res = await inject({
    method: 'GET',
    url: `/api/admin/users${query}`,
    headers: { authorization: `Bearer ${token}` },
  });
  return { status: res.statusCode, body: res.json() as UsersPage };
}

describe('GET /api/admin/users — search, filter, sort, pagination (v1.52)', () => {
  it('1. no filters: page 1, correct totalItems/totalPages, system user absent', async () => {
    await prisma.user.create({
      data: {
        email: SYSTEM_USER_EMAIL,
        name: 'System',
        passwordHash: 'x',
        globalRole: GlobalRole.ADMIN,
        isSystemUser: true,
      },
    });
    await bootstrapUser(app, { email: 'a@example.com', name: 'A', password: PASSWORD });
    await bootstrapUser(app, { email: 'b@example.com', name: 'B', password: PASSWORD });
    const token = await adminToken();

    const { status, body } = await listUsers(token);
    expect(status).toBe(200);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(25);
    expect(body.totalItems).toBe(3);
    expect(body.totalPages).toBe(1);
    expect(body.items).toHaveLength(3);
    expect(body.items.some((u) => u.email === SYSTEM_USER_EMAIL)).toBe(false);
  });

  it('2. search "ali" matches name and email case-insensitively; trims whitespace', async () => {
    const token = await adminToken();
    await bootstrapUser(app, { email: 'alice@example.com', name: 'Alice Smith', password: PASSWORD });
    await bootstrapUser(app, { email: 'bob@example.com', name: 'Bob', password: PASSWORD });
    await bootstrapUser(app, { email: 'ali.khan@corp.com', name: 'Khan', password: PASSWORD });

    const byName = await listUsers(token, '?search=ali');
    expect(byName.body.totalItems).toBe(2);
    expect(byName.body.items.map((u) => u.email).sort()).toEqual(
      ['ali.khan@corp.com', 'alice@example.com'].sort(),
    );

    const trimmed = await listUsers(token, '?search=%20ALI%20');
    expect(trimmed.body.totalItems).toBe(2);
  });

  it('3. role=ADMIN and authSource=LDAP filters', async () => {
    const token = await adminToken();
    const dir = await prisma.directory.create({
      data: {
        name: 'AD',
        slug: 'ad-test',
        kind: 'LDAP',
        host: 'ldap.test',
        baseDN: 'dc=test',
        bindDN: 'cn=admin',
        bindPasswordEnc: 'enc',
      },
    });
    await bootstrapUser(app, {
      email: 'member@example.com',
      name: 'Member',
      password: PASSWORD,
      globalRole: GlobalRole.MEMBER,
    });
    await prisma.user.create({
      data: {
        email: 'ldap@example.com',
        name: 'LDAP User',
        authSource: 'LDAP',
        directoryId: dir.id,
        ldapUsername: 'ldapuser',
      },
    });

    const admins = await listUsers(token, '?role=ADMIN');
    expect(admins.body.items.every((u) => u.globalRole === 'ADMIN')).toBe(true);
    expect(admins.body.items.some((u) => u.email === 'member@example.com')).toBe(false);

    const ldapOnly = await listUsers(token, '?authSource=LDAP');
    expect(ldapOnly.body.totalItems).toBe(1);
    expect(ldapOnly.body.items[0]!.email).toBe('ldap@example.com');
  });

  it('4. status=disabled, locked, and active filters', async () => {
    const token = await adminToken();
    const future = new Date(Date.now() + 60 * 60_000);
    const past = new Date(Date.now() - 60 * 60_000);

    await bootstrapUser(app, { email: 'active@example.com', name: 'Active', password: PASSWORD });
    await prisma.user.create({
      data: {
        email: 'disabled@example.com',
        name: 'Disabled',
        passwordHash: 'x',
        disabledAt: new Date(),
      },
    });
    await prisma.user.create({
      data: {
        email: 'locked@example.com',
        name: 'Locked',
        passwordHash: 'x',
        lockedUntil: future,
      },
    });
    await prisma.user.create({
      data: {
        email: 'waslocked@example.com',
        name: 'WasLocked',
        passwordHash: 'x',
        lockedUntil: past,
      },
    });

    const disabled = await listUsers(token, '?status=disabled');
    expect(disabled.body.totalItems).toBe(1);
    expect(disabled.body.items[0]!.email).toBe('disabled@example.com');

    const locked = await listUsers(token, '?status=locked');
    expect(locked.body.totalItems).toBe(1);
    expect(locked.body.items[0]!.email).toBe('locked@example.com');

    const active = await listUsers(token, '?status=active');
    expect(active.body.items.map((u) => u.email).sort()).toEqual(
      ['active@example.com', 'admin@example.com', 'waslocked@example.com'].sort(),
    );
    expect(active.body.items.some((u) => u.email === 'disabled@example.com')).toBe(false);
    expect(active.body.items.some((u) => u.email === 'locked@example.com')).toBe(false);
  });

  it('5. directoryId filter returns only that directory users', async () => {
    const token = await adminToken();
    const dirA = await prisma.directory.create({
      data: {
        name: 'A',
        slug: 'dir-a',
        kind: 'LDAP',
        host: 'a.test',
        baseDN: 'dc=a',
        bindDN: 'cn=a',
        bindPasswordEnc: 'enc',
      },
    });
    const dirB = await prisma.directory.create({
      data: {
        name: 'B',
        slug: 'dir-b',
        kind: 'SCIM',
        host: null,
        baseDN: 'dc=b',
        bindDN: 'cn=b',
        bindPasswordEnc: 'enc',
      },
    });
    await prisma.user.create({
      data: { email: 'a1@corp.com', name: 'A1', authSource: 'LDAP', directoryId: dirA.id },
    });
    await prisma.user.create({
      data: { email: 'b1@corp.com', name: 'B1', authSource: 'SCIM', directoryId: dirB.id },
    });

    const filtered = await listUsers(token, `?directoryId=${dirA.id}`);
    expect(filtered.body.totalItems).toBe(1);
    expect(filtered.body.items[0]!.email).toBe('a1@corp.com');
  });

  it('6. sort by name, email, createdAt, lastSynced asc and desc', async () => {
    const token = await adminToken();
    await prisma.user.create({
      data: {
        email: 'z@example.com',
        name: 'Zulu',
        passwordHash: 'x',
        createdAt: new Date('2020-01-01'),
        ldapSyncedAt: new Date('2024-06-01'),
      },
    });
    await prisma.user.create({
      data: {
        email: 'a@example.com',
        name: 'Alpha',
        passwordHash: 'x',
        createdAt: new Date('2025-01-01'),
        ldapSyncedAt: new Date('2024-01-01'),
      },
    });

    const nameAsc = await listUsers(token, '?sortBy=name&sortDir=asc&pageSize=10');
    expect(nameAsc.body.items.map((u) => u.name)).toEqual(['Admin', 'Alpha', 'Zulu']);

    const emailDesc = await listUsers(token, '?sortBy=email&sortDir=desc&pageSize=10');
    expect(emailDesc.body.items[0]!.email).toBe('z@example.com');

    const createdDesc = await listUsers(token, '?sortBy=createdAt&sortDir=desc&pageSize=10');
    expect(createdDesc.body.items[0]!.email).toBe('admin@example.com');

    const syncAsc = await listUsers(token, '?sortBy=lastSynced&sortDir=asc&pageSize=10');
    expect(syncAsc.body.items.map((u) => u.email)).toContain('a@example.com');
    expect(syncAsc.body.items.map((u) => u.email)).toContain('z@example.com');
  });

  it('7. page 2 slice has no overlap; out-of-range page is empty with correct totalPages', async () => {
    const token = await adminToken();
    for (let i = 0; i < 11; i++) {
      await bootstrapUser(app, {
        email: `user${i}@example.com`,
        name: `User ${i}`,
        password: PASSWORD,
      });
    }

    const p1 = await listUsers(token, '?page=1&pageSize=10');
    expect(p1.body.items).toHaveLength(10);
    expect(p1.body.totalItems).toBe(12);
    expect(p1.body.totalPages).toBe(2);

    const p2 = await listUsers(token, '?page=2&pageSize=10');
    expect(p2.body.items).toHaveLength(2);
    const ids1 = new Set(p1.body.items.map((u) => u.id));
    for (const u of p2.body.items) expect(ids1.has(u.id)).toBe(false);

    const p99 = await listUsers(token, '?page=99&pageSize=10');
    expect(p99.body.items).toHaveLength(0);
    expect(p99.body.totalPages).toBe(2);
    expect(p99.body.page).toBe(99);
  });

  it('8. pageSize clamped: 9999 capped, 0 and negative use default/min', async () => {
    const token = await adminToken();
    await bootstrapUser(app, { email: 'one@example.com', name: 'One', password: PASSWORD });

    const huge = await listUsers(token, '?pageSize=9999');
    expect(huge.body.pageSize).toBe(100);

    const zero = await listUsers(token, '?pageSize=0');
    expect(zero.body.pageSize).toBe(25);

    const neg = await listUsers(token, '?pageSize=-5');
    expect(neg.body.pageSize).toBe(25);
  });

  it('9. invalid enum role=GOD returns 400', async () => {
    const token = await adminToken();
    const res = await inject({
      method: 'GET',
      url: '/api/admin/users?role=GOD',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it('10. system user never appears under any filter combination', async () => {
    await prisma.user.create({
      data: {
        email: SYSTEM_USER_EMAIL,
        name: 'System Admin',
        passwordHash: 'x',
        globalRole: GlobalRole.ADMIN,
        isSystemUser: true,
      },
    });
    const token = await adminToken();
    await bootstrapUser(app, { email: 'ali@example.com', name: 'Ali Admin', password: PASSWORD });

    const queries = [
      '',
      '?search=admin',
      '?role=ADMIN',
      '?authSource=LOCAL',
      '?status=active',
      '?sortBy=name&sortDir=desc',
      '?page=1&pageSize=10',
    ];
    for (const q of queries) {
      const { body } = await listUsers(token, q);
      expect(body.items.some((u) => u.email === SYSTEM_USER_EMAIL)).toBe(false);
    }
  });

  it('11. filter change contract: page=1 with search returns first matching page (UI resets page)', async () => {
    const token = await adminToken();
    for (let i = 0; i < 15; i++) {
      await bootstrapUser(app, {
        email: `match${i}@example.com`,
        name: `Match ${i}`,
        password: PASSWORD,
      });
    }
    await bootstrapUser(app, { email: 'other@example.com', name: 'Other', password: PASSWORD });

    const page2 = await listUsers(token, '?page=2&pageSize=10');
    expect(page2.body.page).toBe(2);
    expect(page2.body.items).toHaveLength(7);

    const filteredPage1 = await listUsers(token, '?search=match&page=1&pageSize=10');
    expect(filteredPage1.body.page).toBe(1);
    expect(filteredPage1.body.totalItems).toBe(15);
    expect(filteredPage1.body.items).toHaveLength(10);
    expect(filteredPage1.body.items.every((u) => u.email.includes('match'))).toBe(true);

    const lastPage = await listUsers(token, '?search=match&page=2&pageSize=10');
    expect(lastPage.body.page).toBe(2);
    expect(lastPage.body.totalPages).toBe(2);
    expect(lastPage.body.items).toHaveLength(5);
  });
});
