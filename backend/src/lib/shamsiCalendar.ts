import DateObjectModule from 'react-date-object';
import persianModule from 'react-date-object/calendars/persian.js';
import gregorianModule from 'react-date-object/calendars/gregorian.js';

// react-date-object ships CommonJS. Under the backend's native ESM runtime the
// default import resolves to the module namespace, so `new DateObject(...)`
// throws "is not a constructor" — unwrap `.default` when present. (Vite/vitest
// give the constructor directly, where `.default` is undefined, so this is safe
// in both environments.)
const DateObject = ((DateObjectModule as unknown as { default?: typeof DateObjectModule })
  .default ?? DateObjectModule) as typeof DateObjectModule;
const persian = (persianModule as { default?: unknown }).default ?? persianModule;
const gregorian = (gregorianModule as { default?: unknown }).default ?? gregorianModule;

/**
 * Jalali calendar date → UTC-midnight Gregorian instant.
 * Uses the same `react-date-object` library as frontend `lib/shamsi.ts`
 * so import dates match picker/display conversion exactly.
 */
export function jalaliToUtcMidnight(jy: number, jm: number, jd: number): Date {
  const obj = new DateObject({
    year: jy,
    month: jm,
    day: jd,
    calendar: persian,
  });
  const g = obj.convert(gregorian);
  return new Date(Date.UTC(g.year, g.month.number - 1, g.day));
}

/** Inverse of frontend `jalaaliFromUtc` — for tests and validation. */
export function utcMidnightToJalali(date: Date): { jy: number; jm: number; jd: number } {
  const obj = new DateObject({
    date: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())),
    calendar: persian,
  });
  return { jy: obj.year, jm: obj.month.number, jd: obj.day };
}
