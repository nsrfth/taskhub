-- v1.45: personal project buckets (per-user organizational views).

CREATE TABLE "UserProjectBucket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProjectBucket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserProjectBucketItem" (
    "id" TEXT NOT NULL,
    "bucketId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserProjectBucketItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserProjectBucket_userId_name_key" ON "UserProjectBucket"("userId", "name");
CREATE INDEX "UserProjectBucket_userId_position_idx" ON "UserProjectBucket"("userId", "position");

CREATE UNIQUE INDEX "UserProjectBucketItem_bucketId_projectId_key" ON "UserProjectBucketItem"("bucketId", "projectId");
CREATE INDEX "UserProjectBucketItem_bucketId_position_idx" ON "UserProjectBucketItem"("bucketId", "position");
CREATE INDEX "UserProjectBucketItem_userId_projectId_idx" ON "UserProjectBucketItem"("userId", "projectId");

ALTER TABLE "UserProjectBucket" ADD CONSTRAINT "UserProjectBucket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserProjectBucketItem" ADD CONSTRAINT "UserProjectBucketItem_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "UserProjectBucket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
