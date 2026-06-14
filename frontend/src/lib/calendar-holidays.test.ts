import { afterEach, describe, expect, it } from 'vitest';
import {
  isHoliday,
  isOffDay,
  isWeekend,
  setHolidays,
  setWeekendDays,
  utcDateKey,
} from './calendar';

describe('holiday off-day helpers', () => {
  afterEach(() => {
    setWeekendDays([0, 6]);
    setHolidays([]);
  });

  it('3) isHoliday/isOffDay — weekday holiday is an off-day', () => {
    setHolidays([{ id: '1', date: '2026-03-20T00:00:00.000Z', name: 'Nowruz', recurring: false }]);
    const d = new Date('2026-03-20T00:00:00.000Z');
    expect(d.getUTCDay()).toBe(5); // Friday — not a default weekend
    expect(isWeekend(d)).toBe(false);
    expect(isHoliday(d)).toBe(true);
    expect(isOffDay(d)).toBe(true);
  });

  it('6) same UTC calendar key regardless of time-of-day on input ISO', () => {
    setHolidays([{ id: '1', date: '2026-03-20T00:00:00.000Z', name: 'Nowruz', recurring: false }]);
    const morning = new Date('2026-03-20T08:00:00.000Z');
    const evening = new Date('2026-03-20T23:59:00.000Z');
    expect(utcDateKey(morning)).toBe('2026-03-20');
    expect(isHoliday(morning)).toBe(true);
    expect(isHoliday(evening)).toBe(true);
  });

  it('9) weekend behaviour unchanged when no holidays configured', () => {
    setWeekendDays([0, 6]);
    const sat = new Date('2026-03-21T00:00:00.000Z');
    expect(isWeekend(sat)).toBe(true);
    expect(isOffDay(sat)).toBe(true);
    const mon = new Date('2026-03-23T00:00:00.000Z');
    expect(isWeekend(mon)).toBe(false);
    expect(isOffDay(mon)).toBe(false);
  });

  it('recurring holiday matches same month/day in another year', () => {
    setHolidays([{ id: '1', date: '2026-03-20T00:00:00.000Z', name: 'Nowruz', recurring: true }]);
    const nextYear = new Date('2027-03-20T00:00:00.000Z');
    expect(isHoliday(nextYear)).toBe(true);
  });
});
