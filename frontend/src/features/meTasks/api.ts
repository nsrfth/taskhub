import { api } from '@/lib/api';
import type { Task, TaskPriority, TaskStatus } from '@/features/tasks/api';

export interface MeTask extends Task {
  projectName: string;
  teamName: string;
  assigneeName: string | null;
}

export interface MeTasksQuery {
  status?: TaskStatus;
  priority?: TaskPriority;
  projectId?: string;
  teamId?: string;
  q?: string;
  filter?: 'due_today' | 'overdue' | 'upcoming' | 'completed' | 'high_priority';
  sort?: 'dueDate' | 'priority' | 'status' | 'createdAt';
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  cursor?: string;
}

export interface MeTasksResponse {
  items: MeTask[];
  nextCursor: string | null;
  total: number;
}

export async function fetchMyTasks(query?: MeTasksQuery): Promise<MeTasksResponse> {
  return (await api.get<MeTasksResponse>('/me/tasks', { params: query })).data;
}
