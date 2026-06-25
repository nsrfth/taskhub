import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useT } from '@/lib/i18n';
import * as profilesApi from '@/features/profiles/api';

interface ProjectProfilePanelProps {
  teamId: string;
  projectId: string;
  // Whether the caller may assign/override (gated server-side by pmo.* perms;
  // this only decides whether the controls render). Pass capabilities.manageProfiles.
  canManage: boolean;
}

// v1.98 (PMIS R2): the Project Settings → Profile tab. Read-only effective-config
// matrix for everyone with project access; the assignment selector + per-module
// override toggles appear only for PMO users (server still enforces the perms).
export default function ProjectProfilePanel({
  teamId,
  projectId,
  canManage,
}: ProjectProfilePanelProps): JSX.Element {
  const t = useT();
  const qc = useQueryClient();

  const { data: modules = [] } = useQuery({
    queryKey: ['profiles', 'modules'],
    queryFn: profilesApi.listModules,
    staleTime: 5 * 60_000,
  });
  const { data: effective } = useQuery({
    queryKey: ['profiles', teamId, projectId, 'effective'],
    queryFn: () => profilesApi.getEffectiveConfig(teamId, projectId),
  });
  const { data: systemProfiles = [] } = useQuery({
    queryKey: ['profiles', 'system'],
    queryFn: profilesApi.listSystemProfiles,
    enabled: canManage,
  });
  const { data: teamProfiles = [] } = useQuery({
    queryKey: ['profiles', teamId, 'team'],
    queryFn: () => profilesApi.listTeamProfiles(teamId),
    enabled: canManage,
  });

  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!effective) return;
    const map: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(effective.modules)) map[k] = v.enabled;
    setOverrides(map);
  }, [effective?.profileId, effective?.profileVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['profiles', teamId, projectId, 'effective'] });

  const assignMut = useMutation({
    mutationFn: (profileId: string) =>
      profilesApi.assignProjectProfile(teamId, projectId, profileId),
    onSuccess: invalidate,
  });

  const overrideMut = useMutation({
    mutationFn: () =>
      profilesApi.setProjectOverrides(
        teamId,
        projectId,
        Object.fromEntries(modules.map((m) => [m.key, { enabled: !!overrides[m.key] }])),
      ),
    onSuccess: invalidate,
  });

  const publishable = [...systemProfiles, ...teamProfiles].filter((p) => p.status === 'PUBLISHED');

  return (
    <section className="border-t border-border pt-3">
      <h3 className="text-sm font-medium mb-1">{t('profiles.projectTab')}</h3>
      <p className="text-xs text-text-muted mb-2">
        {t('profiles.projectCurrent').replace('{name}', effective?.profileName ?? '—')}
      </p>

      {canManage && (
        <label className="flex items-center gap-2 mb-3 text-xs">
          <span className="text-text-muted">{t('profiles.assign')}</span>
          <select
            defaultValue=""
            onChange={(e) => e.target.value && assignMut.mutate(e.target.value)}
            className="rounded border px-2 py-1 dark:bg-slate-700"
          >
            <option value="" disabled>
              {t('profiles.chooseProfile')}
            </option>
            {publishable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <table className="w-full text-sm">
        <tbody>
          {modules.map((m) => {
            const enabled = effective?.modules[m.key]?.enabled ?? false;
            return (
              <tr key={m.key} className="border-t border-border">
                <td className="py-1">{m.label}</td>
                <td className="py-1 text-end">
                  {canManage ? (
                    <input
                      type="checkbox"
                      checked={!!overrides[m.key]}
                      onChange={(e) =>
                        setOverrides((prev) => ({ ...prev, [m.key]: e.target.checked }))
                      }
                    />
                  ) : (
                    <span className={enabled ? 'text-success' : 'text-text-muted'}>
                      {enabled ? t('profiles.on') : t('profiles.off')}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {canManage && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => overrideMut.mutate()}
            disabled={overrideMut.isPending}
            className="text-xs rounded border border-border px-3 py-1.5 disabled:opacity-50"
          >
            {t('profiles.saveOverrides')}
          </button>
          {overrideMut.isSuccess && <span className="text-xs text-success">{t('profiles.saved')}</span>}
        </div>
      )}
    </section>
  );
}
