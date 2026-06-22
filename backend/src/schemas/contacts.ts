import { z } from 'zod';

// v1.90: team-level reusable contacts directory. Letters (correspondence)
// reference these for sender/recipient. Reads are open to any team member;
// writes need the `contacts.manage` permission.

export const contactTypeEnum = z.enum(['PERSON', 'ORG']);

export const createContactBody = z.object({
  name: z.string().min(1).max(200).trim(),
  organization: z.string().max(200).trim().nullable().optional(),
  email: z.string().email().max(320).nullable().optional(),
  phone: z.string().max(64).trim().nullable().optional(),
  type: contactTypeEnum.default('PERSON'),
});

// PATCH — every field optional; an omitted field is left unchanged.
export const updateContactBody = z
  .object({
    name: z.string().min(1).max(200).trim().optional(),
    organization: z.string().max(200).trim().nullable().optional(),
    email: z.string().email().max(320).nullable().optional(),
    phone: z.string().max(64).trim().nullable().optional(),
    type: contactTypeEnum.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });

export const contactResponse = z.object({
  id: z.string(),
  teamId: z.string(),
  name: z.string(),
  organization: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  type: contactTypeEnum,
  createdById: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const contactListResponse = z.array(contactResponse);

export type CreateContactBody = z.infer<typeof createContactBody>;
export type UpdateContactBody = z.infer<typeof updateContactBody>;
