import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as groupsApi from '@/features/groups/api';
import { useT } from '@/lib/i18n';

/** Pending group invites — shown in the notifications dropdown. */
export default function GroupInvitesPanel(): JSX.Element | null {
  const t = useT();
  const qc = useQueryClient();

  const { data: invites = [] } = useQuery({
    queryKey: ['group-invites'],
    queryFn: groupsApi.listGroupInvites,
    refetchInterval: 60_000,
  });

  const acceptMut = useMutation({
    mutationFn: groupsApi.acceptGroupInvite,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['group-invites'] });
      void qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const declineMut = useMutation({
    mutationFn: groupsApi.declineGroupInvite,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['group-invites'] }),
  });

  if (!invites.length) return null;

  return (
    <div className="border-b border-slate-200 dark:border-slate-600 px-3 py-2 bg-amber-50 dark:bg-amber-950/30">
      <p className="text-xs font-medium mb-2">{t('groups.invites.title')}</p>
      <ul className="space-y-2">
        {invites.map((inv) => (
          <li key={inv.id} className="text-xs">
            <p>
              <strong>{inv.groupName}</strong> · {inv.teamName}
              <span className="text-slate-500 ml-1">
                ({inv.accessLevel === 'FULL' ? t('groups.accessLevel.full') : t('groups.accessLevel.readonly')})
              </span>
            </p>
            <div className="flex gap-2 mt-1">
              <button
                type="button"
                disabled={acceptMut.isPending}
                className="underline text-green-700"
                onClick={() => acceptMut.mutate(inv.id)}
              >
                {t('groups.invite.accept')}
              </button>
              <button
                type="button"
                disabled={declineMut.isPending}
                className="underline text-red-700"
                onClick={() => declineMut.mutate(inv.id)}
              >
                {t('groups.invite.decline')}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
