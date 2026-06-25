-- v1.97 (PMIS R1 — neutral core): WBS n-level task tree. Additive — two columns
-- on Task plus a self-FK. No backfill: every existing task defaults to parentId
-- NULL (a WBS root) and wbsOrder 0 (the /wbs read tie-breaks equal orders by
-- createdAt, so today's tasks list in insertion order). The outline code, depth,
-- and isSummary flag are derived on read, so nothing is persisted for them.

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "parentId" TEXT;
ALTER TABLE "Task" ADD COLUMN "wbsOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Task_projectId_parentId_idx" ON "Task"("projectId", "parentId");

-- AddForeignKey: WBS self-reference. SetNull promotes children to roots if a
-- parent task is ever hard-deleted/purged (soft-delete leaves parentId intact
-- and is handled in the read layer).
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
