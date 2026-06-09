import type { Task, TaskPriority, TaskStatus } from '@/features/tasks/api';
import type { TaskFilterState } from './filters';
import { applyTaskFilters } from './filters';

export interface PlannerFilterBarProps {
  filters: TaskFilterState;
  onChange: (patch: Partial<TaskFilterState>) => void;
  assigneeOptions?: { id: string; name: string }[];
  labelOptions?: { id: string; name: string; color: string }[];
  showProject?: boolean;
  projectOptions?: { id: string; name: string }[];
  projectId?: string;
  onProjectChange?: (id: string) => void;
}

export function collectLabelOptions(tasks: Task[]): { id: string; name: string; color: string }[] {
  const m = new Map<string, { id: string; name: string; color: string }>();
  for (const t of tasks) {
    for (const l of t.labels) m.set(l.id, l);
  }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function collectAssigneeOptions(
  tasks: Task[],
  names: Map<string, string>,
): { id: string; name: string }[] {
  const m = new Map<string, string>();
  for (const t of tasks) {
    if (t.assigneeId) m.set(t.assigneeId, names.get(t.assigneeId) ?? 'Assigned');
  }
  return [...m.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Client-side chart/task aggregation filters (status, assignee, due date window). */
export function applyPlannerScopeFilters(
  tasks: Task[],
  scope: {
    status?: TaskStatus | '';
    assigneeId?: string | '';
    dateFrom?: string;
    dateTo?: string;
  },
): Task[] {
  return applyTaskFilters(tasks, {
    status: scope.status || undefined,
    assigneeId: scope.assigneeId || undefined,
    dateFrom: scope.dateFrom,
    dateTo: scope.dateTo,
  });
}

export default function PlannerFilterBar({
  filters,
  onChange,
  assigneeOptions = [],
  labelOptions = [],
  showProject,
  projectOptions = [],
  projectId = '',
  onProjectChange,
}: PlannerFilterBarProps): JSX.Element {
  return (
    <div className="flex flex-wrap gap-2 mb-4 text-sm items-end">
      {showProject && onProjectChange && (
        <label className="flex flex-col gap-0.5">
          <span className="text-slate-500 text-xs">Project</span>
          <select
            value={projectId}
            onChange={(e) => onProjectChange(e.target.value)}
            className="rounded border px-2 py-1 dark:bg-slate-800"
          >
            <option value="">All projects</option>
            {projectOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-0.5">
        <span className="text-slate-500 text-xs">Status</span>
        <select
          value={filters.status ?? ''}
          onChange={(e) =>
            onChange({ status: (e.target.value || undefined) as TaskStatus | undefined })
          }
          className="rounded border px-2 py-1 dark:bg-slate-800"
        >
          <option value="">All</option>
          {(['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'] as const).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="text-slate-500 text-xs">Priority</span>
        <select
          value={filters.priority ?? ''}
          onChange={(e) =>
            onChange({ priority: (e.target.value || undefined) as TaskPriority | undefined })
          }
          className="rounded border px-2 py-1 dark:bg-slate-800"
        >
          <option value="">All</option>
          {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const).map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      {assigneeOptions.length > 0 && (
        <label className="flex flex-col gap-0.5">
          <span className="text-slate-500 text-xs">Assignee</span>
          <select
            value={filters.assigneeId ?? ''}
            onChange={(e) => onChange({ assigneeId: e.target.value || undefined })}
            className="rounded border px-2 py-1 dark:bg-slate-800"
          >
            <option value="">All</option>
            <option value="__unassigned__">Unassigned</option>
            {assigneeOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {labelOptions.length > 0 && (
        <label className="flex flex-col gap-0.5">
          <span className="text-slate-500 text-xs">Label</span>
          <select
            value={filters.labelIds?.[0] ?? ''}
            onChange={(e) =>
              onChange({ labelIds: e.target.value ? [e.target.value] : undefined })
            }
            className="rounded border px-2 py-1 dark:bg-slate-800"
          >
            <option value="">All</option>
            {labelOptions.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-0.5">
        <span className="text-slate-500 text-xs">Due from</span>
        <input
          type="date"
          value={filters.dateFrom?.slice(0, 10) ?? ''}
          onChange={(e) =>
            onChange({ dateFrom: e.target.value ? `${e.target.value}T00:00:00.000Z` : undefined })
          }
          className="rounded border px-2 py-1 dark:bg-slate-800"
        />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="text-slate-500 text-xs">Due to</span>
        <input
          type="date"
          value={filters.dateTo?.slice(0, 10) ?? ''}
          onChange={(e) =>
            onChange({ dateTo: e.target.value ? `${e.target.value}T23:59:59.000Z` : undefined })
          }
          className="rounded border px-2 py-1 dark:bg-slate-800"
        />
      </label>
    </div>
  );
}
