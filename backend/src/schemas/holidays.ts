import { z } from 'zod';

export const holidaySourceEnum = z.enum(['MANUAL', 'IMPORT', 'SYNC']);

export const holidayResponse = z.object({
  id: z.string(),
  date: z.string().datetime(),
  name: z.string(),
  recurring: z.boolean(),
  source: holidaySourceEnum,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createHolidayBody = z.object({
  date: z.string().datetime(),
  name: z.string().trim().min(1).max(200),
  recurring: z.boolean().optional(),
  source: holidaySourceEnum.optional(),
});

export const updateHolidayBody = z.object({
  date: z.string().datetime().optional(),
  name: z.string().trim().min(1).max(200).optional(),
  recurring: z.boolean().optional(),
});

export type CreateHolidayBody = z.infer<typeof createHolidayBody>;
export type UpdateHolidayBody = z.infer<typeof updateHolidayBody>;
