-- v2.4 (PMIS R8 — record framework): generic project-record register.
-- PmisRecordType defines the type (Issue, RFI, Document, Stakeholder, MoM, …).
-- PmisRecord holds instances; PmisRecordComment is a per-record discussion thread.
-- Built-in types are seeded below.

CREATE TYPE "RecordTypeKind" AS ENUM ('BUILTIN', 'CUSTOM');

CREATE TABLE "PmisRecordType" (
    "id"          TEXT NOT NULL,
    "teamId"      TEXT,
    "key"         TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "kind"        "RecordTypeKind" NOT NULL DEFAULT 'CUSTOM',
    "statusSet"   JSONB NOT NULL DEFAULT '[]',
    "transitions" JSONB NOT NULL DEFAULT '[]',
    "position"    INTEGER NOT NULL DEFAULT 0,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PmisRecordType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PmisRecord" (
    "id"           TEXT NOT NULL,
    "teamId"       TEXT NOT NULL,
    "projectId"    TEXT NOT NULL,
    "recordTypeId" TEXT NOT NULL,
    "reference"    TEXT NOT NULL,
    "title"        TEXT NOT NULL,
    "description"  TEXT,
    "status"       TEXT NOT NULL DEFAULT 'OPEN',
    "fieldValues"  JSONB NOT NULL DEFAULT '{}',
    "assigneeId"   TEXT,
    "dueDate"      TIMESTAMP(3),
    "closedAt"     TIMESTAMP(3),
    "createdById"  TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PmisRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PmisRecordComment" (
    "id"        TEXT NOT NULL,
    "recordId"  TEXT NOT NULL,
    "authorId"  TEXT,
    "body"      TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PmisRecordComment_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "PmisRecordType_teamId_key_key" ON "PmisRecordType"("teamId", "key");
CREATE INDEX "PmisRecordType_teamId_idx" ON "PmisRecordType"("teamId");

CREATE UNIQUE INDEX "PmisRecord_projectId_reference_key" ON "PmisRecord"("projectId", "reference");
CREATE INDEX "PmisRecord_teamId_idx" ON "PmisRecord"("teamId");
CREATE INDEX "PmisRecord_projectId_recordTypeId_idx" ON "PmisRecord"("projectId", "recordTypeId");
CREATE INDEX "PmisRecord_projectId_status_idx" ON "PmisRecord"("projectId", "status");
CREATE INDEX "PmisRecord_assigneeId_idx" ON "PmisRecord"("assigneeId");

CREATE INDEX "PmisRecordComment_recordId_createdAt_idx" ON "PmisRecordComment"("recordId", "createdAt");

-- Foreign keys
ALTER TABLE "PmisRecordType"
    ADD CONSTRAINT "PmisRecordType_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PmisRecord"
    ADD CONSTRAINT "PmisRecord_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "PmisRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "PmisRecord_recordTypeId_fkey" FOREIGN KEY ("recordTypeId") REFERENCES "PmisRecordType"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "PmisRecord_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "PmisRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PmisRecordComment"
    ADD CONSTRAINT "PmisRecordComment_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "PmisRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "PmisRecordComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed global built-in record types (teamId NULL = available to all teams).
INSERT INTO "PmisRecordType" ("id", "teamId", "key", "name", "kind", "statusSet", "transitions", "position", "createdAt", "updatedAt") VALUES
  (gen_random_uuid()::text, NULL, 'issue',       'Issue',       'BUILTIN', '["OPEN","IN_PROGRESS","RESOLVED","CLOSED"]',       '[]', 0, NOW(), NOW()),
  (gen_random_uuid()::text, NULL, 'rfi',         'RFI',         'BUILTIN', '["OPEN","PENDING","ANSWERED","CLOSED"]',            '[]', 1, NOW(), NOW()),
  (gen_random_uuid()::text, NULL, 'document',    'Document',    'BUILTIN', '["DRAFT","REVIEW","APPROVED","SUPERSEDED"]',        '[]', 2, NOW(), NOW()),
  (gen_random_uuid()::text, NULL, 'stakeholder', 'Stakeholder', 'BUILTIN', '["ACTIVE","INACTIVE"]',                             '[]', 3, NOW(), NOW()),
  (gen_random_uuid()::text, NULL, 'mom',         'MoM',         'BUILTIN', '["DRAFT","DISTRIBUTED","APPROVED"]',               '[]', 4, NOW(), NOW());

-- Grant record.manage to all existing Manager system roles.
INSERT INTO "RolePermission" ("roleId", "permission")
SELECT r."id", 'record.manage'
FROM "Role" r
WHERE r."isSystem" = true AND r."name" = 'Manager'
ON CONFLICT DO NOTHING;
