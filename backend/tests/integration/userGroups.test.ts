import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { GlobalRole } from '@prisma/client';
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

  app = await buildApp(loadEnv());
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await prisma.refreshToken.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.projectGroupGrant.deleteMany();
  await prisma.userGroupMember.deleteMany();
  await prisma.userGroup.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.teamMembership.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.role.deleteMany();
  await prisma.team.deleteMany();
  await prisma.user.deleteMany();
});

async function inject(opts: Parameters<FastifyInstance['inject']>[0]) {
  return app.inject(opts);
}

const PASSWORD = 'CorrectHorseBattery9';

async function registerUser(email: string) {
  return bootstrapUser(app, { email, name: email, password: PASSWORD });
}

async function registerMember(email: string) {
  return bootstrapUser(app, {
    email,
    name: email,
    password: PASSWORD,
    globalRole: GlobalRole.MEMBER,
  });
}

async function createTeam(token: string, slug: string) {
  const res = await inject({
    method: 'POST',
    url: '/api/teams',
    headers: { authorization: `Bearer ${token}` },
    payload: { name: slug, slug },
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string };
}

async function addMember(
  mgrToken: string,
  teamId: string,
  email: string,
  role: 'MEMBER' | 'MANAGER',
) {
  const res = await inject({
    method: 'POST',
    url: `/api/teams/${teamId}/members`,
    headers: { authorization: `Bearer ${mgrToken}` },
    payload: { email, role },
  });
  expect(res.statusCode).toBe(201);
}

async function createProject(token: string, teamId: string, name: string) {
  const res = await inject({
    method: 'POST',
    url: `/api/teams/${teamId}/projects`,
    headers: { authorization: `Bearer ${token}` },
    payload: { name },
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string };
}

async function createGroup(mgrToken: string, teamId: string, name: string) {
  const res = await inject({
    method: 'POST',
    url: `/api/teams/${teamId}/groups`,
    headers: { authorization: `Bearer ${mgrToken}` },
    payload: { name },
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string };
}

async function addGroupMember(
  mgrToken: string,
  teamId: string,
  groupId: string,
  userId: string,
  accessLevel: 'FULL' | 'READONLY' = 'FULL',
) {
  const res = await inject({
    method: 'POST',
    url: `/api/teams/${teamId}/groups/${groupId}/members`,
    headers: { authorization: `Bearer ${mgrToken}` },
    payload: { userId, accessLevel },
  });
  expect(res.statusCode).toBe(200);
  return res.json() as { members: Array<{ id: string; userId: string; status: string }> };
}

async function grantProjects(mgrToken: string, teamId: string, groupId: string, projectIds: string[]) {
  const res = await inject({
    method: 'PUT',
    url: `/api/teams/${teamId}/groups/${groupId}/projects`,
    headers: { authorization: `Bearer ${mgrToken}` },
    payload: { projectIds },
  });
  expect(res.statusCode).toBe(200);
}

describe('User Groups v1.51 — cross-team, access levels, invites', () => {
  it('1. owner unchanged — full access to own project', async () => {
    const admin = await registerUser('g51-admin1@example.com');
    const owner = await registerMember('g51-owner1@example.com');
    const team = await createTeam(admin.token, 'team-g51-1');
    await addMember(admin.token, team.id, owner.email, 'MEMBER');
    const proj = await createProject(owner.token, team.id, 'Mine');

    expect(
      (await inject({
        method: 'GET',
        url: `/api/teams/${team.id}/projects/${proj.id}/tasks`,
        headers: { authorization: `Bearer ${owner.token}` },
      })).statusCode,
    ).toBe(200);

    expect(
      (await inject({
        method: 'POST',
        url: `/api/teams/${team.id}/projects/${proj.id}/tasks`,
        headers: { authorization: `Bearer ${owner.token}` },
        payload: { title: 'Owner task' },
      })).statusCode,
    ).toBe(201);
  });

  it('2. in-team FULL — list + create task', async () => {
    const admin = await registerUser('g51-admin2@example.com');
    const owner = await registerMember('g51-owner2@example.com');
    const grantee = await registerMember('g51-grantee2@example.com');
    const team = await createTeam(admin.token, 'team-g51-2');
    await addMember(admin.token, team.id, owner.email, 'MEMBER');
    await addMember(admin.token, team.id, grantee.email, 'MEMBER');
    const proj = await createProject(owner.token, team.id, 'Shared');
    const group = await createGroup(admin.token, team.id, 'Workers');
    await addGroupMember(admin.token, team.id, group.id, grantee.userId, 'FULL');
    await grantProjects(admin.token, team.id, group.id, [proj.id]);

    const list = await inject({
      method: 'GET',
      url: '/api/projects',
      headers: { authorization: `Bearer ${grantee.token}` },
    });
    expect(list.statusCode).toBe(200);
    expect((list.json() as Array<{ id: string }>).map((p) => p.id)).toContain(proj.id);

    expect(
      (await inject({
        method: 'POST',
        url: `/api/teams/${team.id}/projects/${proj.id}/tasks`,
        headers: { authorization: `Bearer ${grantee.token}` },
        payload: { title: 'Granted' },
      })).statusCode,
    ).toBe(201);
  });

  it('3. in-team READONLY — GET ok, task/comment create 403', async () => {
    const admin = await registerUser('g51-admin3@example.com');
    const owner = await registerMember('g51-owner3@example.com');
    const reader = await registerMember('g51-reader3@example.com');
    const team = await createTeam(admin.token, 'team-g51-3');
    await addMember(admin.token, team.id, owner.email, 'MEMBER');
    await addMember(admin.token, team.id, reader.email, 'MEMBER');
    const proj = await createProject(owner.token, team.id, 'ReadOnly');
    const group = await createGroup(admin.token, team.id, 'Readers');
    await addGroupMember(admin.token, team.id, group.id, reader.userId, 'READONLY');
    await grantProjects(admin.token, team.id, group.id, [proj.id]);

    expect(
      (await inject({
        method: 'GET',
        url: `/api/teams/${team.id}/projects/${proj.id}/tasks`,
        headers: { authorization: `Bearer ${reader.token}` },
      })).statusCode,
    ).toBe(200);

    expect(
      (await inject({
        method: 'POST',
        url: `/api/teams/${team.id}/projects/${proj.id}/tasks`,
        headers: { authorization: `Bearer ${reader.token}` },
        payload: { title: 'Nope' },
      })).statusCode,
    ).toBe(403);

    const task = await inject({
      method: 'POST',
      url: `/api/teams/${team.id}/projects/${proj.id}/tasks`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { title: 'For comment' },
    });
    const taskId = (task.json() as { id: string }).id;

    expect(
      (await inject({
        method: 'POST',
        url: `/api/teams/${team.id}/projects/${proj.id}/tasks/${taskId}/comments`,
        headers: { authorization: `Bearer ${reader.token}` },
        payload: { body: 'Read only' },
      })).statusCode,
    ).toBe(403);
  });

  it('4. no grant — team member without group gets 404 on nested routes', async () => {
    const admin = await registerUser('g51-admin4@example.com');
    const owner = await registerMember('g51-owner4@example.com');
    const outsider = await registerMember('g51-outsider4@example.com');
    const team = await createTeam(admin.token, 'team-g51-4');
    await addMember(admin.token, team.id, owner.email, 'MEMBER');
    await addMember(admin.token, team.id, outsider.email, 'MEMBER');
    const proj = await createProject(owner.token, team.id, 'Private');

    expect(
      (await inject({
        method: 'GET',
        url: `/api/teams/${team.id}/projects/${proj.id}/tasks`,
        headers: { authorization: `Bearer ${outsider.token}` },
      })).statusCode,
    ).toBe(404);
  });

  it('5. cross-team FULL accepted — write without TeamMembership', async () => {
    const admin = await registerUser('g51-admin5@example.com');
    const owner = await registerMember('g51-owner5@example.com');
    const external = await registerMember('g51-external5@example.com');
    const team = await createTeam(admin.token, 'team-g51-5');
    await addMember(admin.token, team.id, owner.email, 'MEMBER');
    const proj = await createProject(owner.token, team.id, 'External');
    const group = await createGroup(admin.token, team.id, 'Remote');
    const detail = await addGroupMember(admin.token, team.id, group.id, external.userId, 'FULL');
    const memberRow = detail.members.find((m) => m.userId === external.userId)!;
    expect(memberRow.status).toBe('PENDING');

    const accept = await inject({
      method: 'POST',
      url: `/api/me/group-invites/${memberRow.id}/accept`,
      headers: { authorization: `Bearer ${external.token}` },
    });
    expect(accept.statusCode).toBe(204);
    await grantProjects(admin.token, team.id, group.id, [proj.id]);

    expect(
      (await inject({
        method: 'GET',
        url: '/api/projects',
        headers: { authorization: `Bearer ${external.token}` },
      })).json() as Array<{ id: string }>,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ id: proj.id })]));

    expect(
      (await inject({
        method: 'POST',
        url: `/api/teams/${team.id}/projects/${proj.id}/tasks`,
        headers: { authorization: `Bearer ${external.token}` },
        payload: { title: 'External write' },
      })).statusCode,
    ).toBe(201);
  });

  it('6. pending grants nothing — 404 before accept', async () => {
    const admin = await registerUser('g51-admin6@example.com');
    const owner = await registerMember('g51-owner6@example.com');
    const external = await registerMember('g51-external6@example.com');
    const team = await createTeam(admin.token, 'team-g51-6');
    await addMember(admin.token, team.id, owner.email, 'MEMBER');
    const proj = await createProject(owner.token, team.id, 'Pending');
    const group = await createGroup(admin.token, team.id, 'Wait');
    await addGroupMember(admin.token, team.id, group.id, external.userId, 'FULL');
    await grantProjects(admin.token, team.id, group.id, [proj.id]);

    const list = await inject({
      method: 'GET',
      url: '/api/projects',
      headers: { authorization: `Bearer ${external.token}` },
    });
    expect(list.statusCode).toBe(200);
    expect((list.json() as Array<{ id: string }>).map((p) => p.id)).not.toContain(proj.id);

    expect(
      (await inject({
        method: 'GET',
        url: `/api/teams/${team.id}/projects/${proj.id}/tasks`,
        headers: { authorization: `Bearer ${external.token}` },
      })).statusCode,
    ).toBe(404);
  });

  it('7. declined grants nothing — terminal', async () => {
    const admin = await registerUser('g51-admin7@example.com');
    const owner = await registerMember('g51-owner7@example.com');
    const external = await registerMember('g51-external7@example.com');
    const team = await createTeam(admin.token, 'team-g51-7');
    await addMember(admin.token, team.id, owner.email, 'MEMBER');
    const proj = await createProject(owner.token, team.id, 'Declined');
    const group = await createGroup(admin.token, team.id, 'No');
    const detail = await addGroupMember(admin.token, team.id, group.id, external.userId, 'FULL');
    const memberRow = detail.members.find((m) => m.userId === external.userId)!;
    await grantProjects(admin.token, team.id, group.id, [proj.id]);

    expect(
      (await inject({
        method: 'POST',
        url: `/api/me/group-invites/${memberRow.id}/decline`,
        headers: { authorization: `Bearer ${external.token}` },
      })).statusCode,
    ).toBe(204);

    expect(
      (await inject({
        method: 'GET',
        url: `/api/teams/${team.id}/projects/${proj.id}/tasks`,
        headers: { authorization: `Bearer ${external.token}` },
      })).statusCode,
    ).toBe(404);
  });

  it('8. cross-team isolation — only granted projects visible', async () => {
    const admin = await registerUser('g51-admin8@example.com');
    const owner = await registerMember('g51-owner8@example.com');
    const external = await registerMember('g51-external8@example.com');
    const team = await createTeam(admin.token, 'team-g51-8');
    await addMember(admin.token, team.id, owner.email, 'MEMBER');
    const granted = await createProject(owner.token, team.id, 'Granted');
    const secret = await createProject(owner.token, team.id, 'Secret');
    const group = await createGroup(admin.token, team.id, 'Partial');
    const detail = await addGroupMember(admin.token, team.id, group.id, external.userId, 'FULL');
    const memberRow = detail.members.find((m) => m.userId === external.userId)!;
    await inject({
      method: 'POST',
      url: `/api/me/group-invites/${memberRow.id}/accept`,
      headers: { authorization: `Bearer ${external.token}` },
    });
    await grantProjects(admin.token, team.id, group.id, [granted.id]);

    expect(
      (await inject({
        method: 'GET',
        url: `/api/teams/${team.id}/projects/${secret.id}/tasks`,
        headers: { authorization: `Bearer ${external.token}` },
      })).statusCode,
    ).toBe(404);
  });

  it('9. removal revokes immediately', async () => {
    const admin = await registerUser('g51-admin9@example.com');
    const owner = await registerMember('g51-owner9@example.com');
    const grantee = await registerMember('g51-grantee9@example.com');
    const team = await createTeam(admin.token, 'team-g51-9');
    await addMember(admin.token, team.id, owner.email, 'MEMBER');
    await addMember(admin.token, team.id, grantee.email, 'MEMBER');
    const proj = await createProject(owner.token, team.id, 'Revoke');
    const group = await createGroup(admin.token, team.id, 'Temp');
    await addGroupMember(admin.token, team.id, group.id, grantee.userId, 'FULL');
    await grantProjects(admin.token, team.id, group.id, [proj.id]);

    await inject({
      method: 'DELETE',
      url: `/api/teams/${team.id}/groups/${group.id}/members/${grantee.userId}`,
      headers: { authorization: `Bearer ${admin.token}` },
    });

    expect(
      (await inject({
        method: 'GET',
        url: `/api/teams/${team.id}/projects/${proj.id}/tasks`,
        headers: { authorization: `Bearer ${grantee.token}` },
      })).statusCode,
    ).toBe(404);
  });

  it('10. READONLY→FULL takes effect without re-invite', async () => {
    const admin = await registerUser('g51-admin10@example.com');
    const owner = await registerMember('g51-owner10@example.com');
    const member = await registerMember('g51-member10@example.com');
    const team = await createTeam(admin.token, 'team-g51-10');
    await addMember(admin.token, team.id, owner.email, 'MEMBER');
    await addMember(admin.token, team.id, member.email, 'MEMBER');
    const proj = await createProject(owner.token, team.id, 'Upgrade');
    const group = await createGroup(admin.token, team.id, 'Levels');
    await addGroupMember(admin.token, team.id, group.id, member.userId, 'READONLY');
    await grantProjects(admin.token, team.id, group.id, [proj.id]);

    expect(
      (await inject({
        method: 'POST',
        url: `/api/teams/${team.id}/projects/${proj.id}/tasks`,
        headers: { authorization: `Bearer ${member.token}` },
        payload: { title: 'Blocked' },
      })).statusCode,
    ).toBe(403);

    await inject({
      method: 'PATCH',
      url: `/api/teams/${team.id}/groups/${group.id}/members/${member.userId}`,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { accessLevel: 'FULL' },
    });

    expect(
      (await inject({
        method: 'POST',
        url: `/api/teams/${team.id}/projects/${proj.id}/tasks`,
        headers: { authorization: `Bearer ${member.token}` },
        payload: { title: 'Now ok' },
      })).statusCode,
    ).toBe(201);
  });

  it('11. admin bypass + project.edit manager rename unchanged', async () => {
    const admin = await registerUser('g51-admin11@example.com');
    const owner = await registerMember('g51-owner11@example.com');
    const manager = await registerMember('g51-mgr11@example.com');
    const team = await createTeam(admin.token, 'team-g51-11');
    await addMember(admin.token, team.id, owner.email, 'MEMBER');
    await addMember(admin.token, team.id, manager.email, 'MANAGER');
    const proj = await createProject(owner.token, team.id, 'MgrView');

    expect(
      (await inject({
        method: 'GET',
        url: `/api/teams/${team.id}/projects/${proj.id}/tasks`,
        headers: { authorization: `Bearer ${admin.token}` },
      })).statusCode,
    ).toBe(200);

    const rename = await inject({
      method: 'PATCH',
      url: `/api/teams/${team.id}/projects/${proj.id}`,
      headers: { authorization: `Bearer ${manager.token}` },
      payload: { name: 'Renamed' },
    });
    expect(rename.statusCode).toBe(200);

    expect(
      (await inject({
        method: 'GET',
        url: `/api/teams/${team.id}/projects/${proj.id}/tasks`,
        headers: { authorization: `Bearer ${manager.token}` },
      })).statusCode,
    ).toBe(404);
  });

  it('12. cascade — delete group removes access; project survives', async () => {
    const admin = await registerUser('g51-admin12@example.com');
    const owner = await registerMember('g51-owner12@example.com');
    const grantee = await registerMember('g51-grantee12@example.com');
    const team = await createTeam(admin.token, 'team-g51-12');
    await addMember(admin.token, team.id, owner.email, 'MEMBER');
    await addMember(admin.token, team.id, grantee.email, 'MEMBER');
    const proj = await createProject(owner.token, team.id, 'Survives');
    const group = await createGroup(admin.token, team.id, 'Gone');
    await addGroupMember(admin.token, team.id, group.id, grantee.userId, 'FULL');
    await grantProjects(admin.token, team.id, group.id, [proj.id]);

    expect(
      (await inject({
        method: 'DELETE',
        url: `/api/teams/${team.id}/groups/${group.id}`,
        headers: { authorization: `Bearer ${admin.token}` },
      })).statusCode,
    ).toBe(204);

    expect(await prisma.project.findUnique({ where: { id: proj.id } })).not.toBeNull();
    expect(await prisma.userGroup.findUnique({ where: { id: group.id } })).toBeNull();

    expect(
      (await inject({
        method: 'GET',
        url: `/api/teams/${team.id}/projects/${proj.id}/tasks`,
        headers: { authorization: `Bearer ${grantee.token}` },
      })).statusCode,
    ).toBe(404);
  });
});
