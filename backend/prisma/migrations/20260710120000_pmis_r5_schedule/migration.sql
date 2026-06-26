-- v2.1 (PMIS R5 — scheduling engine + baselines on the Gantt). Additive:
-- dependency lag/lead, task milestones, formal BaselineEntry rows, CapacityCalendar
-- scaffold, project scheduleVersion for CPM cache busting. No permission backfill
-- (R5 reuses core.capture_baseline + profile module gates).

-- CreateEnum
CREATE TYPE "LagUnit" AS ENUM ('DAY', 'HOUR');
CREATE TYPE "CalendarMode" AS ENUM ('WORKING', 'CALENDAR');
CREATE TYPE "CapacityCalendarScope" AS ENUM ('TEAM', 'RESOURCE', 'PROJECT');
CREATE TYPE "CalendarExceptionKind" AS ENUM ('HOLIDAY', 'WORKDAY');

-- AlterTable Project
ALTER TABLE "Project" ADD COLUMN "scheduleVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable Task
ALTER TABLE "Task" ADD COLUMN "isMilestone" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Task" ADD COLUMN "milestoneKind" TEXT;

-- AlterTable TaskDependency
ALTER TABLE "TaskDependency" ADD COLUMN "lag" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TaskDependency" ADD COLUMN "lagUnit" "LagUnit" NOT NULL DEFAULT 'DAY';
ALTER TABLE "TaskDependency" ADD COLUMN "calendarMode" "CalendarMode" NOT NULL DEFAULT 'WORKING';

-- CreateTable BaselineEntry
CREATE TABLE "BaselineEntry" (
    "id" TEXT NOT NULL,
    "baselineId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "start" TIMESTAMP(3),
    "end" TIMESTAMP(3),
    CONSTRAINT "BaselineEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable CapacityCalendar
CREATE TABLE "CapacityCalendar" (
    "id" TEXT NOT NULL,
    "scope" "CapacityCalendarScope" NOT NULL,
    "teamId" TEXT,
    "projectId" TEXT,
    "workdayHours" DECIMAL(4,2) DEFAULT 8,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CapacityCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable CalendarException
CREATE TABLE "CalendarException" (
    "id" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kind" "CalendarExceptionKind" NOT NULL,
    "hours" DECIMAL(4,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CalendarException_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BaselineEntry_baselineId_taskId_key" ON "BaselineEntry"("baselineId", "taskId");
CREATE INDEX "BaselineEntry_baselineId_idx" ON "BaselineEntry"("baselineId");
CREATE INDEX "BaselineEntry_taskId_idx" ON "BaselineEntry"("taskId");

CREATE INDEX "CapacityCalendar_teamId_idx" ON "CapacityCalendar"("teamId");
CREATE INDEX "CapacityCalendar_projectId_idx" ON "CapacityCalendar"("projectId");

CREATE UNIQUE INDEX "CalendarException_calendarId_date_key" ON "CalendarException"("calendarId", "date");

-- AddForeignKey
ALTER TABLE "BaselineEntry" ADD CONSTRAINT "BaselineEntry_baselineId_fkey" FOREIGN KEY ("baselineId") REFERENCES "ProjectBaseline"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BaselineEntry" ADD CONSTRAINT "BaselineEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CapacityCalendar" ADD CONSTRAINT "CapacityCalendar_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CapacityCalendar" ADD CONSTRAINT "CapacityCalendar_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CalendarException" ADD CONSTRAINT "CalendarException_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "CapacityCalendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill BaselineEntry from existing ProjectBaseline snapshot JSON (best-effort:
-- reads taskId + start/due from the R1 snapshot shape).
INSERT INTO "BaselineEntry" ("id", "baselineId", "taskId", "start", "end")
SELECT gen_random_uuid()::text, pb."id", t->>'taskId',
       CASE WHEN COALESCE(t->>'startDate', t->>'baselineStart') IS NOT NULL
            THEN (COALESCE(t->>'startDate', t->>'baselineStart'))::timestamptz ELSE NULL END,
       CASE WHEN COALESCE(t->>'dueDate', t->>'baselineEnd') IS NOT NULL
            THEN (COALESCE(t->>'dueDate', t->>'baselineEnd'))::timestamptz ELSE NULL END
FROM "ProjectBaseline" pb,
     LATERAL jsonb_array_elements(
       CASE WHEN jsonb_typeof(pb."snapshot"->'tasks') = 'array'
            THEN pb."snapshot"->'tasks' ELSE '[]'::jsonb END
     ) AS t
WHERE t->>'taskId' IS NOT NULL
ON CONFLICT DO NOTHING;
