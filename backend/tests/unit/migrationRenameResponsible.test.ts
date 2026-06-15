import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationSql = readFileSync(
  join(
    __dirname,
    '../../prisma/migrations/20260615140000_rename_technician_to_responsible/migration.sql',
  ),
  'utf8',
);

describe('migration 20260615140000_rename_technician_to_responsible', () => {
  it('RENAMES columns (no drop/add that would lose assignments)', () => {
    expect(migrationSql).toMatch(/RENAME COLUMN "technicianId" TO "responsibleId"/);
    expect(migrationSql).not.toMatch(/DROP COLUMN.*technicianId/i);
    expect(migrationSql).not.toMatch(/ADD COLUMN.*responsibleId/i);
  });

  it('backfills task.change_responsible permission from task.change_technician', () => {
    expect(migrationSql).toMatch(/task\.change_responsible/);
    expect(migrationSql).toMatch(/task\.change_technician/);
  });
});
