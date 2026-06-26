import { prisma } from '../data/prisma.js';
import { Errors } from '../lib/errors.js';
import { ensureDefaultCostAccount } from './costService.js';
import type {
  CreateChangeRequestBody,
  CreateContractBody,
  CreateNcrBody,
  CreatePoBody,
  CreateRiskBody,
  CreateVendorBody,
  DecideChangeRequestBody,
  UpdateChangeRequestBody,
  UpdateContractBody,
  UpdateNcrBody,
  UpdatePoBody,
  UpdateRiskBody,
  UpdateVendorBody,
} from '../schemas/lifecycle.js';

// v2.5 (PMIS R9): all four specialized lifecycle domains in one service file
// to avoid circular deps and keep imports simple. Each domain is a section.

export class LifecycleService {
  private async assertProject(teamId: string, projectId: string) {
    const p = await prisma.project.findFirst({ where: { id: projectId, teamId }, select: { id: true } });
    if (!p) throw Errors.notFound('Project not found');
  }

  private async nextRiskRef(projectId: string): Promise<string> {
    const seq = await prisma.riskRecord.count({ where: { projectId } });
    return `RISK-${String(seq + 1).padStart(3, '0')}`;
  }
  private async nextCrRef(projectId: string): Promise<string> {
    const seq = await prisma.changeRequest.count({ where: { projectId } });
    return `CR-${String(seq + 1).padStart(3, '0')}`;
  }
  private async nextContractRef(projectId: string): Promise<string> {
    const seq = await prisma.contract.count({ where: { projectId } });
    return `CON-${String(seq + 1).padStart(3, '0')}`;
  }
  private async nextPoRef(projectId: string): Promise<string> {
    const seq = await prisma.purchaseOrder.count({ where: { projectId } });
    return `PO-${String(seq + 1).padStart(3, '0')}`;
  }
  private async nextNcrRef(projectId: string): Promise<string> {
    const seq = await prisma.qualityNcr.count({ where: { projectId } });
    return `NCR-${String(seq + 1).padStart(3, '0')}`;
  }

  // ── Risk Register ─────────────────────────────────────────────────────────

  async listRisks(teamId: string, projectId: string) {
    await this.assertProject(teamId, projectId);
    const rows = await prisma.riskRecord.findMany({
      where: { projectId, teamId },
      include: { owner: { select: { name: true } } },
      orderBy: { score: 'desc' },
    });
    return rows.map(this.riskToView);
  }

  async getRisk(teamId: string, projectId: string, riskId: string) {
    const r = await prisma.riskRecord.findFirst({
      where: { id: riskId, projectId, teamId },
      include: { owner: { select: { name: true } } },
    });
    if (!r) throw Errors.notFound('Risk not found');
    return this.riskToView(r);
  }

  async createRisk(teamId: string, projectId: string, actorId: string, input: CreateRiskBody) {
    await this.assertProject(teamId, projectId);
    const reference = await this.nextRiskRef(projectId);
    const score = input.probability * input.impact;
    const r = await prisma.riskRecord.create({
      data: {
        teamId, projectId, reference,
        title: input.title,
        description: input.description ?? null,
        probability: input.probability,
        impact: input.impact,
        score,
        response: input.response ?? 'ACCEPT',
        mitigationPlan: input.mitigationPlan ?? null,
        ownerId: input.ownerId ?? null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        createdById: actorId,
      },
      include: { owner: { select: { name: true } } },
    });
    return this.riskToView(r);
  }

  async updateRisk(teamId: string, projectId: string, riskId: string, input: UpdateRiskBody) {
    const r = await prisma.riskRecord.findFirst({ where: { id: riskId, projectId, teamId }, select: { id: true, probability: true, impact: true } });
    if (!r) throw Errors.notFound('Risk not found');
    const prob = input.probability ?? r.probability;
    const imp = input.impact ?? r.impact;
    const updated = await prisma.riskRecord.update({
      where: { id: riskId },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.probability !== undefined && { probability: input.probability }),
        ...(input.impact !== undefined && { impact: input.impact }),
        score: prob * imp,
        ...(input.response !== undefined && { response: input.response }),
        ...(input.mitigationPlan !== undefined && { mitigationPlan: input.mitigationPlan }),
        ...(input.ownerId !== undefined && { ownerId: input.ownerId }),
        ...(input.dueDate !== undefined && { dueDate: input.dueDate ? new Date(input.dueDate) : null }),
      },
      include: { owner: { select: { name: true } } },
    });
    return this.riskToView(updated);
  }

  async closeRisk(teamId: string, projectId: string, riskId: string) {
    const r = await prisma.riskRecord.findFirst({ where: { id: riskId, projectId, teamId }, select: { id: true } });
    if (!r) throw Errors.notFound('Risk not found');
    await prisma.riskRecord.update({ where: { id: riskId }, data: { closedAt: new Date() } });
  }

  async deleteRisk(teamId: string, projectId: string, riskId: string) {
    const r = await prisma.riskRecord.findFirst({ where: { id: riskId, projectId, teamId }, select: { id: true } });
    if (!r) throw Errors.notFound('Risk not found');
    await prisma.riskRecord.delete({ where: { id: riskId } });
  }

  // ── Change Control ────────────────────────────────────────────────────────

  async listChangeRequests(teamId: string, projectId: string) {
    await this.assertProject(teamId, projectId);
    const rows = await prisma.changeRequest.findMany({ where: { projectId, teamId }, orderBy: { createdAt: 'desc' } });
    return rows.map(this.crToView);
  }

  async getChangeRequest(teamId: string, projectId: string, crId: string) {
    const cr = await prisma.changeRequest.findFirst({ where: { id: crId, projectId, teamId } });
    if (!cr) throw Errors.notFound('Change request not found');
    return this.crToView(cr);
  }

  async createChangeRequest(teamId: string, projectId: string, actorId: string, input: CreateChangeRequestBody) {
    await this.assertProject(teamId, projectId);
    const reference = await this.nextCrRef(projectId);
    const cr = await prisma.changeRequest.create({
      data: {
        teamId, projectId, reference,
        title: input.title,
        description: input.description ?? null,
        scheduleDeltaDays: input.scheduleDeltaDays ?? null,
        costImpactMinor: input.costImpactMinor != null ? BigInt(input.costImpactMinor) : null,
        costCurrency: input.costCurrency ?? null,
      },
    });
    return this.crToView(cr);
  }

  async updateChangeRequest(teamId: string, projectId: string, crId: string, input: UpdateChangeRequestBody) {
    const cr = await prisma.changeRequest.findFirst({ where: { id: crId, projectId, teamId }, select: { id: true, status: true } });
    if (!cr) throw Errors.notFound('Change request not found');
    if (cr.status !== 'DRAFT') throw Errors.conflict('Only DRAFT change requests can be edited');
    const updated = await prisma.changeRequest.update({
      where: { id: crId },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.scheduleDeltaDays !== undefined && { scheduleDeltaDays: input.scheduleDeltaDays }),
        ...(input.costImpactMinor !== undefined && { costImpactMinor: input.costImpactMinor != null ? BigInt(input.costImpactMinor) : null }),
        ...(input.costCurrency !== undefined && { costCurrency: input.costCurrency }),
      },
    });
    return this.crToView(updated);
  }

  async submitChangeRequest(teamId: string, projectId: string, crId: string, actorId: string) {
    const cr = await prisma.changeRequest.findFirst({ where: { id: crId, projectId, teamId }, select: { id: true, status: true } });
    if (!cr) throw Errors.notFound('Change request not found');
    if (cr.status !== 'DRAFT') throw Errors.conflict('Only DRAFT change requests can be submitted');
    const updated = await prisma.changeRequest.update({
      where: { id: crId },
      data: { status: 'SUBMITTED', submittedById: actorId, submittedAt: new Date() },
    });
    return this.crToView(updated);
  }

  async decideChangeRequest(teamId: string, projectId: string, crId: string, actorId: string, input: DecideChangeRequestBody) {
    const cr = await prisma.changeRequest.findFirst({ where: { id: crId, projectId, teamId }, select: { id: true, status: true } });
    if (!cr) throw Errors.notFound('Change request not found');
    if (cr.status !== 'SUBMITTED') throw Errors.conflict('Only SUBMITTED change requests can be decided');
    const updated = await prisma.changeRequest.update({
      where: { id: crId },
      data: {
        status: input.decision,
        decidedById: actorId,
        decidedAt: new Date(),
        rejectionReason: input.decision === 'REJECTED' ? (input.rejectionReason ?? null) : null,
      },
    });
    return this.crToView(updated);
  }

  // Apply: post cost-ledger delta + create a CHANGE_REQUEST baseline
  async applyChangeRequest(teamId: string, projectId: string, crId: string, actorId: string) {
    const cr = await prisma.changeRequest.findFirst({ where: { id: crId, projectId, teamId } });
    if (!cr) throw Errors.notFound('Change request not found');
    if (cr.status !== 'APPROVED') throw Errors.conflict('Only APPROVED change requests can be applied');

    const result = await prisma.$transaction(async (tx) => {
      // Capture a new baseline snapshot (source=CHANGE_REQUEST).
      // Snapshot is a minimal summary — full WBS detail is in BaselineEntry.
      const liveTasks = await tx.task.findMany({
        where: { projectId, deletedAt: null },
        select: { id: true, title: true, baselineStart: true, baselineEnd: true, percentComplete: true },
      });
      const baseline = await tx.projectBaseline.create({
        data: {
          projectId,
          teamId,
          name: `${cr.reference}: ${cr.title}`,
          source: 'CHANGE_REQUEST',
          isCurrent: true,
          snapshot: { taskCount: liveTasks.length, tasks: liveTasks.map((t) => ({ id: t.id, title: t.title, percentComplete: t.percentComplete })) },
          capturedById: actorId,
        },
      });
      // Flip all prior baselines to isCurrent=false
      await tx.projectBaseline.updateMany({
        where: { projectId, id: { not: baseline.id } },
        data: { isCurrent: false },
      });

      // Post cost delta to ActualCostEntry if costImpactMinor is set
      if (cr.costImpactMinor != null && cr.costCurrency) {
        const costAccountId = await ensureDefaultCostAccount(tx, teamId, projectId);
        await tx.actualCostEntry.create({
          data: {
            teamId,
            projectId,
            costAccountId,
            source: 'MANUAL',
            amountMinor: cr.costImpactMinor,
            currency: cr.costCurrency,
            baseAmountMinor: cr.costImpactMinor,
            baseCurrency: cr.costCurrency,
            incurredOn: new Date(),
            description: `Change request ${cr.reference}: ${cr.title}`,
            createdById: actorId,
          },
        });
      }

      // Mark CR as APPLIED, link the baseline
      const updated = await tx.changeRequest.update({
        where: { id: crId },
        data: { status: 'APPLIED', appliedBaselineId: baseline.id },
      });
      return updated;
    });
    return this.crToView(result);
  }

  async deleteChangeRequest(teamId: string, projectId: string, crId: string) {
    const cr = await prisma.changeRequest.findFirst({ where: { id: crId, projectId, teamId }, select: { id: true, status: true } });
    if (!cr) throw Errors.notFound('Change request not found');
    if (!['DRAFT', 'REJECTED'].includes(cr.status)) throw Errors.conflict('Only DRAFT or REJECTED change requests can be deleted');
    await prisma.changeRequest.delete({ where: { id: crId } });
  }

  // ── Procurement ───────────────────────────────────────────────────────────

  async listVendors(teamId: string) {
    return prisma.vendor.findMany({ where: { teamId, deletedAt: null }, orderBy: { name: 'asc' } });
  }

  async createVendor(teamId: string, input: CreateVendorBody) {
    try {
      return await prisma.vendor.create({
        data: { teamId, name: input.name, contactEmail: input.contactEmail ?? null, contactPhone: input.contactPhone ?? null, address: input.address ?? null, notes: input.notes ?? null },
      });
    } catch { throw Errors.conflict('A vendor with that name already exists'); }
  }

  async updateVendor(teamId: string, vendorId: string, input: UpdateVendorBody) {
    const v = await prisma.vendor.findFirst({ where: { id: vendorId, teamId, deletedAt: null }, select: { id: true } });
    if (!v) throw Errors.notFound('Vendor not found');
    return prisma.vendor.update({
      where: { id: vendorId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.contactEmail !== undefined && { contactEmail: input.contactEmail }),
        ...(input.contactPhone !== undefined && { contactPhone: input.contactPhone }),
        ...(input.address !== undefined && { address: input.address }),
        ...(input.notes !== undefined && { notes: input.notes }),
      },
    });
  }

  async deleteVendor(teamId: string, vendorId: string) {
    const v = await prisma.vendor.findFirst({ where: { id: vendorId, teamId, deletedAt: null }, select: { id: true } });
    if (!v) throw Errors.notFound('Vendor not found');
    await prisma.vendor.update({ where: { id: vendorId }, data: { deletedAt: new Date() } });
  }

  async listContracts(teamId: string, projectId: string) {
    await this.assertProject(teamId, projectId);
    const rows = await prisma.contract.findMany({
      where: { projectId, teamId },
      include: { vendor: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(this.contractToView);
  }

  async createContract(teamId: string, projectId: string, actorId: string, input: CreateContractBody) {
    await this.assertProject(teamId, projectId);
    const reference = await this.nextContractRef(projectId);
    const c = await prisma.contract.create({
      data: {
        teamId, projectId, reference,
        vendorId: input.vendorId ?? null,
        title: input.title,
        status: input.status ?? 'DRAFT',
        valueMinor: input.valueMinor != null ? BigInt(input.valueMinor) : null,
        currency: input.currency ?? null,
        startDate: input.startDate ? new Date(input.startDate) : null,
        endDate: input.endDate ? new Date(input.endDate) : null,
        notes: input.notes ?? null,
        createdById: actorId,
      },
      include: { vendor: { select: { name: true } } },
    });
    return this.contractToView(c);
  }

  async updateContract(teamId: string, projectId: string, contractId: string, input: UpdateContractBody) {
    const c = await prisma.contract.findFirst({ where: { id: contractId, projectId, teamId }, select: { id: true } });
    if (!c) throw Errors.notFound('Contract not found');
    const updated = await prisma.contract.update({
      where: { id: contractId },
      data: {
        ...(input.vendorId !== undefined && { vendorId: input.vendorId }),
        ...(input.title !== undefined && { title: input.title }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.valueMinor !== undefined && { valueMinor: input.valueMinor != null ? BigInt(input.valueMinor) : null }),
        ...(input.currency !== undefined && { currency: input.currency }),
        ...(input.startDate !== undefined && { startDate: input.startDate ? new Date(input.startDate) : null }),
        ...(input.endDate !== undefined && { endDate: input.endDate ? new Date(input.endDate) : null }),
        ...(input.notes !== undefined && { notes: input.notes }),
      },
      include: { vendor: { select: { name: true } } },
    });
    return this.contractToView(updated);
  }

  async listPurchaseOrders(teamId: string, projectId: string) {
    await this.assertProject(teamId, projectId);
    const rows = await prisma.purchaseOrder.findMany({ where: { projectId, teamId }, orderBy: { createdAt: 'desc' } });
    return rows.map(this.poToView);
  }

  async createPurchaseOrder(teamId: string, projectId: string, actorId: string, input: CreatePoBody) {
    await this.assertProject(teamId, projectId);
    const reference = await this.nextPoRef(projectId);
    const po = await prisma.purchaseOrder.create({
      data: {
        teamId, projectId, reference,
        contractId: input.contractId ?? null,
        title: input.title,
        amountMinor: input.amountMinor != null ? BigInt(input.amountMinor) : null,
        currency: input.currency ?? null,
        issuedDate: input.issuedDate ? new Date(input.issuedDate) : null,
        expectedDate: input.expectedDate ? new Date(input.expectedDate) : null,
        createdById: actorId,
      },
    });
    return this.poToView(po);
  }

  async updatePurchaseOrder(teamId: string, projectId: string, poId: string, actorId: string, input: UpdatePoBody) {
    const po = await prisma.purchaseOrder.findFirst({ where: { id: poId, projectId, teamId }, select: { id: true, status: true, amountMinor: true, currency: true, commitmentId: true } });
    if (!po) throw Errors.notFound('Purchase order not found');

    const issuingNow = input.status === 'ISSUED' && po.status !== 'ISSUED';
    let commitmentId = po.commitmentId;

    if (issuingNow && !commitmentId) {
      // Auto-post a Commitment to the cost module
      const amount = input.amountMinor != null ? BigInt(input.amountMinor) : (po.amountMinor ?? 0n);
      const currency = input.currency ?? po.currency;
      if (amount > 0n && currency) {
        const costAccountId = await ensureDefaultCostAccount(prisma, teamId, projectId);
        const commitment = await prisma.commitment.create({
          data: {
            teamId,
            projectId,
            costAccountId,
            amountMinor: amount,
            currency,
            status: 'OPEN',
          },
        });
        commitmentId = commitment.id;
      }
    }

    const updated = await prisma.purchaseOrder.update({
      where: { id: poId },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.amountMinor !== undefined && { amountMinor: input.amountMinor != null ? BigInt(input.amountMinor) : null }),
        ...(input.currency !== undefined && { currency: input.currency }),
        ...(input.issuedDate !== undefined && { issuedDate: input.issuedDate ? new Date(input.issuedDate) : null }),
        ...(input.expectedDate !== undefined && { expectedDate: input.expectedDate ? new Date(input.expectedDate) : null }),
        ...(input.receivedDate !== undefined && { receivedDate: input.receivedDate ? new Date(input.receivedDate) : null }),
        ...(commitmentId !== po.commitmentId && { commitmentId }),
      },
    });
    return this.poToView(updated);
  }

  // ── Quality NCR ───────────────────────────────────────────────────────────

  async listNcrs(teamId: string, projectId: string) {
    await this.assertProject(teamId, projectId);
    const rows = await prisma.qualityNcr.findMany({ where: { projectId, teamId }, orderBy: { createdAt: 'desc' } });
    return rows.map(this.ncrToView);
  }

  async createNcr(teamId: string, projectId: string, actorId: string, input: CreateNcrBody) {
    await this.assertProject(teamId, projectId);
    const reference = await this.nextNcrRef(projectId);
    const ncr = await prisma.qualityNcr.create({
      data: {
        teamId, projectId, reference,
        title: input.title,
        description: input.description ?? null,
        severity: input.severity ?? 'MINOR',
        createdById: actorId,
      },
    });
    return this.ncrToView(ncr);
  }

  async updateNcr(teamId: string, projectId: string, ncrId: string, input: UpdateNcrBody) {
    const ncr = await prisma.qualityNcr.findFirst({ where: { id: ncrId, projectId, teamId }, select: { id: true } });
    if (!ncr) throw Errors.notFound('NCR not found');
    const updated = await prisma.qualityNcr.update({
      where: { id: ncrId },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.severity !== undefined && { severity: input.severity }),
        ...(input.disposition !== undefined && { disposition: input.disposition }),
        ...(input.correctiveTaskId !== undefined && { correctiveTaskId: input.correctiveTaskId }),
      },
    });
    return this.ncrToView(updated);
  }

  async closeNcr(teamId: string, projectId: string, ncrId: string) {
    const ncr = await prisma.qualityNcr.findFirst({ where: { id: ncrId, projectId, teamId }, select: { id: true } });
    if (!ncr) throw Errors.notFound('NCR not found');
    await prisma.qualityNcr.update({ where: { id: ncrId }, data: { closedAt: new Date() } });
  }

  async deleteNcr(teamId: string, projectId: string, ncrId: string) {
    const ncr = await prisma.qualityNcr.findFirst({ where: { id: ncrId, projectId, teamId }, select: { id: true } });
    if (!ncr) throw Errors.notFound('NCR not found');
    await prisma.qualityNcr.delete({ where: { id: ncrId } });
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private riskToView(r: {
    id: string; teamId: string; projectId: string; reference: string; title: string;
    description: string | null; probability: number; impact: number; score: number;
    response: string; mitigationPlan: string | null; ownerId: string | null;
    dueDate: Date | null; closedAt: Date | null; createdById: string | null;
    createdAt: Date; updatedAt: Date;
    owner: { name: string } | null;
  }) {
    return {
      id: r.id, teamId: r.teamId, projectId: r.projectId, reference: r.reference,
      title: r.title, description: r.description, probability: r.probability,
      impact: r.impact, score: r.score,
      response: r.response as 'ACCEPT' | 'AVOID' | 'MITIGATE' | 'TRANSFER',
      mitigationPlan: r.mitigationPlan, ownerId: r.ownerId,
      ownerName: r.owner?.name ?? null,
      dueDate: r.dueDate ? r.dueDate.toISOString() : null,
      closedAt: r.closedAt ? r.closedAt.toISOString() : null,
      createdById: r.createdById,
      createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
    };
  }

  private crToView(cr: {
    id: string; teamId: string; projectId: string; reference: string; title: string;
    description: string | null; status: string; scheduleDeltaDays: number | null;
    costImpactMinor: bigint | null; costCurrency: string | null;
    submittedById: string | null; submittedAt: Date | null;
    decidedById: string | null; decidedAt: Date | null;
    rejectionReason: string | null; appliedBaselineId: string | null;
    createdAt: Date; updatedAt: Date;
  }) {
    return {
      id: cr.id, teamId: cr.teamId, projectId: cr.projectId, reference: cr.reference,
      title: cr.title, description: cr.description,
      status: cr.status as 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'APPLIED',
      scheduleDeltaDays: cr.scheduleDeltaDays,
      costImpactMinor: cr.costImpactMinor != null ? Number(cr.costImpactMinor) : null,
      costCurrency: cr.costCurrency as string | null,
      submittedById: cr.submittedById,
      submittedAt: cr.submittedAt ? cr.submittedAt.toISOString() : null,
      decidedById: cr.decidedById,
      decidedAt: cr.decidedAt ? cr.decidedAt.toISOString() : null,
      rejectionReason: cr.rejectionReason, appliedBaselineId: cr.appliedBaselineId,
      createdAt: cr.createdAt.toISOString(), updatedAt: cr.updatedAt.toISOString(),
    };
  }

  private contractToView(c: {
    id: string; teamId: string; projectId: string; vendorId: string | null;
    reference: string; title: string; status: string; valueMinor: bigint | null;
    currency: string | null; startDate: Date | null; endDate: Date | null;
    notes: string | null; createdAt: Date; updatedAt: Date;
    vendor: { name: string } | null;
  }) {
    return {
      id: c.id, teamId: c.teamId, projectId: c.projectId, vendorId: c.vendorId,
      vendorName: c.vendor?.name ?? null, reference: c.reference, title: c.title,
      status: c.status as 'DRAFT' | 'ACTIVE' | 'CLOSED' | 'CANCELLED',
      valueMinor: c.valueMinor != null ? Number(c.valueMinor) : null,
      currency: c.currency as string | null,
      startDate: c.startDate ? c.startDate.toISOString() : null,
      endDate: c.endDate ? c.endDate.toISOString() : null,
      notes: c.notes,
      createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(),
    };
  }

  private poToView(po: {
    id: string; teamId: string; projectId: string; contractId: string | null;
    reference: string; title: string; status: string; amountMinor: bigint | null;
    currency: string | null; issuedDate: Date | null; expectedDate: Date | null;
    receivedDate: Date | null; commitmentId: string | null;
    createdAt: Date; updatedAt: Date;
  }) {
    return {
      id: po.id, teamId: po.teamId, projectId: po.projectId, contractId: po.contractId,
      reference: po.reference, title: po.title,
      status: po.status as 'DRAFT' | 'ISSUED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CLOSED' | 'CANCELLED',
      amountMinor: po.amountMinor != null ? Number(po.amountMinor) : null,
      currency: po.currency as string | null,
      issuedDate: po.issuedDate ? po.issuedDate.toISOString() : null,
      expectedDate: po.expectedDate ? po.expectedDate.toISOString() : null,
      receivedDate: po.receivedDate ? po.receivedDate.toISOString() : null,
      commitmentId: po.commitmentId,
      createdAt: po.createdAt.toISOString(), updatedAt: po.updatedAt.toISOString(),
    };
  }

  private ncrToView(ncr: {
    id: string; teamId: string; projectId: string; reference: string; title: string;
    description: string | null; severity: string; disposition: string | null;
    correctiveTaskId: string | null; closedAt: Date | null;
    createdById: string | null; createdAt: Date; updatedAt: Date;
  }) {
    return {
      id: ncr.id, teamId: ncr.teamId, projectId: ncr.projectId, reference: ncr.reference,
      title: ncr.title, description: ncr.description,
      severity: ncr.severity as 'MINOR' | 'MAJOR' | 'CRITICAL',
      disposition: ncr.disposition as 'USE_AS_IS' | 'REWORK' | 'REJECT' | 'CONCESSION' | null,
      correctiveTaskId: ncr.correctiveTaskId,
      closedAt: ncr.closedAt ? ncr.closedAt.toISOString() : null,
      createdById: ncr.createdById,
      createdAt: ncr.createdAt.toISOString(), updatedAt: ncr.updatedAt.toISOString(),
    };
  }
}
