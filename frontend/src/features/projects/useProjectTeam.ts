import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTeams } from '@/features/teams/TeamsContext';
import { listAllProjects, type ProjectCrossTeam } from './api';
import type { Team } from '@/features/teams/api';

// Resolve a project's owning team from the cross-team project list (v1.40).
// Project-scoped routes (/projects/:projectId/...) carry no :teamId in the
// URL, so pages must NOT rely on TeamsContext.currentTeam — the user may
// have navigated from the cross-team Projects list while another team is
// selected in the sidebar.
export function useProjectTeam(projectId: string | undefined): {
  teamId: string | null;
  project: ProjectCrossTeam | null;
  projectTeam: Team | null;
  loading: boolean;
} {
  const { teams } = useTeams();

  const { data: allProjects, isLoading } = useQuery({
    queryKey: ['projects', 'all'],
    queryFn: listAllProjects,
    enabled: !!projectId,
  });

  const project = useMemo(
    () => allProjects?.find((p) => p.id === projectId) ?? null,
    [allProjects, projectId],
  );
  const teamId = project?.teamId ?? null;
  const projectTeam = useMemo(
    () => teams.find((t) => t.id === teamId) ?? null,
    [teams, teamId],
  );

  return { teamId, project, projectTeam, loading: isLoading };
}
