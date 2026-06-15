import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import en from '../../i18n/en.json';
import fa from '../../i18n/fa.json';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ganttPage = readFileSync(
  join(__dirname, '../../pages/ProjectGanttPage.tsx'),
  'utf8',
);

const GANTT_I18N = [
  'gantt.scale.year',
  'gantt.scale.month',
  'gantt.scale.week',
  'gantt.scale.workingWeek',
  'gantt.scale.day',
  'gantt.prev',
  'gantt.next',
  'gantt.today',
  'gantt.period',
] as const;

describe('Gantt time-scale regression', () => {
  it('defines gantt i18n keys in EN and FA', () => {
    for (const key of GANTT_I18N) {
      expect(en[key as keyof typeof en], `en missing ${key}`).toBeTruthy();
      expect(fa[key as keyof typeof fa], `fa missing ${key}`).toBeTruthy();
    }
  });

  it('keeps scale state in memory only (no localStorage)', () => {
    expect(ganttPage).toContain("useState<GanttScaleMode>('day')");
    expect(ganttPage).not.toMatch(/localStorage.*scale/i);
    expect(ganttPage).not.toMatch(/scale.*localStorage/i);
  });

  it('uses logical toolbar spacing and LTR timeline wrapper for RTL safety', () => {
    expect(ganttPage).toContain('ms-auto');
    expect(ganttPage).toContain('dir="ltr"');
    expect(ganttPage).not.toMatch(/\bml-auto\b/);
  });

  it('wires scale modes, navigation, and today reset', () => {
    expect(ganttPage).toContain('buildGanttAxis');
    expect(ganttPage).toContain('shiftAnchor');
    expect(ganttPage).toContain('goToday');
    expect(ganttPage).toContain('workingWeek');
    expect(ganttPage).toContain('dayFitProject');
  });
});
