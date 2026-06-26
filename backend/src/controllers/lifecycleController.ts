import type { FastifyReply, FastifyRequest } from 'fastify';
import type { LifecycleService } from '../services/lifecycleService.js';
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
import { Errors } from '../lib/errors.js';

type TeamParams = { teamId: string };
type VendorParams = { teamId: string; vendorId: string };
type ProjectParams = { teamId: string; projectId: string };
type RiskParams = { teamId: string; projectId: string; riskId: string };
type CrParams = { teamId: string; projectId: string; crId: string };
type ContractParams = { teamId: string; projectId: string; contractId: string };
type PoParams = { teamId: string; projectId: string; poId: string };
type NcrParams = { teamId: string; projectId: string; ncrId: string };

export class LifecycleController {
  constructor(private readonly svc: LifecycleService) {}

  // ── Risk ──────────────────────────────────────────────────────────────────

  listRisks = async (req: FastifyRequest<{ Params: ProjectParams }>, reply: FastifyReply) =>
    reply.send({ items: await this.svc.listRisks(req.params.teamId, req.params.projectId) });

  getRisk = async (req: FastifyRequest<{ Params: RiskParams }>, reply: FastifyReply) =>
    reply.send(await this.svc.getRisk(req.params.teamId, req.params.projectId, req.params.riskId));

  createRisk = async (req: FastifyRequest<{ Params: ProjectParams; Body: CreateRiskBody }>, reply: FastifyReply) => {
    if (!req.user) throw Errors.unauthorized();
    return reply.status(201).send(await this.svc.createRisk(req.params.teamId, req.params.projectId, req.user.sub, req.body));
  };

  updateRisk = async (req: FastifyRequest<{ Params: RiskParams; Body: UpdateRiskBody }>, reply: FastifyReply) => {
    if (!req.user) throw Errors.unauthorized();
    return reply.send(await this.svc.updateRisk(req.params.teamId, req.params.projectId, req.params.riskId, req.body));
  };

  closeRisk = async (req: FastifyRequest<{ Params: RiskParams }>, reply: FastifyReply) => {
    if (!req.user) throw Errors.unauthorized();
    await this.svc.closeRisk(req.params.teamId, req.params.projectId, req.params.riskId);
    return reply.status(204).send();
  };

  deleteRisk = async (req: FastifyRequest<{ Params: RiskParams }>, reply: FastifyReply) => {
    if (!req.user) throw Errors.unauthorized();
    await this.svc.deleteRisk(req.params.teamId, req.params.projectId, req.params.riskId);
    return reply.status(204).send();
  };

  // ── Change Control ────────────────────────────────────────────────────────

  listChangeRequests = async (req: FastifyRequest<{ Params: ProjectParams }>, reply: FastifyReply) =>
    reply.send({ items: await this.svc.listChangeRequests(req.params.teamId, req.params.projectId) });

  getChangeRequest = async (req: FastifyRequest<{ Params: CrParams }>, reply: FastifyReply) =>
    reply.send(await this.svc.getChangeRequest(req.params.teamId, req.params.projectId, req.params.crId));

  createChangeRequest = async (req: FastifyRequest<{ Params: ProjectParams; Body: CreateChangeRequestBody }>, reply: FastifyReply) => {
    if (!req.user) throw Errors.unauthorized();
    return reply.status(201).send(await this.svc.createChangeRequest(req.params.teamId, req.params.projectId, req.user.sub, req.body));
  };

  updateChangeRequest = async (req: FastifyRequest<{ Params: CrParams; Body: UpdateChangeRequestBody }>, reply: FastifyReply) => {
    if (!req.user) throw Errors.unauthorized();
    return reply.send(await this.svc.updateChangeRequest(req.params.teamId, req.params.projectId, req.params.crId, req.body));
  };

  submitChangeRequest = async (req: FastifyRequest<{ Params: CrParams }>, reply: FastifyReply) => {
    if (!req.user) throw Errors.unauthorized();
    return reply.send(await this.svc.submitChangeRequest(req.params.teamId, req.params.projectId, req.params.crId, req.user.sub));
  };

  decideChangeRequest = async (req: FastifyRequest<{ Params: CrParams; Body: DecideChangeRequestBody }>, reply: FastifyReply) => {
    if (!req.user) throw Errors.unauthorized();
    return reply.send(await this.svc.decideChangeRequest(req.params.teamId, req.params.projectId, req.params.crId, req.user.sub, req.body));
  };

  applyChangeRequest = async (req: FastifyRequest<{ Params: CrParams }>, reply: FastifyReply) => {
    if (!req.user) throw Errors.unauthorized();
    return reply.send(await this.svc.applyChangeRequest(req.params.teamId, req.params.projectId, req.params.crId, req.user.sub));
  };

  deleteChangeRequest = async (req: FastifyRequest<{ Params: CrParams }>, reply: FastifyReply) => {
    if (!req.user) throw Errors.unauthorized();
    await this.svc.deleteChangeRequest(req.params.teamId, req.params.projectId, req.params.crId);
    return reply.status(204).send();
  };

  // ── Procurement ───────────────────────────────────────────────────────────

  listVendors = async (req: FastifyRequest<{ Params: TeamParams }>, reply: FastifyReply) =>
    reply.send({ items: await this.svc.listVendors(req.params.teamId) });

  createVendor = async (req: FastifyRequest<{ Params: TeamParams; Body: CreateVendorBody }>, reply: FastifyReply) => {
    if (!req.user) throw Errors.unauthorized();
    return reply.status(201).send(await this.svc.createVendor(req.params.teamId, req.body));
  };

  updateVendor = async (req: FastifyRequest<{ Params: VendorParams; Body: UpdateVendorBody }>, reply: FastifyReply) => {
    if (!req.user) throw Errors.unauthorized();
    return reply.send(await this.svc.updateVendor(req.params.teamId, req.params.vendorId, req.body));
  };

  deleteVendor = async (req: FastifyRequest<{ Params: VendorParams }>, reply: FastifyReply) => {
    if (!req.user) throw Errors.unauthorized();
    await this.svc.deleteVendor(req.params.teamId, req.params.vendorId);
    return reply.status(204).send();
  };

  listContracts = async (req: FastifyRequest<{ Params: ProjectParams }>, reply: FastifyReply) =>
    reply.send({ items: await this.svc.listContracts(req.params.teamId, req.params.projectId) });

  createContract = async (req: FastifyRequest<{ Params: ProjectParams; Body: CreateContractBody }>, reply: FastifyReply) => {
    if (!req.user) throw Errors.unauthorized();
    return reply.status(201).send(await this.svc.createContract(req.params.teamId, req.params.projectId, req.user.sub, req.body));
  };

  updateContract = async (req: FastifyRequest<{ Params: ContractParams; Body: UpdateContractBody }>, reply: FastifyReply) => {
    if (!req.user) throw Errors.unauthorized();
    return reply.send(await this.svc.updateContract(req.params.teamId, req.params.projectId, req.params.contractId, req.body));
  };

  listPurchaseOrders = async (req: FastifyRequest<{ Params: ProjectParams }>, reply: FastifyReply) =>
    reply.send({ items: await this.svc.listPurchaseOrders(req.params.teamId, req.params.projectId) });

  createPurchaseOrder = async (req: FastifyRequest<{ Params: ProjectParams; Body: CreatePoBody }>, reply: FastifyReply) => {
    if (!req.user) throw Errors.unauthorized();
    return reply.status(201).send(await this.svc.createPurchaseOrder(req.params.teamId, req.params.projectId, req.user.sub, req.body));
  };

  updatePurchaseOrder = async (req: FastifyRequest<{ Params: PoParams; Body: UpdatePoBody }>, reply: FastifyReply) => {
    if (!req.user) throw Errors.unauthorized();
    return reply.send(await this.svc.updatePurchaseOrder(req.params.teamId, req.params.projectId, req.params.poId, req.user.sub, req.body));
  };

  // ── Quality NCR ───────────────────────────────────────────────────────────

  listNcrs = async (req: FastifyRequest<{ Params: ProjectParams }>, reply: FastifyReply) =>
    reply.send({ items: await this.svc.listNcrs(req.params.teamId, req.params.projectId) });

  createNcr = async (req: FastifyRequest<{ Params: ProjectParams; Body: CreateNcrBody }>, reply: FastifyReply) => {
    if (!req.user) throw Errors.unauthorized();
    return reply.status(201).send(await this.svc.createNcr(req.params.teamId, req.params.projectId, req.user.sub, req.body));
  };

  updateNcr = async (req: FastifyRequest<{ Params: NcrParams; Body: UpdateNcrBody }>, reply: FastifyReply) => {
    if (!req.user) throw Errors.unauthorized();
    return reply.send(await this.svc.updateNcr(req.params.teamId, req.params.projectId, req.params.ncrId, req.body));
  };

  closeNcr = async (req: FastifyRequest<{ Params: NcrParams }>, reply: FastifyReply) => {
    if (!req.user) throw Errors.unauthorized();
    await this.svc.closeNcr(req.params.teamId, req.params.projectId, req.params.ncrId);
    return reply.status(204).send();
  };

  deleteNcr = async (req: FastifyRequest<{ Params: NcrParams }>, reply: FastifyReply) => {
    if (!req.user) throw Errors.unauthorized();
    await this.svc.deleteNcr(req.params.teamId, req.params.projectId, req.params.ncrId);
    return reply.status(204).send();
  };
}
