import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchMyTasks, type MeTask, type MeTasksQuery } from '@/features/meTasks/api';
import * as tasksApi from '@/features/tasks/api';
import GroupedBoard from '@/features/planner/GroupedBoard';
import TaskGrid from '@/features/planner/TaskGrid';
import {
  BOARD_GROUP_BY_LABEL,
  BOARD_GROUP_BY_ORDER,
  groupTasks,
  type BoardGroupBy,
} from '@/features/planner/grouping';
import { loadBoardGroupBy, saveBoardGroupBy } from '@/features/planner/storage';
import { useT } from '@/lib/i18n';

type SubView = 'board' | 'grid' | 'calendar';

export default function MyTasksPage(): JSX.Element {
  const t = useT();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [subView, setSubView] = useState<SubView>('board');
  const [groupBy, setGroupBy] = useState<BoardGroupBy>(() => loadBoardGroupBy());
  const [filter, setFilter] = useState<MeTasksQuery['filter'] | ''>('');
  const [projectId, setProjectId] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const query: MeTasksQuery = {
    filter: filter || undefined,
    projectId: projectId || undefined,
    sort: 'dueDate',
    order: 'asc',
    limit: pageSize,
    offset: page * pageSize,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['me', 'tasks', query],
    queryFn: () => fetchMyTasks(query),
  });

  const tasks = data?.items ?? [];
  const projectNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const tk of tasks) m.set(tk.projectId, tk.projectName);
    return m;
  }, [tasks]);

  const assigneeNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const tk of tasks) {
      if (tk.assigneeId && tk.assigneeName) m.set(tk.assigneeId, tk.assigneeName);
    }
    return m;
  }, [tasks]);

  const columns = useMemo(
    () => groupTasks(tasks, groupBy, [], assigneeNames),
    [tasks, groupBy, assigneeNames],
  );

  const updateMut = useMutation({
    mutationFn: (args: { task: MeTask; status: tasksApi.TaskStatus }) =>
      tasksApi.updateTask(args.task.teamId, args.task.projectId, args.task.id, {
        status: args.status,
      }),
    onSuccess: async (_d, vars) => {
      await qc.invalidateQueries({ queryKey: ['me', 'tasks'] });
      await qc.invalidateQueries({ queryKey: ['tasks', vars.task.teamId, vars.task.projectId] });
    },
  });

  const uniqueProjects = useMemo(() => {
    const seen = new Map<string, string>();
    for (const tk of tasks) seen.set(tk.projectId, tk.projectName);
    return [...seen.entries()];
  }, [tasks]);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-2">{t('planner.myTasks.title')}</h1>
      <p className="text-sm text-slate-500 mb-4">{t('planner.myTasks.hint')}</p>

      <div className="flex flex-wrap gap-2 mb-4">
        {(['board', 'grid', 'calendar'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => (v === 'calendar' ? nav('/planner/calendar') : setSubView(v))}
            className={`px-3 py-1 text-sm rounded ${
              subView === v
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'border border-slate-300'
            }`}
          >
            {t(`planner.myTasks.view.${v}`)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-4 text-sm">
        <select
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value as MeTasksQuery['filter'] | '');
            setPage(0);
          }}
          className="rounded border px-2 py-1 dark:bg-slate-800"
        >
          <option value="">{t('planner.myTasks.filter.all')}</option>
          <option value="due_today">{t('planner.myTasks.filter.dueToday')}</option>
          <option value="overdue">{t('planner.myTasks.filter.overdue')}</option>
          <option value="upcoming">{t('planner.myTasks.filter.upcoming')}</option>
          <option value="completed">{t('planner.myTasks.filter.completed')}</option>
          <option value="high_priority">{t('planner.myTasks.filter.highPriority')}</option>
        </select>
        <select
          value={projectId}
          onChange={(e) => {
            setProjectId(e.target.value);
            setPage(0);
          }}
          className="rounded border px-2 py-1 dark:bg-slate-800"
        >
          <option value="">{t('planner.filter.allProjects')}</option>
          {uniqueProjects.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        {subView === 'board' && (
          <select
            value={groupBy}
            onChange={(e) => {
              const v = e.target.value as BoardGroupBy;
              setGroupBy(v);
              saveBoardGroupBy(v);
            }}
            className="rounded border px-2 py-1 dark:bg-slate-800"
            aria-label="Group by"
          >
            {BOARD_GROUP_BY_ORDER.map((g) => (
              <option key={g} value={g}>
                {t('planner.groupBy')}: {BOARD_GROUP_BY_LABEL[g]}
              </option>
            ))}
          </select>
        )}
      </div>

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}

      {subView === 'board' && !isLoading && (
        <GroupedBoard
          columns={columns}
          onOpen={(id) => {
            const task = tasks.find((tk) => tk.id === id);
            if (task) nav(`/projects/${task.projectId}/tasks/${id}`);
          }}
          onStatusChange={(task, status) => updateMut.mutate({ task: task as MeTask, status })}
          projectNames={projectNames}
        />
      )}

      {subView === 'grid' && !isLoading && (
        <TaskGrid
          tasks={tasks}
          showProjectColumn
          total={data?.total}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onOpen={(task) => nav(`/projects/${task.projectId}/tasks/${task.id}`)}
          onStatusChange={(task, status) => updateMut.mutate({ task: task as MeTask, status })}
        />
      )}
    </div>
  );
}
