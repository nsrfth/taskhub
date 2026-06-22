import { api } from '@/lib/api';

// v1.89: team-level reusable directory of contacts (people / organizations)
// that correspondence letters reference for sender / recipient.

export type ContactType = 'PERSON' | 'ORG';

export interface Contact {
  id: string;
  teamId: string;
  name: string;
  organization: string | null;
  email: string | null;
  phone: string | null;
  type: ContactType;
  createdAt: string;
}

export interface ContactInput {
  name: string;
  organization?: string | null;
  email?: string | null;
  phone?: string | null;
  type: ContactType;
}

export async function listContacts(teamId: string, search?: string): Promise<Contact[]> {
  const params: Record<string, string> = {};
  if (search) params.search = search;
  return (await api.get<Contact[]>(`/teams/${teamId}/contacts`, { params })).data;
}

export async function getContact(teamId: string, id: string): Promise<Contact> {
  return (await api.get<Contact>(`/teams/${teamId}/contacts/${id}`)).data;
}

export async function createContact(teamId: string, input: ContactInput): Promise<Contact> {
  return (await api.post<Contact>(`/teams/${teamId}/contacts`, input)).data;
}

export async function updateContact(
  teamId: string,
  id: string,
  input: Partial<ContactInput>,
): Promise<Contact> {
  return (await api.patch<Contact>(`/teams/${teamId}/contacts/${id}`, input)).data;
}

export async function deleteContact(teamId: string, id: string): Promise<void> {
  await api.delete(`/teams/${teamId}/contacts/${id}`);
}
