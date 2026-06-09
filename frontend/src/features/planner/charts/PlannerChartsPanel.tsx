import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { BarDatum, StatusSlice } from '../aggregations';

const STATUS_COLORS: Record<string, string> = {
  Open: '#94a3b8',
  'In Progress': '#3b82f6',
  Review: '#f59e0b',
  Completed: '#10b981',
  Blocked: '#ef4444',
};

interface Props {
  statusSlices: StatusSlice[];
  statusBars: BarDatum[];
  memberBars: BarDatum[];
  loading?: boolean;
  empty?: boolean;
}

export default function PlannerChartsPanel({
  statusSlices,
  statusBars,
  memberBars,
  loading,
  empty,
}: Props): JSX.Element {
  if (loading) {
    return <p className="text-sm text-slate-500 py-12 text-center">Loading charts…</p>;
  }
  if (empty) {
    return <p className="text-sm text-slate-500 italic py-12 text-center">No task data for the selected filters.</p>;
  }

  const pieData = statusSlices.filter((s) => s.count > 0).map((s) => ({
    name: s.label,
    value: s.count,
    percent: s.percent,
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
      <section className="bg-white dark:bg-slate-800 rounded shadow p-4">
        <h2 className="text-sm font-semibold mb-4">Task Status Distribution</h2>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
            >
              {pieData.map((entry) => (
                <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? '#cbd5e1'} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number, _name, props) => [
                `${value} (${(props.payload as { percent: number }).percent}%)`,
                'Tasks',
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
        <ul className="mt-2 text-xs space-y-1">
          {statusSlices.map((s) => (
            <li key={s.label} className="flex justify-between">
              <span>{s.label}</span>
              <span className="tabular-nums text-slate-500">
                {s.count} ({s.percent}%)
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-white dark:bg-slate-800 rounded shadow p-4">
        <h2 className="text-sm font-semibold mb-4">Tasks per Status</h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={statusBars} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
            <Tooltip />
            <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </section>

      <section className="bg-white dark:bg-slate-800 rounded shadow p-4 lg:col-span-2 xl:col-span-1">
        <h2 className="text-sm font-semibold mb-4">Tasks per Team Member</h2>
        <ResponsiveContainer width="100%" height={Math.max(220, memberBars.length * 28)}>
          <BarChart
            data={memberBars}
            layout="vertical"
            margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
          >
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} />
            <Tooltip />
            <Bar dataKey="count" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </section>
    </div>
  );
}
