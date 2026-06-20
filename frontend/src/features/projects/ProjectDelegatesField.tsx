import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TeamMember } from '@/features/teams/api';
import { useT } from '@/lib/i18n';
import { getProjectDelegates, setProjectDelegates } from '@/features/projects/api';

interface ProjectDelegatesFieldProps {
  teamId: string;
  projectId: string;
  members: TeamMember[];
}

// v1.86: owner-facing control to grant/revoke per-project "full-edit" delegates.
// Self-contained (own fetch + save) so it stays out of the generic project form
// values. Only rendered in full-edit (owner/admin) mode; the underlying endpoints
// are owner/admin-gated server-side too.
export default function ProjectDelegatesField({
  teamId,
  projectId,
  members,
}: ProjectDelegatesFieldProps): JSX.Element {
  const t = useT();
  const qc = useQueryClient();
  const delegatesKey = ['projects', teamId, projectId, 'delegates'];

  const { data: saved = [], isLoading } = useQuery({
    queryKey: delegatesKey,
    queryFn: () => getProjectDelegates(teamId, projectId),
    staleTime: 30_000,
  });

  const [draft, setDraft] = useState<string[] | null>(null);
  const selected = draft ?? saved;
  const dirty =
    draft !== null &&
    (draft.length !== saved.length || draft.some((id) => !saved.includes(id)));

  const mut = useMutation({
    mutationFn: (ids: string[]) => setProjectDelegates(teamId, projectId, ids),
    onSuccess: (ids) => {
      qc.setQueryData(delegatesKey, ids);
      setDraft(null);
    },
  });

  function toggle(userId: string): void {
    setDraft((prev) => {
      const base = prev ?? saved;
      return base.includes(userId)
        ? base.filter((id) => id !== userId)
        : [...base, userId];
    });
  }

  return (
    <div className="space-y-2 border-t pt-3">
      <div>
        <span className="text-sm font-medium">{t('projects.delegates.title')}</span>
        <p className="text-xs text-text-muted">{t('projects.delegates.hint')}</p>
      </div>
      {isLoading ? (
        <p className="text-xs text-text-muted">{t('projects.delegates.loading')}</p>
      ) : members.length === 0 ? (
        <p className="text-xs text-text-muted">{t('projects.delegates.none')}</p>
      ) : (
        <ul className="space-y-1 max-h-40 overflow-auto">
          {members.map((m) => (
            <li key={m.userId}>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(m.userId)}
                  onChange={() => toggle(m.userId)}
                />
                <span>
                  {m.name} ({m.role})
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => mut.mutate(selected)}
          disabled={!dirty || mut.isPending}
          className="px-3 py-1.5 text-sm rounded border disabled:opacity-50"
        >
          {t('projects.delegates.save')}
        </button>
        {mut.isError && (
          <span className="text-xs text-danger" role="alert">
            {t('projects.delegates.error')}
          </span>
        )}
      </div>
    </div>
  );
}
