import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { prisma } from '../../src/data/prisma.js';
import { bootstrapUser } from '../helpers/bootstrapUser.js';

// v1.95 (PMIS R0 — plumbing): the permission/capability substrate.
//
// Covers:
//   - GET /system/permissions exposes the new pmo/core/portfolio keys + groups
//   - a freshly created team's Manager role carries pmo.manage_profiles, so a
//     (non-admin) manager sees capabilities.manageProfiles = true
//   - a plain member of that team sees capabilities.manageProfiles = false

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
  await prisma.refreshToken.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.teamMembership.deleteMany();
  await prisma.role.deleteMany();
  await prisma.project.deleteMany();
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

async function capabilities(token: string, teamId: string): Promise<Record<string, boolean>> {
  const r = await app.inject({
    method: 'GET',
    url: `/api/teams/${teamId}`,
    headers: { authorization: `Bearer ${token}` },
  });
  if (r.statusCode !== 200) throw new Error(`getTeam failed: ${r.statusCode} ${r.body}`);
  return r.json().capabilities as Record<string, boolean>;
}

describe('PMIS R0 plumbing — permission substrate', () => {
  it('GET /system/permissions exposes the new pmo/core/portfolio keys + groups', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/system/permissions' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      permissions: string[];
      groups: Record<string, string[]>;
    };

    for (const key of [
      'pmo.manage_profiles',
      'pmo.assign_profile',
      'pmo.override_profile',
      'pmo.set_team_defaults',
      'pmo.set_group_defaults',
      'core.capture_baseline',
      'portfolio.view',
      'portfolio.manage',
      'portfolio.attach_project',
      'portfolio.manage_managers',
    ]) {
      expect(body.permissions).toContain(key);
    }
    // core.set_health was deliberately NOT added (v1.91 health uses project WRITE).
    expect(body.permissions).not.toContain('core.set_health');

    expect(body.groups.PMO).toContain('pmo.manage_profiles');
    expect(body.groups.Core).toEqual(['core.capture_baseline']);
    expect(body.groups.Portfolio).toContain('portfolio.view');
  });

  it('a freshly created team grants pmo.manage_profiles to its Manager', async () => {
    // First user is global ADMIN; the second is a plain MEMBER who becomes
    // MANAGER of the team they create — proving the seed path (not admin
    // bypass) carries the new permission.
    await register('admin@example.com');
    const manager = await register('manager@example.com', 'Mgr');
    const teamId = await createTeam(manager.token, 'pmo-team');

    const caps = await capabilities(manager.token, teamId);
    expect(caps.manageProfiles).toBe(true);
  });

  it('a plain member of the team does not get manageProfiles', async () => {
    await register('admin@example.com');
    const manager = await register('manager@example.com', 'Mgr');
    const member = await register('member@example.com', 'Mem');
    const teamId = await createTeam(manager.token, 'pmo-team');
    // roleId null → legacy fallback to DEFAULT_MEMBER_PERMISSIONS (no pmo.*).
    await prisma.teamMembership.create({
      data: { userId: member.userId, teamId, role: 'MEMBER' },
    });

    const caps = await capabilities(member.token, teamId);
    expect(caps.manageProfiles).toBe(false);
  });
});
