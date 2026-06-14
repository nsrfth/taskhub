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
  await prisma.dashboardWidget.deleteMany();
  await prisma.dashboard.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.customFieldValueOption.deleteMany();
  await prisma.customFieldValue.deleteMany();
  await prisma.customFieldOption.deleteMany();
  await prisma.customFieldDefinition.deleteMany();
  await prisma.taskLabel.deleteMany();
  await prisma.label.deleteMany();
  await prisma.projectGroupGrant.deleteMany();
  await prisma.userGroupMember.deleteMany();
  await prisma.userGroup.deleteMany();
  await prisma.activity.deleteMany();
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

async function registerUser(email: string, globalRole?: GlobalRole) {
  return bootstrapUser(app, {
    email,
    name: email,
    password: PASSWORD,
    globalRole: globalRole ?? GlobalRole.MEMBER,
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

async function createTask(
  token: string,
  teamId: string,
  projectId: string,
  payload: Record<string, unknown>,
) {
  const res = await inject({
    method: 'POST',
    url: `/api/teams/${teamId}/projects/${projectId}/tasks`,
    headers: { authorization: `Bearer ${token}` },
    payload: { title: 'Task', ...payload },
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string };
}

async function createDashboard(token: string, teamId: string, body: Record<string, unknown>) {
  const res = await inject({
    method: 'POST',
    url: `/api/teams/${teamId}/dashboards`,
    headers: { authorization: `Bearer ${token}` },
    payload: body,
  });
  return res;
}

async function widgetData(
  token: string,
  teamId: string,
  dashboardId: string,
  widgetId: string,
) {
  return inject({
    method: 'GET',
    url: `/api/teams/${teamId}/dashboards/${dashboardId}/widgets/${widgetId}/data`,
    headers: { authorization: `Bearer ${token}` },
  });
}

describe('dashboards', () => {
  it('creates dashboard with each widget type and resolves data', async () => {
    const owner = await registerUser('dash-owner@test.local');
    const team = await createTeam(owner.token, 'dash-team');
    const project = await createProject(owner.token, team.id, 'P1');

    await createTask(owner.token, team.id, project.id, {
      title: 'Open',
      status: 'TODO',
      priority: 'HIGH',
    });
    const done = await createTask(owner.token, team.id, project.id, {
      title: 'Done',
      status: 'DONE',
    });
    await prisma.task.update({
      where: { id: done.id },
      data: { completedAt: new Date('2026-06-01T12:00:00.000Z') },
    });

    const res = await createDashboard(owner.token, team.id, {
      name: 'All widgets',
      widgets: [
        { type: 'METRIC', title: 'Total', dataSource: 'task_count' },
        { type: 'BAR', title: 'By status', dataSource: 'task_count', groupBy: 'status' },
        { type: 'PIE', title: 'By priority', dataSource: 'task_count', groupBy: 'priority' },
        {
          type: 'LINE',
          title: 'Completions',
          dataSource: 'task_count',
          timeBucket: 'week',
          configJson: { timeField: 'completedAt', lineDays: 60 },
        },
        { type: 'TABLE', title: 'Projects', dataSource: 'task_count', groupBy: 'project' },
      ],
    });
    expect(res.statusCode).toBe(201);
    const dash = res.json() as { id: string; widgets: { id: string; type: string }[] };
    expect(dash.widgets).toHaveLength(5);

    for (const w of dash.widgets) {
      const dataRes = await widgetData(owner.token, team.id, dash.id, w.id);
      expect(dataRes.statusCode).toBe(200);
      const data = dataRes.json() as { kind: string; total?: number; rows?: unknown[]; series?: unknown[] };
      if (w.type === 'METRIC') {
        expect(data.kind).toBe('metric');
        expect(data.total).toBe(2);
      } else if (w.type === 'LINE') {
        expect(data.kind).toBe('series');
        expect((data.series ?? []).length).toBeGreaterThan(0);
      } else if (w.type === 'TABLE') {
        expect(data.kind).toBe('table');
        expect((data.rows ?? []).length).toBeGreaterThan(0);
      } else {
        expect(data.kind).toBe('grouped');
        expect((data.rows ?? []).length).toBeGreaterThan(0);
      }
    }
  });

  it('groups by status, priority, assignee, label, project, due-bucket correctly', async () => {
    const owner = await registerUser('group-owner@test.local');
    const member = await registerUser('group-member@test.local');
    const team = await createTeam(owner.token, 'group-team');
    await addMember(owner.token, team.id, member.email, 'MEMBER');
    const projectA = await createProject(owner.token, team.id, 'Alpha');
    const projectB = await createProject(owner.token, team.id, 'Beta');

    const labelRes = await inject({
      method: 'POST',
      url: `/api/teams/${team.id}/labels`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: 'urgent', color: '#ff0000' },
    });
    expect(labelRes.statusCode).toBe(201);
    const label = labelRes.json() as { id: string };

    const t1 = await createTask(owner.token, team.id, projectA.id, {
      title: 'T1',
      status: 'TODO',
      priority: 'HIGH',
      assigneeId: member.userId,
    });
    await inject({
      method: 'POST',
      url: `/api/teams/${team.id}/projects/${projectA.id}/tasks/${t1.id}/labels`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { labelId: label.id },
    });

    await createTask(owner.token, team.id, projectB.id, {
      title: 'T2',
      status: 'IN_PROGRESS',
      priority: 'LOW',
    });

    const overdueDate = new Date();
    overdueDate.setUTCDate(overdueDate.getUTCDate() - 2);
    await createTask(owner.token, team.id, projectA.id, {
      title: 'Overdue',
      status: 'TODO',
      dueDate: overdueDate.toISOString(),
    });

    const dimensions = [
      'status',
      'priority',
      'assignee',
      'label',
      'project',
      'due_bucket',
    ] as const;

    for (const groupBy of dimensions) {
      const dashRes = await createDashboard(owner.token, team.id, {
        name: `By ${groupBy}`,
        widgets: [
          { type: 'BAR', title: groupBy, dataSource: 'task_count', groupBy },
        ],
      });
      expect(dashRes.statusCode).toBe(201);
      const dash = dashRes.json() as { id: string; widgets: { id: string }[] };
      const dataRes = await widgetData(owner.token, team.id, dash.id, dash.widgets[0].id);
      expect(dataRes.statusCode).toBe(200);
      const data = dataRes.json() as { rows: { key: string; value: number }[] };
      const total = data.rows.reduce((s, r) => s + Number(r.value), 0);
      expect(total).toBeGreaterThanOrEqual(3);
    }
  });

  it('groups SELECT custom field and sums NUMBER custom field', async () => {
    const owner = await registerUser('cf-owner@test.local');
    const team = await createTeam(owner.token, 'cf-team');
    const project = await createProject(owner.token, team.id, 'P');

    const selectField = await inject({
      method: 'POST',
      url: `/api/teams/${team.id}/custom-fields`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: 'Region', type: 'SINGLE_SELECT', options: [{ label: 'North' }, { label: 'South' }] },
    });
    expect(selectField.statusCode).toBe(201);
    const selectDef = selectField.json() as { id: string; options: { id: string; label: string }[] };
    const northId = selectDef.options.find((o) => o.label === 'North')!.id;

    const numField = await inject({
      method: 'POST',
      url: `/api/teams/${team.id}/custom-fields`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: 'Points', type: 'NUMBER' },
    });
    expect(numField.statusCode).toBe(201);
    const numDef = numField.json() as { id: string };

    const t1 = await createTask(owner.token, team.id, project.id, { title: 'A' });
    const t2 = await createTask(owner.token, team.id, project.id, { title: 'B' });

    await inject({
      method: 'PUT',
      url: `/api/teams/${team.id}/projects/${project.id}/tasks/${t1.id}/custom-fields/${selectDef.id}`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { optionIds: [northId] },
    });
    await inject({
      method: 'PUT',
      url: `/api/teams/${team.id}/projects/${project.id}/tasks/${t1.id}/custom-fields/${numDef.id}`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { valueNumber: 10 },
    });
    await inject({
      method: 'PUT',
      url: `/api/teams/${team.id}/projects/${project.id}/tasks/${t2.id}/custom-fields/${numDef.id}`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { valueNumber: 5 },
    });

    const selectDash = await createDashboard(owner.token, team.id, {
      name: 'Select group',
      widgets: [
        {
          type: 'PIE',
          title: 'Region',
          dataSource: 'task_count',
          groupBy: `custom_field:${selectDef.id}`,
        },
      ],
    });
    const sd = selectDash.json() as { id: string; widgets: { id: string }[] };
    const selectData = (await widgetData(owner.token, team.id, sd.id, sd.widgets[0].id)).json() as {
      rows: { key: string; value: number }[];
    };
    const northRow = selectData.rows.find((r) => r.key === northId);
    expect(northRow?.value).toBe(1);

    const sumDash = await createDashboard(owner.token, team.id, {
      name: 'Sum',
      widgets: [
        {
          type: 'METRIC',
          title: 'Points sum',
          dataSource: 'custom_field_number_sum',
          configJson: { customFieldId: numDef.id },
        },
      ],
    });
    const sumD = sumDash.json() as { id: string; widgets: { id: string }[] };
    const sumData = (await widgetData(owner.token, team.id, sumD.id, sumD.widgets[0].id)).json() as {
      total: string;
    };
    expect(sumData.total).toBe('15.00');
  });

  it('filters narrow results (priority HIGH + status TODO)', async () => {
    const owner = await registerUser('filter-owner@test.local');
    const team = await createTeam(owner.token, 'filter-team');
    const project = await createProject(owner.token, team.id, 'P');

    await createTask(owner.token, team.id, project.id, {
      title: 'Match',
      status: 'TODO',
      priority: 'HIGH',
    });
    await createTask(owner.token, team.id, project.id, {
      title: 'Wrong priority',
      status: 'TODO',
      priority: 'LOW',
    });
    await createTask(owner.token, team.id, project.id, {
      title: 'Wrong status',
      status: 'DONE',
      priority: 'HIGH',
    });

    const dashRes = await createDashboard(owner.token, team.id, {
      name: 'Filtered',
      widgets: [
        {
          type: 'METRIC',
          title: 'Filtered count',
          dataSource: 'task_count',
          filtersJson: {
            match: 'ALL',
            conditions: [
              { field: 'priority', op: 'in', value: ['HIGH'] },
              { field: 'status', op: 'in', value: ['TODO'] },
            ],
          },
        },
      ],
    });
    const dash = dashRes.json() as { id: string; widgets: { id: string }[] };
    const data = (await widgetData(owner.token, team.id, dash.id, dash.widgets[0].id)).json() as {
      total: number;
    };
    expect(data.total).toBe(1);
  });

  it('LINE over completedAt by week renders time series', async () => {
    const owner = await registerUser('line-owner@test.local');
    const team = await createTeam(owner.token, 'line-team');
    const project = await createProject(owner.token, team.id, 'P');

    const t = await createTask(owner.token, team.id, project.id, {
      title: 'Done',
      status: 'DONE',
    });
    await prisma.task.update({
      where: { id: t.id },
      data: { completedAt: new Date('2026-06-02T10:00:00.000Z') },
    });

    const dashRes = await createDashboard(owner.token, team.id, {
      name: 'Line',
      widgets: [
        {
          type: 'LINE',
          title: 'Weekly done',
          dataSource: 'task_count',
          timeBucket: 'week',
          configJson: { timeField: 'completedAt', lineDays: 90 },
        },
      ],
    });
    const dash = dashRes.json() as { id: string; widgets: { id: string }[] };
    const data = (await widgetData(owner.token, team.id, dash.id, dash.widgets[0].id)).json() as {
      series: { bucket: string; value: number }[];
    };
    expect(data.series.some((p) => p.value >= 1)).toBe(true);
  });

  it('shared dashboard visible to member; non-owner cannot edit', async () => {
    const owner = await registerUser('share-owner@test.local');
    const member = await registerUser('share-member@test.local');
    const team = await createTeam(owner.token, 'share-team');
    await addMember(owner.token, team.id, member.email, 'MEMBER');

    const createRes = await createDashboard(owner.token, team.id, {
      name: 'Shared board',
      shared: true,
      widgets: [{ type: 'METRIC', title: 'N', dataSource: 'task_count' }],
    });
    expect(createRes.statusCode).toBe(201);
    const dash = createRes.json() as { id: string };

    const listRes = await inject({
      method: 'GET',
      url: `/api/teams/${team.id}/dashboards`,
      headers: { authorization: `Bearer ${member.token}` },
    });
    expect(listRes.statusCode).toBe(200);
    const list = listRes.json() as { items: { id: string; canEdit: boolean }[] };
    expect(list.items.some((d) => d.id === dash.id)).toBe(true);
    expect(list.items.find((d) => d.id === dash.id)?.canEdit).toBe(false);

    const patchRes = await inject({
      method: 'PATCH',
      url: `/api/teams/${team.id}/dashboards/${dash.id}`,
      headers: { authorization: `Bearer ${member.token}` },
      payload: { name: 'Hacked' },
    });
    expect(patchRes.statusCode).toBe(403);
  });

  it('cross-team isolation and foreign custom field returns 404', async () => {
    const u1 = await registerUser('iso-u1@test.local');
    const u2 = await registerUser('iso-u2@test.local');
    const teamA = await createTeam(u1.token, 'team-a');
    const teamB = await createTeam(u2.token, 'team-b');
    const projectB = await createProject(u2.token, teamB.id, 'PB');
    await createTask(u2.token, teamB.id, projectB.id, { title: 'Secret' });

    const fieldRes = await inject({
      method: 'POST',
      url: `/api/teams/${teamB.id}/custom-fields`,
      headers: { authorization: `Bearer ${u2.token}` },
      payload: { name: 'TeamB only', type: 'SINGLE_SELECT', options: [{ label: 'X' }] },
    });
    const fieldB = fieldRes.json() as { id: string };

    const dashRes = await createDashboard(u1.token, teamA.id, {
      name: 'Team A dash',
      widgets: [
        {
          type: 'BAR',
          title: 'Bad ref',
          dataSource: 'task_count',
          groupBy: `custom_field:${fieldB.id}`,
        },
      ],
    });
    const dash = dashRes.json() as { id: string; widgets: { id: string }[] };

    const dataRes = await widgetData(u1.token, teamA.id, dash.id, dash.widgets[0].id);
    expect(dataRes.statusCode).toBe(404);

    const otherTeamList = await inject({
      method: 'GET',
      url: `/api/teams/${teamB.id}/dashboards`,
      headers: { authorization: `Bearer ${u1.token}` },
    });
    expect(otherTeamList.statusCode).toBe(403);
  });

  it('deleting dashboard cascades widgets; tasks untouched', async () => {
    const owner = await registerUser('del-owner@test.local');
    const team = await createTeam(owner.token, 'del-team');
    const project = await createProject(owner.token, team.id, 'P');
    const task = await createTask(owner.token, team.id, project.id, { title: 'Keep' });

    const dashRes = await createDashboard(owner.token, team.id, {
      name: 'To delete',
      widgets: [{ type: 'METRIC', title: 'N', dataSource: 'task_count' }],
    });
    const dash = dashRes.json() as { id: string };

    const delRes = await inject({
      method: 'DELETE',
      url: `/api/teams/${team.id}/dashboards/${dash.id}`,
      headers: { authorization: `Bearer ${owner.token}` },
    });
    expect(delRes.statusCode).toBe(204);

    const widgetsLeft = await prisma.dashboardWidget.count({ where: { dashboardId: dash.id } });
    expect(widgetsLeft).toBe(0);

    const taskStill = await prisma.task.findUnique({ where: { id: task.id } });
    expect(taskStill).not.toBeNull();
  });
});
