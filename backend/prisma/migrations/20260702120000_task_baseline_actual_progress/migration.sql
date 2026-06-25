-- v1.93 (PMIS R1 — neutral core): task schedule baseline + actual execution
-- dates and a stored percent-complete. All additive: dates nullable;
-- percentComplete defaults 0 with a 0..100 CHECK (mirrors the budget CHECKs).

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "baselineStart" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN "baselineEnd" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN "actualStart" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN "actualEnd" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN "percentComplete" INTEGER NOT NULL DEFAULT 0;

-- CHECK: percent-complete stays within 0..100.
ALTER TABLE "Task" ADD CONSTRAINT "Task_percentComplete_range" CHECK ("percentComplete" >= 0 AND "percentComplete" <= 100);
