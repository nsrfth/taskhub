-- v1.94 (PMIS R1 — neutral core): Consulted / Informed RACI legs as a join
-- table. Responsible (Task.responsibleId) + Accountable (Project.accountableId)
-- already exist. Additive; cascades on task or user delete.

-- CreateEnum
CREATE TYPE "RaciRole" AS ENUM ('CONSULTED', 'INFORMED');

-- CreateTable
CREATE TABLE "TaskRaci" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "RaciRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskRaci_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskRaci_taskId_userId_role_key" ON "TaskRaci"("taskId", "userId", "role");
CREATE INDEX "TaskRaci_taskId_idx" ON "TaskRaci"("taskId");
CREATE INDEX "TaskRaci_userId_idx" ON "TaskRaci"("userId");

-- AddForeignKey
ALTER TABLE "TaskRaci" ADD CONSTRAINT "TaskRaci_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskRaci" ADD CONSTRAINT "TaskRaci_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
