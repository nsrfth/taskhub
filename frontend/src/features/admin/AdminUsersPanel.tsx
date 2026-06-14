import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useAuth } from '@/features/auth/AuthContext';
import * as adminApi from '@/features/admin/api';
import { listDirectories } from '@/features/directories/api';
import { formatShamsiTimestampDate } from '@/lib/shamsi';
import { useT } from '@/lib/i18n';

function errorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const msg = err.response?.data?.error?.message;
    if (typeof msg === 'string' && msg.length) return msg;
  }
  return fallback;
}

function authSourceLabel(source: adminApi.AuthSource): string {
  switch (source) {
    case 'LDAP':
      return 'LDAP';
    case 'SCIM':
      return 'SCIM';
    default:
      return 'Local';
  }
}

function authSourceBadgeClass(source: adminApi.AuthSource): string {
  switch (source) {
    case 'LDAP':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200';
    case 'SCIM':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200';
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200';
  }
}

function isUserDisabled(u: adminApi.AdminUser): boolean {
  return u.disabledAt != null;
}

function isUserLocked(u: adminApi.AdminUser): boolean {
  if (!u.lockedUntil) return false;
  return new Date(u.lockedUntil) > new Date();
}

function directoryLabel(u: adminApi.AdminUser): string {
  if (u.directoryName) return u.directoryName;
  if (u.authSource === 'LDAP') return 'LDAP';
  if (u.authSource === 'SCIM') return 'SCIM';
  return 'directory';
}

function isDirectoryOwned(u: adminApi.AdminUser): boolean {
  return u.authSource !== 'LOCAL' || u.directoryId != null;
}

const DEFAULT_PAGE_SIZE = 25;

export default function AdminUsersPanel(): JSX.Element {
  const { user } = useAuth();
  const qc = useQueryClient();
  const t = useT();

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(DEFAULT_PAGE_SIZE);
  const [roleFilter, setRoleFilter] = useState<adminApi.GlobalRole | ''>('');
  const [authFilter, setAuthFilter] = useState<adminApi.AuthSource | ''>('');
  const [statusFilter, setStatusFilter] = useState<adminApi.UserStatusFilter | ''>('');
  const [directoryFilter, setDirectoryFilter] = useState('');
  const [sortBy, setSortBy] = useState<adminApi.UserSortBy>('createdAt');
  const [sortDir, setSortDir] = useState<adminApi.SortDir>('asc');
  const [jumpPage, setJumpPage] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [search, roleFilter, authFilter, statusFilter, directoryFilter, sortBy, sortDir]);

  const listParams: adminApi.ListUsersParams = {
    page,
    pageSize,
    search: search || undefined,
    role: roleFilter || undefined,
    authSource: authFilter || undefined,
    status: statusFilter || undefined,
    directoryId: directoryFilter || undefined,
    sortBy,
    sortDir,
  };

  const { data: usersPage, isLoading, isFetching } = useQuery({
    queryKey: ['admin', 'users', listParams],
    queryFn: () => adminApi.listUsers(listParams),
  });

  const { data: directoriesData } = useQuery({
    queryKey: ['directories'],
    queryFn: listDirectories,
  });

  const users = usersPage?.items ?? [];
  const totalPages = usersPage?.totalPages ?? 0;
  const totalItems = usersPage?.totalItems ?? 0;
  const currentPage = usersPage?.page ?? page;

  function invalidateUsers(): void {
    void qc.invalidateQueries({ queryKey: ['admin', 'users'] });
  }

  function patchUserInList(updated: adminApi.AdminUser): void {
    qc.setQueriesData<adminApi.PagedResult<adminApi.AdminUser>>(
      { queryKey: ['admin', 'users'] },
      (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.map((row) => (row.id === updated.id ? updated : row)),
        };
      },
    );
  }

  function toggleSort(column: adminApi.UserSortBy): void {
    if (sortBy === column) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortDir('asc');
    }
  }

  function sortIndicator(column: adminApi.UserSortBy): string {
    if (sortBy !== column) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  }

  function submitJumpPage(e: FormEvent): void {
    e.preventDefault();
    const n = Number.parseInt(jumpPage, 10);
    if (!Number.isFinite(n) || n < 1) return;
    setPage(Math.min(n, Math.max(1, totalPages)));
    setJumpPage('');
  }

  const updateRoleMut = useMutation({
    mutationFn: (input: { userId: string; role: adminApi.GlobalRole }) =>
      adminApi.updateUserRole(input.userId, input.role),
    onSuccess: () => invalidateUsers(),
    onError: (err) => window.alert(errorMessage(err, t('admin.users.errorRole'))),
  });
  const [roleUpdatingId, setRoleUpdatingId] = useState<string | null>(null);

  function changeUserRole(u: adminApi.AdminUser, role: adminApi.GlobalRole): void {
    if (role === u.globalRole) return;
    if (!window.confirm(`${u.email} → ${role}?`)) return;
    setRoleUpdatingId(u.id);
    updateRoleMut.mutate(
      { userId: u.id, role },
      { onSettled: () => setRoleUpdatingId(null) },
    );
  }

  const deleteUserMut = useMutation({
    mutationFn: (userId: string) => adminApi.deleteUser(userId),
    onSuccess: () => invalidateUsers(),
    onError: (err) => window.alert(errorMessage(err, t('admin.users.errorDelete'))),
  });

  const [ldapPanelUserId, setLdapPanelUserId] = useState<string | null>(null);
  const [ldapTestPassword, setLdapTestPassword] = useState('');
  const [ldapActionMsg, setLdapActionMsg] = useState<string | null>(null);
  const [ldapActionErr, setLdapActionErr] = useState<string | null>(null);

  const refreshLdapMut = useMutation({
    mutationFn: (userId: string) => adminApi.refreshLdapUser(userId),
    onSuccess: () => {
      setLdapActionMsg(t('admin.users.ldapRefreshed'));
      setLdapActionErr(null);
      invalidateUsers();
    },
    onError: (err) => setLdapActionErr(errorMessage(err, t('admin.users.ldapRefreshError'))),
  });

  const testLdapMut = useMutation({
    mutationFn: (input: { userId: string; password: string }) =>
      adminApi.testLdapUserAuth(input.userId, input.password),
    onSuccess: () => {
      setLdapActionMsg(t('admin.users.ldapTestOk'));
      setLdapActionErr(null);
      setLdapTestPassword('');
    },
    onError: (err) => setLdapActionErr(errorMessage(err, t('admin.users.ldapTestError'))),
  });

  const [resetTarget, setResetTarget] = useState<adminApi.AdminUser | null>(null);
  const [resetCustom, setResetCustom] = useState('');
  const [resetResult, setResetResult] = useState<adminApi.ResetPasswordResult | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  const resetPasswordMut = useMutation({
    mutationFn: () => adminApi.resetUserPassword(resetTarget!.id, resetCustom || undefined),
    onSuccess: (r) => {
      setResetResult(r);
      setResetError(null);
      setResetCustom('');
    },
    onError: (err) => setResetError(errorMessage(err, t('admin.resetPassword.error'))),
  });

  function openReset(u: adminApi.AdminUser): void {
    setResetTarget(u);
    setResetResult(null);
    setResetError(null);
    setResetCustom('');
  }
  function closeReset(): void {
    setResetTarget(null);
    setResetResult(null);
    setResetError(null);
    setResetCustom('');
  }

  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  const [profileTarget, setProfileTarget] = useState<adminApi.AdminUser | null>(null);
  const [profileForm, setProfileForm] = useState({
    name: '',
    email: '',
    department: '',
    jobTitle: '',
  });
  const [profileError, setProfileError] = useState<string | null>(null);
  const [lifecycleBusy, setLifecycleBusy] = useState<string | null>(null);

  const disableMut = useMutation({
    mutationFn: (input: { userId: string; disabled: boolean }) =>
      adminApi.setUserDisabled(input.userId, input.disabled),
    onSuccess: (updated) => {
      patchUserInList(updated);
      invalidateUsers();
    },
    onError: (err) => window.alert(errorMessage(err, t('admin.users.errorLifecycle'))),
  });

  const unlockMut = useMutation({
    mutationFn: (userId: string) => adminApi.unlockUser(userId),
    onSuccess: (updated) => {
      patchUserInList(updated);
      invalidateUsers();
    },
    onError: (err) => window.alert(errorMessage(err, t('admin.users.errorLifecycle'))),
  });

  const forceLogoutMut = useMutation({
    mutationFn: (userId: string) => adminApi.forceLogoutUser(userId),
    onSuccess: (updated) => {
      patchUserInList(updated);
      invalidateUsers();
    },
    onError: (err) => window.alert(errorMessage(err, t('admin.users.errorLifecycle'))),
  });

  const profileMut = useMutation({
    mutationFn: () =>
      adminApi.updateUserProfile(profileTarget!.id, {
        name: profileForm.name,
        email: profileForm.email,
        department: profileForm.department || null,
        jobTitle: profileForm.jobTitle || null,
      }),
    onSuccess: (updated) => {
      patchUserInList(updated);
      invalidateUsers();
      setProfileTarget(null);
      setProfileError(null);
    },
    onError: (err) => setProfileError(errorMessage(err, t('admin.users.errorProfile'))),
  });

  function openProfile(u: adminApi.AdminUser): void {
    setProfileTarget(u);
    setProfileForm({
      name: u.name,
      email: u.email,
      department: u.department ?? '',
      jobTitle: u.jobTitle ?? '',
    });
    setProfileError(null);
  }

  function toggleDisabled(u: adminApi.AdminUser): void {
    const disabling = !isUserDisabled(u);
    const msg = disabling
      ? t('admin.users.confirm.disable').replace('{email}', u.email)
      : undefined;
    if (disabling && !window.confirm(msg)) return;
    setLifecycleBusy(u.id);
    disableMut.mutate(
      { userId: u.id, disabled: disabling },
      { onSettled: () => setLifecycleBusy(null) },
    );
  }

  function runForceLogout(u: adminApi.AdminUser): void {
    if (!window.confirm(t('admin.users.confirm.forceLogout').replace('{email}', u.email))) return;
    setLifecycleBusy(u.id);
    forceLogoutMut.mutate(u.id, { onSettled: () => setLifecycleBusy(null) });
  }

  function runUnlock(u: adminApi.AdminUser): void {
    setLifecycleBusy(u.id);
    unlockMut.mutate(u.id, { onSettled: () => setLifecycleBusy(null) });
  }

  const detailUser = detailUserId ? users.find((row) => row.id === detailUserId) : null;

  return (
    <section className="bg-white dark:bg-slate-800 rounded shadow p-4 mb-6">
      <h2 className="font-medium mb-3">{t('admin.users.title')}</h2>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{t('admin.users.intro')}</p>

      <div className="flex flex-wrap gap-2 mb-3">
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t('admin.users.search')}
          className="flex-1 min-w-[12rem] rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-700 px-2 py-1 text-sm"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as adminApi.GlobalRole | '')}
          className="rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-700 px-2 py-1 text-sm"
          aria-label={t('admin.users.filter.role')}
        >
          <option value="">{t('admin.users.filter.roleAll')}</option>
          <option value="ADMIN">{t('admin.users.filter.roleAdmin')}</option>
          <option value="MEMBER">{t('admin.users.filter.roleMember')}</option>
        </select>
        <select
          value={authFilter}
          onChange={(e) => setAuthFilter(e.target.value as adminApi.AuthSource | '')}
          className="rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-700 px-2 py-1 text-sm"
          aria-label={t('admin.users.filter.authSource')}
        >
          <option value="">{t('admin.users.filter.authAll')}</option>
          <option value="LOCAL">{t('admin.users.filter.authLocal')}</option>
          <option value="LDAP">LDAP</option>
          <option value="SCIM">SCIM</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as adminApi.UserStatusFilter | '')}
          className="rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-700 px-2 py-1 text-sm"
          aria-label={t('admin.users.filter.status')}
        >
          <option value="">{t('admin.users.filter.statusAll')}</option>
          <option value="active">{t('admin.users.filter.status.active')}</option>
          <option value="disabled">{t('admin.users.filter.status.disabled')}</option>
          <option value="locked">{t('admin.users.filter.status.locked')}</option>
        </select>
        <select
          value={directoryFilter}
          onChange={(e) => setDirectoryFilter(e.target.value)}
          className="rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-700 px-2 py-1 text-sm min-w-[8rem]"
          aria-label={t('admin.users.filter.directory')}
        >
          <option value="">{t('admin.users.filter.directoryAll')}</option>
          {(directoriesData?.items ?? []).map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p className="text-sm text-slate-500">{t('admin.users.loading')}</p>}
      {!isLoading && users.length === 0 && (
        <p className="text-sm text-slate-500 italic">{t('admin.users.empty')}</p>
      )}

      {users.length > 0 && (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500 uppercase">
            <tr>
              <th className="py-1 pr-4">
                <button type="button" onClick={() => toggleSort('name')} className="hover:underline">
                  {t('admin.users.col.name')}
                  {sortIndicator('name')}
                </button>
              </th>
              <th className="py-1 pr-4">
                <button type="button" onClick={() => toggleSort('email')} className="hover:underline">
                  {t('admin.users.col.email')}
                  {sortIndicator('email')}
                </button>
              </th>
              <th className="py-1 pr-4">{t('admin.users.col.auth')}</th>
              <th className="py-1 pr-4">{t('admin.users.col.status')}</th>
              <th className="py-1 pr-4">{t('admin.users.col.ldapUser')}</th>
              <th className="py-1 pr-4">{t('admin.users.col.role')}</th>
              <th className="py-1 pr-4">{t('admin.users.col.teams')}</th>
              <th className="py-1 pr-4">
                <button type="button" onClick={() => toggleSort('createdAt')} className="hover:underline">
                  {t('admin.users.col.joined')}
                  {sortIndicator('createdAt')}
                </button>
              </th>
              <th className="py-1 pr-4">
                <button type="button" onClick={() => toggleSort('lastSynced')} className="hover:underline">
                  {t('admin.users.col.lastSynced')}
                  {sortIndicator('lastSynced')}
                </button>
              </th>
              <th className="py-1">{t('admin.users.col.action')}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSelf = u.id === user?.id;
              const roleBusy = roleUpdatingId === u.id && updateRoleMut.isPending;
              const lifecyclePending = lifecycleBusy === u.id;
              const disabled = isUserDisabled(u);
              const locked = isUserLocked(u);
              return (
                <tr key={u.id} className="border-t dark:border-slate-700">
                  <td className="py-2 pr-4">{u.name}</td>
                  <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">{u.email}</td>
                  <td className="py-2 pr-4">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${authSourceBadgeClass(u.authSource)}`}>
                      {authSourceLabel(u.authSource)}
                    </span>
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex flex-wrap gap-1">
                      {disabled && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200">
                          {t('admin.users.badge.disabled')}
                        </span>
                      )}
                      {locked && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                          {t('admin.users.badge.locked')}
                        </span>
                      )}
                      {!disabled && !locked && (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </div>
                  </td>
                  <td className="py-2 pr-4 text-slate-500 font-mono text-xs">{u.ldapUsername ?? '—'}</td>
                  <td className="py-2 pr-4">
                    {isSelf ? (
                      <span className="text-xs uppercase tracking-wide text-slate-500">{u.globalRole}</span>
                    ) : (
                      <select
                        value={u.globalRole}
                        disabled={roleBusy}
                        onChange={(e) => changeUserRole(u, e.target.value as adminApi.GlobalRole)}
                        className="rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-700 px-2 py-1 text-xs uppercase disabled:opacity-50"
                      >
                        <option value="MEMBER">Member</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-slate-500">{u.membershipCount}</td>
                  <td className="py-2 pr-4 text-slate-500 text-xs" dir="rtl">
                    {formatShamsiTimestampDate(u.createdAt)}
                  </td>
                  <td className="py-2 pr-4 text-slate-500 text-xs" dir="rtl">
                    {u.ldapSyncedAt ? formatShamsiTimestampDate(u.ldapSyncedAt) : '—'}
                  </td>
                  <td className="py-2">
                    <button
                      type="button"
                      disabled={lifecyclePending}
                      onClick={() => setDetailUserId(detailUserId === u.id ? null : u.id)}
                      className="text-xs underline mr-3 disabled:opacity-40"
                    >
                      {t('admin.users.action.manage')}
                    </button>
                    <button
                      disabled={u.authSource !== 'LOCAL'}
                      onClick={() => openReset(u)}
                      className="text-xs underline disabled:opacity-40 mr-3"
                    >
                      {t('admin.resetPassword.button')}
                    </button>
                    {u.authSource === 'LDAP' && (
                      <button
                        type="button"
                        onClick={() => {
                          setLdapPanelUserId(ldapPanelUserId === u.id ? null : u.id);
                          setLdapActionMsg(null);
                          setLdapActionErr(null);
                          setLdapTestPassword('');
                        }}
                        className="text-xs underline mr-3"
                      >
                        LDAP
                      </button>
                    )}
                    <button
                      disabled={isSelf || deleteUserMut.isPending}
                      onClick={() => {
                        if (window.confirm(t('admin.users.confirmDelete').replace('{email}', u.email))) {
                          deleteUserMut.mutate(u.id);
                        }
                      }}
                      className="text-xs text-red-600 hover:underline disabled:opacity-40"
                    >
                      {t('admin.users.delete')}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {totalPages > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
          <span>
            {t('admin.users.pagination.pageOf')
              .replace('{page}', String(currentPage))
              .replace('{totalPages}', String(totalPages))}
          </span>
          <span className="text-xs text-slate-500">
            {t('admin.users.pagination.total').replace('{count}', String(totalItems))}
          </span>
          <button
            type="button"
            disabled={currentPage <= 1 || isFetching}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="text-xs underline disabled:opacity-40"
          >
            {t('admin.users.pagination.prev')}
          </button>
          <button
            type="button"
            disabled={currentPage >= totalPages || isFetching}
            onClick={() => setPage((p) => p + 1)}
            className="text-xs underline disabled:opacity-40"
          >
            {t('admin.users.pagination.next')}
          </button>
          <form onSubmit={submitJumpPage} className="flex items-center gap-1 text-xs">
            <label htmlFor="admin-users-jump">{t('admin.users.pagination.jump')}</label>
            <input
              id="admin-users-jump"
              type="number"
              min={1}
              max={totalPages}
              value={jumpPage}
              onChange={(e) => setJumpPage(e.target.value)}
              className="w-14 rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-700 px-1 py-0.5"
            />
            <button type="submit" className="underline" disabled={isFetching}>
              {t('admin.users.pagination.go')}
            </button>
          </form>
        </div>
      )}

      {detailUser && (
        <div className="mt-4 rounded border border-slate-200 dark:border-slate-600 p-3 text-sm bg-slate-50/50 dark:bg-slate-900/20">
          <p className="font-medium mb-2">
            {t('admin.users.detail.title').replace('{email}', detailUser.email)}
          </p>
          <div className="grid gap-2 sm:grid-cols-2 mb-3 text-xs text-slate-600 dark:text-slate-300">
            <div>
              <span className="text-slate-500">{t('admin.users.profile.name')}: </span>
              {detailUser.name}
            </div>
            <div>
              <span className="text-slate-500">{t('admin.users.profile.department')}: </span>
              {detailUser.department ?? '—'}
            </div>
            <div>
              <span className="text-slate-500">{t('admin.users.profile.jobTitle')}: </span>
              {detailUser.jobTitle ?? '—'}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(() => {
              const isSelf = detailUser.id === user?.id;
              const disabled = isUserDisabled(detailUser);
              const locked = isUserLocked(detailUser);
              const busy = lifecycleBusy === detailUser.id;
              const disableTitle = isSelf ? t('admin.users.selfActionTooltip') : undefined;
              return (
                <>
                  <button
                    type="button"
                    disabled={busy || (isSelf && !disabled)}
                    title={isSelf && !disabled ? disableTitle : undefined}
                    onClick={() => toggleDisabled(detailUser)}
                    className="text-xs rounded border px-2 py-1 disabled:opacity-40"
                  >
                    {disabled ? t('admin.users.action.enable') : t('admin.users.action.disable')}
                  </button>
                  <button
                    type="button"
                    disabled={busy || !locked}
                    onClick={() => runUnlock(detailUser)}
                    className="text-xs rounded border px-2 py-1 disabled:opacity-40"
                  >
                    {t('admin.users.action.unlock')}
                  </button>
                  <button
                    type="button"
                    disabled={busy || isSelf}
                    title={isSelf ? t('admin.users.selfActionTooltip') : undefined}
                    onClick={() => runForceLogout(detailUser)}
                    className="text-xs rounded border px-2 py-1 disabled:opacity-40"
                  >
                    {t('admin.users.action.forceLogout')}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => openProfile(detailUser)}
                    className="text-xs rounded border px-2 py-1 disabled:opacity-40"
                  >
                    {t('admin.users.action.editProfile')}
                  </button>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {profileTarget && (
        <div className="mt-4 rounded border p-3 text-sm bg-slate-50 dark:bg-slate-800/40">
          <p className="font-medium mb-2">
            {t('admin.users.profile.title').replace('{email}', profileTarget.email)}
          </p>
          {isDirectoryOwned(profileTarget) ? (
            <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
              <p title={t('admin.users.directoryManaged').replace('{directory}', directoryLabel(profileTarget))}>
                {t('admin.users.profile.name')}: {profileTarget.name}
              </p>
              <p>{t('admin.users.profile.email')}: {profileTarget.email}</p>
              <p>{t('admin.users.profile.department')}: {profileTarget.department ?? '—'}</p>
              <p>{t('admin.users.profile.jobTitle')}: {profileTarget.jobTitle ?? '—'}</p>
              <p className="text-slate-500 italic">
                {t('admin.users.directoryManaged').replace('{directory}', directoryLabel(profileTarget))}
              </p>
              <button type="button" onClick={() => setProfileTarget(null)} className="text-xs underline">
                {t('admin.users.profile.cancel')}
              </button>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                profileMut.mutate();
              }}
              className="grid gap-2 sm:grid-cols-2"
            >
              <label className="text-xs">
                {t('admin.users.profile.name')}
                <input
                  value={profileForm.name}
                  onChange={(e) => setProfileForm((f) => ({ ...f, name: e.target.value }))}
                  className="mt-0.5 block w-full rounded border px-2 py-1 dark:bg-slate-700"
                  required
                />
              </label>
              <label className="text-xs">
                {t('admin.users.profile.email')}
                <input
                  type="email"
                  value={profileForm.email}
                  onChange={(e) => setProfileForm((f) => ({ ...f, email: e.target.value }))}
                  className="mt-0.5 block w-full rounded border px-2 py-1 dark:bg-slate-700"
                  required
                />
              </label>
              <label className="text-xs">
                {t('admin.users.profile.department')}
                <input
                  value={profileForm.department}
                  onChange={(e) => setProfileForm((f) => ({ ...f, department: e.target.value }))}
                  className="mt-0.5 block w-full rounded border px-2 py-1 dark:bg-slate-700"
                />
              </label>
              <label className="text-xs">
                {t('admin.users.profile.jobTitle')}
                <input
                  value={profileForm.jobTitle}
                  onChange={(e) => setProfileForm((f) => ({ ...f, jobTitle: e.target.value }))}
                  className="mt-0.5 block w-full rounded border px-2 py-1 dark:bg-slate-700"
                />
              </label>
              <div className="sm:col-span-2 flex flex-wrap gap-2 items-center">
                <button
                  type="submit"
                  disabled={profileMut.isPending}
                  className="rounded bg-slate-900 text-white px-3 py-1 text-sm disabled:opacity-50"
                >
                  {t('admin.users.profile.save')}
                </button>
                <button type="button" onClick={() => setProfileTarget(null)} className="text-xs underline">
                  {t('admin.users.profile.cancel')}
                </button>
                {profileError && <p className="basis-full text-xs text-red-600">{profileError}</p>}
              </div>
            </form>
          )}
        </div>
      )}

      {ldapPanelUserId && (() => {
        const u = users.find((row) => row.id === ldapPanelUserId);
        if (!u || u.authSource !== 'LDAP') return null;
        return (
          <div className="mt-4 rounded border border-blue-200 dark:border-blue-800 p-3 text-sm bg-blue-50/50 dark:bg-blue-900/10">
            <p className="font-medium mb-2">LDAP — {u.email}</p>
            <button
              type="button"
              disabled={refreshLdapMut.isPending}
              onClick={() => refreshLdapMut.mutate(u.id)}
              className="text-xs rounded border px-2 py-1 mb-2"
            >
              {refreshLdapMut.isPending ? '…' : t('admin.users.ldapRefresh')}
            </button>
            <form
              className="flex flex-wrap gap-2 items-center"
              onSubmit={(e) => {
                e.preventDefault();
                if (!ldapTestPassword) return;
                testLdapMut.mutate({ userId: u.id, password: ldapTestPassword });
              }}
            >
              <input
                type="password"
                value={ldapTestPassword}
                onChange={(e) => setLdapTestPassword(e.target.value)}
                placeholder={t('admin.users.ldapTestPlaceholder')}
                className="flex-1 min-w-[12rem] rounded border px-2 py-1 text-xs font-mono dark:bg-slate-700"
              />
              <button type="submit" disabled={testLdapMut.isPending || !ldapTestPassword} className="text-xs rounded bg-slate-800 text-white px-2 py-1 disabled:opacity-50">
                {testLdapMut.isPending ? '…' : t('admin.users.ldapTest')}
              </button>
            </form>
            {ldapActionMsg && <p className="text-xs text-emerald-700 mt-2">{ldapActionMsg}</p>}
            {ldapActionErr && <p className="text-xs text-red-600 mt-2">{ldapActionErr}</p>}
          </div>
        );
      })()}

      {resetTarget && (
        <div className="mt-4 rounded border p-3 text-sm bg-slate-50 dark:bg-slate-800/40">
          <p className="font-medium mb-2">
            {t('admin.resetPassword.title').replace('{email}', resetTarget.email)}
          </p>
          {resetResult ? (
            <div>
              {resetResult.generatedPassword ? (
                <code className="block select-all font-mono">{resetResult.generatedPassword}</code>
              ) : (
                <p className="text-emerald-700">{t('admin.resetPassword.successCustom')}</p>
              )}
              <button type="button" onClick={closeReset} className="text-xs underline mt-2">
                {t('admin.resetPassword.cancel')}
              </button>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                resetPasswordMut.mutate();
              }}
              className="flex flex-wrap gap-2"
            >
              <input
                type="text"
                value={resetCustom}
                onChange={(e) => setResetCustom(e.target.value)}
                placeholder={t('admin.resetPassword.label')}
                className="flex-1 rounded border px-2 py-1 text-sm font-mono dark:bg-slate-700"
              />
              <button type="submit" disabled={resetPasswordMut.isPending} className="rounded bg-slate-900 text-white px-3 py-1 text-sm disabled:opacity-50">
                {t('admin.resetPassword.submit')}
              </button>
              <button type="button" onClick={closeReset} className="text-xs underline">
                {t('admin.resetPassword.cancel')}
              </button>
              {resetError && <p className="basis-full text-xs text-red-600">{resetError}</p>}
            </form>
          )}
        </div>
      )}
    </section>
  );
}

export function useInvalidateAdminUsers(): () => void {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ['admin', 'users'] });
}
