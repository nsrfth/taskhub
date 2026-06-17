import { api } from '@/lib/api';

// v1.81: one-page per-project status report client. Mirrors
// ProjectStatusReport in backend/src/services/projectStatusService.ts.

export interface ProjectStatusReport {
  projectId: string;
  name: string;
  status: 'ACTIVE' | 'ON_HOLD' | 'ARCHIVED';
  startDate: string | null;
  endDate: string | null;
  ownerName: string | null;
  accountableName: string | null;
  plannedBudget: string | null;
  budgetCurrency: 'IRR' | 'EUR' | 'USD';
  taskCounts: {
    todo: number;
    inProgress: number;
    review: number;
    done: number;
    total: number;
  };
  overdueCount: number;
  percentComplete: number;
}

export async function fetchProjectStatus(
  teamId: string,
  projectId: string,
): Promise<ProjectStatusReport> {
  return (
    await api.get<ProjectStatusReport>(
      `/teams/${teamId}/projects/${projectId}/reports/status`,
    )
  ).data;
}
