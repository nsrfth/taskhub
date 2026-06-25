import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useTeams } from '@/features/teams/TeamsContext';
import { useT } from '@/lib/i18n';
import * as teamsApi from '@/features/teams/api';
import * as profilesApi from '@/features/profiles/api';

function errorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const msg = err.response?.data?.error?.message;
    if (typeof msg === 'string' && msg.length) return msg;
  }
  return fallback;
}

export default function ProfilesPage(): JSX.Element {
  const { currentTeam } = useTeams();
  const t = useT();
  const qc = useQueryClient();
  const teamId = currentTeam?.id ?? null;

  const { data: teamDetail } = useQuery({
    queryKey: ['teams', teamId, 'detail'],
    queryFn: () => teamsApi.getTeam(teamId!),
    enabled: !!teamId,
  });
  const canManage = teamDetail?.capabilities.manageProfiles ?? false;

  const { data: modules = [] } = useQuery({
    queryKey: ['profiles', 'modules'],
    queryFn: profilesApi.listModules,
    enabled: canManage,
    staleTime: 5 * 60_000,
  });
  const { data: systemProfiles = [] } = useQuery({
    queryKey: ['profiles', 'system'],
    queryFn: profilesApi.listSystemProfiles,
    enabled: canManage,
  });
  const { data: teamProfiles = [] } = useQuery({
    queryKey: ['profiles', teamId, 'team'],
    queryFn: () => profilesApi.listTeamProfiles(teamId!),
    enabled: !!teamId && canManage,
  });

  const allProfiles = useMemo(
    () => [...systemProfiles, ...teamProfiles],
    [systemProfiles, teamProfiles],
  );
  const publishable = allProfiles.filter((p) => p.status === 'PUBLISHED');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = allProfiles.find((p) => p.id === selectedId) ?? null;

  // Local editable toggle state for a DRAFT profile's module matrix.
  const [draftToggles, setDraftToggles] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!selected) return;
    const map: Record<string, boolean> = {};
    for (const m of selected.modules) map[m.moduleKey] = m.enabled;
    setDraftToggles(map);
  }, [selectedId, selected?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clone form.
  const [cloneName, setCloneName] = useState('');
  const [cloneKey, setCloneKey] = useState('');
  const [cloneBaseId, setCloneBaseId] = useState('');

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['profiles', teamId, 'team'] });

  const createMut = useMutation({
    mutationFn: () =>
      profilesApi.createProfile(teamId!, {
        name: cloneName.trim(),
        key: cloneKey.trim(),
        basedOnProfileId: cloneBaseId || undefined,
      }),
    onSuccess: async (p) => {
      setCloneName('');
      setCloneKey('');
      setCloneBaseId('');
      await invalidate();
      setSelectedId(p.id);
    },
  });

  const saveMut = useMutation({
    mutationFn: () =>
      profilesApi.updateProfile(teamId!, selected!.id, {
        modules: modules.map((m) => ({
          moduleKey: m.key,
          enabled: !!draftToggles[m.key],
        })),
      }),
    onSuccess: async () => {
      await invalidate();
      await qc.invalidateQueries({ queryKey: ['profiles', 'system'] });
    },
  });

  const publishMut = useMutation({
    mutationFn: () => profilesApi.publishProfile(teamId!, selected!.id),
    onSuccess: invalidate,
  });
  const deprecateMut = useMutation({
    mutationFn: () => profilesApi.deprecateProfile(teamId!, selected!.id),
    onSuccess: invalidate,
  });
  const setDefaultMut = useMutation({
    mutationFn: (profileId: string) => profilesApi.setTeamDefaultProfile(teamId!, profileId),
  });

  function onClone(e: FormEvent): void {
    e.preventDefault();
    if (!cloneName.trim() || !cloneKey.trim()) return;
    createMut.mutate();
  }

  if (!teamId) return <p className="text-sm text-text-muted">{t('profiles.selectTeam')}</p>;
  if (!canManage) return <p className="text-sm text-text-muted">{t('profiles.noAccess')}</p>;

  const isDraft = selected?.status === 'DRAFT';
  const isTeamOwned = selected?.ownerScope === 'TEAM';

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-semibold mb-1">{t('profiles.title')}</h1>
      <p className="text-sm text-text-muted mb-6">{t('profiles.subtitle')}</p>

      {/* Team default selector */}
      <section className="bg-surface rounded shadow p-4 mb-6">
        <h2 className="font-medium text-sm mb-2">{t('profiles.teamDefault')}</h2>
        <select
          defaultValue=""
          onChange={(e) => e.target.value && setDefaultMut.mutate(e.target.value)}
          className="rounded border px-2 py-1 text-sm dark:bg-slate-700"
        >
          <option value="" disabled>
            {t('profiles.chooseDefault')}
          </option>
          {publishable.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} {p.ownerScope === 'SYSTEM' ? '(built-in)' : ''}
            </option>
          ))}
        </select>
        {setDefaultMut.isSuccess && (
          <span className="text-xs text-success ms-2">{t('profiles.saved')}</span>
        )}
      </section>

      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4">
        {/* Profile list */}
        <div className="space-y-4">
          <section className="bg-surface rounded shadow p-3">
            <h3 className="text-xs font-semibold uppercase text-text-muted mb-2">
              {t('profiles.builtins')}
            </h3>
            <ul className="space-y-1">
              {systemProfiles.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(p.id)}
                    className={`block w-full text-start rounded px-2 py-1 text-sm ${
                      selectedId === p.id ? 'bg-bg-elevated font-medium' : 'hover:bg-bg-elevated'
                    }`}
                  >
                    {p.name}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="bg-surface rounded shadow p-3">
            <h3 className="text-xs font-semibold uppercase text-text-muted mb-2">
              {t('profiles.teamProfiles')}
            </h3>
            {teamProfiles.length === 0 && (
              <p className="text-xs text-text-muted">{t('profiles.empty')}</p>
            )}
            <ul className="space-y-1">
              {teamProfiles.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(p.id)}
                    className={`block w-full text-start rounded px-2 py-1 text-sm ${
                      selectedId === p.id ? 'bg-bg-elevated font-medium' : 'hover:bg-bg-elevated'
                    }`}
                  >
                    {p.name}{' '}
                    <span className="text-[10px] text-text-muted">
                      {t(`profiles.status.${p.status}`)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {/* Clone form */}
          <form onSubmit={onClone} className="bg-surface rounded shadow p-3 space-y-2">
            <h3 className="text-xs font-semibold uppercase text-text-muted">{t('profiles.clone')}</h3>
            <input
              value={cloneName}
              onChange={(e) => setCloneName(e.target.value)}
              placeholder={t('profiles.name')}
              className="w-full rounded border px-2 py-1 text-sm dark:bg-slate-700"
            />
            <input
              value={cloneKey}
              onChange={(e) => setCloneKey(e.target.value.toUpperCase())}
              placeholder={t('profiles.key')}
              className="w-full rounded border px-2 py-1 text-sm dark:bg-slate-700"
            />
            <select
              value={cloneBaseId}
              onChange={(e) => setCloneBaseId(e.target.value)}
              className="w-full rounded border px-2 py-1 text-sm dark:bg-slate-700"
            >
              <option value="">{t('profiles.cloneFromNone')}</option>
              {allProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={createMut.isPending || !cloneName.trim() || !cloneKey.trim()}
              className="w-full text-sm rounded bg-slate-900 text-white px-3 py-1.5 disabled:opacity-50"
            >
              {t('profiles.create')}
            </button>
            {createMut.isError && (
              <p className="text-xs text-danger">{errorMessage(createMut.error, 'Failed')}</p>
            )}
          </form>
        </div>

        {/* Module matrix for the selected profile */}
        <section className="bg-surface rounded shadow p-4">
          {!selected && <p className="text-sm text-text-muted">{t('profiles.selectProfile')}</p>}
          {selected && (
            <>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="font-medium">{selected.name}</h2>
                  <p className="text-xs text-text-muted">
                    {selected.key} · v{selected.version} · {t(`profiles.status.${selected.status}`)}
                  </p>
                </div>
                <div className="flex gap-2">
                  {isTeamOwned && isDraft && (
                    <button
                      type="button"
                      onClick={() => publishMut.mutate()}
                      disabled={publishMut.isPending}
                      className="text-xs rounded bg-success text-white px-3 py-1.5 disabled:opacity-50"
                    >
                      {t('profiles.publish')}
                    </button>
                  )}
                  {isTeamOwned && selected.status === 'PUBLISHED' && (
                    <button
                      type="button"
                      onClick={() => deprecateMut.mutate()}
                      disabled={deprecateMut.isPending}
                      className="text-xs rounded border border-border px-3 py-1.5 disabled:opacity-50"
                    >
                      {t('profiles.deprecate')}
                    </button>
                  )}
                </div>
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="text-start text-xs text-text-muted">
                    <th className="text-start font-medium pb-1">{t('profiles.module')}</th>
                    <th className="text-start font-medium pb-1">{t('profiles.wave')}</th>
                    <th className="text-end font-medium pb-1">{t('profiles.enabled')}</th>
                  </tr>
                </thead>
                <tbody>
                  {modules.map((m) => {
                    const fromProfile = selected.modules.find((s) => s.moduleKey === m.key);
                    const checked = isDraft ? !!draftToggles[m.key] : !!fromProfile?.enabled;
                    return (
                      <tr key={m.key} className="border-t border-border">
                        <td className="py-1.5">
                          {m.label}
                          {m.dependsOn.length > 0 && (
                            <span className="text-[10px] text-text-muted ms-1">
                              → {m.dependsOn.join(', ')}
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 text-xs text-text-muted">{m.wave}</td>
                        <td className="py-1.5 text-end">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!isDraft}
                            onChange={(e) =>
                              setDraftToggles((prev) => ({ ...prev, [m.key]: e.target.checked }))
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {isDraft && (
                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => saveMut.mutate()}
                    disabled={saveMut.isPending}
                    className="text-sm rounded bg-slate-900 text-white px-3 py-1.5 disabled:opacity-50"
                  >
                    {t('profiles.save')}
                  </button>
                  {saveMut.isSuccess && <span className="text-xs text-success">{t('profiles.saved')}</span>}
                  {saveMut.isError && (
                    <span className="text-xs text-danger">{errorMessage(saveMut.error, 'Failed')}</span>
                  )}
                </div>
              )}
              {!isTeamOwned && (
                <p className="text-xs text-text-muted mt-3">{t('profiles.builtinReadonly')}</p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
