import { api } from '@/lib/api';

export interface ProjectBucket {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  projectIds: string[];
}

export async function fetchProjectBuckets(): Promise<ProjectBucket[]> {
  return (await api.get<{ buckets: ProjectBucket[] }>('/me/project-buckets')).data.buckets;
}

export async function createProjectBucket(input: {
  name: string;
  description?: string | null;
  color?: string | null;
}): Promise<ProjectBucket> {
  return (await api.post<ProjectBucket>('/me/project-buckets', input)).data;
}

export async function updateProjectBucket(
  bucketId: string,
  input: { name?: string; description?: string | null; color?: string | null },
): Promise<ProjectBucket> {
  return (await api.patch<ProjectBucket>(`/me/project-buckets/${bucketId}`, input)).data;
}

export async function deleteProjectBucket(bucketId: string): Promise<void> {
  await api.delete(`/me/project-buckets/${bucketId}`);
}

export async function reorderProjectBuckets(bucketIds: string[]): Promise<ProjectBucket[]> {
  return (
    await api.patch<{ buckets: ProjectBucket[] }>('/me/project-buckets/reorder', { bucketIds })
  ).data.buckets;
}

export async function addProjectToBucket(bucketId: string, projectId: string): Promise<ProjectBucket> {
  return (
    await api.post<ProjectBucket>(`/me/project-buckets/${bucketId}/projects/${projectId}`)
  ).data;
}

export async function removeProjectFromBucket(
  bucketId: string,
  projectId: string,
): Promise<ProjectBucket> {
  return (
    await api.delete<ProjectBucket>(`/me/project-buckets/${bucketId}/projects/${projectId}`)
  ).data;
}

export async function reorderBucketProjects(
  bucketId: string,
  projectIds: string[],
): Promise<ProjectBucket> {
  return (
    await api.patch<ProjectBucket>(`/me/project-buckets/${bucketId}/projects/reorder`, {
      projectIds,
    })
  ).data;
}

export async function setProjectBuckets(
  projectId: string,
  bucketIds: string[],
): Promise<ProjectBucket[]> {
  return (
    await api.put<{ buckets: ProjectBucket[] }>('/me/project-buckets/assignments', {
      projectId,
      bucketIds,
    })
  ).data.buckets;
}
