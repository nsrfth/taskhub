import { describe, expect, it } from 'vitest';
import { CURRENCY_DECIMALS, formatMinor, fromMinor, toMinor } from '../../src/lib/money.js';

// v1.95 (PMIS R0): integer-minor-units money convention for future cost data.
describe('money (minor units)', () => {
  it('knows each currency precision', () => {
    expect(CURRENCY_DECIMALS).toEqual({ IRR: 0, EUR: 2, USD: 2 });
  });

  it('toMinor scales by precision and rounds to the nearest minor unit', () => {
    expect(toMinor(12.34, 'USD')).toBe(1234n);
    expect(toMinor(99.99, 'USD')).toBe(9999n); // rounds .99 cents up, no float drift
    expect(toMinor(1, 'USD')).toBe(100n);
    expect(toMinor(5000, 'IRR')).toBe(5000n); // 0-decimal currency: 1:1
    expect(toMinor(0, 'EUR')).toBe(0n);
  });

  it('fromMinor is the inverse of toMinor', () => {
    expect(fromMinor(1234n, 'USD')).toBe(12.34);
    expect(fromMinor(5000n, 'IRR')).toBe(5000);
  });

  it('formatMinor renders at currency precision without grouping/symbol', () => {
    expect(formatMinor(1234n, 'USD')).toBe('12.34');
    expect(formatMinor(5000n, 'IRR')).toBe('5000');
    expect(formatMinor(5n, 'EUR')).toBe('0.05'); // zero-padded fractional part
    expect(formatMinor(-1234n, 'USD')).toBe('-12.34');
  });
});
