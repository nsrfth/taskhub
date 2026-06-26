import { z } from 'zod';
import { currencyEnum } from './currency.js';

// ── Risk ─────────────────────────────────────────────────────────────────────

export const riskResponseEnum = z.enum(['ACCEPT', 'AVOID', 'MITIGATE', 'TRANSFER']);

export const createRiskBody = z.object({
  title: z.string().min(1).max(500).trim(),
  description: z.string().max(5000).nullable().optional(),
  probability: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
  response: riskResponseEnum.optional(),
  mitigationPlan: z.string().max(5000).nullable().optional(),
  ownerId: z.string().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
});
export type CreateRiskBody = z.infer<typeof createRiskBody>;

export const updateRiskBody = createRiskBody.partial().refine(
  (v) => Object.values(v).some((x) => x !== undefined),
  'Provide at least one field',
);
export type UpdateRiskBody = z.infer<typeof updateRiskBody>;

export const riskResponse = z.object({
  id: z.string(),
  teamId: z.string(),
  projectId: z.string(),
  reference: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  probability: z.number().int(),
  impact: z.number().int(),
  score: z.number().int(),
  response: riskResponseEnum,
  mitigationPlan: z.string().nullable(),
  ownerId: z.string().nullable(),
  ownerName: z.string().nullable(),
  dueDate: z.string().nullable(),
  closedAt: z.string().nullable(),
  createdById: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ── Change Control ────────────────────────────────────────────────────────────

export const changeRequestStatusEnum = z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'APPLIED']);

export const createChangeRequestBody = z.object({
  title: z.string().min(1).max(500).trim(),
  description: z.string().max(5000).nullable().optional(),
  scheduleDeltaDays: z.number().int().nullable().optional(),
  costImpactMinor: z.number().int().nullable().optional(),
  costCurrency: currencyEnum.nullable().optional(),
});
export type CreateChangeRequestBody = z.infer<typeof createChangeRequestBody>;

export const updateChangeRequestBody = createChangeRequestBody.partial().refine(
  (v) => Object.values(v).some((x) => x !== undefined),
  'Provide at least one field',
);
export type UpdateChangeRequestBody = z.infer<typeof updateChangeRequestBody>;

export const decideChangeRequestBody = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  rejectionReason: z.string().max(2000).nullable().optional(),
});
export type DecideChangeRequestBody = z.infer<typeof decideChangeRequestBody>;

export const changeRequestResponse = z.object({
  id: z.string(),
  teamId: z.string(),
  projectId: z.string(),
  reference: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: changeRequestStatusEnum,
  scheduleDeltaDays: z.number().int().nullable(),
  costImpactMinor: z.number().nullable(),
  costCurrency: currencyEnum.nullable(),
  submittedById: z.string().nullable(),
  submittedAt: z.string().nullable(),
  decidedById: z.string().nullable(),
  decidedAt: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  appliedBaselineId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ── Procurement ───────────────────────────────────────────────────────────────

export const createVendorBody = z.object({
  name: z.string().min(1).max(200).trim(),
  contactEmail: z.string().email().nullable().optional(),
  contactPhone: z.string().max(50).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type CreateVendorBody = z.infer<typeof createVendorBody>;

export const updateVendorBody = createVendorBody.partial().refine(
  (v) => Object.values(v).some((x) => x !== undefined),
  'Provide at least one field',
);
export type UpdateVendorBody = z.infer<typeof updateVendorBody>;

export const vendorResponse = z.object({
  id: z.string(),
  teamId: z.string(),
  name: z.string(),
  contactEmail: z.string().nullable(),
  contactPhone: z.string().nullable(),
  address: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const contractStatusEnum = z.enum(['DRAFT', 'ACTIVE', 'CLOSED', 'CANCELLED']);

export const createContractBody = z.object({
  vendorId: z.string().nullable().optional(),
  title: z.string().min(1).max(500).trim(),
  status: contractStatusEnum.optional(),
  valueMinor: z.number().int().nonnegative().nullable().optional(),
  currency: currencyEnum.nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type CreateContractBody = z.infer<typeof createContractBody>;

export const updateContractBody = createContractBody.partial().refine(
  (v) => Object.values(v).some((x) => x !== undefined),
  'Provide at least one field',
);
export type UpdateContractBody = z.infer<typeof updateContractBody>;

export const contractResponse = z.object({
  id: z.string(),
  teamId: z.string(),
  projectId: z.string(),
  vendorId: z.string().nullable(),
  vendorName: z.string().nullable(),
  reference: z.string(),
  title: z.string(),
  status: contractStatusEnum,
  valueMinor: z.number().nullable(),
  currency: currencyEnum.nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const poStatusEnum = z.enum(['DRAFT', 'ISSUED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED']);

export const createPoBody = z.object({
  contractId: z.string().nullable().optional(),
  title: z.string().min(1).max(500).trim(),
  amountMinor: z.number().int().nonnegative().nullable().optional(),
  currency: currencyEnum.nullable().optional(),
  issuedDate: z.string().datetime().nullable().optional(),
  expectedDate: z.string().datetime().nullable().optional(),
});
export type CreatePoBody = z.infer<typeof createPoBody>;

export const updatePoBody = z.object({
  title: z.string().min(1).max(500).trim().optional(),
  status: poStatusEnum.optional(),
  amountMinor: z.number().int().nonnegative().nullable().optional(),
  currency: currencyEnum.nullable().optional(),
  issuedDate: z.string().datetime().nullable().optional(),
  expectedDate: z.string().datetime().nullable().optional(),
  receivedDate: z.string().datetime().nullable().optional(),
}).refine((v) => Object.values(v).some((x) => x !== undefined), 'Provide at least one field');
export type UpdatePoBody = z.infer<typeof updatePoBody>;

export const poResponse = z.object({
  id: z.string(),
  teamId: z.string(),
  projectId: z.string(),
  contractId: z.string().nullable(),
  reference: z.string(),
  title: z.string(),
  status: poStatusEnum,
  amountMinor: z.number().nullable(),
  currency: currencyEnum.nullable(),
  issuedDate: z.string().nullable(),
  expectedDate: z.string().nullable(),
  receivedDate: z.string().nullable(),
  commitmentId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ── Quality NCR ───────────────────────────────────────────────────────────────

export const ncrSeverityEnum = z.enum(['MINOR', 'MAJOR', 'CRITICAL']);
export const ncrDispositionEnum = z.enum(['USE_AS_IS', 'REWORK', 'REJECT', 'CONCESSION']);

export const createNcrBody = z.object({
  title: z.string().min(1).max(500).trim(),
  description: z.string().max(5000).nullable().optional(),
  severity: ncrSeverityEnum.optional(),
});
export type CreateNcrBody = z.infer<typeof createNcrBody>;

export const updateNcrBody = z.object({
  title: z.string().min(1).max(500).trim().optional(),
  description: z.string().max(5000).nullable().optional(),
  severity: ncrSeverityEnum.optional(),
  disposition: ncrDispositionEnum.nullable().optional(),
  correctiveTaskId: z.string().nullable().optional(),
}).refine((v) => Object.values(v).some((x) => x !== undefined), 'Provide at least one field');
export type UpdateNcrBody = z.infer<typeof updateNcrBody>;

export const ncrResponse = z.object({
  id: z.string(),
  teamId: z.string(),
  projectId: z.string(),
  reference: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  severity: ncrSeverityEnum,
  disposition: ncrDispositionEnum.nullable(),
  correctiveTaskId: z.string().nullable(),
  closedAt: z.string().nullable(),
  createdById: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
