import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useProjectTeam } from '@/features/projects/useProjectTeam';
import { getMyDelegateStatus } from '@/features/projects/api';
import { useAuth } from '@/features/auth/AuthContext';
import { CorrespondenceRegister } from '@/features/correspondence/CorrespondenceRegister';
import { ContactsPanel } from '@/features/contacts/ContactsPanel';
import { useT } from '@/lib/i18n';

interface RouteParams extends Record<string, string | undefined> {
  projectId: string;
}

type Tab = 'letters' | 'contacts';

export default function CorrespondencePage(): JSX.Element {
  const { projectId } = useParams<RouteParams>();
  const t = useT();
  const { user } = useAuth();
  const { teamId, project, projectTeam, loading } = useProjectTeam(projectId);
  const [tab, setTab] = useState<Tab>('letters');

  const { data: delegate } = useQuery({
    queryKey: ['projects', teamId, projectId, 'delegate', 'me'],
    queryFn: () => getMyDelegateStatus(teamId!, projectId!),
    enabled: !!teamId && !!projectId,
  });

  if (loading) {
    return <div className="p-8 text-sm text-text-muted">{t('common.loading')}</div>;
  }

  // The module is enabled per project by a global admin. If the project is
  // found but the flag is off, treat it as not-available (the API would 404
  // anyway). correspondenceEnabled may be undefined on older responses; only
  // block when it's explicitly false.
  if (!teamId || !project || project.correspondenceEnabled === false) {
    return (
      <div className="p-8">
        <Link to="/projects" className="text-sm underline">
          ← {t('nav.projects')}
        </Link>
        <p className="mt-4 text-sm text-slate-500">{t('correspondence.notFound')}</p>
      </div>
    );
  }

  // Write access: project owner / manager / global admin / delegate.
  const isManager = projectTeam?.myRole === 'MANAGER';
  const isAdmin = user?.globalRole === 'ADMIN';
  const isOwner = project.ownerId === user?.id;
  const canManage = isAdmin || isManager || isOwner || (delegate?.isDelegate ?? false);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6 gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold truncate">{t('correspondence.title')}</h1>
          <p className="text-sm text-slate-500">
            {project.name}
            {project.teamName ? (
              <>
                {' · '}
                <span className="font-medium">{project.teamName}</span>
              </>
            ) : null}
          </p>
        </div>
        <Link to="/projects" className="text-sm underline whitespace-nowrap">
          ← {t('nav.projects')}
        </Link>
      </div>

      <div className="mb-6 inline-flex rounded border border-border overflow-hidden" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'letters'}
          onClick={() => setTab('letters')}
          className={`px-4 py-1.5 text-sm ${
            tab === 'letters'
              ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
              : 'bg-surface text-text hover:bg-bg-elevated'
          }`}
        >
          {t('correspondence.tab.letters')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'contacts'}
          onClick={() => setTab('contacts')}
          className={`px-4 py-1.5 text-sm border-s border-border ${
            tab === 'contacts'
              ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
              : 'bg-surface text-text hover:bg-bg-elevated'
          }`}
        >
          {t('correspondence.tab.contacts')}
        </button>
      </div>

      <section className="bg-surface rounded shadow p-6">
        {tab === 'letters' ? (
          <CorrespondenceRegister teamId={teamId} projectId={projectId!} canManage={canManage} />
        ) : (
          <ContactsPanel teamId={teamId} canManage={canManage} />
        )}
      </section>
    </div>
  );
}
