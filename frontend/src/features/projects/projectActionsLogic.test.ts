import { describe, expect, it } from 'vitest';
import en from '../../i18n/en.json';
import fa from '../../i18n/fa.json';
import {
  PROJECT_ACTION_I18N_KEYS,
  shouldShowProjectActionsMenu,
  toggleActionsMenuProjectId,
} from './projectActionsLogic';

describe('project actions menu logic', () => {
  it('1) opening one row menu does not leave another row open', () => {
    expect(toggleActionsMenuProjectId(null, 'a')).toBe('a');
    expect(toggleActionsMenuProjectId('a', 'b')).toBe('b');
    expect(toggleActionsMenuProjectId('b', 'b')).toBe(null);
    expect(toggleActionsMenuProjectId('a', 'a')).toBe(null);
  });

  it('5) user without manage rights does not get the actions menu', () => {
    expect(shouldShowProjectActionsMenu(false)).toBe(false);
    expect(shouldShowProjectActionsMenu(true)).toBe(true);
  });

  it('7) bucket assignment remains a separate concern from actions menu', () => {
    // Bucket assign uses assignProjectId; actions use actionsMenuProjectId — independent toggles.
    expect(toggleActionsMenuProjectId('p1', 'p2')).toBe('p2');
    expect(toggleActionsMenuProjectId(null, 'p1')).toBe('p1');
  });

  it('8) menu/modal i18n keys exist in both en.json and fa.json', () => {
    for (const key of PROJECT_ACTION_I18N_KEYS) {
      expect(en[key as keyof typeof en], `en missing ${key}`).toBeTruthy();
      expect(fa[key as keyof typeof fa], `fa missing ${key}`).toBeTruthy();
    }
  });
});
