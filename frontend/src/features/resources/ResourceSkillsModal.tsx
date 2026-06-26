import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import Modal from '@/features/ui/Modal';
import { useT } from '@/lib/i18n';
import * as api from './api';
import type { Resource } from './api';

interface Props {
  teamId: string;
  resource: Resource;
  onClose: () => void;
  onSaved: () => void;
}

// v1.90 (PMIS R6 GUI completion): assign team skills to a single resource with a
// proficiency level (1–5). The whole set is replaced via PUT on save.
export function ResourceSkillsModal({ teamId, resource, onClose, onSaved }: Props): JSX.Element {
  const t = useT();

  // selected skillId → level (1–5).
  const [selected, setSelected] = useState<Map<string, number>>(
    () => new Map(resource.skills.map((s) => [s.skillId, s.level])),
  );

  const { data: skills = [], isLoading } = useQuery({
    queryKey: ['skills', teamId],
    queryFn: () => api.listSkills(teamId),
    enabled: !!teamId,
  });

  const saveMut = useMutation({
    mutationFn: () =>
      api.setResourceSkills(
        teamId,
        resource.id,
        Array.from(selected.entries()).map(([skillId, level]) => ({ skillId, level })),
      ),
    onSuccess: onSaved,
  });

  function toggle(skillId: string): void {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(skillId)) next.delete(skillId);
      else next.set(skillId, 3);
      return next;
    });
  }
  function setLevel(skillId: string, level: number): void {
    setSelected((prev) => new Map(prev).set(skillId, level));
  }

  return (
    <Modal title={`${t('resources.skills.editTitle')} · ${resource.name}`} onClose={onClose}>
      <div className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-text-muted">{t('common.loading')}</p>
        ) : skills.length === 0 ? (
          <p className="text-sm text-text-muted">{t('resources.skills.catalogEmpty')}</p>
        ) : (
          <ul className="space-y-2">
            {skills.map((s) => {
              const isOn = selected.has(s.id);
              return (
                <li key={s.id} className="flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={isOn} onChange={() => toggle(s.id)} />
                    {s.name}
                  </label>
                  {isOn && (
                    <select
                      value={selected.get(s.id)}
                      onChange={(e) => setLevel(s.id, Number(e.target.value))}
                      className="rounded border border-border bg-surface px-2 py-1 text-xs"
                    >
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          {t('resources.skills.level')} {n}
                        </option>
                      ))}
                    </select>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {saveMut.isError && <p className="text-sm text-rose-600">{t('resources.skills.saveError')}</p>}
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm rounded border">
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending || skills.length === 0}
            className="px-3 py-1.5 text-sm rounded bg-primary text-primary-contrast disabled:opacity-50"
          >
            {t('common.save')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
