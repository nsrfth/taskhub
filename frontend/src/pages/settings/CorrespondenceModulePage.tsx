import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as adminApi from '@/features/correspondence/adminApi';
import { useAuth } from '@/features/auth/AuthContext';
import { useT } from '@/lib/i18n';

// v1.89: global-admin per-project enablement of the correspondence module.
export default function CorrespondenceModulePage(): JSX.Element {
  const t = useT();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [filterEnabled, setFilterEnabled] = useState<'all' | 'on' | 'off'>('all');

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['admin', 'correspondence', 'projects'],
    queryFn: adminApi.listCorrespondenceProjects,
    enabled: user?.globalRole === 'ADMIN',
  });

  const toggleMut = useMutation({
    mutationFn: ({ projectId, enabled }: { projectId: string; enabled: boolean }) =>
      adminApi.setCorrespondenceEnabled(projectId, enabled),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin', 'correspondence', 'projects'] });
      // The cross-team project list carries correspondenceEnabled for the nav.
      await qc.invalidateQueries({ queryKey: ['projects', 'all'] });
    },
  });

  if (user && user.globalRole !== 'ADMIN') {
    return <Navigate to="/dashboard" replace />;
  }

  const filtered = projects.filter((p) => {
    if (filterEnabled === 'on' && !p.correspondenceEnabled) return false;
    if (filterEnabled === 'off' && p.correspondenceEnabled) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      p.projectName.toLowerCase().includes(q) || p.teamName.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text">{t('settings.correspondence.title')}</h1>
        <p className="text-sm text-text-muted">{t('settings.correspondence.desc')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder={t('settings.correspondence.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded border-border px-3 py-1.5 border text-sm dark:bg-slate-800 min-w-[16rem]"
        />
        <select
          value={filterEnabled}
          onChange={(e) => setFilterEnabled(e.target.value as 'all' | 'on' | 'off')}
          className="rounded border-border px-2 py-1.5 border text-sm dark:bg-slate-800"
        >
          <option value="all">{t('settings.correspondence.filter.all')}</option>
          <option value="on">{t('settings.correspondence.filter.enabled')}</option>
          <option value="off">{t('settings.correspondence.filter.disabled')}</option>
        </select>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">{t('common.loading')}</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-slate-500 italic">{t('settings.correspondence.empty')}</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {filtered.map((p) => (
            <li
              key={p.projectId}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-text truncate">{p.projectName}</p>
                <p className="text-xs text-slate-500 truncate">{p.teamName}</p>
              </div>
              <label className="inline-flex items-center gap-2 cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={p.correspondenceEnabled}
                  disabled={toggleMut.isPending}
                  onChange={(e) =>
                    toggleMut.mutate({ projectId: p.projectId, enabled: e.target.checked })
                  }
                />
                <span className="text-sm">
                  {p.correspondenceEnabled
                    ? t('settings.correspondence.on')
                    : t('settings.correspondence.off')}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
