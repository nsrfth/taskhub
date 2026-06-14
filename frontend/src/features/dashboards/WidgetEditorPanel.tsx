import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useT } from '@/lib/i18n';
import { api } from '@/lib/api';
import * as customFieldsApi from '@/features/customFields/api';
import type { DashboardWidgetInput, DataSource, WidgetType } from './api';

interface Props {
  teamId: string;
  initial: DashboardWidgetInput;
  onSave: (widget: DashboardWidgetInput) => void;
  onCancel: () => void;
}

const WIDGET_TYPES: WidgetType[] = ['METRIC', 'BAR', 'PIE', 'LINE', 'TABLE'];
const DATA_SOURCES: DataSource[] = [
  'task_count',
  'planned_budget_sum',
  'actual_spent_sum',
  'custom_field_number_sum',
];
const GROUP_BY = [
  'status',
  'priority',
  'assignee',
  'label',
  'project',
  'due_bucket',
] as const;

export default function WidgetEditorPanel({ teamId, initial, onSave, onCancel }: Props): JSX.Element {
  const t = useT();
  const [draft, setDraft] = useState(initial);

  useEffect(() => setDraft(initial), [initial]);

  const { data: customFields } = useQuery({
    queryKey: ['custom-fields', teamId],
    queryFn: async () =>
      (await api.get<customFieldsApi.CustomFieldDefinition[]>(`/teams/${teamId}/custom-fields`)).data,
  });

  const numberFields = (customFields ?? []).filter((f) => f.type === 'NUMBER');
  const selectFields = (customFields ?? []).filter(
    (f) => f.type === 'SINGLE_SELECT' || f.type === 'MULTI_SELECT',
  );

  const needsGroupBy = draft.type !== 'METRIC' && draft.type !== 'LINE';
  const needsTimeBucket = draft.type === 'LINE';
  const needsCustomFieldId = draft.dataSource === 'custom_field_number_sum';

  return (
    <div className="border border-indigo-200 dark:border-indigo-800 rounded-lg p-4 bg-indigo-50/50 dark:bg-indigo-950/20 space-y-3">
      <h2 className="text-sm font-semibold">{t('dashboard.widget.editorTitle')}</h2>

      <label className="block text-xs">
        {t('dashboard.widget.titleLabel')}
        <input
          className="mt-1 w-full rounded border px-2 py-1 text-sm dark:bg-slate-800"
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
      </label>

      <label className="block text-xs">
        {t('dashboard.widget.typeLabel')}
        <select
          className="mt-1 w-full rounded border px-2 py-1 text-sm dark:bg-slate-800"
          value={draft.type}
          onChange={(e) => setDraft({ ...draft, type: e.target.value as WidgetType })}
        >
          {WIDGET_TYPES.map((wt) => (
            <option key={wt} value={wt}>
              {t(`dashboard.widget.type.${wt}`)}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-xs">
        {t('dashboard.widget.sourceLabel')}
        <select
          className="mt-1 w-full rounded border px-2 py-1 text-sm dark:bg-slate-800"
          value={draft.dataSource}
          onChange={(e) => setDraft({ ...draft, dataSource: e.target.value as DataSource })}
        >
          {DATA_SOURCES.map((ds) => (
            <option key={ds} value={ds}>
              {t(`dashboard.source.${ds}`)}
            </option>
          ))}
        </select>
      </label>

      {needsCustomFieldId && (
        <label className="block text-xs">
          {t('dashboard.widget.customFieldLabel')}
          <select
            className="mt-1 w-full rounded border px-2 py-1 text-sm dark:bg-slate-800"
            value={draft.configJson?.customFieldId ?? ''}
            onChange={(e) =>
              setDraft({
                ...draft,
                configJson: { ...draft.configJson, customFieldId: e.target.value || undefined },
              })
            }
          >
            <option value="">{t('dashboard.widget.pickField')}</option>
            {numberFields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {needsGroupBy && (
        <label className="block text-xs">
          {t('dashboard.widget.groupByLabel')}
          <select
            className="mt-1 w-full rounded border px-2 py-1 text-sm dark:bg-slate-800"
            value={draft.groupBy ?? ''}
            onChange={(e) => setDraft({ ...draft, groupBy: e.target.value || null })}
          >
            <option value="">{t('dashboard.widget.pickGroupBy')}</option>
            {GROUP_BY.map((g) => (
              <option key={g} value={g}>
                {t(`dashboard.groupBy.${g}`)}
              </option>
            ))}
            {selectFields.map((f) => (
              <option key={f.id} value={`custom_field:${f.id}`}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {needsTimeBucket && (
        <>
          <label className="block text-xs">
            {t('dashboard.widget.timeBucketLabel')}
            <select
              className="mt-1 w-full rounded border px-2 py-1 text-sm dark:bg-slate-800"
              value={draft.timeBucket ?? 'week'}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  timeBucket: e.target.value as 'day' | 'week' | 'month',
                })
              }
            >
              <option value="day">{t('dashboard.timeBucket.day')}</option>
              <option value="week">{t('dashboard.timeBucket.week')}</option>
              <option value="month">{t('dashboard.timeBucket.month')}</option>
            </select>
          </label>
          <label className="block text-xs">
            {t('dashboard.widget.timeFieldLabel')}
            <select
              className="mt-1 w-full rounded border px-2 py-1 text-sm dark:bg-slate-800"
              value={draft.configJson?.timeField ?? 'completedAt'}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  configJson: {
                    ...draft.configJson,
                    timeField: e.target.value as 'completedAt' | 'createdAt',
                  },
                })
              }
            >
              <option value="completedAt">{t('dashboard.timeField.completedAt')}</option>
              <option value="createdAt">{t('dashboard.timeField.createdAt')}</option>
            </select>
          </label>
        </>
      )}

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          className="px-3 py-1.5 text-sm rounded bg-indigo-600 text-white"
          onClick={() => onSave(draft)}
        >
          {t('dashboard.widget.save')}
        </button>
        <button type="button" className="px-3 py-1.5 text-sm rounded border" onClick={onCancel}>
          {t('dashboard.widget.cancel')}
        </button>
      </div>
    </div>
  );
}
