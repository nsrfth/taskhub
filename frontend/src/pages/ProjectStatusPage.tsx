import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchProjectStatus } from '@/features/reports/projectStatusApi';
import { formatShamsiCalendarDate } from '@/lib/shamsi';
import { budgetLocaleFromLanguage, formatBudget } from '@/lib/formatBudget';
import { getLanguage, useT } from '@/lib/i18n';

// v1.81: one-page per-project status report. Overview only (no task list):
// % complete, task counts by status, overdue count, dates, budget, owner +
// accountable. Print-friendly (window.print()); RTL via the app <html dir>.

interface RouteParams extends Record<string, string | undefined> {
  projectId: string;
}

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  ON_HOLD: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  ARCHIVED: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
};

export default function ProjectStatusPage(): JSX.Element {
  const { projectId } = useParams<RouteParams>();
  const t = useT();
  const locale = budgetLocaleFromLanguage(getLanguage());

  // Resolve the project's team from the cross-team list (same as the Gantt page).
  const { data: allProjects } = useQuery({
    queryKey: ['projects', 'all'],
    queryFn: async () => {
      const { api } = await import('@/lib/api');
      return (await api.get<Array<{ id: string; teamId: string; name: string }>>('/projects')).data;
    },
  });
  const teamId = allProjects?.find((p) => p.id === projectId)?.teamId ?? null;

  const { data, isLoading, error } = useQuery({
    queryKey: ['projectStatus', teamId, projectId],
    queryFn: () => fetchProjectStatus(teamId!, projectId!),
    enabled: !!teamId && !!projectId,
  });

  const statusLabel = data
    ? t(`projects.status.${data.status === 'ON_HOLD' ? 'onHold' : data.status.toLowerCase()}` as never)
    : '';

  return (
    <div className="p-6 max-w-3xl mx-auto print:p-0 print:max-w-none">
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <Link to="/projects" className="text-sm text-slate-500 hover:underline">
          ← {t('nav.projects')}
        </Link>
        {data && (
          <button
            type="button"
            onClick={() => window.print()}
            className="text-sm rounded border border-slate-300 dark:border-slate-600 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            🖨 {t('projects.status.print')}
          </button>
        )}
      </div>

      {isLoading && <p className="text-sm text-slate-500">{t('common.loading')}</p>}
      {error && (
        <p className="text-sm text-red-600">{t('projects.status.loadError')}</p>
      )}

      {data && (
        <section className="bg-white dark:bg-slate-800 rounded shadow p-6 print:shadow-none print:bg-white space-y-6">
          <header className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-700 pb-4">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-slate-400">{t('projects.status.title')}</p>
              <h1 className="text-2xl font-semibold truncate">{data.name}</h1>
            </div>
            <span
              className={`shrink-0 text-xs font-medium rounded-full px-3 py-1 ${STATUS_BADGE[data.status] ?? ''}`}
            >
              {statusLabel}
            </span>
          </header>

          {/* Progress */}
          <div>
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-sm text-slate-600 dark:text-slate-300">{t('projects.status.percentComplete')}</span>
              <span className="text-2xl font-bold tabular-nums">{data.percentComplete}%</span>
            </div>
            <div className="h-3 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${data.percentComplete}%` }}
              />
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {data.taskCounts.done} / {data.taskCounts.total} {t('projects.status.done').toLowerCase()}
            </p>
          </div>

          {/* Task counts by status */}
          <div>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">{t('projects.status.byStatus')}</p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <Tile label={t('projects.status.todo')} value={data.taskCounts.todo} />
              <Tile label={t('projects.status.inProgress')} value={data.taskCounts.inProgress} />
              <Tile label={t('projects.status.review')} value={data.taskCounts.review} />
              <Tile label={t('projects.status.done')} value={data.taskCounts.done} />
              <Tile label={t('projects.status.total')} value={data.taskCounts.total} emphasis />
            </div>
            <div className="mt-3">
              <span
                className={`inline-flex items-center gap-2 text-sm rounded px-3 py-1.5 ${
                  data.overdueCount > 0
                    ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200 font-medium'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                }`}
              >
                {t('projects.status.overdue')}: <strong className="tabular-nums">{data.overdueCount}</strong>
              </span>
            </div>
          </div>

          {/* Schedule + budget + people */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-sm">
            <Field label={t('projects.status.dates')}>
              <span dir="auto">
                {formatShamsiCalendarDate(data.startDate) ?? '—'}
                {' → '}
                {formatShamsiCalendarDate(data.endDate) ?? '—'}
              </span>
            </Field>
            <Field label={t('projects.status.budget')}>
              <span dir="ltr">
                {data.plannedBudget ? formatBudget(data.plannedBudget, data.budgetCurrency, locale) : '—'}
              </span>
            </Field>
            <Field label={t('projects.status.owner')}>{data.ownerName ?? '—'}</Field>
            <Field label={t('projects.accountable')}>{data.accountableName ?? '—'}</Field>
          </div>
        </section>
      )}
    </div>
  );
}

function Tile({ label, value, emphasis = false }: { label: string; value: number; emphasis?: boolean }): JSX.Element {
  return (
    <div
      className={`rounded border px-3 py-2 text-center ${
        emphasis
          ? 'border-slate-300 dark:border-slate-500 bg-slate-50 dark:bg-slate-700/50'
          : 'border-slate-200 dark:border-slate-700'
      }`}
    >
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-400 mb-0.5">{label}</div>
      <div className="text-slate-800 dark:text-slate-100">{children}</div>
    </div>
  );
}
