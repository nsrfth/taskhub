-- v2.2 (PMIS R6 — resource management): Resource catalog, Skill catalog,
-- ResourceSkill join, and ResourceAssignment linking resources to WBS tasks.
-- resource.manage permission added to Manager role.

CREATE TYPE "ResourceType" AS ENUM ('HUMAN', 'EQUIPMENT', 'MATERIAL');

CREATE TABLE "Resource" (
    "id"            TEXT NOT NULL,
    "teamId"        TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    "type"          "ResourceType" NOT NULL DEFAULT 'HUMAN',
    "userId"        TEXT,
    "email"         TEXT,
    "maxUnits"      DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "costRateMinor" BIGINT,
    "currency"      "Currency",
    "calendarId"    TEXT,
    "notes"         TEXT,
    "deletedAt"     TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Skill" (
    "id"        TEXT NOT NULL,
    "teamId"    TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResourceSkill" (
    "resourceId" TEXT NOT NULL,
    "skillId"    TEXT NOT NULL,
    "level"      INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "ResourceSkill_pkey" PRIMARY KEY ("resourceId", "skillId")
);

CREATE TABLE "ResourceAssignment" (
    "id"           TEXT NOT NULL,
    "teamId"       TEXT NOT NULL,
    "projectId"    TEXT NOT NULL,
    "taskId"       TEXT NOT NULL,
    "resourceId"   TEXT NOT NULL,
    "units"        DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "plannedHours" DOUBLE PRECISION,
    "actualHours"  DOUBLE PRECISION,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ResourceAssignment_pkey" PRIMARY KEY ("id")
);

-- Unique + index constraints
CREATE UNIQUE INDEX "Resource_teamId_name_key" ON "Resource"("teamId", "name");
CREATE INDEX "Resource_teamId_deletedAt_idx" ON "Resource"("teamId", "deletedAt");
CREATE INDEX "Resource_userId_idx" ON "Resource"("userId");
CREATE INDEX "Resource_calendarId_idx" ON "Resource"("calendarId");

CREATE UNIQUE INDEX "Skill_teamId_name_key" ON "Skill"("teamId", "name");
CREATE INDEX "Skill_teamId_idx" ON "Skill"("teamId");

CREATE UNIQUE INDEX "ResourceAssignment_taskId_resourceId_key" ON "ResourceAssignment"("taskId", "resourceId");
CREATE INDEX "ResourceAssignment_teamId_idx" ON "ResourceAssignment"("teamId");
CREATE INDEX "ResourceAssignment_resourceId_idx" ON "ResourceAssignment"("resourceId");
CREATE INDEX "ResourceAssignment_projectId_idx" ON "ResourceAssignment"("projectId");
CREATE INDEX "ResourceAssignment_taskId_idx" ON "ResourceAssignment"("taskId");

-- Foreign keys
ALTER TABLE "Resource"
    ADD CONSTRAINT "Resource_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "Resource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "Resource_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "CapacityCalendar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Skill"
    ADD CONSTRAINT "Skill_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ResourceSkill"
    ADD CONSTRAINT "ResourceSkill_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "ResourceSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ResourceAssignment"
    ADD CONSTRAINT "ResourceAssignment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "ResourceAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "ResourceAssignment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "ResourceAssignment_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Grant resource.manage to all existing Manager system roles.
INSERT INTO "RolePermission" ("roleId", "permission")
SELECT r."id", 'resource.manage'
FROM "Role" r
WHERE r."isSystem" = true AND r."name" = 'Manager'
ON CONFLICT DO NOTHING;
