import { api } from '@/lib/api';

export interface Subtask {
  id: string;
  taskId: string;
  title: string;
  done: boolean;
  // v1.19: subtask technician (defaults to creator on create; manager/admin
  // only to change).
  technicianId: string | null;
  technicianName: string | null;
  position: number;
}

export async function createSubtask(
  teamId: string,
  projectId: string,
  taskId: string,
  input: { title: string; done?: boolean },
): Promise<Subtask> {
  return (
    await api.post<Subtask>(
      `/teams/${teamId}/projects/${projectId}/tasks/${taskId}/subtasks`,
      input,
    )
  ).data;
}

export async function updateSubtask(
  teamId: string,
  projectId: string,
  taskId: string,
  subtaskId: string,
  // v1.19: technicianId change gated server-side to manager/admin.
  input: { title?: string; done?: boolean; technicianId?: string | null },
): Promise<Subtask> {
  return (
    await api.patch<Subtask>(
      `/teams/${teamId}/projects/${projectId}/tasks/${taskId}/subtasks/${subtaskId}`,
      input,
    )
  ).data;
}

export async function deleteSubtask(
  teamId: string,
  projectId: string,
  taskId: string,
  subtaskId: string,
): Promise<void> {
  await api.delete(
    `/teams/${teamId}/projects/${projectId}/tasks/${taskId}/subtasks/${subtaskId}`,
  );
}

// v1.35: full-permutation reorder. Body must contain every subtaskId on
// the task in the desired order; partial / mismatched lists are rejected
// by the server with 400. Drag-and-drop UIs naturally send the full
// permutation on each drop.
export async function reorderSubtasks(
  teamId: string,
  projectId: string,
  taskId: string,
  subtaskIds: string[],
): Promise<{ items: Subtask[] }> {
  return (
    await api.patch<{ items: Subtask[] }>(
      `/teams/${teamId}/projects/${projectId}/tasks/${taskId}/subtasks/reorder`,
      { subtaskIds },
    )
  ).data;
}
