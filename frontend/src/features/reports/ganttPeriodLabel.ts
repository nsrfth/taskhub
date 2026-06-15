import { getCalendar } from '../../lib/calendar';
import { formatShamsiCalendarDate, formatShamsiCalendarLong } from '../../lib/shamsi';
import {
  visiblePeriodEndMs,
  visiblePeriodStartMs,
  type GanttScaleMode,
  type ProjectBounds,
} from './ganttScale';

export function formatGanttPeriodLabel(
  scaleMode: GanttScaleMode,
  anchorMs: number,
  weekStartDay: number,
  fitBounds: ProjectBounds | null,
): string {
  const startMs = visiblePeriodStartMs(scaleMode, anchorMs, weekStartDay, fitBounds);
  const endMs = visiblePeriodEndMs(scaleMode, anchorMs, weekStartDay, fitBounds);
  const startIso = new Date(startMs).toISOString();
  const endIso = new Date(endMs).toISOString();

  if (scaleMode === 'year') {
    if (getCalendar() === 'GREGORIAN') {
      return String(new Date(startMs).getUTCFullYear());
    }
    const long = formatShamsiCalendarLong(startIso);
    if (!long) return '';
    const parts = long.trim().split(/\s+/);
    return parts[parts.length - 1] ?? long;
  }

  if (scaleMode === 'month' || scaleMode === 'day') {
    if (scaleMode === 'day' && fitBounds) {
      const a = formatShamsiCalendarDate(startIso);
      const b = formatShamsiCalendarDate(endIso);
      return a && b ? `${a} → ${b}` : a ?? b ?? '';
    }
    return formatShamsiCalendarLong(startIso) ?? '';
  }

  const a = formatShamsiCalendarDate(startIso);
  const b = formatShamsiCalendarDate(endIso);
  return a && b ? `${a} – ${b}` : a ?? b ?? '';
}
