import { api } from '@/lib/api';

export interface DoneTaskRow {
  taskId: string;
  taskTitle: string;
  projectId: string;
  projectName: string;
  assigneeId: string | null;
  assigneeName: string | null;
  completedAt: string;
}

export interface DoneReport {
  windowDays: number;
  items: DoneTaskRow[];
}

export async function fetchDoneReport(teamId: string, days: number): Promise<DoneReport> {
  return (await api.get<DoneReport>(`/teams/${teamId}/reports/done`, { params: { days } })).data;
}

export interface WorkloadRow {
  assigneeId: string | null;
  assigneeName: string | null;
  total: number;
  byStatus: { TODO: number; IN_PROGRESS: number; REVIEW: number };
}

export async function fetchWorkload(teamId: string): Promise<{ items: WorkloadRow[] }> {
  return (await api.get<{ items: WorkloadRow[] }>(`/teams/${teamId}/reports/workload`)).data;
}

export interface OverdueTaskRow {
  taskId: string;
  taskTitle: string;
  projectId: string;
  projectName: string;
  status: 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';
  assigneeId: string | null;
  assigneeName: string | null;
  dueDate: string;
  daysOverdue: number;
}

export async function fetchOverdue(teamId: string): Promise<{ items: OverdueTaskRow[] }> {
  return (await api.get<{ items: OverdueTaskRow[] }>(`/teams/${teamId}/reports/overdue`)).data;
}

export interface SummaryReport {
  doneLast7Days: number;
  overdueCount: number;
  openCount: number;
  byStatus: { TODO: number; IN_PROGRESS: number; REVIEW: number; DONE: number };
}

export async function fetchSummary(teamId: string): Promise<SummaryReport> {
  return (await api.get<SummaryReport>(`/teams/${teamId}/reports/summary`)).data;
}

export interface TimelinessReport {
  windowDays: number;
  evaluatedCount: number;
  // 0..1; 0 when no tasks have both plannedDate + completedAt in window.
  onTimeRate: number;
  // Days; positive = late, negative = early.
  avgVarianceDays: number;
  behindPlanCount: number;
}

export async function fetchTimeliness(
  teamId: string,
  days: number,
): Promise<TimelinessReport> {
  return (
    await api.get<TimelinessReport>(`/teams/${teamId}/reports/timeliness`, {
      params: { days },
    })
  ).data;
}
