// v1.10: per-user display calendar.
//
// The active calendar is module-level state, seeded from localStorage at
// load and updated by `setCalendar` (which also writes to localStorage).
// Formatters in lib/shamsi.ts read this value on every call and branch
// between Shamsi (Jalali) and Gregorian output.
//
// Components do NOT re-render automatically when the active calendar
// changes — the Preferences page reloads the window after a successful
// PATCH so every rendered formatter / picker picks up the new value
// cleanly. This sidesteps threading the preference through every helper
// signature or wrapping every component in a CalendarContext.

export type Calendar = 'SHAMSI' | 'GREGORIAN';

// v1.11: instance-wide off-days. An array of weekday IDs (0=Sun..6=Sat —
// JS Date.getUTCDay convention). Default [0,6] (Sat+Sun). Admins pick any
// subset via Settings → Preferences; stored as an InstanceSetting on the
// server. The frontend caches a local copy here so isWeekend() /
// getWeekendDays() stay synchronous (no React state, no per-render fetch).

const STORAGE_KEY = 'taskhub.calendar';
const WEEKEND_STORAGE_KEY = 'taskhub.weekend';

function readInitial(): Calendar {
  if (typeof window === 'undefined') return 'SHAMSI';
  const stored = window.localStorage?.getItem(STORAGE_KEY);
  return stored === 'GREGORIAN' ? 'GREGORIAN' : 'SHAMSI';
}

let _active: Calendar = readInitial();

export function getCalendar(): Calendar {
  return _active;
}

// Set the active calendar + persist. Returns true if the value changed
// (useful when deciding whether to trigger a window reload).
export function setCalendar(next: Calendar): boolean {
  const changed = _active !== next;
  _active = next;
  try {
    window.localStorage?.setItem(STORAGE_KEY, next);
  } catch {
    // localStorage can throw in private-mode Safari; the runtime state
    // still updates so the active session keeps working.
  }
  return changed;
}

// Sync from the server-side per-user preference. Called by AuthContext
// after login / refresh so a user logging in on a fresh device sees their
// chosen calendar immediately, without first toggling locally.
export function adoptServerCalendar(serverPref: Calendar | undefined | null): void {
  if (!serverPref) return;
  setCalendar(serverPref);
}

// ── Off-days ─────────────────────────────────────────────────────────────

// Normalise an unknown into a sorted unique int[] in [0..6]. Used both at
// storage-read time (where the JSON might be anything) and at adopt time
// (where the server response is already validated, but defensive coding
// is cheap).
function sanitiseDays(input: unknown): number[] {
  if (!Array.isArray(input)) return [0, 6];
  const cleaned = input
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return [...new Set(cleaned)].sort((a, b) => a - b);
}

function readInitialWeekendDays(): number[] {
  if (typeof window === 'undefined') return [0, 6];
  const stored = window.localStorage?.getItem(WEEKEND_STORAGE_KEY);
  if (!stored) return [0, 6];
  try {
    return sanitiseDays(JSON.parse(stored));
  } catch {
    return [0, 6];
  }
}

let _weekendDays: number[] = readInitialWeekendDays();

// Active off-day set. Returns a defensive copy so callers can't mutate it.
export function getWeekendDays(): number[] {
  return _weekendDays.slice();
}

// Replace the active off-day set. Returns true when the value changed
// (useful for deciding whether to trigger a reload after the admin
// updates the workweek).
export function setWeekendDays(next: number[]): boolean {
  const sanitised = sanitiseDays(next);
  const changed = JSON.stringify(sanitised) !== JSON.stringify(_weekendDays);
  _weekendDays = sanitised;
  try {
    window.localStorage?.setItem(WEEKEND_STORAGE_KEY, JSON.stringify(sanitised));
  } catch {
    // localStorage can throw in private-mode Safari; runtime state holds.
  }
  return changed;
}

// Adopt the value the server returned from /system/info. Called once at
// app start so the very first picker render already paints the right
// weekend cells.
export function adoptServerWeekend(serverPref: number[] | undefined | null): void {
  if (!serverPref) return;
  setWeekendDays(serverPref);
}

// True iff `date`'s weekday is in the configured off-day set.
export function isWeekend(date: Date): boolean {
  return _weekendDays.includes(date.getUTCDay());
}

// ── Holidays (v1.62) ─────────────────────────────────────────────────────
// Specific-date off-days stored as UTC-midnight calendar dates. Cached from
// /system/info bootstrap (same pattern as weekends).

export interface HolidayEntry {
  id: string;
  date: string;
  name: string;
  recurring: boolean;
}

const HOLIDAY_STORAGE_KEY = 'taskhub.holidays';

export function utcDateKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function readInitialHolidays(): HolidayEntry[] {
  if (typeof window === 'undefined') return [];
  const stored = window.localStorage?.getItem(HOLIDAY_STORAGE_KEY);
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (h): h is HolidayEntry =>
        typeof h === 'object'
        && h !== null
        && typeof (h as HolidayEntry).id === 'string'
        && typeof (h as HolidayEntry).date === 'string'
        && typeof (h as HolidayEntry).name === 'string'
        && typeof (h as HolidayEntry).recurring === 'boolean',
    );
  } catch {
    return [];
  }
}

let _holidays: HolidayEntry[] = readInitialHolidays();

function findHolidayOnDate(date: Date): HolidayEntry | null {
  const key = utcDateKey(date);
  const exact = _holidays.find((h) => utcDateKey(new Date(h.date)) === key);
  if (exact) return exact;
  const mm = date.getUTCMonth();
  const dd = date.getUTCDate();
  for (const h of _holidays) {
    if (!h.recurring) continue;
    const hd = new Date(h.date);
    if (hd.getUTCMonth() === mm && hd.getUTCDate() === dd) return h;
  }
  return null;
}

export function getHolidays(): HolidayEntry[] {
  return _holidays.slice();
}

export function setHolidays(next: HolidayEntry[]): boolean {
  const changed = JSON.stringify(next) !== JSON.stringify(_holidays);
  _holidays = next.slice();
  try {
    window.localStorage?.setItem(HOLIDAY_STORAGE_KEY, JSON.stringify(_holidays));
  } catch {
    // private-mode Safari
  }
  return changed;
}

export function adoptServerHolidays(serverPref: HolidayEntry[] | undefined | null): void {
  if (!serverPref) return;
  setHolidays(serverPref);
}

export function isHoliday(date: Date): boolean {
  return findHolidayOnDate(date) !== null;
}

export function getHolidayName(date: Date): string | null {
  return findHolidayOnDate(date)?.name ?? null;
}

/** Weekend weekday OR instance holiday on this UTC calendar date. */
export function isOffDay(date: Date): boolean {
  return isWeekend(date) || isHoliday(date);
}

/** Tooltip label for off-days — holiday name when applicable. */
export function getOffDayTitle(date: Date): string | null {
  const name = getHolidayName(date);
  if (name) return name;
  if (isWeekend(date)) return null;
  return null;
}

// ── Week layout ───────────────────────────────────────────────────────────
// Derive the first column of 7-day calendar rows from the off-day set.
// JS convention: 0=Sun .. 6=Sat. Both supported presets (Sat+Sun and
// Thu+Fri weekends) display Saturday → … → Friday. Custom configs pick
// the start day that clusters off-days at the start or end of the row.

export function getWeekStartDay(offDays?: number[]): number {
  return deriveWeekStartDay(sanitiseDays(offDays ?? _weekendDays));
}

function deriveWeekStartDay(off: number[]): number {
  if (off.length === 0) return 0;

  // Western Sat+Sun off ([0, 6]) and Iranian Thu+Fri off ([4, 5]).
  if (off.includes(0) && off.includes(6)) return 6;
  if (off.includes(4) && off.includes(5)) return 6;

  // Future custom sets: prefer a row start where off-days sit in the first
  // two or last two columns; tie-break toward Saturday (6).
  let bestStart = 6;
  let bestScore = -1;
  for (let start = 0; start < 7; start++) {
    let score = 0;
    for (let i = 0; i < 7; i++) {
      if (!off.includes((start + i) % 7)) continue;
      if (i <= 1 || i >= 5) score++;
    }
    if (score > bestScore || (score === bestScore && start === 6)) {
      bestScore = score;
      bestStart = start;
    }
  }
  return bestStart;
}
