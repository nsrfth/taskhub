import { prisma } from '../data/prisma.js';
import { Errors } from '../lib/errors.js';
import type { CreateContactBody, UpdateContactBody } from '../schemas/contacts.js';

// v1.90: team-level contacts directory. Every row carries teamId; every query
// pins teamId in the `where` so a contact never leaks across teams. Soft-delete
// (deletedAt) preserves referential history for letters that referenced a
// now-removed contact (the FK is SetNull on Correspondence so old letters keep
// rendering even after the contact is gone).

export interface ContactView {
  id: string;
  teamId: string;
  name: string;
  organization: string | null;
  email: string | null;
  phone: string | null;
  type: 'PERSON' | 'ORG';
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toView(c: {
  id: string;
  teamId: string;
  name: string;
  organization: string | null;
  email: string | null;
  phone: string | null;
  type: 'PERSON' | 'ORG';
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ContactView {
  return {
    id: c.id,
    teamId: c.teamId,
    name: c.name,
    organization: c.organization,
    email: c.email,
    phone: c.phone,
    type: c.type,
    createdById: c.createdById,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export class ContactsService {
  async list(teamId: string): Promise<ContactView[]> {
    const rows = await prisma.contact.findMany({
      where: { teamId, deletedAt: null },
      orderBy: { name: 'asc' },
    });
    return rows.map(toView);
  }

  // 404 (not 403) on cross-team / missing — never confirm a contact's existence
  // to a caller in another team.
  async get(teamId: string, contactId: string): Promise<ContactView> {
    const row = await prisma.contact.findFirst({
      where: { id: contactId, teamId, deletedAt: null },
    });
    if (!row) throw Errors.notFound('Contact not found');
    return toView(row);
  }

  async create(teamId: string, createdById: string, body: CreateContactBody): Promise<ContactView> {
    const row = await prisma.contact.create({
      data: {
        teamId,
        createdById,
        name: body.name,
        organization: body.organization ?? null,
        email: body.email ?? null,
        phone: body.phone ?? null,
        type: body.type ?? 'PERSON',
      },
    });
    return toView(row);
  }

  async update(
    teamId: string,
    contactId: string,
    body: UpdateContactBody,
  ): Promise<ContactView> {
    // Re-assert team scope before mutating.
    await this.get(teamId, contactId);
    const row = await prisma.contact.update({
      where: { id: contactId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.organization !== undefined && { organization: body.organization }),
        ...(body.email !== undefined && { email: body.email }),
        ...(body.phone !== undefined && { phone: body.phone }),
        ...(body.type !== undefined && { type: body.type }),
      },
    });
    return toView(row);
  }

  async remove(teamId: string, contactId: string): Promise<void> {
    await this.get(teamId, contactId);
    await prisma.contact.update({
      where: { id: contactId },
      data: { deletedAt: new Date() },
    });
  }
}
