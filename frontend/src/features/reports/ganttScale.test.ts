import {
  barGeometry,
  buildGanttAxis,
  daysBetween,
  DAY_PX,
  MONTH_PX,
  projectBoundsFromRows,
  shiftAnchor,
  todayUtcMs,
  utcDayMs,
  weekStartMs,
  type GanttScaleMode,
} from './ganttScale';
import { describe, expect, it } from 'vitest';

const MS_DAY = 86_400_000;
/** Default instance week start (Saturday) — matches getWeekStartDay() for [0,6] off-days. */
const WEEK_START = 6;

function iso(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m, d)).toISOString();
}

describe('ganttScale', () => {
  const weekStart = WEEK_START;

  it('MONTH prev/next shifts exactly one calendar month', () => {
    const anchor = Date.UTC(2025, 2, 15); // Mar 15
    const prev = shiftAnchor('month', anchor, -1);
    const next = shiftAnchor('month', anchor, 1);
    expect(new Date(prev).getUTCMonth()).toBe(1);
    expect(new Date(next).getUTCMonth()).toBe(3);
  });

  it('WEEK mode shows 7 day columns', () => {
    const anchor = Date.UTC(2025, 5, 11); // Wed Jun 11
    const axis = buildGanttAxis('week', anchor, weekStart, todayUtcMs(), null);
    expect(axis.columns).toHaveLength(7);
    expect(axis.chartWidth).toBe(7 * DAY_PX);
  });

  it('WEEK prev/next moves one week', () => {
    const anchor = Date.UTC(2025, 5, 11);
    const prev = shiftAnchor('week', anchor, -1);
    expect(daysBetween(prev, anchor)).toBe(7);
  });

  it('WORKING-WEEK omits off-days from columns (same source as isOffDay)', () => {
    const anchor = Date.UTC(2025, 5, 9); // Mon Jun 9 2025
    const weekAxis = buildGanttAxis('week', anchor, weekStart, todayUtcMs(), null);
    const workAxis = buildGanttAxis('workingWeek', anchor, weekStart, todayUtcMs(), null);

    const omitted = weekAxis.columns.filter(
      (c) => c.kind === 'day' && c.offDay,
    );
    expect(omitted.length).toBeGreaterThan(0);
    expect(workAxis.columns.length).toBe(weekAxis.columns.length - omitted.length);

    for (const col of omitted) {
      if (col.kind !== 'day') continue;
      expect(workAxis.workingDayIndex?.has(col.ms)).toBe(false);
    }
  });

  it('YEAR mode uses 12 month columns without per-day rendering', () => {
    const anchor = Date.UTC(2025, 6, 1);
    const axis = buildGanttAxis('year', anchor, weekStart, todayUtcMs(), null);
    expect(axis.columnKind).toBe('month');
    expect(axis.columns).toHaveLength(12);
    expect(axis.chartWidth).toBe(12 * MONTH_PX);
    expect(axis.columns.every((c) => c.kind === 'month')).toBe(true);
  });

  it('YEAR bar spans proportional months', () => {
    const anchor = Date.UTC(2025, 0, 1);
    const axis = buildGanttAxis('year', anchor, weekStart, todayUtcMs(), null);
    const start = Date.UTC(2025, 0, 15);
    const end = Date.UTC(2025, 5, 15);
    const geom = barGeometry(start, end, axis);
    expect(geom).not.toBeNull();
    expect(geom!.x).toBeGreaterThan(0);
    expect(geom!.x + geom!.width).toBeLessThanOrEqual(axis.chartWidth);
  });

  it('bar x is stable across scale switches (UTC-midnight)', () => {
    const start = utcDayMs(iso(2025, 5, 10));
    const end = utcDayMs(iso(2025, 5, 12));
    const anchor = Date.UTC(2025, 5, 10);
    const weekAxis = buildGanttAxis('week', anchor, weekStart, todayUtcMs(), null);
    const geom = barGeometry(start, end, weekAxis);
    expect(geom).not.toBeNull();
    const expectedX = daysBetween(weekAxis.startMs, start) * DAY_PX;
    expect(geom!.x).toBe(expectedX);
    const widthDays = daysBetween(start, end) + 1;
    expect(geom!.width).toBe(widthDays * DAY_PX - 4);
  });

  it('DAY fit mode spans project bounds with day columns', () => {
    const rows = [
      { startDate: iso(2025, 0, 5), endDate: iso(2025, 1, 20) },
    ];
    const bounds = projectBoundsFromRows(rows)!;
    const axis = buildGanttAxis('day', todayUtcMs(), weekStart, todayUtcMs(), bounds);
    expect(axis.columns.length).toBeGreaterThan(30);
    expect(axis.startMs).toBe(bounds.startMs);
    expect(axis.endMs).toBe(bounds.endMs);
  });

  it('shiftAnchor year moves one year', () => {
    const anchor = Date.UTC(2025, 3, 1);
    const next = shiftAnchor('year', anchor, 1);
    expect(new Date(next).getUTCFullYear()).toBe(2026);
  });

  const modes: GanttScaleMode[] = ['year', 'month', 'week', 'workingWeek', 'day'];
  it.each(modes)('buildGanttAxis produces chart for %s', (mode) => {
    const anchor = Date.UTC(2025, 5, 15);
    const fit = mode === 'day' ? projectBoundsFromRows([
      { startDate: iso(2025, 5, 1), endDate: iso(2025, 5, 20) },
    ]) : null;
    const axis = buildGanttAxis(mode, anchor, weekStart, todayUtcMs(), fit);
    expect(axis.chartWidth).toBeGreaterThan(0);
    expect(axis.columns.length).toBeGreaterThan(0);
  });
});

describe('ganttScale weekStartMs', () => {
  it('aligns to configured week start', () => {
    const weekStart = WEEK_START;
    const ms = Date.UTC(2025, 5, 11); // Wed
    const start = weekStartMs(ms, WEEK_START);
    expect(new Date(start).getUTCDay()).toBe(WEEK_START);
  });
});
