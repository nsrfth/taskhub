-- v1.90: Correspondence (دبیرخانه) module. Per-project letters register, optional
-- (enabled per project by a global admin via Project.correspondenceEnabled), with
-- a team-level contacts directory, auto per-project/Jalali-year reference numbers,
-- referral (ارجاع) workflow, and reused (now polymorphic) attachments. Additive.

-- CreateEnum
CREATE TYPE "CorrespondenceDirection" AS ENUM ('INCOMING', 'OUTGOING', 'INTERNAL');
CREATE TYPE "CorrespondenceStatus" AS ENUM ('DRAFT', 'SENT', 'RECEIVED', 'ARCHIVED');
CREATE TYPE "ContactType" AS ENUM ('PERSON', 'ORG');
CREATE TYPE "ReferralKind" AS ENUM ('ACTION', 'INFO');
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'HANDLED');

-- AlterEnum (only declared here; never used in this migration's statements, so it is
-- transaction-safe on PG12+, same as the v1.87 PENDING_APPROVAL add).
ALTER TYPE "NotifyType" ADD VALUE 'CORRESPONDENCE_REFERRAL';

-- AlterTable: per-project module toggle.
ALTER TABLE "Project" ADD COLUMN "correspondenceEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: Attachment becomes polymorphic (task OR correspondence).
ALTER TABLE "Attachment" ALTER COLUMN "taskId" DROP NOT NULL;
ALTER TABLE "Attachment" ADD COLUMN "correspondenceId" TEXT;

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organization" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "type" "ContactType" NOT NULL DEFAULT 'PERSON',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Correspondence" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "direction" "CorrespondenceDirection" NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT,
    "letterDate" TIMESTAMP(3) NOT NULL,
    "jalaliYear" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "status" "CorrespondenceStatus" NOT NULL DEFAULT 'DRAFT',
    "senderId" TEXT,
    "recipientId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,

    CONSTRAINT "Correspondence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CorrespondenceReferral" (
    "id" TEXT NOT NULL,
    "correspondenceId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "ReferralKind" NOT NULL DEFAULT 'ACTION',
    "note" TEXT,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "referredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handledAt" TIMESTAMP(3),

    CONSTRAINT "CorrespondenceReferral_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CorrespondenceCounter" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "jalaliYear" INTEGER NOT NULL,
    "currentValue" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CorrespondenceCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contact_teamId_deletedAt_idx" ON "Contact"("teamId", "deletedAt");
CREATE INDEX "Contact_teamId_name_idx" ON "Contact"("teamId", "name");
CREATE INDEX "Correspondence_teamId_idx" ON "Correspondence"("teamId");
CREATE INDEX "Correspondence_projectId_deletedAt_letterDate_idx" ON "Correspondence"("projectId", "deletedAt", "letterDate");
CREATE INDEX "Correspondence_projectId_status_idx" ON "Correspondence"("projectId", "status");
CREATE UNIQUE INDEX "Correspondence_projectId_jalaliYear_sequence_key" ON "Correspondence"("projectId", "jalaliYear", "sequence");
CREATE UNIQUE INDEX "Correspondence_projectId_referenceNumber_key" ON "Correspondence"("projectId", "referenceNumber");
CREATE INDEX "CorrespondenceReferral_userId_status_idx" ON "CorrespondenceReferral"("userId", "status");
CREATE INDEX "CorrespondenceReferral_correspondenceId_idx" ON "CorrespondenceReferral"("correspondenceId");
CREATE UNIQUE INDEX "CorrespondenceReferral_correspondenceId_userId_key" ON "CorrespondenceReferral"("correspondenceId", "userId");
CREATE UNIQUE INDEX "CorrespondenceCounter_projectId_jalaliYear_key" ON "CorrespondenceCounter"("projectId", "jalaliYear");
CREATE INDEX "Attachment_correspondenceId_idx" ON "Attachment"("correspondenceId");

-- Exactly one attachment parent.
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_one_parent"
  CHECK (("taskId" IS NOT NULL) <> ("correspondenceId" IS NOT NULL));

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_correspondenceId_fkey" FOREIGN KEY ("correspondenceId") REFERENCES "Correspondence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Correspondence" ADD CONSTRAINT "Correspondence_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Correspondence" ADD CONSTRAINT "Correspondence_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Correspondence" ADD CONSTRAINT "Correspondence_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Correspondence" ADD CONSTRAINT "Correspondence_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Correspondence" ADD CONSTRAINT "Correspondence_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Correspondence" ADD CONSTRAINT "Correspondence_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CorrespondenceReferral" ADD CONSTRAINT "CorrespondenceReferral_correspondenceId_fkey" FOREIGN KEY ("correspondenceId") REFERENCES "Correspondence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CorrespondenceReferral" ADD CONSTRAINT "CorrespondenceReferral_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CorrespondenceReferral" ADD CONSTRAINT "CorrespondenceReferral_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CorrespondenceReferral" ADD CONSTRAINT "CorrespondenceReferral_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CorrespondenceCounter" ADD CONSTRAINT "CorrespondenceCounter_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RBAC backfill: grant the new correspondence/contacts permissions to every
-- existing system Manager role (v1.23 backfill convention). Members do not get
-- manage by default; correspondence.read is granted to Members in the seed.
INSERT INTO "RolePermission" ("roleId", "permission")
SELECT r."id", p.perm
FROM "Role" r
CROSS JOIN (VALUES ('correspondence.read'), ('correspondence.manage'), ('contacts.manage')) AS p(perm)
WHERE r."name" = 'Manager' AND r."isSystem" = true
ON CONFLICT DO NOTHING;
