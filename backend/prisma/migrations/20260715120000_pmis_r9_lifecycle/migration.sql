-- v2.5 (PMIS R9 — specialized lifecycle): Risk register, Change Control,
-- Procurement (Vendor/Contract/PO), and Quality NCR. All project-scoped.
-- Permissions: risk.manage, change.manage, change.approve, procurement.manage, quality.manage
-- added to Manager roles.

-- Enums
CREATE TYPE "RiskResponse" AS ENUM ('ACCEPT', 'AVOID', 'MITIGATE', 'TRANSFER');
CREATE TYPE "ChangeRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'APPLIED');
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED', 'CANCELLED');
CREATE TYPE "PoStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED');
CREATE TYPE "NcrSeverity" AS ENUM ('MINOR', 'MAJOR', 'CRITICAL');
CREATE TYPE "NcrDisposition" AS ENUM ('USE_AS_IS', 'REWORK', 'REJECT', 'CONCESSION');

-- Risk register
CREATE TABLE "RiskRecord" (
    "id"             TEXT NOT NULL,
    "teamId"         TEXT NOT NULL,
    "projectId"      TEXT NOT NULL,
    "reference"      TEXT NOT NULL,
    "title"          TEXT NOT NULL,
    "description"    TEXT,
    "probability"    INTEGER NOT NULL,
    "impact"         INTEGER NOT NULL,
    "score"          INTEGER NOT NULL,
    "response"       "RiskResponse" NOT NULL DEFAULT 'ACCEPT',
    "mitigationPlan" TEXT,
    "ownerId"        TEXT,
    "dueDate"        TIMESTAMP(3),
    "closedAt"       TIMESTAMP(3),
    "createdById"    TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RiskRecord_pkey" PRIMARY KEY ("id")
);

-- Change requests
CREATE TABLE "ChangeRequest" (
    "id"                TEXT NOT NULL,
    "teamId"            TEXT NOT NULL,
    "projectId"         TEXT NOT NULL,
    "reference"         TEXT NOT NULL,
    "title"             TEXT NOT NULL,
    "description"       TEXT,
    "status"            "ChangeRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduleDeltaDays" INTEGER,
    "costImpactMinor"   BIGINT,
    "costCurrency"      "Currency",
    "submittedById"     TEXT,
    "submittedAt"       TIMESTAMP(3),
    "decidedById"       TEXT,
    "decidedAt"         TIMESTAMP(3),
    "rejectionReason"   TEXT,
    "appliedBaselineId" TEXT,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChangeRequest_pkey" PRIMARY KEY ("id")
);

-- Vendor master
CREATE TABLE "Vendor" (
    "id"           TEXT NOT NULL,
    "teamId"       TEXT NOT NULL,
    "name"         TEXT NOT NULL,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "address"      TEXT,
    "notes"        TEXT,
    "deletedAt"    TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- Contracts
CREATE TABLE "Contract" (
    "id"          TEXT NOT NULL,
    "teamId"      TEXT NOT NULL,
    "projectId"   TEXT NOT NULL,
    "vendorId"    TEXT,
    "reference"   TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "status"      "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "valueMinor"  BIGINT,
    "currency"    "Currency",
    "startDate"   TIMESTAMP(3),
    "endDate"     TIMESTAMP(3),
    "notes"       TEXT,
    "createdById" TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- Purchase orders
CREATE TABLE "PurchaseOrder" (
    "id"           TEXT NOT NULL,
    "teamId"       TEXT NOT NULL,
    "projectId"    TEXT NOT NULL,
    "contractId"   TEXT,
    "reference"    TEXT NOT NULL,
    "title"        TEXT NOT NULL,
    "status"       "PoStatus" NOT NULL DEFAULT 'DRAFT',
    "amountMinor"  BIGINT,
    "currency"     "Currency",
    "issuedDate"   TIMESTAMP(3),
    "expectedDate" TIMESTAMP(3),
    "receivedDate" TIMESTAMP(3),
    "commitmentId" TEXT,
    "createdById"  TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- Quality NCR
CREATE TABLE "QualityNcr" (
    "id"               TEXT NOT NULL,
    "teamId"           TEXT NOT NULL,
    "projectId"        TEXT NOT NULL,
    "reference"        TEXT NOT NULL,
    "title"            TEXT NOT NULL,
    "description"      TEXT,
    "severity"         "NcrSeverity" NOT NULL DEFAULT 'MINOR',
    "disposition"      "NcrDisposition",
    "correctiveTaskId" TEXT,
    "closedAt"         TIMESTAMP(3),
    "createdById"      TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityNcr_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "RiskRecord_projectId_reference_key" ON "RiskRecord"("projectId", "reference");
CREATE INDEX "RiskRecord_teamId_idx" ON "RiskRecord"("teamId");
CREATE INDEX "RiskRecord_projectId_score_idx" ON "RiskRecord"("projectId", "score");

CREATE UNIQUE INDEX "ChangeRequest_projectId_reference_key" ON "ChangeRequest"("projectId", "reference");
CREATE INDEX "ChangeRequest_teamId_idx" ON "ChangeRequest"("teamId");
CREATE INDEX "ChangeRequest_projectId_status_idx" ON "ChangeRequest"("projectId", "status");

CREATE UNIQUE INDEX "Vendor_teamId_name_key" ON "Vendor"("teamId", "name");
CREATE INDEX "Vendor_teamId_deletedAt_idx" ON "Vendor"("teamId", "deletedAt");

CREATE UNIQUE INDEX "Contract_projectId_reference_key" ON "Contract"("projectId", "reference");
CREATE INDEX "Contract_teamId_idx" ON "Contract"("teamId");
CREATE INDEX "Contract_projectId_status_idx" ON "Contract"("projectId", "status");
CREATE INDEX "Contract_vendorId_idx" ON "Contract"("vendorId");

CREATE UNIQUE INDEX "PurchaseOrder_projectId_reference_key" ON "PurchaseOrder"("projectId", "reference");
CREATE INDEX "PurchaseOrder_teamId_idx" ON "PurchaseOrder"("teamId");
CREATE INDEX "PurchaseOrder_projectId_status_idx" ON "PurchaseOrder"("projectId", "status");
CREATE INDEX "PurchaseOrder_contractId_idx" ON "PurchaseOrder"("contractId");

CREATE UNIQUE INDEX "QualityNcr_projectId_reference_key" ON "QualityNcr"("projectId", "reference");
CREATE INDEX "QualityNcr_teamId_idx" ON "QualityNcr"("teamId");
CREATE INDEX "QualityNcr_projectId_severity_idx" ON "QualityNcr"("projectId", "severity");
CREATE INDEX "QualityNcr_correctiveTaskId_idx" ON "QualityNcr"("correctiveTaskId");

-- Foreign keys
ALTER TABLE "RiskRecord"
    ADD CONSTRAINT "RiskRecord_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "RiskRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "RiskRecord_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "RiskRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ChangeRequest"
    ADD CONSTRAINT "ChangeRequest_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "ChangeRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "ChangeRequest_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "ChangeRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Vendor"
    ADD CONSTRAINT "Vendor_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Contract"
    ADD CONSTRAINT "Contract_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "Contract_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "Contract_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "Contract_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PurchaseOrder"
    ADD CONSTRAINT "PurchaseOrder_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "PurchaseOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "PurchaseOrder_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "PurchaseOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "QualityNcr"
    ADD CONSTRAINT "QualityNcr_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "QualityNcr_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "QualityNcr_correctiveTaskId_fkey" FOREIGN KEY ("correctiveTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "QualityNcr_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Grant R9 permissions to all existing Manager system roles.
INSERT INTO "RolePermission" ("roleId", "permission")
SELECT r."id", p.perm
FROM "Role" r
CROSS JOIN (VALUES
  ('risk.manage'), ('change.manage'), ('change.approve'),
  ('procurement.manage'), ('quality.manage')
) AS p(perm)
WHERE r."isSystem" = true AND r."name" = 'Manager'
ON CONFLICT DO NOTHING;
