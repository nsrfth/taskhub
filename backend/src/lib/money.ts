// v1.95 (PMIS R0 — plumbing): the money convention for all FUTURE cost data.
//
// Every cost/EV-bearing row added from R4 onward stores money as an INTEGER
// count of the currency's smallest unit (`amountMinor: bigint`) plus its ISO
// currency, never a float. This sidesteps binary-float rounding drift across
// the sums/rollups/EVM the controls waves depend on. Existing budget columns
// (`Project.plannedBudget`, `Task.plannedBudget/actualSpent`) stay `Decimal`
// for now — they are read-through until R4 deprecates them; do not retrofit.
//
// Pure helpers, no Prisma. The `Currency` enum (IRR/EUR/USD today) is the app's
// currency domain; widen it in one place if more currencies are ever needed.

import type { Currency } from '@prisma/client';

// Fractional digits per currency. IRR has none (the rial is already the minor
// unit in practice); EUR/USD use 2 (cents). Matches the existing display rule
// in the budget UI (v1.59).
export const CURRENCY_DECIMALS: Record<Currency, number> = {
  IRR: 0,
  EUR: 2,
  USD: 2,
};

function factor(currency: Currency): bigint {
  return 10n ** BigInt(CURRENCY_DECIMALS[currency]);
}

/**
 * Convert a major-unit amount (e.g. 12.34 USD) to minor units (1234n), rounding
 * to the nearest minor unit. NOTE: fractional `number` inputs are subject to
 * IEEE-754 representation (12.345 * 100 is 1234.4999…), so the canonical R4
 * cost-entry path should build minor units from integers or parse a decimal
 * STRING at the API boundary rather than rely on rounding a float here.
 */
export function toMinor(amount: number, currency: Currency): bigint {
  const f = Number(factor(currency));
  return BigInt(Math.round(amount * f));
}

/** Convert minor units back to a major-unit number for display/serialization. */
export function fromMinor(minor: bigint, currency: Currency): number {
  return Number(minor) / Number(factor(currency));
}

/**
 * Format minor units as a plain decimal string at the currency's precision
 * (e.g. 1234n USD → "12.34", 5000n IRR → "5000"). No grouping/symbol — the
 * frontend owns locale formatting; this is for logs, CSV, and API payloads.
 */
export function formatMinor(minor: bigint, currency: Currency): string {
  const decimals = CURRENCY_DECIMALS[currency];
  if (decimals === 0) return minor.toString();
  const f = factor(currency);
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const whole = abs / f;
  const frac = (abs % f).toString().padStart(decimals, '0');
  return `${neg ? '-' : ''}${whole}.${frac}`;
}
