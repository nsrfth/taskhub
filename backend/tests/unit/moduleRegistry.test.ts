import { describe, expect, it } from 'vitest';
import {
  MODULE_KEYS,
  MODULE_REGISTRY,
  expandWithDependencies,
  isModuleKey,
  type ModuleKey,
} from '../../src/lib/moduleRegistry.js';

// v1.95 (PMIS R0): the authoritative module list + dependency DAG.
describe('module registry', () => {
  it('has a registry entry for every key (and vice versa)', () => {
    for (const k of MODULE_KEYS) expect(MODULE_REGISTRY[k]?.key).toBe(k);
    expect(Object.keys(MODULE_REGISTRY).sort()).toEqual([...MODULE_KEYS].sort());
  });

  it('guards unknown keys', () => {
    expect(isModuleKey('evm')).toBe(true);
    expect(isModuleKey('not_a_module')).toBe(false);
  });

  it('every dependsOn edge points at a real module (no dangling edges)', () => {
    for (const def of Object.values(MODULE_REGISTRY)) {
      for (const dep of def.dependsOn) expect(isModuleKey(dep)).toBe(true);
    }
  });

  it('expandWithDependencies closes over transitive edges', () => {
    // evm → baselines + cost_control (both leaves), so the closure is exactly 3.
    const evm = expandWithDependencies(['evm']);
    expect(evm).toEqual(new Set<ModuleKey>(['evm', 'baselines', 'cost_control']));

    // A leaf module expands to just itself.
    expect(expandWithDependencies(['issue'])).toEqual(new Set<ModuleKey>(['issue']));
  });

  it('the dependency graph is acyclic (closure terminates for every key)', () => {
    for (const k of MODULE_KEYS) {
      const closure = expandWithDependencies([k]);
      expect(closure.has(k)).toBe(true);
    }
  });
});
