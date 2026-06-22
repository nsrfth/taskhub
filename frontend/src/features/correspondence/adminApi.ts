import { api } from '@/lib/api';

// v1.89: global-admin per-project enablement of the correspondence module.

export interface CorrespondenceProjectRow {
  projectId: string;
  projectName: string;
  teamId: string;
  teamName: string;
  correspondenceEnabled: boolean;
}

export async function listCorrespondenceProjects(): Promise<CorrespondenceProjectRow[]> {
  return (await api.get<CorrespondenceProjectRow[]>('/admin/correspondence/projects')).data;
}

export async function setCorrespondenceEnabled(
  projectId: string,
  enabled: boolean,
): Promise<void> {
  await api.patch(`/admin/correspondence/projects/${projectId}`, { enabled });
}
