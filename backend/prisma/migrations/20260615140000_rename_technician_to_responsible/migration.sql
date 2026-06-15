-- v1.77: rename Task/Subtask technicianId → responsibleId (data-preserving RENAME).
-- Also rename permission task.change_technician → task.change_responsible.

-- Task
ALTER TABLE "Task" RENAME COLUMN "technicianId" TO "responsibleId";
ALTER TABLE "Task" RENAME CONSTRAINT "Task_technicianId_fkey" TO "Task_responsibleId_fkey";
ALTER INDEX "Task_teamId_technicianId_idx" RENAME TO "Task_teamId_responsibleId_idx";

-- Subtask
ALTER TABLE "Subtask" RENAME COLUMN "technicianId" TO "responsibleId";
ALTER TABLE "Subtask" RENAME CONSTRAINT "Subtask_technicianId_fkey" TO "Subtask_responsibleId_fkey";
ALTER INDEX "Subtask_technicianId_idx" RENAME TO "Subtask_responsibleId_idx";

-- Permission backfill: existing custom roles keep the capability under the new name.
UPDATE "RolePermission"
SET "permission" = 'task.change_responsible'
WHERE "permission" = 'task.change_technician';
