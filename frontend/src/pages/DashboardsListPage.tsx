import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTeams } from '@/features/teams/TeamsContext';
import { useT } from '@/lib/i18n';
import { createDashboard, deleteDashboard, fetchDashboards } from '@/features/dashboards/api';

export default function DashboardsListPage(): JSX.Element {
  const { currentTeam } = useTeams();
  const t = useT();
  const nav = useNavigate();
  const qc = useQueryClient();

  const teamId = currentTeam?.id;
  const { data, isLoading } = useQuery({
    queryKey: ['dashboards', teamId],
    queryFn: () => fetchDashboards(teamId!),
    enabled: !!teamId,
  });

  const createMut = useMutation({
    mutationFn: () =>
      createDashboard(teamId!, {
        name: t('dashboard.defaultName'),
        shared: false,
      }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['dashboards', teamId] });
      nav(`/dashboards/${d.id}`);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteDashboard(teamId!, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboards', teamId] }),
  });

  if (!currentTeam) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <p className="text-sm text-slate-500">{t('dashboard.selectTeam')}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{t('dashboard.title')}</h1>
        <button
          type="button"
          onClick={() => createMut.mutate()}
          disabled={createMut.isPending}
          className="px-3 py-1.5 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {t('dashboard.create')}
        </button>
      </div>

      {isLoading && <p className="text-sm text-slate-500">{t('dashboard.loading')}</p>}

      {!isLoading && (data?.items.length ?? 0) === 0 && (
        <p className="text-sm text-slate-500 italic">{t('dashboard.empty')}</p>
      )}

      <ul className="space-y-2">
        {(data?.items ?? []).map((d) => (
          <li
            key={d.id}
            className="flex items-center justify-between gap-4 p-3 rounded-lg border dark:border-slate-700 bg-white dark:bg-slate-800"
          >
            <div>
              <Link to={`/dashboards/${d.id}`} className="font-medium text-indigo-600 dark:text-indigo-400">
                {d.name}
              </Link>
              <p className="text-xs text-slate-500 mt-0.5">
                {d.widgetCount} {t('dashboard.widgetCount')}
                {d.shared ? ` · ${t('dashboard.shared')}` : ''}
              </p>
            </div>
            {d.canEdit && (
              <button
                type="button"
                className="text-xs text-red-600 hover:underline"
                onClick={() => {
                  if (window.confirm(t('dashboard.confirmDelete'))) deleteMut.mutate(d.id);
                }}
              >
                {t('dashboard.delete')}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
