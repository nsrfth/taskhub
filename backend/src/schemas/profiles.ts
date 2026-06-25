import { z } from 'zod';
import { MODULE_KEYS } from '../lib/moduleRegistry.js';

// v1.98 (PMIS R2 — project profiles): Zod schemas are the single source of
// truth for validation AND the OpenAPI doc.

// Module key as an OpenAPI enum (kept in lock-step with lib/moduleRegistry).
export const moduleKeyEnum = z.enum(MODULE_KEYS as unknown as [string, ...string[]]);

export const profileKindEnum = z.enum(['BUILTIN', 'CUSTOM']);
export const profileOwnerScopeEnum = z.enum(['SYSTEM', 'TEAM']);
export const profileStatusEnum = z.enum(['DRAFT', 'PUBLISHED', 'DEPRECATED']);

// A free-form per-module bag. Kept permissive (consumed by Wave-B/C modules).
const jsonObject = z.record(z.string(), z.unknown());

// ── /api/system/modules ──────────────────────────────────────────────────────
export const moduleDefResponse = z.object({
  key: moduleKeyEnum,
  label: z.string(),
  wave: z.enum(['B', 'C']),
  dependsOn: z.array(moduleKeyEnum),
  managePermission: z.string().nullable(),
});

export const moduleListResponse = z.object({
  modules: z.array(moduleDefResponse),
});

// ── Stored profile module setting (as authored on a profile) ─────────────────
export const moduleSettingResponse = z.object({
  moduleKey: moduleKeyEnum,
  enabled: z.boolean(),
  requiredFields: z.array(z.string()),
  defaults: jsonObject,
  config: jsonObject,
});

export const moduleSettingInput = z.object({
  moduleKey: moduleKeyEnum,
  enabled: z.boolean().default(false),
  requiredFields: z.array(z.string()).default([]),
  defaults: jsonObject.default({}),
  config: jsonObject.default({}),
});

// ── Profile (definition) responses ───────────────────────────────────────────
export const profileResponse = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  kind: profileKindEnum,
  ownerScope: profileOwnerScopeEnum,
  teamId: z.string().nullable(),
  version: z.number().int(),
  status: profileStatusEnum,
  basedOnProfileId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  modules: z.array(moduleSettingResponse),
});

export const profileListResponse = z.object({
  items: z.array(profileResponse),
});

// ── Mutations ────────────────────────────────────────────────────────────────
export const createProfileBody = z.object({
  name: z.string().min(1).max(200).trim(),
  // Machine key — uppercase letters/digits/underscore. Auto-uppercased.
  key: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[A-Za-z0-9_]+$/, 'key must be alphanumeric/underscore')
    .transform((s) => s.toUpperCase()),
  // Clone the module settings from this profile (system or this team's).
  basedOnProfileId: z.string().optional(),
  // Initial module settings (override anything cloned from basedOnProfileId).
  modules: z.array(moduleSettingInput).optional(),
});

export const updateProfileBody = z.object({
  name: z.string().min(1).max(200).trim().optional(),
  // Full replace-set of module settings when provided.
  modules: z.array(moduleSettingInput).optional(),
});

export const setTeamDefaultBody = z.object({
  profileId: z.string(),
});

export const setGroupDefaultBody = z.object({
  // null clears the group default (falls back to the team default).
  profileId: z.string().nullable(),
});

export const assignProjectProfileBody = z.object({
  profileId: z.string(),
});

// Partial per-module override the project layers on its snapshotted profile.
const moduleOverride = z.object({
  enabled: z.boolean().optional(),
  requiredFields: z.array(z.string()).optional(),
  defaults: jsonObject.optional(),
  config: jsonObject.optional(),
});

export const projectOverridesBody = z.object({
  overrides: z.record(moduleKeyEnum, moduleOverride),
});

// ── effective-config (the hot path) ──────────────────────────────────────────
export const moduleEffectiveConfigResponse = z.object({
  enabled: z.boolean(),
  requiredFields: z.array(z.string()),
  defaults: jsonObject,
  config: jsonObject,
});

export const effectiveConfigResponse = z.object({
  profileId: z.string().nullable(),
  profileName: z.string().nullable(),
  profileVersion: z.number().int().nullable(),
  modules: z.record(moduleKeyEnum, moduleEffectiveConfigResponse),
});

// ── Project profile assignment view (read current snapshot + overrides) ──────
export const projectProfileResponse = z.object({
  profileId: z.string().nullable(),
  profileName: z.string().nullable(),
  profileVersion: z.number().int().nullable(),
  overrides: z.record(moduleKeyEnum, moduleOverride),
});

export type CreateProfileBody = z.infer<typeof createProfileBody>;
export type UpdateProfileBody = z.infer<typeof updateProfileBody>;
export type SetTeamDefaultBody = z.infer<typeof setTeamDefaultBody>;
export type SetGroupDefaultBody = z.infer<typeof setGroupDefaultBody>;
export type AssignProjectProfileBody = z.infer<typeof assignProjectProfileBody>;
export type ProjectOverridesBody = z.infer<typeof projectOverridesBody>;
export type ModuleSettingInput = z.infer<typeof moduleSettingInput>;
