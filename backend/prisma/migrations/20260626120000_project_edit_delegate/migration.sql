-- v1.86: per-project "full-edit" delegation.
-- The project owner (or a global ADMIN) may name users who can edit ALL
-- task/subtask fields on a given project — including the manager-only date
-- fields and the task.change_responsible-gated field — for THAT project only.
-- Kept deliberately separate from project access (resolveProjectAccess) and
-- group grants so WRITE/FULL access never silently bypasses those field-level
-- restrictions. Additive table — no backfill, existing teams/members unaffected.

-- CreateTable
CREATE TABLE "ProjectEditDelegate" (
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedById" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectEditDelegate_pkey" PRIMARY KEY ("projectId","userId")
);

-- CreateIndex
CREATE INDEX "ProjectEditDelegate_userId_idx" ON "ProjectEditDelegate"("userId");

-- AddForeignKey
ALTER TABLE "ProjectEditDelegate" ADD CONSTRAINT "ProjectEditDelegate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectEditDelegate" ADD CONSTRAINT "ProjectEditDelegate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectEditDelegate" ADD CONSTRAINT "ProjectEditDelegate_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
