import { Prisma, type GlobalRole } from '@prisma/client';
import { prisma } from '../data/prisma.js';
import { Errors } from '../lib/errors.js';
import type {
  CreateProjectBucketBody,
  UpdateProjectBucketBody,
} from '../schemas/userProjectBuckets.js';

export interface ProjectBucketView {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  projectIds: string[];
}

function serializeBucket(
  row: {
    id: string;
    name: string;
    description: string | null;
    color: string | null;
    position: number;
    createdAt: Date;
    updatedAt: Date;
    items: { projectId: string; position: number }[];
  },
): ProjectBucketView {
  const projectIds = [...row.items]
    .sort((a, b) => a.position - b.position || a.projectId.localeCompare(b.projectId))
    .map((i) => i.projectId);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    position: row.position,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    projectIds,
  };
}

const BUCKET_INCLUDE = {
  items: { select: { projectId: true, position: true }, orderBy: { position: 'asc' as const } },
} as const;

export class UserProjectBucketsService {
  /** Ensure caller can see the project before allowing bucket assignment. */
  async assertProjectVisible(
    callerUserId: string,
    callerGlobalRole: GlobalRole,
    projectId: string,
  ): Promise<void> {
    const p = await prisma.project.findUnique({
      where: { id: projectId },
      select: { teamId: true, ownerId: true },
    });
    if (!p) throw Errors.notFound('Project not found');
    if (callerGlobalRole === 'ADMIN') return;
    if (p.ownerId !== callerUserId) throw Errors.notFound('Project not found');
    const mem = await prisma.teamMembership.findUnique({
      where: { userId_teamId: { userId: callerUserId, teamId: p.teamId } },
      select: { userId: true },
    });
    if (!mem) throw Errors.notFound('Project not found');
  }

  async list(userId: string): Promise<ProjectBucketView[]> {
    const rows = await prisma.userProjectBucket.findMany({
      where: { userId },
      orderBy: { position: 'asc' },
      include: BUCKET_INCLUDE,
    });
    return rows.map(serializeBucket);
  }

  async create(userId: string, input: CreateProjectBucketBody): Promise<ProjectBucketView> {
    const max = await prisma.userProjectBucket.aggregate({
      where: { userId },
      _max: { position: true },
    });
    try {
      const row = await prisma.userProjectBucket.create({
        data: {
          userId,
          name: input.name,
          description: input.description ?? null,
          color: input.color ?? null,
          position: (max._max.position ?? -1) + 1,
        },
        include: BUCKET_INCLUDE,
      });
      return serializeBucket(row);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw Errors.conflict('A bucket with this name already exists');
      }
      throw err;
    }
  }

  private async getOwnedBucket(userId: string, bucketId: string) {
    const row = await prisma.userProjectBucket.findFirst({
      where: { id: bucketId, userId },
      include: BUCKET_INCLUDE,
    });
    if (!row) throw Errors.notFound('Bucket not found');
    return row;
  }

  async update(
    userId: string,
    bucketId: string,
    input: UpdateProjectBucketBody,
  ): Promise<ProjectBucketView> {
    await this.getOwnedBucket(userId, bucketId);
    try {
      const row = await prisma.userProjectBucket.update({
        where: { id: bucketId },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.color !== undefined && { color: input.color }),
        },
        include: BUCKET_INCLUDE,
      });
      return serializeBucket(row);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw Errors.conflict('A bucket with this name already exists');
      }
      throw err;
    }
  }

  async remove(userId: string, bucketId: string): Promise<void> {
    await this.getOwnedBucket(userId, bucketId);
    await prisma.userProjectBucket.delete({ where: { id: bucketId } });
  }

  async reorderBuckets(userId: string, bucketIds: string[]): Promise<ProjectBucketView[]> {
    const existing = await prisma.userProjectBucket.findMany({
      where: { userId },
      select: { id: true },
    });
    const set = new Set(existing.map((b) => b.id));
    if (bucketIds.length !== set.size || bucketIds.some((id) => !set.has(id))) {
      throw Errors.badRequest('bucketIds must be a full permutation of your buckets');
    }
    await prisma.$transaction(
      bucketIds.map((id, position) =>
        prisma.userProjectBucket.update({ where: { id }, data: { position } }),
      ),
    );
    return this.list(userId);
  }

  async addProject(
    userId: string,
    callerGlobalRole: GlobalRole,
    bucketId: string,
    projectId: string,
  ): Promise<ProjectBucketView> {
    await this.getOwnedBucket(userId, bucketId);
    await this.assertProjectVisible(userId, callerGlobalRole, projectId);
    const max = await prisma.userProjectBucketItem.aggregate({
      where: { bucketId },
      _max: { position: true },
    });
    try {
      await prisma.userProjectBucketItem.create({
        data: {
          bucketId,
          userId,
          projectId,
          position: (max._max.position ?? -1) + 1,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Already in bucket — idempotent.
      } else {
        throw err;
      }
    }
    return serializeBucket(await this.getOwnedBucket(userId, bucketId));
  }

  async removeProject(userId: string, bucketId: string, projectId: string): Promise<ProjectBucketView> {
    await this.getOwnedBucket(userId, bucketId);
    await prisma.userProjectBucketItem.deleteMany({
      where: { bucketId, userId, projectId },
    });
    return serializeBucket(await this.getOwnedBucket(userId, bucketId));
  }

  async reorderProjects(
    userId: string,
    bucketId: string,
    projectIds: string[],
  ): Promise<ProjectBucketView> {
    const bucket = await this.getOwnedBucket(userId, bucketId);
    const existing = new Set(bucket.items.map((i) => i.projectId));
    if (projectIds.length !== existing.size || projectIds.some((id) => !existing.has(id))) {
      throw Errors.badRequest('projectIds must be a full permutation of projects in this bucket');
    }
    await prisma.$transaction(
      projectIds.map((projectId, position) =>
        prisma.userProjectBucketItem.update({
          where: { bucketId_projectId: { bucketId, projectId } },
          data: { position },
        }),
      ),
    );
    return serializeBucket(await this.getOwnedBucket(userId, bucketId));
  }

  async setProjectBuckets(
    userId: string,
    callerGlobalRole: GlobalRole,
    projectId: string,
    bucketIds: string[],
  ): Promise<ProjectBucketView[]> {
    await this.assertProjectVisible(userId, callerGlobalRole, projectId);
    const owned = await prisma.userProjectBucket.findMany({
      where: { userId },
      select: { id: true },
    });
    const ownedSet = new Set(owned.map((b) => b.id));
    if (bucketIds.some((id) => !ownedSet.has(id))) {
      throw Errors.badRequest('Unknown bucket id');
    }
    await prisma.$transaction(async (tx) => {
      await tx.userProjectBucketItem.deleteMany({ where: { userId, projectId } });
      for (let i = 0; i < bucketIds.length; i++) {
        await tx.userProjectBucketItem.create({
          data: {
            bucketId: bucketIds[i]!,
            userId,
            projectId,
            position: i,
          },
        });
      }
    });
    return this.list(userId);
  }
}
