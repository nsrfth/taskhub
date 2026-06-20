import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { prisma } from '../../src/data/prisma.js';
import { bootstrapUser } from '../helpers/bootstrapUser.js';

// v1.86 — Feature 1: a global ADMIN can reach + edit EVERY settings surface,
// including team-scoped settings for teams they are NOT a member of. This is
// the existing GlobalRole.ADMIN design (synthetic MANAGER membership in
// requireTeamRole + the requirePermission ADMIN bypass); these tests lock that
// behaviour in and prove a non-admin non-member is rejected on the same routes.

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(loadEnv());
});
afterAll(async () => {
  if (app) await app.close();
});
beforeEach(async () => {
  await prisma.refreshToken.deleteMany();
  await prisma.instanceSetting.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.teamMembership.deleteMany();
  await prisma.team.deleteMany();
  await prisma.user.deleteMany();
});

const PASSWORD = 'CorrectHorseBattery9';
const H = (t: string) => ({ authorization: `Bearer ${t}` });

// teamOwnerAdmin creates the team; the user under test (otherAdmin) is a global
// ADMIN who is NEVER added to that team. nonMember is a global MEMBER, also not
// in the team — the negative-authorization contrast.
async function setup() {
  const teamOwnerAdmin = await bootstrapUser(app, {
    email: 'owner-admin@example.com', name: 'OwnerAdmin', password: PASSWORD, globalRole: 'ADMIN',
  });
  const otherAdmin = await bootstrapUser(app, {
    email: 'other-admin@example.com', name: 'OtherAdmin', password: PASSWORD, globalRole: 'ADMIN',
  });
  const nonMember = await bootstrapUser(app, {
    email: 'rando@example.com', name: 'Rando', password: PASSWORD, globalRole: 'MEMBER',
  });
  const team = await app.inject({
    method: 'POST', url: '/api/teams', headers: H(teamOwnerAdmin.token),
    payload: { name: 'SettingsTeam', slug: 'settings-team' },
  });
  const teamId = team.json().id as string;
  return {
    otherAdminToken: otherAdmin.token,
    nonMemberToken: nonMember.token,
    teamId,
  };
}

describe('Feature 1 — global ADMIN reaches team-scoped settings without membership', () => {
  it('can READ every team-scoped settings surface for a team it is not a member of', async () => {
    const s = await setup();
    const reads = ['roles', 'labels', 'custom-fields', 'automations', 'groups', 'webhooks', 'forms'];
    for (const path of reads) {
      const res = await app.inject({
        method: 'GET', url: `/api/teams/${s.teamId}/${path}`, headers: H(s.otherAdminToken),
      });
      expect(res.statusCode, `GET ${path}`).toBe(200);
    }
  });

  it('can WRITE team-scoped settings (labels, roles, groups) without membership', async () => {
    const s = await setup();
    const label = await app.inject({
      method: 'POST', url: `/api/teams/${s.teamId}/labels`, headers: H(s.otherAdminToken),
      payload: { name: 'admin-made', color: '#123456' },
    });
    expect(label.statusCode).toBeLessThan(300);

    const role = await app.inject({
      method: 'POST', url: `/api/teams/${s.teamId}/roles`, headers: H(s.otherAdminToken),
      payload: { name: 'AdminMadeRole', permissions: [] },
    });
    expect(role.statusCode).toBeLessThan(300);

    const group = await app.inject({
      method: 'POST', url: `/api/teams/${s.teamId}/groups`, headers: H(s.otherAdminToken),
      payload: { name: 'AdminMadeGroup' },
    });
    expect(group.statusCode).toBeLessThan(300);
  });

  it('can WRITE instance-level settings', async () => {
    const s = await setup();
    const res = await app.inject({
      method: 'PUT', url: '/api/settings/instance/tasks.dateEditRestriction',
      headers: H(s.otherAdminToken), payload: { value: 'manager-only' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('NEGATIVE: a non-admin non-member is rejected on the same surfaces', async () => {
    const s = await setup();
    const read = await app.inject({
      method: 'GET', url: `/api/teams/${s.teamId}/roles`, headers: H(s.nonMemberToken),
    });
    expect(read.statusCode).toBe(403);

    const write = await app.inject({
      method: 'POST', url: `/api/teams/${s.teamId}/labels`, headers: H(s.nonMemberToken),
      payload: { name: 'nope', color: '#000000' },
    });
    expect(write.statusCode).toBeGreaterThanOrEqual(400);

    const instance = await app.inject({
      method: 'PUT', url: '/api/settings/instance/tasks.dateEditRestriction',
      headers: H(s.nonMemberToken), payload: { value: 'manager-only' },
    });
    expect(instance.statusCode).toBe(403);
  });
});
