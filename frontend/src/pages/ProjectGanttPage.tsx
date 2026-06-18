import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchGantt, type GanttSubtaskRow } from '@/features/reports/ganttApi';
import { formatGanttPeriodLabel } from '@/features/reports/ganttPeriodLabel';
import {
  barGeometry,
  buildGanttAxis,
  projectBoundsFromRows,
  shiftAnchor,
  todayLineX,
  todayUtcMs,
  utcDayMs,
  type GanttAxis,
  type GanttColumn,
  type GanttScaleMode,
} from '@/features/reports/ganttScale';
import { formatShamsiCalendarDate } from '@/lib/shamsi';
import { getWeekStartDay } from '@/lib/calendar';
import { useT } from '@/lib/i18n';

// v1.42: per-project Gantt report page. v1.76: time-scale modes +
// period navigation (year / month / week / working-week / day).

const ROW_HEIGHT = 28;
const HEADER_HEIGHT = 36;

const SCALE_MODES: GanttScaleMode[] = [
  'year',
  'month',
  'week',
  'workingWeek',
  'day',
];

const SCALE_I18N: Record<GanttScaleMode, string> = {
  year: 'gantt.scale.year',
  month: 'gantt.scale.month',
  week: 'gantt.scale.week',
  workingWeek: 'gantt.scale.workingWeek',
  day: 'gantt.scale.day',
};

interface RouteParams extends Record<string, string | undefined> {
  projectId: string;
}

export default function ProjectGanttPage(): JSX.Element {
  const { projectId } = useParams<RouteParams>();
  const t = useT();

  const { data: allProjects } = useQuery({
    queryKey: ['projects', 'all'],
    queryFn: async () => {
      const { api } = await import('@/lib/api');
      return (await api.get<Array<{ id: string; teamId: string; name: string }>>('/projects'))
        .data;
    },
  });
  const project = allProjects?.find((p) => p.id === projectId) ?? null;
  const teamId = project?.teamId ?? null;

  const { data, isLoading, error } = useQuery({
    queryKey: ['gantt', teamId, projectId],
    queryFn: () => fetchGantt(teamId!, projectId!),
    enabled: !!teamId && !!projectId,
  });

  const [filterTaskId, setFilterTaskId] = useState<string>('');
  const [filterAssigneeId, setFilterAssigneeId] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterFromIso, setFilterFromIso] = useState<string>('');
  const [filterToIso, setFilterToIso] = useState<string>('');

  const [scaleMode, setScaleMode] = useState<GanttScaleMode>('day');
  const [anchorMs, setAnchorMs] = useState(() => todayUtcMs());
  const [dayFitProject, setDayFitProject] = useState(true);

  const distinctTasks = useMemo(() => {
    if (!data) return [];
    const m = new Map<string, string>();
    for (const r of data.rows) m.set(r.taskId, r.parentTaskTitle);
    return Array.from(m, ([id, name]) => ({ id, name }));
  }, [data]);

  const distinctAssignees = useMemo(() => {
    if (!data) return [];
    const m = new Map<string, string>();
    for (const r of data.rows) {
      if (r.assigneeId) m.set(r.assigneeId, r.assigneeName ?? '(unknown)');
    }
    return Array.from(m, ([id, name]) => ({ id, name }));
  }, [data]);

  const distinctStatuses = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.rows.map((r) => r.parentTaskStatus)));
  }, [data]);

  const scheduledRows = useMemo<GanttSubtaskRow[]>(() => {
    if (!data) return [];
    return data.rows
      .filter((r) => r.startDate && r.endDate)
      .filter((r) => !filterTaskId || r.taskId === filterTaskId)
      .filter((r) => !filterAssigneeId || r.assigneeId === filterAssigneeId)
      .filter((r) => !filterStatus || r.parentTaskStatus === filterStatus)
      .filter((r) => !filterFromIso || utcDayMs(r.endDate!) >= utcDayMs(filterFromIso))
      .filter((r) => !filterToIso || utcDayMs(r.startDate!) <= utcDayMs(filterToIso));
  }, [data, filterTaskId, filterAssigneeId, filterStatus, filterFromIso, filterToIso]);

  const grouped = useMemo(() => {
    const m = new Map<string, { title: string; status: string; rows: GanttSubtaskRow[] }>();
    for (const r of scheduledRows) {
      const g = m.get(r.taskId);
      if (g) g.rows.push(r);
      else m.set(r.taskId, { title: r.parentTaskTitle, status: r.parentTaskStatus, rows: [r] });
    }
    return Array.from(m, ([taskId, g]) => ({ taskId, ...g }));
  }, [scheduledRows]);

  const projectBounds = useMemo(
    () =>
      projectBoundsFromRows(
        scheduledRows.map((r) => ({
          startDate: r.startDate!,
          endDate: r.endDate!,
        })),
      ),
    [scheduledRows],
  );

  const fitBounds = scaleMode === 'day' && dayFitProject ? projectBounds : null;
  const weekStartDay = getWeekStartDay();
  const todayMs = todayUtcMs();

  const axis = useMemo(
    () => buildGanttAxis(scaleMode, anchorMs, weekStartDay, todayMs, fitBounds),
    [scaleMode, anchorMs, weekStartDay, todayMs, fitBounds],
  );

  const periodLabel = useMemo(
    () => formatGanttPeriodLabel(scaleMode, anchorMs, weekStartDay, fitBounds),
    [scaleMode, anchorMs, weekStartDay, fitBounds],
  );

  const chartHeight =
    HEADER_HEIGHT + grouped.reduce((acc, g) => acc + ROW_HEIGHT + g.rows.length * ROW_HEIGHT, 0);

  function navigate(delta: -1 | 1): void {
    setDayFitProject(false);
    setAnchorMs((prev) => shiftAnchor(scaleMode, prev, delta));
  }

  function goToday(): void {
    setDayFitProject(false);
    setAnchorMs(todayUtcMs());
  }

  function changeScale(mode: GanttScaleMode): void {
    setScaleMode(mode);
    if (mode !== 'day') setDayFitProject(false);
    else setDayFitProject(true);
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="mb-4">
        <div className="text-sm text-slate-500 mb-1">
          <Link to="/projects" className="hover:underline">
            ← Projects
          </Link>
        </div>
        <h1 className="text-2xl font-semibold">
          Gantt — {project?.name ?? '…'}
        </h1>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && (
        <p className="text-sm text-danger" role="alert">
          Could not load the report. The project may not exist or you don't have access.
        </p>
      )}

      {data && (
        <>
          <section className="bg-white rounded shadow p-4 mb-4 grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
            <Summary label="Total tasks" value={data.summary.totalTasks} />
            <Summary label="Total subtasks" value={data.summary.totalSubtasks} />
            <Summary label="Scheduled" value={data.summary.scheduledSubtasks} />
            <Summary label="Unscheduled" value={data.summary.unscheduledSubtasks} />
            <Summary
              label="Duration"
              value={
                data.summary.earliestStart && data.summary.latestEnd
                  ? `${formatShamsiCalendarDate(data.summary.earliestStart) ?? '…'} → ${
                      formatShamsiCalendarDate(data.summary.latestEnd) ?? '…'
                    }`
                  : '—'
              }
            />
          </section>

          <section className="bg-white rounded shadow p-4 mb-4 flex flex-wrap items-center gap-3 text-sm">
            <FilterSelect
              label="Task"
              value={filterTaskId}
              onChange={setFilterTaskId}
              options={distinctTasks.map((tk) => ({ value: tk.id, label: tk.name }))}
            />
            <FilterSelect
              label="Assignee"
              value={filterAssigneeId}
              onChange={setFilterAssigneeId}
              options={distinctAssignees.map((a) => ({ value: a.id, label: a.name }))}
            />
            <FilterSelect
              label="Status"
              value={filterStatus}
              onChange={setFilterStatus}
              options={distinctStatuses.map((s) => ({ value: s, label: s }))}
            />
            <label className="flex items-center gap-1">
              <span className="text-slate-500">From</span>
              <input
                type="date"
                value={filterFromIso ? filterFromIso.slice(0, 10) : ''}
                onChange={(e) =>
                  setFilterFromIso(
                    e.target.value ? new Date(e.target.value).toISOString() : '',
                  )
                }
                className="rounded border-slate-300 px-2 py-1 border"
              />
            </label>
            <label className="flex items-center gap-1">
              <span className="text-slate-500">To</span>
              <input
                type="date"
                value={filterToIso ? filterToIso.slice(0, 10) : ''}
                onChange={(e) =>
                  setFilterToIso(
                    e.target.value ? new Date(e.target.value).toISOString() : '',
                  )
                }
                className="rounded border-slate-300 px-2 py-1 border"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setFilterTaskId('');
                setFilterAssigneeId('');
                setFilterStatus('');
                setFilterFromIso('');
                setFilterToIso('');
              }}
              className="ms-auto text-xs text-slate-500 hover:underline"
            >
              Clear filters
            </button>
          </section>

          {scheduledRows.length > 0 && (
            <section className="bg-white rounded shadow px-4 py-3 mb-2 flex flex-wrap items-center gap-3 text-sm">
              <div
                className="inline-flex rounded border border-slate-200 overflow-hidden"
                role="group"
                aria-label={t('gantt.scale.label')}
              >
                {SCALE_MODES.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => changeScale(mode)}
                    className={`px-3 py-1.5 text-xs border-s border-slate-200 first:border-s-0 ${
                      scaleMode === mode
                        ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                        : 'bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {t(SCALE_I18N[mode])}
                  </button>
                ))}
              </div>
              <div className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  className="rounded border border-border px-2 py-1 text-xs hover:bg-bg"
                  aria-label={t('gantt.prev')}
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={goToday}
                  className="rounded border border-border px-2 py-1 text-xs hover:bg-bg"
                >
                  {t('gantt.today')}
                </button>
                <button
                  type="button"
                  onClick={() => navigate(1)}
                  className="rounded border border-border px-2 py-1 text-xs hover:bg-bg"
                  aria-label={t('gantt.next')}
                >
                  ›
                </button>
              </div>
              <span className="text-sm font-medium text-text" dir="auto">
                {t('gantt.period')}: {periodLabel}
              </span>
            </section>
          )}

          <section className="bg-white rounded shadow p-2 overflow-x-auto">
            {scheduledRows.length === 0 ? (
              <p className="text-sm text-slate-500 p-4 italic">
                No subtasks match the current filters with both startDate and endDate set.
                Add scheduling dates on subtasks (Task detail → 📅) to populate the chart.
              </p>
            ) : (
              <GanttChart
                axis={axis}
                grouped={grouped}
                chartHeight={chartHeight}
                todayMs={todayMs}
                todayLabel={t('gantt.today')}
              />
            )}
          </section>

          {data.summary.unscheduledSubtasks > 0 && (
            <section className="mt-4 text-xs text-slate-500">
              {data.summary.unscheduledSubtasks} subtask
              {data.summary.unscheduledSubtasks === 1 ? '' : 's'} ha
              {data.summary.unscheduledSubtasks === 1 ? 's' : 've'} no scheduling dates
              and are not shown on the chart.
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string | number }): JSX.Element {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-medium text-slate-800">{value}</div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}): JSX.Element {
  return (
    <label className="flex items-center gap-1">
      <span className="text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border-slate-300 px-2 py-1 border text-sm"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function statusFill(status: string, done: boolean): string {
  if (done) return '#10b981';
  switch (status) {
    case 'IN_PROGRESS':
      return '#3b82f6';
    case 'REVIEW':
      return '#f59e0b';
    case 'DONE':
      return '#10b981';
    default:
      return '#94a3b8';
  }
}

function GanttChart({
  axis,
  grouped,
  chartHeight,
  todayMs,
  todayLabel,
}: {
  axis: GanttAxis;
  grouped: Array<{ taskId: string; title: string; status: string; rows: GanttSubtaskRow[] }>;
  chartHeight: number;
  todayMs: number;
  todayLabel: string;
}): JSX.Element {
  const t = useT();
  const todayX = todayLineX(axis, todayMs);

  let yCursor = HEADER_HEIGHT;

  return (
    <div dir="ltr" className="min-w-full">
      <svg
        width={axis.chartWidth}
        height={chartHeight}
        style={{ display: 'block', minWidth: '100%' }}
        role="img"
        aria-label="Project Gantt chart"
      >
        <HeaderColumns axis={axis} chartHeight={chartHeight} />

        {todayX !== null && (
          <g>
            <line
              x1={todayX}
              y1={0}
              x2={todayX}
              y2={chartHeight}
              stroke="#ef4444"
              strokeWidth={1}
            />
            <text x={todayX + 2} y={28} fontSize="10" fill="#ef4444">
              {todayLabel}
            </text>
          </g>
        )}

        {grouped.map((g) => {
          const groupHeaderY = yCursor;
          const groupHeader = (
            <g key={`hdr-${g.taskId}`}>
              <rect
                x={0}
                y={groupHeaderY}
                width={axis.chartWidth}
                height={ROW_HEIGHT}
                fill="#f8fafc"
              />
              <text x={6} y={groupHeaderY + 18} fontSize="12" fontWeight={600} fill="#334155">
                {g.title}
              </text>
            </g>
          );
          yCursor += ROW_HEIGHT;
          const rowEls = g.rows.map((r) => {
            const startMs = utcDayMs(r.startDate!);
            const endMs = utcDayMs(r.endDate!);
            const geom = barGeometry(startMs, endMs, axis);
            const y = yCursor + 4;
            const overdue = !r.done && endMs < todayMs;
            const fill = statusFill(g.status, r.done);
            const widthDays =
              Math.round((endMs - startMs) / 86_400_000) + 1;
            const durationLine =
              r.workingDayCount !== null
                ? `Duration: ${r.workingDayCount} working day(s) (${widthDays} calendar day(s))`
                : `Duration: ${widthDays} day(s)`;
            const tooltip = [
              r.title,
              `Start: ${formatShamsiCalendarDate(r.startDate) ?? ''}`,
              `End: ${formatShamsiCalendarDate(r.endDate) ?? ''}`,
              durationLine,
              r.assigneeName ? `Assignee: ${r.assigneeName}` : 'Assignee: —',
              r.responsibleName ? `${t('tasks.col.responsible')}: ${r.responsibleName}` : '',
              `Status: ${g.status}${r.done ? ' / done' : ''}`,
              `Parent: ${r.parentTaskTitle}`,
            ]
              .filter(Boolean)
              .join('\n');
            const el = geom ? (
              <g key={r.id}>
                <rect
                  x={geom.x + 2}
                  y={y}
                  width={geom.width}
                  height={ROW_HEIGHT - 8}
                  rx={3}
                  ry={3}
                  fill={fill}
                  stroke={overdue ? '#dc2626' : 'transparent'}
                  strokeWidth={overdue ? 2 : 0}
                >
                  <title>{tooltip}</title>
                </rect>
                <text
                  x={geom.x + 6}
                  y={y + (ROW_HEIGHT - 8) / 2 + 4}
                  fontSize="11"
                  fill="#ffffff"
                  style={{ pointerEvents: 'none' }}
                >
                  {r.title.length > Math.max(4, Math.floor(geom.width / 8)) ? '' : r.title}
                </text>
              </g>
            ) : (
              <g key={r.id} />
            );
            yCursor += ROW_HEIGHT;
            return el;
          });
          return (
            <g key={g.taskId}>
              {groupHeader}
              {rowEls}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function HeaderColumns({
  axis,
  chartHeight,
}: {
  axis: GanttAxis;
  chartHeight: number;
}): JSX.Element {
  return (
    <g>
      {axis.columns.map((col, i) => (
        <HeaderColumn key={i} col={col} chartHeight={chartHeight} />
      ))}
    </g>
  );
}

function HeaderColumn({
  col,
  chartHeight,
}: {
  col: GanttColumn;
  chartHeight: number;
}): JSX.Element {
  if (col.kind === 'month') {
    return (
      <g>
        {col.isCurrentMonth && (
          <rect
            x={col.x}
            y={0}
            width={col.width}
            height={chartHeight}
            fill="#fff7ed"
          />
        )}
        <line
          x1={col.x}
          y1={0}
          x2={col.x}
          y2={chartHeight}
          stroke="#e2e8f0"
          strokeWidth={col.isCurrentMonth ? 2 : 1}
        />
        <text x={col.x + 4} y={14} fontSize="10" fill="#64748b">
          {col.label}
        </text>
      </g>
    );
  }

  const d = new Date(col.ms);
  const label = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  const stroke = col.weekBoundary ? '#cbd5e1' : '#f1f5f9';
  const strokeWidth = col.weekBoundary ? 2 : 1;

  return (
    <g>
      {col.offDay && (
        <rect x={col.x} y={0} width={col.width} height={chartHeight} fill="#fef2f2" />
      )}
      <line
        x1={col.x}
        y1={0}
        x2={col.x}
        y2={chartHeight}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <text x={col.x + 2} y={14} fontSize="10" fill={col.offDay ? '#dc2626' : '#64748b'}>
        {col.holidayName ? <title>{col.holidayName}</title> : null}
        {label}
      </text>
    </g>
  );
}
