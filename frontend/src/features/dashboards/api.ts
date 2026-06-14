import { api } from '@/lib/api';

export type WidgetType = 'METRIC' | 'BAR' | 'PIE' | 'LINE' | 'TABLE';
export type DataSource =
  | 'task_count'
  | 'planned_budget_sum'
  | 'actual_spent_sum'
  | 'custom_field_number_sum';

export interface WidgetFilterCondition {
  field: 'status' | 'priority' | 'assignee' | 'label' | 'project' | 'custom_field';
  op: 'in' | 'has' | 'equals';
  value: string[] | string | number | boolean;
  customFieldId?: string;
}

export interface WidgetFilters {
  match?: 'ALL' | 'ANY';
  conditions: WidgetFilterCondition[];
}

export interface WidgetConfig {
  customFieldId?: string;
  timeField?: 'completedAt' | 'createdAt';
  lineDays?: number;
}

export interface DashboardWidgetDto {
  id: string;
  dashboardId: string;
  type: WidgetType;
  title: string;
  dataSource: DataSource;
  groupBy: string | null;
  timeBucket: 'day' | 'week' | 'month' | null;
  filtersJson: WidgetFilters | null;
  configJson: WidgetConfig | null;
  position: number;
}

export interface DashboardDto {
  id: string;
  teamId: string;
  ownerId: string;
  name: string;
  description: string | null;
  shared: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
  widgets: DashboardWidgetDto[];
  canEdit: boolean;
}

export interface DashboardListItem {
  id: string;
  teamId: string;
  ownerId: string;
  name: string;
  description: string | null;
  shared: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
  widgetCount: number;
  canEdit: boolean;
}

export interface WidgetDataRow {
  key: string;
  label: string;
  value: number | string;
}

export interface WidgetDataResult {
  kind: 'metric' | 'grouped' | 'series' | 'table';
  total?: number | string;
  rows?: WidgetDataRow[];
  series?: { bucket: string; label: string; value: number }[];
}

export interface DashboardWidgetInput {
  id?: string;
  type: WidgetType;
  title: string;
  dataSource: DataSource;
  groupBy?: string | null;
  timeBucket?: 'day' | 'week' | 'month' | null;
  filtersJson?: WidgetFilters | null;
  configJson?: WidgetConfig | null;
  position?: number;
}

export async function fetchDashboards(teamId: string): Promise<{ items: DashboardListItem[] }> {
  return (await api.get<{ items: DashboardListItem[] }>(`/teams/${teamId}/dashboards`)).data;
}

export async function fetchDashboard(teamId: string, dashboardId: string): Promise<DashboardDto> {
  return (await api.get<DashboardDto>(`/teams/${teamId}/dashboards/${dashboardId}`)).data;
}

export async function createDashboard(
  teamId: string,
  body: {
    name: string;
    description?: string | null;
    shared?: boolean;
    widgets?: DashboardWidgetInput[];
  },
): Promise<DashboardDto> {
  return (await api.post<DashboardDto>(`/teams/${teamId}/dashboards`, body)).data;
}

export async function updateDashboard(
  teamId: string,
  dashboardId: string,
  body: { name?: string; description?: string | null; shared?: boolean },
): Promise<DashboardDto> {
  return (await api.patch<DashboardDto>(`/teams/${teamId}/dashboards/${dashboardId}`, body)).data;
}

export async function deleteDashboard(teamId: string, dashboardId: string): Promise<void> {
  await api.delete(`/teams/${teamId}/dashboards/${dashboardId}`);
}

export async function setDashboardWidgets(
  teamId: string,
  dashboardId: string,
  widgets: DashboardWidgetInput[],
): Promise<DashboardDto> {
  return (
    await api.put<DashboardDto>(`/teams/${teamId}/dashboards/${dashboardId}/widgets`, { widgets })
  ).data;
}

export async function fetchWidgetData(
  teamId: string,
  dashboardId: string,
  widgetId: string,
): Promise<WidgetDataResult> {
  return (
    await api.get<WidgetDataResult>(
      `/teams/${teamId}/dashboards/${dashboardId}/widgets/${widgetId}/data`,
    )
  ).data;
}
