-- v1.87: per-task approval gate.
-- A task may require approval by a designated approver. "Completing" it (moving
-- to DONE) by a non-finalizer routes it to the new PENDING_APPROVAL state; the
-- approver (or a project manager / global admin) then approves (→ DONE) or
-- rejects with a reason (→ IN_PROGRESS). Additive — a new enum value plus two
-- nullable columns; no backfill, existing tasks unaffected. The new enum value
-- is referenced only at runtime, never in this migration, so adding it in the
-- same transaction is safe on PostgreSQL 12+.

-- AlterEnum
ALTER TYPE "TaskStatus" ADD VALUE 'PENDING_APPROVAL';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "approverId" TEXT;

-- CreateIndex
CREATE INDEX "Task_approverId_idx" ON "Task"("approverId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
