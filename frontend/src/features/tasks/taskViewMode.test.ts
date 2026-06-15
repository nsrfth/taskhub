import { describe, expect, it } from 'vitest';
import { parseTaskViewMode } from './taskViewMode';

describe('parseTaskViewMode', () => {
  it('accepts current view modes', () => {
    expect(parseTaskViewMode('status')).toBe('status');
    expect(parseTaskViewMode('list')).toBe('list');
    expect(parseTaskViewMode('responsible')).toBe('responsible');
  });

  it('migrates legacy technician to responsible', () => {
    expect(parseTaskViewMode('technician')).toBe('responsible');
  });

  it('returns null for unknown values', () => {
    expect(parseTaskViewMode('buckets')).toBeNull();
    expect(parseTaskViewMode(null)).toBeNull();
    expect(parseTaskViewMode('')).toBeNull();
  });
});
