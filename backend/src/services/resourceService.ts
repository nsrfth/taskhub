import type { Prisma } from '@prisma/client';
import { prisma } from '../data/prisma.js';
import { Errors } from '../lib/errors.js';
import type {
  CreateAssignmentBody,
  CreateResourceBody,
  CreateSkillBody,
  SetResourceSkillsBody,
  UpdateAssignmentBody,
  UpdateResourceBody,
  WorkloadQuery,
} from '../schemas/resources.js';

export class ResourceService {
  private async assertTeam(teamId: string) {
    const t = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true } });
    if (!t) throw Errors.notFound('Team not found');
  }

  private async assertProject(teamId: string, projectId: string) {
    const p = await prisma.project.findFirst({ where: { id: projectId, teamId }, select: { id: true } });
    if (!p) throw Errors.notFound('Project not found');
  }

  // ── Resources ────────────────────────────────────────────────────────────

  async listResources(teamId: string) {
    await this.assertTeam(teamId);
    const rows = await prisma.resource.findMany({
      where: { teamId, deletedAt: null },
      include: { skills: { include: { skill: true } } },
      orderBy: { name: 'asc' },
    });
    return rows.map(this.toView);
  }

  async getResource(teamId: string, resourceId: string) {
    const r = await prisma.resource.findFirst({
      where: { id: resourceId, teamId, deletedAt: null },
      include: { skills: { include: { skill: true } } },
    });
    if (!r) throw Errors.notFound('Resource not found');
    return this.toView(r);
  }

  async createResource(teamId: string, input: CreateResourceBody) {
    await this.assertTeam(teamId);
    const existing = await prisma.resource.findFirst({
      where: { teamId, name: input.name, deletedAt: null },
      select: { id: true },
    });
    if (existing) throw Errors.conflict('A resource with that name already exists');
    const r = await prisma.resource.create({
      data: {
        teamId,
        name: input.name,
        type: input.type ?? 'HUMAN',
        userId: input.userId ?? null,
        email: input.email ?? null,
        maxUnits: input.maxUnits ?? 1.0,
        costRateMinor: input.costRateMinor != null ? BigInt(input.costRateMinor) : null,
        currency: input.currency ?? null,
        calendarId: input.calendarId ?? null,
        notes: input.notes ?? null,
      },
      include: { skills: { include: { skill: true } } },
    });
    return this.toView(r);
  }

  async updateResource(teamId: string, resourceId: string, input: UpdateResourceBody) {
    const r = await prisma.resource.findFirst({
      where: { id: resourceId, teamId, deletedAt: null },
      select: { id: true },
    });
    if (!r) throw Errors.notFound('Resource not found');

    if (input.name) {
      const conflict = await prisma.resource.findFirst({
        where: { teamId, name: input.name, deletedAt: null, NOT: { id: resourceId } },
        select: { id: true },
      });
      if (conflict) throw Errors.conflict('A resource with that name already exists');
    }

    const updated = await prisma.resource.update({
      where: { id: resourceId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.type !== undefined && { type: input.type }),
        ...(input.userId !== undefined && { userId: input.userId }),
        ...(input.email !== undefined && { email: input.email }),
        ...(input.maxUnits !== undefined && { maxUnits: input.maxUnits }),
        ...(input.costRateMinor !== undefined && {
          costRateMinor: input.costRateMinor != null ? BigInt(input.costRateMinor) : null,
        }),
        ...(input.currency !== undefined && { currency: input.currency }),
        ...(input.calendarId !== undefined && { calendarId: input.calendarId }),
        ...(input.notes !== undefined && { notes: input.notes }),
      },
      include: { skills: { include: { skill: true } } },
    });
    return this.toView(updated);
  }

  async deleteResource(teamId: string, resourceId: string) {
    const r = await prisma.resource.findFirst({
      where: { id: resourceId, teamId, deletedAt: null },
      select: { id: true },
    });
    if (!r) throw Errors.notFound('Resource not found');
    await prisma.resource.update({
      where: { id: resourceId },
      data: { deletedAt: new Date() },
    });
  }

  // ── Skills ───────────────────────────────────────────────────────────────

  async listSkills(teamId: string) {
    await this.assertTeam(teamId);
    return prisma.skill.findMany({ where: { teamId }, orderBy: { name: 'asc' } });
  }

  async createSkill(teamId: string, input: CreateSkillBody) {
    await this.assertTeam(teamId);
    try {
      return await prisma.skill.create({ data: { teamId, name: input.name } });
    } catch {
      throw Errors.conflict('A skill with that name already exists');
    }
  }

  async deleteSkill(teamId: string, skillId: string) {
    const s = await prisma.skill.findFirst({ where: { id: skillId, teamId }, select: { id: true } });
    if (!s) throw Errors.notFound('Skill not found');
    await prisma.skill.delete({ where: { id: skillId } });
  }

  // ── Resource skills (set-replace) ────────────────────────────────────────

  async setResourceSkills(teamId: string, resourceId: string, input: SetResourceSkillsBody) {
    const r = await prisma.resource.findFirst({
      where: { id: resourceId, teamId, deletedAt: null },
      select: { id: true },
    });
    if (!r) throw Errors.notFound('Resource not found');

    await prisma.$transaction(async (tx) => {
      await tx.resourceSkill.deleteMany({ where: { resourceId } });
      if (input.skills.length > 0) {
        await tx.resourceSkill.createMany({
          data: input.skills.map((s) => ({
            resourceId,
            skillId: s.skillId,
            level: s.level ?? 1,
          })),
          skipDuplicates: true,
        });
      }
    });
  }

  // ── Assignments ──────────────────────────────────────────────────────────

  async listAssignments(teamId: string, projectId: string, taskId: string) {
    await this.assertProject(teamId, projectId);
    const rows = await prisma.resourceAssignment.findMany({
      where: { taskId, projectId, teamId },
      include: { resource: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(this.assignmentToView);
  }

  async listAssignmentsForProject(teamId: string, projectId: string) {
    const rows = await prisma.resourceAssignment.findMany({
      where: { projectId, teamId },
      include: { resource: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(this.assignmentToView);
  }

  async createAssignment(teamId: string, projectId: string, taskId: string, input: CreateAssignmentBody) {
    await this.assertProject(teamId, projectId);
    const task = await prisma.task.findFirst({
      where: { id: taskId, projectId, teamId, deletedAt: null },
      select: { id: true },
    });
    if (!task) throw Errors.notFound('Task not found');
    const resource = await prisma.resource.findFirst({
      where: { id: input.resourceId, teamId, deletedAt: null },
      select: { id: true },
    });
    if (!resource) throw Errors.notFound('Resource not found');

    try {
      const a = await prisma.resourceAssignment.create({
        data: {
          teamId,
          projectId,
          taskId,
          resourceId: input.resourceId,
          units: input.units ?? 1.0,
          plannedHours: input.plannedHours ?? null,
        },
        include: { resource: true },
      });
      return this.assignmentToView(a);
    } catch {
      throw Errors.conflict('This resource is already assigned to this task');
    }
  }

  async updateAssignment(teamId: string, assignmentId: string, input: UpdateAssignmentBody) {
    const a = await prisma.resourceAssignment.findFirst({
      where: { id: assignmentId, teamId },
      select: { id: true },
    });
    if (!a) throw Errors.notFound('Assignment not found');
    const updated = await prisma.resourceAssignment.update({
      where: { id: assignmentId },
      data: {
        ...(input.units !== undefined && { units: input.units }),
        ...(input.plannedHours !== undefined && { plannedHours: input.plannedHours }),
        ...(input.actualHours !== undefined && { actualHours: input.actualHours }),
      },
      include: { resource: true },
    });
    return this.assignmentToView(updated);
  }

  async deleteAssignment(teamId: string, assignmentId: string) {
    const a = await prisma.resourceAssignment.findFirst({
      where: { id: assignmentId, teamId },
      select: { id: true },
    });
    if (!a) throw Errors.notFound('Assignment not found');
    await prisma.resourceAssignment.delete({ where: { id: assignmentId } });
  }

  // ── Workload report ──────────────────────────────────────────────────────

  async workloadReport(teamId: string, query: WorkloadQuery) {
    await this.assertTeam(teamId);
    const where: Prisma.ResourceAssignmentWhereInput = { teamId };

    const rows = await prisma.resourceAssignment.findMany({
      where,
      include: { resource: { select: { id: true, name: true } } },
    });

    const map = new Map<string, { resourceId: string; resourceName: string; plannedHours: number; actualHours: number; count: number }>();
    for (const row of rows) {
      const key = row.resourceId;
      const entry = map.get(key) ?? { resourceId: row.resourceId, resourceName: row.resource.name, plannedHours: 0, actualHours: 0, count: 0 };
      entry.plannedHours += row.plannedHours ?? 0;
      entry.actualHours += row.actualHours ?? 0;
      entry.count += 1;
      map.set(key, entry);
    }

    return {
      items: Array.from(map.values()).map((e) => ({
        resourceId: e.resourceId,
        resourceName: e.resourceName,
        totalPlannedHours: e.plannedHours,
        totalActualHours: e.actualHours,
        assignmentCount: e.count,
      })),
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private toView(r: {
    id: string; teamId: string; name: string; type: string;
    userId: string | null; email: string | null; maxUnits: number;
    costRateMinor: bigint | null; currency: string | null; calendarId: string | null;
    notes: string | null; createdAt: Date; updatedAt: Date;
    skills: { skill: { id: string; name: string }; level: number }[];
  }) {
    return {
      id: r.id,
      teamId: r.teamId,
      name: r.name,
      type: r.type as 'HUMAN' | 'EQUIPMENT' | 'MATERIAL',
      userId: r.userId,
      email: r.email,
      maxUnits: r.maxUnits,
      costRateMinor: r.costRateMinor != null ? Number(r.costRateMinor) : null,
      currency: r.currency,
      calendarId: r.calendarId,
      notes: r.notes,
      skills: r.skills.map((s) => ({ skillId: s.skill.id, skillName: s.skill.name, level: s.level })),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  private assignmentToView(a: {
    id: string; teamId: string; projectId: string; taskId: string;
    resourceId: string; units: number; plannedHours: number | null;
    actualHours: number | null; createdAt: Date; updatedAt: Date;
    resource: { name: string; type: string };
  }) {
    return {
      id: a.id,
      teamId: a.teamId,
      projectId: a.projectId,
      taskId: a.taskId,
      resourceId: a.resourceId,
      resourceName: a.resource.name,
      resourceType: a.resource.type as 'HUMAN' | 'EQUIPMENT' | 'MATERIAL',
      units: a.units,
      plannedHours: a.plannedHours,
      actualHours: a.actualHours,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    };
  }
}
