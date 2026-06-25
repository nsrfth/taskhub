// v1.98 (PMIS R2 — project profiles): pure helpers + constants for resolving a
// project's effective module configuration. The DB work lives in
// services/profilesService.ts; everything here is side-effect-free so it's
// trivially unit-testable and reusable by the resolver, the assign flow, and
// the requireModule middleware.

import {
  MODULE_KEYS,
  expandWithDependencies,
  isModuleKey,
  type ModuleKey,
} from './moduleRegistry.js';

// The four system-seeded built-ins (see the R2 migration). Stable ids let the
// resolver + backfill reference NEUTRAL without a lookup.
export const SYSTEM_PROFILE_KEYS = ['NEUTRAL', 'IT', 'EPC', 'OPERATIONS'] as const;
export type SystemProfileKey = (typeof SYSTEM_PROFILE_KEYS)[number];

export const NEUTRAL_PROFILE_ID = 'sysprofile_neutral';

// One module's resolved config in an effective-config response.
export interface ModuleEffectiveConfig {
  enabled: boolean;
  requiredFields: string[];
  defaults: Record<string, unknown>;
  config: Record<string, unknown>;
}

export type EffectiveModules = Record<ModuleKey, ModuleEffectiveConfig>;

// The raw shape of a stored ProfileModuleSetting (or a project override entry)
// before resolution. All fields optional so overrides can be partial.
export interface RawModuleSetting {
  moduleKey: string;
  enabled?: boolean | null;
  requiredFields?: unknown;
  defaults?: unknown;
  config?: unknown;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

function asObject(v: unknown): Record<string, unknown> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return { ...(v as Record<string, unknown>) };
  return {};
}

function blank(): ModuleEffectiveConfig {
  return { enabled: false, requiredFields: [], defaults: {}, config: {} };
}

function emptyModules(): EffectiveModules {
  const out = {} as EffectiveModules;
  for (const k of MODULE_KEYS) out[k] = blank();
  return out;
}

// Layer one raw setting (base or override) over an accumulator entry. Only the
// fields actually present on the setting are applied, so a partial project
// override can flip `enabled` without clobbering the profile's requiredFields.
function applySetting(target: ModuleEffectiveConfig, s: RawModuleSetting): void {
  if (s.enabled !== undefined && s.enabled !== null) target.enabled = !!s.enabled;
  if (s.requiredFields !== undefined) target.requiredFields = asStringArray(s.requiredFields);
  if (s.defaults !== undefined) target.defaults = asObject(s.defaults);
  if (s.config !== undefined) target.config = asObject(s.config);
}

/**
 * Resolve a project's effective module config:
 *   1. start every module disabled,
 *   2. layer the snapshotted profile's module settings,
 *   3. layer the project-level overrides on top,
 *   4. close the enabled set over `dependsOn` edges (enabling `evm` pulls in
 *      `baselines` + `cost_control`).
 * Pure — unknown module keys in either source are ignored.
 */
export function computeEffectiveModules(
  baseSettings: readonly RawModuleSetting[],
  overrides: Record<string, RawModuleSetting | Partial<ModuleEffectiveConfig>> | null | undefined,
): EffectiveModules {
  const modules = emptyModules();

  for (const s of baseSettings) {
    if (isModuleKey(s.moduleKey)) applySetting(modules[s.moduleKey], s);
  }

  if (overrides && typeof overrides === 'object') {
    for (const [key, raw] of Object.entries(overrides)) {
      if (!isModuleKey(key) || !raw || typeof raw !== 'object') continue;
      applySetting(modules[key], { moduleKey: key, ...(raw as Record<string, unknown>) });
    }
  }

  // Close the enabled set over dependency edges.
  const enabled: ModuleKey[] = MODULE_KEYS.filter((k) => modules[k].enabled);
  for (const k of expandWithDependencies(enabled)) modules[k].enabled = true;

  return modules;
}
