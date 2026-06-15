import { getHolidayName, isOffDay } from '../../lib/calendar';

// v1.76: time-scale + visible-window math for the per-project Gantt chart.
// All date math stays on UTC-midnight calendar days (same convention as
// ProjectGanttPage's original utcDayMs).

export const DAY_PX = 28;
export const MONTH_PX = 72;

export type GanttScaleMode = 'year' | 'month' | 'week' | 'workingWeek' | 'day';

const MS_DAY = 86_400_000;

export function utcDayMs(iso: string): number {
  const d = new Date(iso);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function daysBetween(startMs: number, endMs: number): number {
  return Math.round((endMs - startMs) / MS_DAY);
}

export function todayUtcMs(): number {
  const n = new Date();
  return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
}

function utcMonthStart(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

function utcMonthEnd(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0);
}

function utcYearStart(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), 0, 1);
}

function utcYearEnd(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), 11, 31);
}

function addDays(ms: number, n: number): number {
  return ms + n * MS_DAY;
}

function addMonths(ms: number, n: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate());
}

function addYears(ms: number, n: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear() + n, d.getUTCMonth(), d.getUTCDate());
}

export function shiftAnchor(
  scaleMode: GanttScaleMode,
  anchorMs: number,
  delta: -1 | 1,
): number {
  switch (scaleMode) {
    case 'year':
      return addYears(anchorMs, delta);
    case 'month':
    case 'day':
      return addMonths(anchorMs, delta);
    case 'week':
    case 'workingWeek':
      return addDays(anchorMs, delta * 7);
  }
}

export function weekStartMs(ms: number, weekStartDay: number): number {
  const d = new Date(ms);
  const day = d.getUTCDay();
  const diff = (day - weekStartDay + 7) % 7;
  return ms - diff * MS_DAY;
}

export interface GanttDayColumn {
  kind: 'day';
  x: number;
  width: number;
  ms: number;
  offDay: boolean;
  holidayName: string | null;
  weekBoundary: boolean;
}

export interface GanttMonthColumn {
  kind: 'month';
  x: number;
  width: number;
  monthStartMs: number;
  monthEndMs: number;
  label: string;
  isCurrentMonth: boolean;
}

export type GanttColumn = GanttDayColumn | GanttMonthColumn;

export interface GanttAxis {
  scaleMode: GanttScaleMode;
  startMs: number;
  endMs: number;
  chartWidth: number;
  columns: GanttColumn[];
  columnKind: 'day' | 'month';
  /** Working-day columns only (WORKING-WEEK); maps UTC day ms → column index. */
  workingDayIndex: Map<number, number> | null;
}

export interface ProjectBounds {
  startMs: number;
  endMs: number;
}

export function projectBoundsFromRows(
  rows: Array<{ startDate: string; endDate: string }>,
): ProjectBounds | null {
  if (rows.length === 0) return null;
  let startMs = Infinity;
  let endMs = -Infinity;
  for (const r of rows) {
    const s = utcDayMs(r.startDate);
    const e = utcDayMs(r.endDate);
    if (s < startMs) startMs = s;
    if (e > endMs) endMs = e;
  }
  return { startMs: startMs - MS_DAY, endMs: endMs + MS_DAY };
}

function enumerateDays(startMs: number, endMs: number): number[] {
  const out: number[] = [];
  for (let ms = startMs; ms <= endMs; ms += MS_DAY) out.push(ms);
  return out;
}

function buildDayColumns(
  dayMsList: number[],
  showWeekBoundaries: boolean,
  weekStartDay: number,
): GanttDayColumn[] {
  return dayMsList.map((ms, i) => {
    const d = new Date(ms);
    const weekBoundary =
      showWeekBoundaries && (d.getUTCDay() - weekStartDay + 7) % 7 === 0 && i > 0;
    return {
      kind: 'day' as const,
      x: i * DAY_PX,
      width: DAY_PX,
      ms,
      offDay: isOffDay(d),
      holidayName: getHolidayName(d),
      weekBoundary,
    };
  });
}

function buildMonthColumns(
  yearStartMs: number,
  todayMs: number,
): GanttMonthColumn[] {
  const cols: GanttMonthColumn[] = [];
  for (let m = 0; m < 12; m++) {
    const monthStartMs = Date.UTC(
      new Date(yearStartMs).getUTCFullYear(),
      m,
      1,
    );
    const monthEndMs = Date.UTC(
      new Date(yearStartMs).getUTCFullYear(),
      m + 1,
      0,
    );
    const d = new Date(monthStartMs);
    const label = `${d.getUTCMonth() + 1}`;
    const isCurrentMonth =
      todayMs >= monthStartMs && todayMs <= monthEndMs;
    cols.push({
      kind: 'month',
      x: m * MONTH_PX,
      width: MONTH_PX,
      monthStartMs,
      monthEndMs,
      label,
      isCurrentMonth,
    });
  }
  return cols;
}

export function buildGanttAxis(
  scaleMode: GanttScaleMode,
  anchorMs: number,
  weekStartDay: number,
  todayMs: number,
  fitBounds: ProjectBounds | null,
): GanttAxis {
  if (scaleMode === 'day' && fitBounds) {
    const dayMsList = enumerateDays(fitBounds.startMs, fitBounds.endMs);
    const columns = buildDayColumns(dayMsList, false, weekStartDay);
    return {
      scaleMode,
      startMs: fitBounds.startMs,
      endMs: fitBounds.endMs,
      chartWidth: dayMsList.length * DAY_PX,
      columns,
      columnKind: 'day',
      workingDayIndex: null,
    };
  }

  if (scaleMode === 'year') {
    const startMs = utcYearStart(anchorMs);
    const endMs = utcYearEnd(anchorMs);
    const columns = buildMonthColumns(startMs, todayMs);
    return {
      scaleMode,
      startMs,
      endMs,
      chartWidth: 12 * MONTH_PX,
      columns,
      columnKind: 'month',
      workingDayIndex: null,
    };
  }

  let startMs: number;
  let endMs: number;
  let showWeekBoundaries = false;

  if (scaleMode === 'month' || scaleMode === 'day') {
    startMs = utcMonthStart(anchorMs);
    endMs = utcMonthEnd(anchorMs);
    showWeekBoundaries = scaleMode === 'month';
  } else {
    startMs = weekStartMs(anchorMs, weekStartDay);
    endMs = startMs + 6 * MS_DAY;
  }

  const allDays = enumerateDays(startMs, endMs);

  if (scaleMode === 'workingWeek') {
    const workingDays = allDays.filter((ms) => !isOffDay(new Date(ms)));
    const workingDayIndex = new Map<number, number>();
    const columns: GanttDayColumn[] = workingDays.map((ms, i) => {
      workingDayIndex.set(ms, i);
      const d = new Date(ms);
      return {
        kind: 'day',
        x: i * DAY_PX,
        width: DAY_PX,
        ms,
        offDay: false,
        holidayName: getHolidayName(d),
        weekBoundary: false,
      };
    });
    return {
      scaleMode,
      startMs,
      endMs,
      chartWidth: Math.max(workingDays.length, 1) * DAY_PX,
      columns,
      columnKind: 'day',
      workingDayIndex,
    };
  }

  const columns = buildDayColumns(allDays, showWeekBoundaries, weekStartDay);
  return {
    scaleMode,
    startMs,
    endMs,
    chartWidth: allDays.length * DAY_PX,
    columns,
    columnKind: 'day',
    workingDayIndex: null,
  };
}

/** Map a calendar day to its left edge on the chart (clamped to window). */
function dayX(
  ms: number,
  axis: GanttAxis,
): number | null {
  if (axis.columnKind === 'month') {
    const yearMs = axis.startMs;
    const yearEndMs = axis.endMs;
    if (ms < yearMs || ms > yearEndMs) return null;
    const totalDays = daysBetween(yearMs, yearEndMs) + 1;
    const offset = daysBetween(yearMs, ms);
    return (offset / totalDays) * axis.chartWidth;
  }

  if (axis.workingDayIndex) {
    const idx = axis.workingDayIndex.get(ms);
    if (idx !== undefined) return idx * DAY_PX;
    // Off-day inside the week: snap to nearest visible working column.
    for (let probe = ms; probe >= axis.startMs; probe -= MS_DAY) {
      const i = axis.workingDayIndex.get(probe);
      if (i !== undefined) return i * DAY_PX;
    }
    for (let probe = ms; probe <= axis.endMs; probe += MS_DAY) {
      const i = axis.workingDayIndex.get(probe);
      if (i !== undefined) return i * DAY_PX;
    }
    return null;
  }

  if (ms < axis.startMs || ms > axis.endMs) return null;
  return daysBetween(axis.startMs, ms) * DAY_PX;
}

function dayRightX(ms: number, axis: GanttAxis): number | null {
  const left = dayX(ms, axis);
  if (left === null) return null;
  if (axis.columnKind === 'month') {
    const yearMs = axis.startMs;
    const yearEndMs = axis.endMs;
    const totalDays = daysBetween(yearMs, yearEndMs) + 1;
    return ((daysBetween(yearMs, ms) + 1) / totalDays) * axis.chartWidth;
  }
  if (axis.workingDayIndex) return left + DAY_PX;
  return left + DAY_PX;
}

export function barGeometry(
  startMs: number,
  endMs: number,
  axis: GanttAxis,
): { x: number; width: number } | null {
  const x0 = dayX(startMs, axis);
  const x1 = dayRightX(endMs, axis);
  if (x0 === null || x1 === null) {
    // Bar partially outside window — clip to visible span.
    const visStart = Math.max(startMs, axis.startMs);
    const visEnd = Math.min(endMs, axis.endMs);
    if (visStart > visEnd) return null;
    const cx0 = dayX(visStart, axis);
    const cx1 = dayRightX(visEnd, axis);
    if (cx0 === null || cx1 === null) return null;
    return { x: cx0, width: Math.max(2, cx1 - cx0 - 4) };
  }
  return { x: x0, width: Math.max(2, x1 - x0 - 4) };
}

export function todayLineX(axis: GanttAxis, todayMs: number): number | null {
  if (todayMs < axis.startMs || todayMs > axis.endMs) return null;
  if (axis.columnKind === 'month') {
    return dayX(todayMs, axis);
  }
  if (axis.workingDayIndex && !axis.workingDayIndex.has(todayMs)) return null;
  return dayX(todayMs, axis);
}

/** UTC ms at the start of the visible period (for period labels). */
export function visiblePeriodStartMs(
  scaleMode: GanttScaleMode,
  anchorMs: number,
  weekStartDay: number,
  fitBounds: ProjectBounds | null,
): number {
  if (scaleMode === 'day' && fitBounds) return fitBounds.startMs;
  if (scaleMode === 'year') return utcYearStart(anchorMs);
  if (scaleMode === 'month' || scaleMode === 'day') return utcMonthStart(anchorMs);
  return weekStartMs(anchorMs, weekStartDay);
}

export function visiblePeriodEndMs(
  scaleMode: GanttScaleMode,
  anchorMs: number,
  weekStartDay: number,
  fitBounds: ProjectBounds | null,
): number {
  if (scaleMode === 'day' && fitBounds) return fitBounds.endMs;
  if (scaleMode === 'year') return utcYearEnd(anchorMs);
  if (scaleMode === 'month' || scaleMode === 'day') return utcMonthEnd(anchorMs);
  return weekStartMs(anchorMs, weekStartDay) + 6 * MS_DAY;
}
