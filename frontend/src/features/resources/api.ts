import { api } from '@/lib/api';

// v2.2 (PMIS R6 — resource management): typed client for the team resource catalog,
// skill catalog and workload report.
// Mirrors backend/src/schemas/resources.ts shapes.

export type ResourceType = 'HUMAN' | 'EQUIPMENT' | 'MATERIAL';
export type BudgetCurrency = 'IRR' | 'USD' | 'EUR';

export interface ResourceSkill {
  skillId: string;
  skillName: string;
  level: number;
}

export interface Resource {
  id: string;
  teamId: string;
  name: string;
  type: ResourceType;
  userId: string | null;
  email: string | null;
  maxUnits: number;
  costRateMinor: number | null;
  currency: BudgetCurrency | null;
  calendarId: string | null;
  notes: string | null;
  skills: ResourceSkill[];
  createdAt: string;
  updatedAt: string;
}

export interface Skill {
  id: string;
  teamId: string;
  name: string;
  createdAt: string;
}

export interface WorkloadItem {
  resourceId: string;
  resourceName: string;
  totalPlannedHours: number;
  totalActualHours: number;
  assignmentCount: number;
}

export interface CreateResourceInput {
  name: string;
  type?: ResourceType;
  userId?: string | null;
  email?: string | null;
  maxUnits?: number;
  costRateMinor?: number | null;
  currency?: BudgetCurrency | null;
  notes?: string | null;
}

export type UpdateResourceInput = Partial<CreateResourceInput>;

export interface Assignment {
  id: string;
  teamId: string;
  projectId: string;
  taskId: string;
  resourceId: string;
  resourceName: string;
  resourceType: ResourceType;
  units: number;
  plannedHours: number | null;
  actualHours: number | null;
  createdAt: string;
  updatedAt: string;
}

export async function listResources(teamId: string): Promise<Resource[]> {
  return (await api.get<{ items: Resource[] }>(`/teams/${teamId}/resources`)).data.items;
}
export async function createResource(teamId: string, input: CreateResourceInput): Promise<Resource> {
  return (await api.post<Resource>(`/teams/${teamId}/resources`, input)).data;
}
export async function updateResource(
  teamId: string,
  id: string,
  input: UpdateResourceInput,
): Promise<Resource> {
  return (await api.patch<Resource>(`/teams/${teamId}/resources/${id}`, input)).data;
}
export async function deleteResource(teamId: string, id: string): Promise<void> {
  await api.delete(`/teams/${teamId}/resources/${id}`);
}

export async function setResourceSkills(
  teamId: string,
  resourceId: string,
  skills: { skillId: string; level?: number }[],
): Promise<void> {
  await api.put(`/teams/${teamId}/resources/${resourceId}/skills`, { skills });
}

export async function listSkills(teamId: string): Promise<Skill[]> {
  return (await api.get<{ items: Skill[] }>(`/teams/${teamId}/skills`)).data.items;
}
export async function createSkill(teamId: string, name: string): Promise<Skill> {
  return (await api.post<Skill>(`/teams/${teamId}/skills`, { name })).data;
}
export async function deleteSkill(teamId: string, id: string): Promise<void> {
  await api.delete(`/teams/${teamId}/skills/${id}`);
}

export async function getWorkload(teamId: string): Promise<WorkloadItem[]> {
  return (await api.get<{ items: WorkloadItem[] }>(`/teams/${teamId}/resources/workload`)).data.items;
}

// Task-scoped resource assignments (R6). Create/list hang off a task; update and
// remove are addressed by assignmentId at the team scope.
export async function listAssignments(
  teamId: string,
  projectId: string,
  taskId: string,
): Promise<Assignment[]> {
  return (
    await api.get<{ items: Assignment[] }>(
      `/teams/${teamId}/projects/${projectId}/tasks/${taskId}/assignments`,
    )
  ).data.items;
}
export async function createAssignment(
  teamId: string,
  projectId: string,
  taskId: string,
  input: { resourceId: string; units?: number; plannedHours?: number | null },
): Promise<Assignment> {
  return (
    await api.post<Assignment>(
      `/teams/${teamId}/projects/${projectId}/tasks/${taskId}/assignments`,
      input,
    )
  ).data;
}
export async function updateAssignment(
  teamId: string,
  assignmentId: string,
  input: { units?: number; plannedHours?: number | null; actualHours?: number | null },
): Promise<Assignment> {
  return (
    await api.patch<Assignment>(`/teams/${teamId}/resource-assignments/${assignmentId}`, input)
  ).data;
}
export async function deleteAssignment(teamId: string, assignmentId: string): Promise<void> {
  await api.delete(`/teams/${teamId}/resource-assignments/${assignmentId}`);
}
