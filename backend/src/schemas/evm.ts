import { z } from 'zod';
import { currencyEnum } from './currency.js';

export const eacMethodEnum = z.enum(['CPI_BASED', 'SPI_BASED', 'TCPI_BASED']);

export const evmQuery = z.object({
  asOf: z.string().date().optional(),
  eacMethod: eacMethodEnum.optional(),
});
export type EvmQuery = z.infer<typeof evmQuery>;

export const evmSeriesQuery = z.object({
  bucket: z.enum(['day', 'week', 'month']).optional(),
});
export type EvmSeriesQuery = z.infer<typeof evmSeriesQuery>;

export const evmMetricsResponse = z.object({
  projectId: z.string(),
  asOf: z.string(),
  bac: z.number(),
  pv: z.number(),
  ev: z.number(),
  ac: z.number(),
  cv: z.number(),
  sv: z.number(),
  cpi: z.number(),
  spi: z.number(),
  eac: z.number(),
  eacMethod: eacMethodEnum,
  vac: z.number(),
  tcpi: z.number(),
  currency: currencyEnum,
});

export const evmSnapshotResponse = evmMetricsResponse.extend({
  id: z.string(),
  createdAt: z.string(),
});

export const evmSeriesResponse = z.object({
  items: z.array(z.object({
    date: z.string(),
    bac: z.number(),
    pv: z.number(),
    ev: z.number(),
    ac: z.number(),
    cpi: z.number(),
    spi: z.number(),
  })),
});
