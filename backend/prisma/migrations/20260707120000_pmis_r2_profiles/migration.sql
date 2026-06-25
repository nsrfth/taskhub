-- v1.98 (PMIS R2 — project profiles): pluggable industry profiles that toggle
-- the optional PMIS modules per project, on top of the always-on neutral core.
-- Fully additive + backfills to identity: every existing project lands on the
-- system NEUTRAL profile (all modules OFF = today's behaviour exactly).
--
--   1. ProjectProfile + ProfileModuleSetting tables.
--   2. Project += profileId / profileVersion / profileOverrides.
--   3. Team += defaultProfileId, UserGroup += defaultProfileId (defaulting carriers).
--   4. Seed the 4 BUILTIN/PUBLISHED/SYSTEM profiles (NEUTRAL/IT/EPC/OPERATIONS).
--   5. Backfill projects → NEUTRAL v1, teams → defaultProfileId = NEUTRAL.

-- CreateEnum
CREATE TYPE "ProfileKind" AS ENUM ('BUILTIN', 'CUSTOM');
CREATE TYPE "ProfileOwnerScope" AS ENUM ('SYSTEM', 'TEAM');
CREATE TYPE "ProfileStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'DEPRECATED');

-- AlterTable: defaulting carriers + per-project snapshot/overrides.
ALTER TABLE "Team" ADD COLUMN "defaultProfileId" TEXT;
ALTER TABLE "UserGroup" ADD COLUMN "defaultProfileId" TEXT;
ALTER TABLE "Project" ADD COLUMN "profileId" TEXT;
ALTER TABLE "Project" ADD COLUMN "profileVersion" INTEGER;
ALTER TABLE "Project" ADD COLUMN "profileOverrides" JSONB;

-- CreateTable
CREATE TABLE "ProjectProfile" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ProfileKind" NOT NULL DEFAULT 'CUSTOM',
    "ownerScope" "ProfileOwnerScope" NOT NULL DEFAULT 'TEAM',
    "teamId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "ProfileStatus" NOT NULL DEFAULT 'DRAFT',
    "basedOnProfileId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileModuleSetting" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "requiredFields" JSONB NOT NULL DEFAULT '[]',
    "defaults" JSONB NOT NULL DEFAULT '{}',
    "config" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "ProfileModuleSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectProfile_teamId_idx" ON "ProjectProfile"("teamId");
CREATE INDEX "ProjectProfile_ownerScope_status_idx" ON "ProjectProfile"("ownerScope", "status");
CREATE INDEX "ProjectProfile_key_idx" ON "ProjectProfile"("key");
-- Partial unique indexes (Prisma can't express these): system keys are
-- globally unique; a team's keys are unique within that team.
CREATE UNIQUE INDEX "ProjectProfile_system_key_key" ON "ProjectProfile"("key") WHERE "ownerScope" = 'SYSTEM';
CREATE UNIQUE INDEX "ProjectProfile_team_key_key" ON "ProjectProfile"("teamId", "key") WHERE "ownerScope" = 'TEAM';

CREATE UNIQUE INDEX "ProfileModuleSetting_profileId_moduleKey_key" ON "ProfileModuleSetting"("profileId", "moduleKey");
CREATE INDEX "ProfileModuleSetting_profileId_idx" ON "ProfileModuleSetting"("profileId");

CREATE INDEX "Project_profileId_idx" ON "Project"("profileId");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_defaultProfileId_fkey" FOREIGN KEY ("defaultProfileId") REFERENCES "ProjectProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UserGroup" ADD CONSTRAINT "UserGroup_defaultProfileId_fkey" FOREIGN KEY ("defaultProfileId") REFERENCES "ProjectProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ProjectProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectProfile" ADD CONSTRAINT "ProjectProfile_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectProfile" ADD CONSTRAINT "ProjectProfile_basedOnProfileId_fkey" FOREIGN KEY ("basedOnProfileId") REFERENCES "ProjectProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProfileModuleSetting" ADD CONSTRAINT "ProfileModuleSetting_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ProjectProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed the 4 BUILTIN / PUBLISHED / SYSTEM-scoped profiles. Stable ids so the
-- resolver + backfill can reference NEUTRAL without a lookup.
INSERT INTO "ProjectProfile" ("id", "key", "name", "kind", "ownerScope", "teamId", "version", "status", "updatedAt")
VALUES
  ('sysprofile_neutral',    'NEUTRAL',    'Neutral',    'BUILTIN', 'SYSTEM', NULL, 1, 'PUBLISHED', CURRENT_TIMESTAMP),
  ('sysprofile_it',         'IT',         'IT',         'BUILTIN', 'SYSTEM', NULL, 1, 'PUBLISHED', CURRENT_TIMESTAMP),
  ('sysprofile_epc',        'EPC',        'EPC',        'BUILTIN', 'SYSTEM', NULL, 1, 'PUBLISHED', CURRENT_TIMESTAMP),
  ('sysprofile_operations', 'OPERATIONS', 'Operations', 'BUILTIN', 'SYSTEM', NULL, 1, 'PUBLISHED', CURRENT_TIMESTAMP);

-- Module settings — only the ENABLED modules get a row; a missing row reads as
-- disabled, so NEUTRAL (all OFF) needs none. Matrix from the roadmap's
-- "Built-in profile → module matrix" (✅/light/optional → enabled:true; – → row omitted).
INSERT INTO "ProfileModuleSetting" ("id", "profileId", "moduleKey", "enabled")
VALUES
  -- IT
  ('pms_it_timesheets',      'sysprofile_it', 'timesheets',     true),
  ('pms_it_cost_control',    'sysprofile_it', 'cost_control',   true),
  ('pms_it_baselines',       'sysprofile_it', 'baselines',      true),
  ('pms_it_cpm_schedule',    'sysprofile_it', 'cpm_schedule',   true),
  ('pms_it_resource_mgmt',   'sysprofile_it', 'resource_mgmt',  true),
  ('pms_it_evm',             'sysprofile_it', 'evm',            true),
  ('pms_it_risk',            'sysprofile_it', 'risk',           true),
  ('pms_it_issue',           'sysprofile_it', 'issue',          true),
  ('pms_it_change_control',  'sysprofile_it', 'change_control', true),
  ('pms_it_procurement',     'sysprofile_it', 'procurement',    true),
  ('pms_it_stakeholder',     'sysprofile_it', 'stakeholder',    true),
  ('pms_it_mom',             'sysprofile_it', 'mom',            true),
  -- EPC (all modules on)
  ('pms_epc_timesheets',     'sysprofile_epc', 'timesheets',     true),
  ('pms_epc_cost_control',   'sysprofile_epc', 'cost_control',   true),
  ('pms_epc_baselines',      'sysprofile_epc', 'baselines',      true),
  ('pms_epc_cpm_schedule',   'sysprofile_epc', 'cpm_schedule',   true),
  ('pms_epc_resource_mgmt',  'sysprofile_epc', 'resource_mgmt',  true),
  ('pms_epc_evm',            'sysprofile_epc', 'evm',            true),
  ('pms_epc_risk',           'sysprofile_epc', 'risk',           true),
  ('pms_epc_issue',          'sysprofile_epc', 'issue',          true),
  ('pms_epc_change_control', 'sysprofile_epc', 'change_control', true),
  ('pms_epc_rfi',            'sysprofile_epc', 'rfi',            true),
  ('pms_epc_document_register', 'sysprofile_epc', 'document_register', true),
  ('pms_epc_procurement',    'sysprofile_epc', 'procurement',    true),
  ('pms_epc_quality',        'sysprofile_epc', 'quality',        true),
  ('pms_epc_stakeholder',    'sysprofile_epc', 'stakeholder',    true),
  ('pms_epc_mom',            'sysprofile_epc', 'mom',            true),
  -- OPERATIONS
  ('pms_ops_timesheets',     'sysprofile_operations', 'timesheets',        true),
  ('pms_ops_cost_control',   'sysprofile_operations', 'cost_control',      true),
  ('pms_ops_baselines',      'sysprofile_operations', 'baselines',         true),
  ('pms_ops_resource_mgmt',  'sysprofile_operations', 'resource_mgmt',     true),
  ('pms_ops_risk',           'sysprofile_operations', 'risk',              true),
  ('pms_ops_issue',          'sysprofile_operations', 'issue',             true),
  ('pms_ops_change_control', 'sysprofile_operations', 'change_control',    true),
  ('pms_ops_document_register', 'sysprofile_operations', 'document_register', true),
  ('pms_ops_procurement',    'sysprofile_operations', 'procurement',       true),
  ('pms_ops_quality',        'sysprofile_operations', 'quality',           true),
  ('pms_ops_stakeholder',    'sysprofile_operations', 'stakeholder',       true),
  ('pms_ops_mom',            'sysprofile_operations', 'mom',               true);

-- Backfill to identity: every existing project pins NEUTRAL v1; every team's
-- default becomes NEUTRAL. NEUTRAL has no module settings → effective-config
-- returns every module disabled → zero behaviour change.
UPDATE "Project" SET "profileId" = 'sysprofile_neutral', "profileVersion" = 1 WHERE "profileId" IS NULL;
UPDATE "Team" SET "defaultProfileId" = 'sysprofile_neutral' WHERE "defaultProfileId" IS NULL;
