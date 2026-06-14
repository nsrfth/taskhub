-- v1.51: User Groups — cross-team members, FULL/READONLY access levels, invitations.

-- CreateEnum
CREATE TYPE "GroupAccessLevel" AS ENUM ('FULL', 'READONLY');
CREATE TYPE "GroupInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- AlterEnum
ALTER TYPE "NotifyType" ADD VALUE 'GROUP_INVITE';

-- Expand UserGroupMember (was composite PK groupId+userId in v1.50).
ALTER TABLE "UserGroupMember" ADD COLUMN "id" TEXT;
UPDATE "UserGroupMember" SET "id" = 'ugm_' || "groupId" || '_' || "userId";
ALTER TABLE "UserGroupMember" ALTER COLUMN "id" SET NOT NULL;

ALTER TABLE "UserGroupMember" ADD COLUMN "accessLevel" "GroupAccessLevel" NOT NULL DEFAULT 'FULL';
ALTER TABLE "UserGroupMember" ADD COLUMN "status" "GroupInviteStatus" NOT NULL DEFAULT 'ACCEPTED';
ALTER TABLE "UserGroupMember" ADD COLUMN "invitedById" TEXT;
ALTER TABLE "UserGroupMember" ADD COLUMN "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "UserGroupMember" ADD COLUMN "respondedAt" TIMESTAMP(3);
ALTER TABLE "UserGroupMember" ADD COLUMN "external" BOOLEAN NOT NULL DEFAULT false;

UPDATE "UserGroupMember" SET "invitedAt" = "addedAt" WHERE "addedAt" IS NOT NULL;

ALTER TABLE "UserGroupMember" DROP CONSTRAINT "UserGroupMember_pkey";
ALTER TABLE "UserGroupMember" ADD CONSTRAINT "UserGroupMember_pkey" PRIMARY KEY ("id");
ALTER TABLE "UserGroupMember" ADD CONSTRAINT "UserGroupMember_groupId_userId_key" UNIQUE ("groupId", "userId");

ALTER TABLE "UserGroupMember" DROP COLUMN "addedAt";

DROP INDEX IF EXISTS "UserGroupMember_userId_idx";
CREATE INDEX "UserGroupMember_userId_status_idx" ON "UserGroupMember"("userId", "status");
CREATE INDEX "UserGroupMember_groupId_idx" ON "UserGroupMember"("groupId");

ALTER TABLE "UserGroupMember" ADD CONSTRAINT "UserGroupMember_invitedById_fkey"
  FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
