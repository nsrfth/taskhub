// v1.95 (PMIS R0 — plumbing): the Module Registry.
//
// The authoritative, code-level list of the optional PMIS modules a Project
// Profile (R2) can toggle on. It is pure substrate: nothing reads it yet. R2's
// `effective-config` resolver will use it to (a) reject unknown module keys,
// (b) close a profile's enabled-set over `dependsOn` edges (you can't enable
// `evm` without `baselines` + `cost_control`), and (c) know which permission
// gates a module's data once that module ships.
//
// Dependency edges are intentionally conservative — only the ones the roadmap
// states outright are encoded; soft/aspirational couplings (e.g. risk exposure
// feeding cost contingency) are left out so R2 gating never blocks on a guess.
//
// The neutral core (WBS, baseline dates, % complete, RACI, RAG, project code)
// is NOT a module — it is always on for every project, so it has no key here.

import type { Permission } from './permissions.js';

export const MODULE_KEYS = [
  'cost_control',
  'timesheets',
  'baselines',
  'cpm_schedule',
  'resource_mgmt',
  'evm',
  'risk',
  'issue',
  'change_control',
  'rfi',
  'document_register',
  'procurement',
  'quality',
  'stakeholder',
  'mom',
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export interface ModuleDef {
  key: ModuleKey;
  /** Human label for the profile matrix UI. */
  label: string;
  /** Wave the module ships in — informational, for ordering the matrix. */
  wave: 'B' | 'C';
  /** Other modules that must also be enabled for this one to function. */
  dependsOn: readonly ModuleKey[];
  /**
   * Permission that gates managing this module's data, where one already exists
   * in the catalog. Undefined = the module reuses an existing gate (project
   * WRITE / approvals) or its permission lands with the feature.
   */
  managePermission?: Permission;
}

export const MODULE_REGISTRY: Record<ModuleKey, ModuleDef> = {
  // WAVE B — controls.
  timesheets: { key: 'timesheets', label: 'Timesheets', wave: 'B', dependsOn: [] },
  cost_control: { key: 'cost_control', label: 'Cost Control', wave: 'B', dependsOn: [] },
  baselines: {
    key: 'baselines',
    label: 'Baselines',
    wave: 'B',
    dependsOn: [],
    managePermission: 'core.capture_baseline',
  },
  cpm_schedule: { key: 'cpm_schedule', label: 'CPM Schedule', wave: 'B', dependsOn: [] },
  resource_mgmt: {
    key: 'resource_mgmt',
    label: 'Resource Management',
    wave: 'B',
    // R6: assignment actual hours are read from approved timesheets.
    dependsOn: ['timesheets'],
  },
  evm: {
    key: 'evm',
    label: 'Earned Value (EVM)',
    wave: 'B',
    // R7: BAC from baseline budget lines; AC from the cost ledger.
    dependsOn: ['baselines', 'cost_control'],
  },
  // WAVE C — lifecycle records.
  risk: { key: 'risk', label: 'Risk Register', wave: 'C', dependsOn: [] },
  issue: { key: 'issue', label: 'Issue Register', wave: 'C', dependsOn: [] },
  change_control: {
    key: 'change_control',
    label: 'Change Control',
    wave: 'C',
    // R9: an approved change captures a new current baseline.
    dependsOn: ['baselines'],
  },
  rfi: { key: 'rfi', label: 'RFI Register', wave: 'C', dependsOn: [] },
  document_register: {
    key: 'document_register',
    label: 'Document / Transmittal Register',
    wave: 'C',
    dependsOn: [],
  },
  procurement: {
    key: 'procurement',
    label: 'Procurement',
    wave: 'C',
    // R9: a PO emits a commitment into cost control.
    dependsOn: ['cost_control'],
  },
  quality: { key: 'quality', label: 'Quality / NCR', wave: 'C', dependsOn: [] },
  stakeholder: { key: 'stakeholder', label: 'Stakeholder Register', wave: 'C', dependsOn: [] },
  mom: { key: 'mom', label: 'Meeting Minutes', wave: 'C', dependsOn: [] },
};

const MODULE_KEY_SET: ReadonlySet<string> = new Set(MODULE_KEYS);

export function isModuleKey(value: string): value is ModuleKey {
  return MODULE_KEY_SET.has(value);
}

/**
 * Close a set of enabled module keys over `dependsOn` edges: returns the input
 * plus every transitive dependency. Order-independent; cycles are impossible
 * because the registry is a hand-authored DAG. R2 calls this so enabling a
 * module silently pulls in what it needs rather than 400-ing the caller.
 */
export function expandWithDependencies(keys: Iterable<ModuleKey>): Set<ModuleKey> {
  const out = new Set<ModuleKey>();
  const visit = (k: ModuleKey): void => {
    if (out.has(k)) return;
    out.add(k);
    for (const dep of MODULE_REGISTRY[k].dependsOn) visit(dep);
  };
  for (const k of keys) visit(k);
  return out;
}
