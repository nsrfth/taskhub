import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTeams } from '@/features/teams/TeamsContext';
import { useT } from '@/lib/i18n';
import {
  fetchDashboard,
  setDashboardWidgets,
  updateDashboard,
  type DashboardWidgetInput,
  type WidgetType,
  type DataSource,
} from '@/features/dashboards/api';
import DashboardWidgetCard from '@/features/dashboards/DashboardWidgetCard';
import WidgetEditorPanel from '@/features/dashboards/WidgetEditorPanel';

export default function DashboardEditorPage(): JSX.Element {
  const { dashboardId } = useParams<{ dashboardId: string }>();
  const { currentTeam } = useTeams();
  const t = useT();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<DashboardWidgetInput | null>(null);
  const [editIndex, setEditIndex] = useState<number | null>(null);

  const teamId = currentTeam?.id;
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', teamId, dashboardId],
    queryFn: () => fetchDashboard(teamId!, dashboardId!),
    enabled: !!teamId && !!dashboardId,
  });

  const saveMeta = useMutation({
    mutationFn: (body: { name?: string; shared?: boolean }) =>
      updateDashboard(teamId!, dashboardId!, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboard', teamId, dashboardId] }),
  });

  const saveWidgets = useMutation({
    mutationFn: (widgets: DashboardWidgetInput[]) =>
      setDashboardWidgets(teamId!, dashboardId!, widgets),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard', teamId, dashboardId] });
      setEditing(null);
      setEditIndex(null);
    },
  });

  const draftWidgets = useMemo(() => data?.widgets ?? [], [data]);

  if (!currentTeam) {
    return (
      <div className="p-8">
        <p className="text-sm text-slate-500">{t('dashboard.selectTeam')}</p>
      </div>
    );
  }

  if (isLoading || !data || !teamId) {
    return <p className="p-8 text-sm text-slate-500">{t('dashboard.loading')}</p>;
  }

  const tid = teamId;

  const canEdit = data.canEdit;

  function openNewWidget() {
    setEditing({
      type: 'METRIC',
      title: t('dashboard.widget.newTitle'),
      dataSource: 'task_count',
    });
    setEditIndex(null);
  }

  function openEditWidget(index: number) {
    const w = draftWidgets[index];
    setEditing({
      id: w.id,
      type: w.type as WidgetType,
      title: w.title,
      dataSource: w.dataSource as DataSource,
      groupBy: w.groupBy,
      timeBucket: w.timeBucket,
      filtersJson: w.filtersJson,
      configJson: w.configJson,
      position: w.position,
    });
    setEditIndex(index);
  }

  function toInput(w: (typeof draftWidgets)[number], position: number): DashboardWidgetInput {
    return {
      id: w.id,
      type: w.type as WidgetType,
      title: w.title,
      dataSource: w.dataSource as DataSource,
      groupBy: w.groupBy ?? null,
      timeBucket: w.timeBucket ?? null,
      filtersJson: w.filtersJson ?? null,
      configJson: w.configJson ?? null,
      position,
    };
  }

  function commitWidget(widget: DashboardWidgetInput) {
    const next = draftWidgets.map((w, i) => toInput(w, i));
    const normalized: DashboardWidgetInput = {
      ...widget,
      groupBy: widget.groupBy ?? null,
      timeBucket: widget.timeBucket ?? null,
      filtersJson: widget.filtersJson ?? null,
      configJson: widget.configJson ?? null,
    };
    if (editIndex === null) {
      next.push({ ...normalized, position: next.length });
    } else {
      next[editIndex] = { ...normalized, id: next[editIndex]?.id, position: editIndex };
    }
    saveWidgets.mutate(next);
  }

  function removeWidget(index: number) {
    const next = draftWidgets
      .filter((_, i) => i !== index)
      .map((w, i) => toInput(w, i));
    saveWidgets.mutate(next);
  }

  return (
    <div className="min-h-screen p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap items-start gap-4 justify-between">
        <div>
          <Link to="/dashboards" className="text-xs text-primary">
            {t('dashboard.backToList')}
          </Link>
          {canEdit ? (
            <input
              className="block mt-2 text-2xl font-bold bg-transparent border-b border-transparent hover:border-slate-300 focus:border-primary outline-none w-full max-w-md"
              defaultValue={data.name}
              onBlur={(e) => {
                const name = e.target.value.trim();
                if (name && name !== data.name) saveMeta.mutate({ name });
              }}
            />
          ) : (
            <h1 className="mt-2 text-2xl font-bold">{data.name}</h1>
          )}
          {data.shared && (
            <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded bg-bg-elevated">
              {t('dashboard.shared')}
            </span>
          )}
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={data.shared}
                onChange={(e) => saveMeta.mutate({ shared: e.target.checked })}
              />
              {t('dashboard.shared')}
            </label>
            <button
              type="button"
              onClick={openNewWidget}
              className="px-3 py-1.5 text-sm rounded bg-primary text-primary-contrast hover:bg-primary"
            >
              {t('dashboard.widget.add')}
            </button>
          </div>
        )}
      </div>

      {editing && canEdit && (
        <WidgetEditorPanel
          teamId={tid}
          initial={editing}
          onSave={commitWidget}
          onCancel={() => {
            setEditing(null);
            setEditIndex(null);
          }}
        />
      )}

      {draftWidgets.length === 0 ? (
        <p className="text-sm text-slate-500 italic py-12 text-center">{t('dashboard.emptyWidgets')}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {draftWidgets.map((w, i) => (
            <div key={w.id} className="relative group">
              <DashboardWidgetCard teamId={tid} dashboardId={data.id} widget={w} />
              {canEdit && (
                <div className="absolute top-2 end-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    className="text-xs px-2 py-0.5 rounded bg-bg-elevated"
                    onClick={() => openEditWidget(i)}
                  >
                    {t('dashboard.widget.edit')}
                  </button>
                  <button
                    type="button"
                    disabled={saveWidgets.isPending}
                    className="text-xs px-2 py-0.5 rounded bg-danger/10 text-danger disabled:opacity-50"
                    onClick={() => removeWidget(i)}
                  >
                    {t('dashboard.widget.remove')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!canEdit && (
        <p className="text-xs text-slate-500">{t('dashboard.readOnly')}</p>
      )}
    </div>
  );
}
