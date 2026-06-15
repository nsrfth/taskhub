import { z } from 'zod';

/** Validate IANA timezone via Intl (Node 20+ / modern runtimes). */
export function isValidIanaTimeZone(tz: string): boolean {
  if (!tz || tz.length > 64) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const timeFormatEnum = z.enum(['H12', 'H24']);

/** Treat blank strings like null — some clients send "" for "browser default". */
export function normalizeTimeZoneInput(tz: string | null | undefined): string | null {
  if (tz == null) return null;
  const trimmed = tz.trim();
  return trimmed.length ? trimmed : null;
}

/** null clears stored preference (browser fallback on frontend). */
export const timeZonePreference = z.preprocess(
  (val) => normalizeTimeZoneInput(val as string | null | undefined),
  z
    .string()
    .max(64)
    .refine(isValidIanaTimeZone, { message: 'Invalid IANA time zone' })
    .nullable()
    .optional(),
);

export type TimeFormatValue = z.infer<typeof timeFormatEnum>;
