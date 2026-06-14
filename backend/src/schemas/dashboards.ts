import { z } from 'zod';
import { conditionMatchEnum } from './automations.js';
import { taskPriorityEnum, taskStatusEnum } from './tasks.js';

export const widgetTypeEnum = z.enum(['METRIC', 'BAR', 'PIE', 'LINE', 'TABLE']);

export const dataSourceEnum = z.enum([
  'task_count',
  'planned_budget_sum',
  'actual_spent_sum',
  'custom_field_number_sum',
]);

export const groupByDimensionEnum = z.enum([
  'status',
  'priority',
  'assignee',
  'label',
  'project',
  'due_bucket',
]);

export const timeBucketEnum = z.enum(['day', 'week', 'month']);

export const widgetFilterConditionSchema = z.object({
  field: z.enum(['status', 'priority', 'assignee', 'label', 'project', 'custom_field']),
  op: z.enum(['in', 'has', 'equals']),
  value: z.union([
    z.array(z.string()),
    z.string(),
    z.number(),
    z.boolean(),
  ]),
  customFieldId: z.string().optional(),
});

export const widgetFiltersSchema = z
  .object({
    match: conditionMatchEnum.optional().default('ALL'),
    conditions: z.array(widgetFilterConditionSchema).default([]),
  })
  .nullable()
  .optional();

export const widgetConfigSchema = z
  .object({
    customFieldId: z.string().optional(),
    timeField: z.enum(['completedAt', 'createdAt']).optional(),
    lineDays: z.number().int().min(7).max(365).optional(),
  })
  .nullable()
  .optional();

export const dashboardWidgetInput = z.object({
  id: z.string().optional(),
  type: widgetTypeEnum,
  title: z.string().min(1).max(120).trim(),
  dataSource: dataSourceEnum,
  groupBy: z.string().max(120).nullable().optional(),
  timeBucket: timeBucketEnum.nullable().optional(),
  filtersJson: widgetFiltersSchema,
  configJson: widgetConfigSchema,
  position: z.number().int().nonnegative().optional(),
});

export const createDashboardBody = z.object({
  name: z.string().min(1).max(120).trim(),
  description: z.string().max(2000).trim().nullable().optional(),
  shared: z.boolean().optional(),
  position: z.number().int().nonnegative().optional(),
  widgets: z.array(dashboardWidgetInput).optional(),
});

export const updateDashboardBody = z.object({
  name: z.string().min(1).max(120).trim().optional(),
  description: z.string().max(2000).trim().nullable().optional(),
  shared: z.boolean().optional(),
  position: z.number().int().nonnegative().optional(),
});

export const setDashboardWidgetsBody = z.object({
  widgets: z.array(dashboardWidgetInput),
});

const dashboardWidgetResponse = z.object({
  id: z.string(),
  dashboardId: z.string(),
  type: widgetTypeEnum,
  title: z.string(),
  dataSource: dataSourceEnum,
  groupBy: z.string().nullable(),
  timeBucket: timeBucketEnum.nullable(),
  filtersJson: widgetFiltersSchema,
  configJson: widgetConfigSchema,
  position: z.number().int(),
});

export const dashboardResponse = z.object({
  id: z.string(),
  teamId: z.string(),
  ownerId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  shared: z.boolean(),
  position: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  widgets: z.array(dashboardWidgetResponse),
  canEdit: z.boolean(),
});

export const dashboardsListResponse = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      teamId: z.string(),
      ownerId: z.string(),
      name: z.string(),
      description: z.string().nullable(),
      shared: z.boolean(),
      position: z.number().int(),
      createdAt: z.string(),
      updatedAt: z.string(),
      widgetCount: z.number().int(),
      canEdit: z.boolean(),
    }),
  ),
});

export const widgetDataRowSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.union([z.number(), z.string()]),
});

export const widgetDataResponse = z.object({
  kind: z.enum(['metric', 'grouped', 'series', 'table']),
  total: z.union([z.number(), z.string()]).optional(),
  rows: z.array(widgetDataRowSchema).optional(),
  series: z.array(
    z.object({
      bucket: z.string(),
      label: z.string(),
      value: z.number(),
    }),
  ).optional(),
});

export type WidgetFilterCondition = z.infer<typeof widgetFilterConditionSchema>;
export type WidgetFilters = z.infer<typeof widgetFiltersSchema>;
export type WidgetConfig = z.infer<typeof widgetConfigSchema>;
export type DashboardWidgetInput = z.infer<typeof dashboardWidgetInput>;
export type CreateDashboardBody = z.infer<typeof createDashboardBody>;
export type UpdateDashboardBody = z.infer<typeof updateDashboardBody>;
export type SetDashboardWidgetsBody = z.infer<typeof setDashboardWidgetsBody>;

export { taskStatusEnum, taskPriorityEnum };
