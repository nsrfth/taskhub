import { api } from '@/lib/api';
import type { TaskStatus } from '@/features/tasks/api';

// v1.90 (PMIS R1 GUI): Work Breakdown Structure tree client. The backend returns
// a FLAT list in depth-first pre-order; each node carries its derived outline
// `wbsCode`, `wbsDepth` (0 = root), an `isSummary` flag, and a leaf-weighted
// `rollupPercentComplete`. Mutation is via the tasks endpoints (create with
// parentId, POST /move to reparent).

export interface WbsNode {
  id: string;
  parentId: string | null;
  title: string;
  status: TaskStatus;
  wbsCode: string;
  wbsDepth: number;
  isSummary: boolean;
  childCount: number;
  percentComplete: number;
  rollupPercentComplete: number;
  responsibleId: string | null;
  responsibleName: string | null;
  startDate: string | null;
  dueDate: string | null;
  baselineStart: string | null;
  baselineEnd: string | null;
}

export async function getWbs(teamId: string, projectId: string): Promise<WbsNode[]> {
  return (await api.get<{ items: WbsNode[] }>(`/teams/${teamId}/projects/${projectId}/wbs`)).data
    .items;
}

// Reparent a task in the WBS tree. newParentId null = promote to a root.
// position is the 0-based index among the new siblings (clamped server-side).
export async function moveTask(
  teamId: string,
  projectId: string,
  taskId: string,
  newParentId: string | null,
  position: number,
): Promise<void> {
  await api.post(`/teams/${teamId}/projects/${projectId}/tasks/${taskId}/move`, {
    newParentId,
    position,
  });
}
