import type { Prisma } from '@prisma/client';
import { prisma } from '../data/prisma.js';

// v2.1 (PMIS R5): bump the project's scheduleVersion whenever schedule-shaping
// data changes so on-demand CPM cache keys invalidate.
export async function bumpScheduleVersion(
  client: Prisma.TransactionClient | typeof prisma,
  projectId: string,
): Promise<number> {
  const row = await client.project.update({
    where: { id: projectId },
    data: { scheduleVersion: { increment: 1 } },
    select: { scheduleVersion: true },
  });
  return row.scheduleVersion;
}
