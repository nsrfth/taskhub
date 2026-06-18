import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import * as groupsApi from '@/features/groups/api';
import * as projectsApi from '@/features/projects/api';
import { listTeamMembersForAssignees, type TeamMember } from '@/features/teams/api';
import { useT } from '@/lib/i18n';
import { visibleTeamMembers } from '@/lib/systemUser';

function errorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const msg = err.response?.data?.error?.message;
    if (typeof msg === 'string' && msg.length) return msg;
  }
  return fallback;
}

export default function TeamGroupsPanel({ teamId }: { teamId: string }): JSX.Element {
  const t = useT();
  const qc = useQueryClient();

  const { data: rosterMembers = [] } = useQuery({
    queryKey: ['teams', teamId, 'assignees'],
    queryFn: () => listTeamMembersForAssignees(teamId),
  });
  const visibleMembers = visibleTeamMembers(rosterMembers);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [userQuery, setUserQuery] = useState('');
  const [addAccess, setAddAccess] = useState<groupsApi.GroupAccessLevel>('FULL');

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['groups', teamId],
    queryFn: () => groupsApi.listGroups(teamId),
  });

  const { data: teamProjects = [] } = useQuery({
    queryKey: ['projects', teamId],
    queryFn: () => projectsApi.listProjects(teamId),
    enabled: !!selectedId,
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['groups', teamId, selectedId],
    queryFn: () => groupsApi.getGroup(teamId, selectedId!),
    enabled: !!selectedId,
  });

  const { data: searchHits = [] } = useQuery({
    queryKey: ['groups', teamId, 'user-search', userQuery],
    queryFn: () => groupsApi.searchUsers(teamId, userQuery),
    enabled: userQuery.trim().length >= 2,
  });

  const invalidate = async (): Promise<void> => {
    await qc.invalidateQueries({ queryKey: ['groups', teamId] });
    if (selectedId) await qc.invalidateQueries({ queryKey: ['groups', teamId, selectedId] });
  };

  const createMut = useMutation({
    mutationFn: () => groupsApi.createGroup(teamId, { name: newName.trim(), description: newDesc || null }),
    onSuccess: async (g) => {
      setNewName('');
      setNewDesc('');
      setCreateError(null);
      setSelectedId(g.id);
      await invalidate();
    },
    onError: (err) => setCreateError(errorMessage(err, t('groups.createFailed'))),
  });

  const deleteMut = useMutation({
    mutationFn: (groupId: string) => groupsApi.deleteGroup(teamId, groupId),
    onSuccess: async () => {
      setSelectedId(null);
      await invalidate();
    },
  });

  const setProjectsMut = useMutation({
    mutationFn: (projectIds: string[]) => groupsApi.setGroupProjects(teamId, selectedId!, projectIds),
    onSuccess: invalidate,
  });

  return (
    <section className="mt-6 pt-6 border-t">
      <h3 className="font-medium mb-2">{t('groups.title')}</h3>
      <p className="text-xs text-text-muted mb-3">{t('groups.description')}</p>

      <form
        className="flex flex-wrap gap-2 mb-4"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          createMut.mutate();
        }}
      >
        <input
          type="text"
          required
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t('groups.namePlaceholder')}
          className="rounded border px-2 py-1 text-sm bg-surface flex-1 min-w-[10rem]"
        />
        <input
          type="text"
          value={newDesc}
          onChange={(e) => setNewDesc(e.target.value)}
          placeholder={t('groups.descPlaceholder')}
          className="rounded border px-2 py-1 text-sm bg-surface flex-1 min-w-[10rem]"
        />
        <button
          type="submit"
          disabled={createMut.isPending || !newName.trim()}
          className="text-sm bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded px-3 py-1 disabled:opacity-50"
        >
          {t('groups.create')}
        </button>
      </form>
      {createError && <p role="alert" className="text-xs text-danger mb-2">{createError}</p>}

      {isLoading && <p className="text-sm text-slate-500">{t('groups.loading')}</p>}
      {!isLoading && groups.length === 0 && (
        <p className="text-sm text-slate-500">{t('groups.empty')}</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ul className="space-y-1 text-sm">
          {groups.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                onClick={() => setSelectedId(g.id)}
                className={`w-full text-start rounded px-2 py-1 ${
                  selectedId === g.id ? 'bg-slate-900 text-white' : 'hover:bg-bg-elevated'
                }`}
              >
                {g.name}
                <span className="ml-2 text-xs opacity-70">
                  {g.memberCount} · {g.grantedProjectCount}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {selectedId && detail && !detailLoading && (
          <GroupEditor
            teamId={teamId}
            detail={detail}
            teamMembers={visibleMembers}
            projects={teamProjects}
            userQuery={userQuery}
            setUserQuery={setUserQuery}
            searchHits={searchHits}
            addAccess={addAccess}
            setAddAccess={setAddAccess}
            onDelete={() => {
              if (window.confirm(t('groups.confirmDelete'))) deleteMut.mutate(selectedId);
            }}
            onSaveProjects={(ids) => setProjectsMut.mutate(ids)}
            onInvalidate={invalidate}
            deletePending={deleteMut.isPending}
            savePending={setProjectsMut.isPending}
          />
        )}
      </div>
    </section>
  );
}

function GroupEditor({
  teamId,
  detail,
  teamMembers,
  projects,
  userQuery,
  setUserQuery,
  searchHits,
  addAccess,
  setAddAccess,
  onDelete,
  onSaveProjects,
  onInvalidate,
  deletePending,
  savePending,
}: {
  teamId: string;
  detail: groupsApi.UserGroupDetail;
  teamMembers: TeamMember[];
  projects: projectsApi.Project[];
  userQuery: string;
  setUserQuery: (v: string) => void;
  searchHits: groupsApi.UserSearchHit[];
  addAccess: groupsApi.GroupAccessLevel;
  setAddAccess: (v: groupsApi.GroupAccessLevel) => void;
  onDelete: () => void;
  onSaveProjects: (ids: string[]) => void;
  onInvalidate: () => Promise<void>;
  deletePending: boolean;
  savePending: boolean;
}): JSX.Element {
  const t = useT();
  const [projectIds, setProjectIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setProjectIds(new Set(detail.projects.map((p) => p.projectId)));
  }, [detail.id, detail.projects]);

  const memberIds = new Set(detail.members.map((m) => m.userId));
  const teamPickList = teamMembers.filter((m) => !memberIds.has(m.userId));

  return (
    <div className="border rounded p-3 text-sm space-y-3 border-border">
      <div className="flex justify-between items-start gap-2">
        <div>
          <p className="font-medium">{detail.name}</p>
          {detail.description && (
            <p className="text-xs text-slate-500 mt-0.5">{detail.description}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onDelete}
          disabled={deletePending}
          className="text-xs text-danger hover:underline disabled:opacity-50"
        >
          {t('groups.delete')}
        </button>
      </div>

      <div>
        <p className="text-xs font-medium text-slate-500 mb-1">{t('groups.members')}</p>
        <ul className="space-y-1 mb-2">
          {detail.members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-2 text-xs">
              <span>{m.name}</span>
              <span className="text-slate-400">{m.email}</span>
              {m.external && (
                <span className="rounded bg-amber-100 text-amber-900 px-1">{t('groups.external')}</span>
              )}
              {m.status === 'PENDING' && (
                <span className="rounded bg-slate-200 px-1">{t('groups.invite.pending')}</span>
              )}
              {m.status === 'DECLINED' && (
                <span className="rounded bg-red-100 text-red-800 px-1">{t('groups.invite.declined')}</span>
              )}
              <select
                value={m.accessLevel}
                className="rounded border px-1 py-0.5 text-xs bg-surface"
                onChange={(e) => {
                  void groupsApi
                    .updateGroupMemberAccess(
                      teamId,
                      detail.id,
                      m.userId,
                      e.target.value as groupsApi.GroupAccessLevel,
                    )
                    .then(onInvalidate);
                }}
              >
                <option value="FULL">{t('groups.accessLevel.full')}</option>
                <option value="READONLY">{t('groups.accessLevel.readonly')}</option>
              </select>
              <button
                type="button"
                className="text-danger underline"
                onClick={() => {
                  void groupsApi.removeGroupMember(teamId, detail.id, m.userId).then(onInvalidate);
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>

        {teamPickList.length > 0 && (
          <div className="mb-2">
            <p className="text-xs text-slate-500 mb-1">{t('groups.addTeamMember')}</p>
            <div className="flex flex-wrap gap-1">
              {teamPickList.map((m) => (
                <button
                  key={m.userId}
                  type="button"
                  className="text-xs border rounded px-2 py-0.5 hover:bg-bg-elevated"
                  onClick={() => {
                    void groupsApi
                      .addGroupMember(teamId, detail.id, m.userId, addAccess)
                      .then(onInvalidate);
                  }}
                >
                  + {m.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="text-xs text-slate-500 mb-1">{t('groups.searchUsers')}</p>
          <input
            type="search"
            value={userQuery}
            onChange={(e) => setUserQuery(e.target.value)}
            placeholder={t('groups.searchUsersPlaceholder')}
            className="w-full rounded border px-2 py-1 text-xs bg-surface mb-1"
          />
          <select
            value={addAccess}
            onChange={(e) => setAddAccess(e.target.value as groupsApi.GroupAccessLevel)}
            className="rounded border px-1 py-0.5 text-xs bg-surface mb-1"
          >
            <option value="FULL">{t('groups.accessLevel.full')}</option>
            <option value="READONLY">{t('groups.accessLevel.readonly')}</option>
          </select>
          <ul className="max-h-24 overflow-y-auto space-y-1">
            {searchHits
              .filter((u) => !memberIds.has(u.id))
              .map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    className="text-xs w-full text-start hover:underline"
                    onClick={() => {
                      void groupsApi
                        .addGroupMember(teamId, detail.id, u.id, addAccess)
                        .then(onInvalidate);
                      setUserQuery('');
                    }}
                  >
                    {u.name} ({u.email})
                  </button>
                </li>
              ))}
          </ul>
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-slate-500 mb-1">{t('groups.grantedProjects')}</p>
        <ul className="max-h-32 overflow-y-auto space-y-1">
          {projects.map((p) => (
            <li key={p.id}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={projectIds.has(p.id)}
                  onChange={(e) => {
                    setProjectIds((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(p.id);
                      else next.delete(p.id);
                      return next;
                    });
                  }}
                />
                <span>{p.name}</span>
              </label>
            </li>
          ))}
        </ul>
        <button
          type="button"
          disabled={savePending}
          onClick={() => onSaveProjects([...projectIds])}
          className="mt-2 text-xs underline disabled:opacity-50"
        >
          {t('groups.saveProjects')}
        </button>
      </div>
    </div>
  );
}
