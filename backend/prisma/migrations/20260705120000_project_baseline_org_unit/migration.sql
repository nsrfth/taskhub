-- v1.96 (PMIS R1 — neutral core): formal project baselines + the org-unit
-- attach point. Additive:
--   1. ProjectBaseline   — immutable snapshot of task plan/progress at capture.
--   2. Project.orgUnitId  — nullable id (no FK yet; the OrgUnit table lands R3).

-- CreateEnum
CREATE TYPE "BaselineSource" AS ENUM ('MANUAL', 'CHANGE_REQUEST');

-- AlterTable: portfolio attach point (plain nullable id; FK added in R3).
ALTER TABLE "Project" ADD COLUMN "orgUnitId" TEXT;

-- CreateTable
CREATE TABLE "ProjectBaseline" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" "BaselineSource" NOT NULL DEFAULT 'MANUAL',
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "snapshot" JSONB NOT NULL,
    "capturedById" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectBaseline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Project_orgUnitId_idx" ON "Project"("orgUnitId");
CREATE INDEX "ProjectBaseline_projectId_isCurrent_idx" ON "ProjectBaseline"("projectId", "isCurrent");
CREATE INDEX "ProjectBaseline_teamId_idx" ON "ProjectBaseline"("teamId");

-- AddForeignKey
ALTER TABLE "ProjectBaseline" ADD CONSTRAINT "ProjectBaseline_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectBaseline" ADD CONSTRAINT "ProjectBaseline_capturedById_fkey" FOREIGN KEY ("capturedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
