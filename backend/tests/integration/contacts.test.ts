import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { prisma } from '../../src/data/prisma.js';
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
  await prisma.passwordReset.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.teamMembership.deleteMany();
  await prisma.team.deleteMany();
  await prisma.user.deleteMany();
});

function inject(opts: Parameters<FastifyInstance['inject']>[0]) {
  return app.inject(opts);
}
const H = (token: string) => ({ authorization: `Bearer ${token}` });
const PASSWORD = 'CorrectHorseBattery9';

async function setup(email = 'admin@example.com', slug = 'team-a') {
  const reg = await bootstrapUser(app, { email, name: email.split('@')[0], password: PASSWORD });
  const team = (
    await inject({ method: 'POST', url: '/api/teams', headers: H(reg.token), payload: { name: 'Team', slug } })
  ).json();
  return { token: reg.token, userId: reg.userId, teamId: team.id };
}

async function addMember(
  managerToken: string,
  teamId: string,
  email: string,
  role: 'MEMBER' | 'MANAGER' = 'MEMBER',
) {
  const reg = await bootstrapUser(app, { email, name: email.split('@')[0], password: PASSWORD });
  await inject({
    method: 'POST',
    url: `/api/teams/${teamId}/members`,
    headers: H(managerToken),
    payload: { email, role },
  });
  return { token: reg.token, userId: reg.userId };
}

describe('contacts', () => {
  it('manager creates a contact (201) and members can read it', async () => {
    const s = await setup();
    const create = await inject({
      method: 'POST',
      url: `/api/teams/${s.teamId}/contacts`,
      headers: H(s.token),
      payload: { name: 'Acme Corp', organization: 'Acme', type: 'ORG', email: 'a@acme.test' },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json().name).toBe('Acme Corp');
    expect(create.json().type).toBe('ORG');

    const member = await addMember(s.token, s.teamId, 'm@example.com', 'MEMBER');
    const list = await inject({
      method: 'GET',
      url: `/api/teams/${s.teamId}/contacts`,
      headers: H(member.token),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toHaveLength(1);
  });

  it('member without contacts.manage cannot create (403)', async () => {
    const s = await setup();
    const member = await addMember(s.token, s.teamId, 'm2@example.com', 'MEMBER');
    const res = await inject({
      method: 'POST',
      url: `/api/teams/${s.teamId}/contacts`,
      headers: H(member.token),
      payload: { name: 'Nope' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('cross-team user cannot read/write another team contacts (403/404)', async () => {
    const a = await setup('a@example.com', 'team-a');
    await inject({
      method: 'POST',
      url: `/api/teams/${a.teamId}/contacts`,
      headers: H(a.token),
      payload: { name: 'A Contact' },
    });
    const b = await setup('b@example.com', 'team-b');
    // B is not a member of A's team — requireTeamRole rejects.
    const res = await inject({
      method: 'GET',
      url: `/api/teams/${a.teamId}/contacts`,
      headers: H(b.token),
    });
    expect([403, 404]).toContain(res.statusCode);
  });

  it('updates and soft-deletes a contact', async () => {
    const s = await setup();
    const c = (
      await inject({
        method: 'POST',
        url: `/api/teams/${s.teamId}/contacts`,
        headers: H(s.token),
        payload: { name: 'Old Name' },
      })
    ).json();

    const upd = await inject({
      method: 'PATCH',
      url: `/api/teams/${s.teamId}/contacts/${c.id}`,
      headers: H(s.token),
      payload: { name: 'New Name', phone: '12345' },
    });
    expect(upd.statusCode).toBe(200);
    expect(upd.json().name).toBe('New Name');
    expect(upd.json().phone).toBe('12345');

    const del = await inject({
      method: 'DELETE',
      url: `/api/teams/${s.teamId}/contacts/${c.id}`,
      headers: H(s.token),
    });
    expect(del.statusCode).toBe(204);

    const list = await inject({
      method: 'GET',
      url: `/api/teams/${s.teamId}/contacts`,
      headers: H(s.token),
    });
    expect(list.json()).toHaveLength(0);
  });
});
