import { useEffect, useState } from 'react';
import Modal from '@/features/ui/Modal';
import type { ProjectStatus } from '@/features/projects/api';
import { useT } from '@/lib/i18n';

export interface ProjectEditFormValues {
  name: string;
  description: string;
  status: ProjectStatus;
}

interface ProjectEditModalProps {
  initial: ProjectEditFormValues;
  pending: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (values: ProjectEditFormValues) => void;
}

export default function ProjectEditModal({
  initial,
  pending,
  error,
  onClose,
  onSave,
}: ProjectEditModalProps): JSX.Element {
  const t = useT();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [status, setStatus] = useState<ProjectStatus>(initial.status);

  useEffect(() => {
    setName(initial.name);
    setDescription(initial.description);
    setStatus(initial.status);
  }, [initial.name, initial.description, initial.status]);

  const statuses: ProjectStatus[] = ['ACTIVE', 'ON_HOLD', 'ARCHIVED'];

  function submit(e: React.FormEvent): void {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave({ name: trimmed, description: description.trim(), status });
  }

  return (
    <Modal title={t('projects.edit.title')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        )}
        <label className="flex flex-col gap-1 text-sm">
          <span>{t('projects.edit.name')}</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            required
            className="rounded border px-2 py-1.5 dark:bg-slate-700"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>{t('projects.edit.description')}</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            rows={3}
            className="rounded border px-2 py-1.5 dark:bg-slate-700 resize-y"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>{t('projects.edit.status')}</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ProjectStatus)}
            className="rounded border px-2 py-1.5 dark:bg-slate-700"
          >
            {statuses.map((s) => (
              <option key={s} value={s}>
                {t(`projects.status.${s === 'ON_HOLD' ? 'onHold' : s.toLowerCase()}` as never)}
              </option>
            ))}
          </select>
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm rounded border">
            {t('projects.edit.cancel')}
          </button>
          <button
            type="submit"
            disabled={pending || !name.trim()}
            className="px-3 py-1.5 text-sm rounded bg-indigo-600 text-white disabled:opacity-50"
          >
            {t('projects.edit.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
