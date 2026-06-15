// v1.77: kanban/list view mode. Legacy `technician` URL/localStorage values map to
// `responsible` so saved links and preferences survive the rename.
export type TaskViewMode = 'status' | 'responsible' | 'list';

export function parseTaskViewMode(raw: string | null | undefined): TaskViewMode | null {
  if (raw === 'status' || raw === 'list' || raw === 'responsible') return raw;
  if (raw === 'technician') return 'responsible';
  return null;
}
