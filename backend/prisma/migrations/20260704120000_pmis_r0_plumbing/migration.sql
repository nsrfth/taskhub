-- v1.95 (PMIS R0 — plumbing): substrate for the PMIS waves. Purely additive,
-- nothing user-facing yet:
--   1. Team.reportingCurrency  — nullable; null falls back to defaultCurrency.
--   2. FxRate                  — global FX reference table (scaffold; unused
--                                until R4 seeds identity rows + cost data lands).
--   3. RBAC backfill           — grant the new pmo/core/portfolio permission
--                                keys to every existing system Manager role so
--                                older teams match freshly-seeded ones.

-- AlterTable: per-team reporting currency (nullable enum, no default).
ALTER TABLE "Team" ADD COLUMN "reportingCurrency" "Currency";

-- CreateTable: FX reference rates. Global (no teamId) — market data is the same
-- for every team. `rate` = "1 baseCurrency = <rate> quoteCurrency".
CREATE TABLE "FxRate" (
    "id" TEXT NOT NULL,
    "baseCurrency" "Currency" NOT NULL,
    "quoteCurrency" "Currency" NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "asOf" DATE NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FxRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FxRate_baseCurrency_quoteCurrency_asOf_key" ON "FxRate"("baseCurrency", "quoteCurrency", "asOf");
CREATE INDEX "FxRate_baseCurrency_quoteCurrency_idx" ON "FxRate"("baseCurrency", "quoteCurrency");

-- RBAC backfill: grant the new PMIS permission keys to every existing system
-- Manager role (v1.23 backfill convention — new teams pick these up via
-- ensureSystemRoles → DEFAULT_MANAGER_PERMISSIONS). Members are left untouched.
-- Idempotent: RolePermission PK is (roleId, permission) → ON CONFLICT DO NOTHING.
-- These permissions gate nothing yet; they exist so R2/R3 enforcement and the
-- role matrix have a populated catalog to build on.
INSERT INTO "RolePermission" ("roleId", "permission")
SELECT r."id", p.perm
FROM "Role" r
CROSS JOIN (VALUES
  ('pmo.manage_profiles'),
  ('pmo.assign_profile'),
  ('pmo.override_profile'),
  ('pmo.set_team_defaults'),
  ('pmo.set_group_defaults'),
  ('core.capture_baseline'),
  ('portfolio.view'),
  ('portfolio.manage'),
  ('portfolio.attach_project'),
  ('portfolio.manage_managers')
) AS p(perm)
WHERE r."name" = 'Manager' AND r."isSystem" = true
ON CONFLICT DO NOTHING;
