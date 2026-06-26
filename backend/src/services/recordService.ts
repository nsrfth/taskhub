import { prisma } from '../data/prisma.js';
import { Errors } from '../lib/errors.js';
import type {
  CreateRecordBody,
  CreateRecordCommentBody,
  CreateRecordTypeBody,
  ListRecordsQuery,
  TransitionRecordBody,
  UpdateRecordBody,
  UpdateRecordTypeBody,
} from '../schemas/records.js';

export class RecordService {
  private async assertProject(teamId: string, projectId: string) {
    const p = await prisma.project.findFirst({ where: { id: projectId, teamId }, select: { id: true } });
    if (!p) throw Errors.notFound('Project not found');
  }

  // ── Record Types ─────────────────────────────────────────────────────────

  async listRecordTypes(teamId: string) {
    // Return global built-ins + team-custom types.
    const rows = await prisma.pmisRecordType.findMany({
      where: { OR: [{ teamId: null }, { teamId }] },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(this.typeToView);
  }

  async createRecordType(teamId: string, input: CreateRecordTypeBody) {
    const existing = await prisma.pmisRecordType.findFirst({
      where: { teamId, key: input.key },
      select: { id: true },
    });
    if (existing) throw Errors.conflict('A record type with that key already exists');
    const rt = await prisma.pmisRecordType.create({
      data: {
        teamId,
        key: input.key,
        name: input.name,
        kind: 'CUSTOM',
        statusSet: input.statusSet,
        transitions: input.transitions ?? [],
        position: input.position ?? 100,
      },
    });
    return this.typeToView(rt);
  }

  async updateRecordType(teamId: string, typeId: string, input: UpdateRecordTypeBody) {
    const rt = await prisma.pmisRecordType.findFirst({
      where: { id: typeId, teamId },
      select: { id: true, kind: true },
    });
    if (!rt) throw Errors.notFound('Record type not found');
    if (rt.kind === 'BUILTIN') throw Errors.forbidden('Built-in record types cannot be modified');
    const updated = await prisma.pmisRecordType.update({
      where: { id: typeId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.statusSet !== undefined && { statusSet: input.statusSet }),
        ...(input.transitions !== undefined && { transitions: input.transitions }),
        ...(input.position !== undefined && { position: input.position }),
      },
    });
    return this.typeToView(updated);
  }

  async deleteRecordType(teamId: string, typeId: string) {
    const rt = await prisma.pmisRecordType.findFirst({
      where: { id: typeId, teamId },
      select: { id: true, kind: true },
    });
    if (!rt) throw Errors.notFound('Record type not found');
    if (rt.kind === 'BUILTIN') throw Errors.forbidden('Built-in record types cannot be deleted');
    const count = await prisma.pmisRecord.count({ where: { recordTypeId: typeId } });
    if (count > 0) throw Errors.conflict('Cannot delete a record type that has records');
    await prisma.pmisRecordType.delete({ where: { id: typeId } });
  }

  // ── Records ──────────────────────────────────────────────────────────────

  async listRecords(teamId: string, projectId: string, query: ListRecordsQuery) {
    await this.assertProject(teamId, projectId);
    const where: Parameters<typeof prisma.pmisRecord.findMany>[0]['where'] = { projectId, teamId };
    if (query.status) where.status = query.status;
    if (query.typeKey) {
      const rt = await prisma.pmisRecordType.findFirst({
        where: { key: query.typeKey, OR: [{ teamId: null }, { teamId }] },
        select: { id: true },
      });
      if (rt) where.recordTypeId = rt.id;
    }
    const rows = await prisma.pmisRecord.findMany({
      where,
      include: { recordType: true, assignee: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(this.recordToView);
  }

  async getRecord(teamId: string, projectId: string, recordId: string) {
    const r = await prisma.pmisRecord.findFirst({
      where: { id: recordId, projectId, teamId },
      include: { recordType: true, assignee: { select: { name: true } } },
    });
    if (!r) throw Errors.notFound('Record not found');
    return this.recordToView(r);
  }

  async createRecord(teamId: string, projectId: string, actorId: string, input: CreateRecordBody) {
    await this.assertProject(teamId, projectId);
    const rt = await prisma.pmisRecordType.findFirst({
      where: { id: input.recordTypeId, OR: [{ teamId: null }, { teamId }] },
      select: { id: true, key: true, statusSet: true },
    });
    if (!rt) throw Errors.notFound('Record type not found');

    const statusSet = rt.statusSet as string[];
    const status = input.status ?? statusSet[0] ?? 'OPEN';
    if (statusSet.length > 0 && !statusSet.includes(status)) {
      throw Errors.badRequest(`Status "${status}" is not valid for this record type`);
    }

    // Generate sequential reference: count existing records of this type + 1
    const seq = await prisma.pmisRecord.count({ where: { projectId, recordTypeId: rt.id } });
    const reference = `${rt.key.toUpperCase()}-${String(seq + 1).padStart(3, '0')}`;

    const r = await prisma.pmisRecord.create({
      data: {
        teamId,
        projectId,
        recordTypeId: input.recordTypeId,
        reference,
        title: input.title,
        description: input.description ?? null,
        status,
        fieldValues: (input.fieldValues as object) ?? {},
        assigneeId: input.assigneeId ?? null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        createdById: actorId,
      },
      include: { recordType: true, assignee: { select: { name: true } } },
    });
    return this.recordToView(r);
  }

  async updateRecord(teamId: string, projectId: string, recordId: string, input: UpdateRecordBody) {
    const r = await prisma.pmisRecord.findFirst({
      where: { id: recordId, projectId, teamId },
      include: { recordType: { select: { statusSet: true } } },
    });
    if (!r) throw Errors.notFound('Record not found');

    if (input.status) {
      const statusSet = r.recordType.statusSet as string[];
      if (statusSet.length > 0 && !statusSet.includes(input.status)) {
        throw Errors.badRequest(`Status "${input.status}" is not valid for this record type`);
      }
    }

    const updated = await prisma.pmisRecord.update({
      where: { id: recordId },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.fieldValues !== undefined && { fieldValues: input.fieldValues as object }),
        ...(input.assigneeId !== undefined && { assigneeId: input.assigneeId }),
        ...(input.dueDate !== undefined && { dueDate: input.dueDate ? new Date(input.dueDate) : null }),
      },
      include: { recordType: true, assignee: { select: { name: true } } },
    });
    return this.recordToView(updated);
  }

  async transitionRecord(teamId: string, projectId: string, recordId: string, input: TransitionRecordBody) {
    const r = await prisma.pmisRecord.findFirst({
      where: { id: recordId, projectId, teamId },
      include: { recordType: { select: { statusSet: true, transitions: true } } },
    });
    if (!r) throw Errors.notFound('Record not found');

    const statusSet = r.recordType.statusSet as string[];
    if (statusSet.length > 0 && !statusSet.includes(input.toStatus)) {
      throw Errors.badRequest(`Status "${input.toStatus}" is not valid for this record type`);
    }

    const closedAt = input.toStatus === 'CLOSED' || input.toStatus === 'APPROVED'
      ? (r.closedAt ?? new Date())
      : null;

    const updated = await prisma.pmisRecord.update({
      where: { id: recordId },
      data: { status: input.toStatus, closedAt },
      include: { recordType: true, assignee: { select: { name: true } } },
    });
    return this.recordToView(updated);
  }

  async deleteRecord(teamId: string, projectId: string, recordId: string) {
    const r = await prisma.pmisRecord.findFirst({
      where: { id: recordId, projectId, teamId },
      select: { id: true },
    });
    if (!r) throw Errors.notFound('Record not found');
    await prisma.pmisRecord.delete({ where: { id: recordId } });
  }

  // ── Record Comments ───────────────────────────────────────────────────────

  async listComments(teamId: string, projectId: string, recordId: string) {
    await this.assertProject(teamId, projectId);
    const r = await prisma.pmisRecord.findFirst({ where: { id: recordId, teamId }, select: { id: true } });
    if (!r) throw Errors.notFound('Record not found');
    const rows = await prisma.pmisRecordComment.findMany({
      where: { recordId },
      include: { author: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((c) => ({
      id: c.id,
      recordId: c.recordId,
      authorId: c.authorId,
      authorName: c.author?.name ?? null,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));
  }

  async createComment(teamId: string, projectId: string, recordId: string, actorId: string, input: CreateRecordCommentBody) {
    await this.assertProject(teamId, projectId);
    const r = await prisma.pmisRecord.findFirst({ where: { id: recordId, teamId }, select: { id: true } });
    if (!r) throw Errors.notFound('Record not found');
    const c = await prisma.pmisRecordComment.create({
      data: { recordId, authorId: actorId, body: input.body },
      include: { author: { select: { name: true } } },
    });
    return {
      id: c.id,
      recordId: c.recordId,
      authorId: c.authorId,
      authorName: c.author?.name ?? null,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private typeToView(rt: {
    id: string; teamId: string | null; key: string; name: string;
    kind: string; statusSet: unknown; transitions: unknown;
    position: number; createdAt: Date; updatedAt: Date;
  }) {
    return {
      id: rt.id,
      teamId: rt.teamId,
      key: rt.key,
      name: rt.name,
      kind: rt.kind as 'BUILTIN' | 'CUSTOM',
      statusSet: rt.statusSet as string[],
      transitions: rt.transitions as { from: string; to: string; permission?: string }[],
      position: rt.position,
      createdAt: rt.createdAt.toISOString(),
      updatedAt: rt.updatedAt.toISOString(),
    };
  }

  private recordToView(r: {
    id: string; teamId: string; projectId: string; recordTypeId: string;
    reference: string; title: string; description: string | null;
    status: string; fieldValues: unknown; assigneeId: string | null;
    dueDate: Date | null; closedAt: Date | null; createdById: string | null;
    createdAt: Date; updatedAt: Date;
    recordType: { key: string; name: string };
    assignee: { name: string } | null;
  }) {
    return {
      id: r.id,
      teamId: r.teamId,
      projectId: r.projectId,
      recordTypeId: r.recordTypeId,
      recordTypeKey: r.recordType.key,
      recordTypeName: r.recordType.name,
      reference: r.reference,
      title: r.title,
      description: r.description,
      status: r.status,
      fieldValues: r.fieldValues as Record<string, unknown>,
      assigneeId: r.assigneeId,
      assigneeName: r.assignee?.name ?? null,
      dueDate: r.dueDate ? r.dueDate.toISOString() : null,
      closedAt: r.closedAt ? r.closedAt.toISOString() : null,
      createdById: r.createdById,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
}
