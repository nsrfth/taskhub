import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import * as projectsApi from '@/features/projects/api';
import * as tasksApi from '@/features/tasks/api';
import TaskGrid from '@/features/planner/TaskGrid';
import type { TaskFilterState } from '@/features/planner/filters';
import { getTeam } from '@/features/teams/api';
import { useT } from '@/lib/i18n';

export default function PlannerGridPage(): JSX.Element {
  const t = useT();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [projectId, setProjectId] = useState('');
  const [filters, setFilters] = useState<TaskFilterState>({});

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects', 'all'],
    queryFn: projectsApi.listAllProjects,
  });

  const targetProjects = useMemo(() => {
    if (projectId) return projects.filter((p) => p.id === projectId);
    return projects.slice(0, 15);
  }, [projects, projectId]);

  const taskQueries = useQueries({
    queries: targetProjects.map((p) => ({
      queryKey: ['tasks', p.teamId, p.id],
      queryFn: () => tasksApi.listTasks(p.teamId, p.id),
      enabled: targetProjects.length > 0,
    })),
  });

  const teamId = targetProjects[0]?.teamId;
  const { data: teamDetail } = useQuery({
    queryKey: ['teams', teamId],
    queryFn: () => getTeam(teamId!),
    enabled: !!teamId,
  });

  const assigneeNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const mem of teamDetail?.members ?? []) {
      m.set(mem.userId, mem.name || mem.email);
    }
    return m;
  }, [teamDetail]);

  const rows = useMemo(() => {
    return taskQueries.flatMap((q, i) => {
      const p = targetProjects[i];
      if (!p || !q.data) return [];
      return q.data.map((task) => ({
        ...task,
        projectName: p.name,
        assigneeName: task.assigneeId ? assigneeNames.get(task.assigneeId) ?? null : null,
      }));
    });
  }, [taskQueries, targetProjects, assigneeNames]);

  const updateMut = useMutation({
    mutationFn: (args: { teamId: string; projectId: string; taskId: string; status: tasksApi.TaskStatus }) =>
      tasksApi.updateTask(args.teamId, args.projectId, args.taskId, { status: args.status }),
    onSuccess: async (_d, vars) => {
      await qc.invalidateQueries({ queryKey: ['tasks', vars.teamId, vars.projectId] });
    },
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">{t('planner.grid.title')}</h1>
      <div className="flex flex-wrap gap-3 mb-4 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-slate-500">{t('planner.filter.project')}</span>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="rounded border px-2 py-1 dark:bg-slate-800"
          >
            <option value="">{t('planner.filter.allProjects')}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <select
          value={filters.status ?? ''}
          onChange={(e) =>
            setFilters((f) => ({ ...f, status: (e.target.value || undefined) as tasksApi.TaskStatus | undefined }))
          }
          className="rounded border px-2 py-1 dark:bg-slate-800"
        >
          <option value="">All statuses</option>
          {(['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'] as const).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={filters.priority ?? ''}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              priority: (e.target.value || undefined) as tasksApi.TaskPriority | undefined,
            }))
          }
          className="rounded border px-2 py-1 dark:bg-slate-800"
        >
          <option value="">All priorities</option>
          {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const).map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      <TaskGrid
        tasks={rows}
        filters={filters}
        showProjectColumn={!projectId}
        onOpen={(task) => nav(`/projects/${task.projectId}/tasks/${task.id}`)}
        onStatusChange={(task, status) =>
          updateMut.mutate({
            teamId: task.teamId,
            projectId: task.projectId,
            taskId: task.id,
            status,
          })
        }
      />
    </div>
  );
}
