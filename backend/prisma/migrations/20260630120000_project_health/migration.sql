-- v1.91 (PMIS R1 — neutral core): project health (RAG) for portfolio roll-up.
-- Additive and non-breaking: ragStatus defaults GREEN so every existing project
-- stays valid with no backfill; ragReason + healthUpdatedAt are nullable.

-- CreateEnum
CREATE TYPE "RagStatus" AS ENUM ('GREEN', 'AMBER', 'RED');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "ragStatus" "RagStatus" NOT NULL DEFAULT 'GREEN';
ALTER TABLE "Project" ADD COLUMN "ragReason" TEXT;
ALTER TABLE "Project" ADD COLUMN "healthUpdatedAt" TIMESTAMP(3);
