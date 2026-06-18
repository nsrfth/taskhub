import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import * as projectsApi from '@/features/projects/api';
import { useT } from '@/lib/i18n';

export default function PlannerBoardPage(): JSX.Element {
  const t = useT();
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects', 'all'],
    queryFn: projectsApi.listAllProjects,
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-2">{t('planner.board.title')}</h1>
      <p className="text-sm text-slate-500 mb-6">{t('planner.board.hint')}</p>
      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      <ul className="space-y-2">
        {projects.map((p) => (
          <li key={p.id}>
            <Link
              to={`/projects/${p.id}/tasks`}
              className="flex items-center justify-between bg-surface rounded shadow px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <span className="font-medium">{p.name}</span>
              <span className="text-xs text-slate-500">{p.teamName}</span>
            </Link>
          </li>
        ))}
      </ul>
      {projects.length === 0 && !isLoading && (
        <p className="text-sm text-slate-500">
          <Link to="/projects" className="underline">
            Create a project
          </Link>{' '}
          to open a board.
        </p>
      )}
    </div>
  );
}
