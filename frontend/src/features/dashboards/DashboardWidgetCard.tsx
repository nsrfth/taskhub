import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useT } from '@/lib/i18n';
import { fetchWidgetData, type DashboardWidgetDto, type WidgetDataResult } from './api';

const CHART_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b'];

interface Props {
  teamId: string;
  dashboardId: string;
  widget: DashboardWidgetDto;
}

export default function DashboardWidgetCard({ teamId, dashboardId, widget }: Props): JSX.Element {
  const t = useT();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard-widget-data', teamId, dashboardId, widget.id],
    queryFn: () => fetchWidgetData(teamId, dashboardId, widget.id),
  });

  return (
    <section className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 flex flex-col min-h-[220px]">
      <h3 className="text-sm font-semibold mb-3 truncate">{widget.title}</h3>
      {isLoading && (
        <p className="text-sm text-slate-500 flex-1 flex items-center justify-center">
          {t('dashboard.widget.loading')}
        </p>
      )}
      {isError && (
        <p className="text-sm text-red-500 flex-1 flex items-center justify-center">
          {t('dashboard.widget.error')}
        </p>
      )}
      {!isLoading && !isError && data && (
        <div className="flex-1" dir="ltr">
          <WidgetBody widget={widget} data={data} t={t} />
        </div>
      )}
    </section>
  );
}

function WidgetBody({
  widget,
  data,
  t,
}: {
  widget: DashboardWidgetDto;
  data: WidgetDataResult;
  t: (key: string) => string;
}): JSX.Element {
  if (data.kind === 'metric') {
    return (
      <p className="text-4xl font-bold tabular-nums text-center py-8 text-indigo-600 dark:text-indigo-400">
        {data.total ?? 0}
      </p>
    );
  }

  if (data.kind === 'series' && widget.type === 'LINE') {
    const series = data.series ?? [];
    if (series.length === 0) {
      return <EmptyState t={t} />;
    }
    return (
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={series}>
          <XAxis dataKey="label" tick={{ fontSize: 10 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
          <Tooltip />
          <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  const rows = data.rows ?? [];
  if (rows.length === 0) {
    return <EmptyState t={t} />;
  }

  const chartData = rows.map((r) => ({
    name: r.label,
    value: Number(r.value),
  }));

  if (widget.type === 'PIE') {
    return (
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75}>
            {chartData.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (widget.type === 'BAR') {
    return (
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData}>
          <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={50} />
          <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
          <Tooltip />
          <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <div className="overflow-auto max-h-[220px]">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 border-b dark:border-slate-700">
            <th className="py-1 pe-2">{t('dashboard.widget.table.label')}</th>
            <th className="py-1 text-end">{t('dashboard.widget.table.value')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-slate-100 dark:border-slate-700/50">
              <td className="py-1 pe-2 truncate">{r.label}</td>
              <td className="py-1 text-end tabular-nums">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ t }: { t: (key: string) => string }): JSX.Element {
  return (
    <p className="text-sm text-slate-500 italic flex-1 flex items-center justify-center py-8">
      {t('dashboard.widget.empty')}
    </p>
  );
}
