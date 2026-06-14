import { api } from '@/lib/api';

export interface Holiday {
  id: string;
  date: string;
  name: string;
  recurring: boolean;
  source?: 'MANUAL' | 'IMPORT' | 'SYNC';
  createdAt?: string;
  updatedAt?: string;
}

export async function fetchHolidays(params?: {
  year?: number;
  from?: string;
  to?: string;
}): Promise<Holiday[]> {
  const q = new URLSearchParams();
  if (params?.year !== undefined) q.set('year', String(params.year));
  if (params?.from) q.set('from', params.from);
  if (params?.to) q.set('to', params.to);
  const suffix = q.toString() ? `?${q.toString()}` : '';
  return (await api.get<Holiday[]>(`/holidays${suffix}`)).data;
}

export async function createHoliday(input: {
  date: string;
  name: string;
  recurring?: boolean;
}): Promise<Holiday> {
  return (await api.post<Holiday>('/holidays', input)).data;
}

export async function updateHoliday(
  id: string,
  input: { date?: string; name?: string; recurring?: boolean },
): Promise<Holiday> {
  return (await api.patch<Holiday>(`/holidays/${id}`, input)).data;
}

export async function deleteHoliday(id: string): Promise<void> {
  await api.delete(`/holidays/${id}`);
}
