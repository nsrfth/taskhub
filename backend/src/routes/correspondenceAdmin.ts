import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { prisma } from '../data/prisma.js';
import { requireAuth, requireGlobalRole } from '../middleware/auth.js';
import { logActivity } from '../services/activityLogger.js';
import { Errors } from '../lib/errors.js';

// v1.90: admin-only correspondence module enablement. Global ADMIN turns the
// module on/off per project. Mounted at /admin/correspondence so it inherits
// the GlobalRole=ADMIN gate. The toggle flips Project.correspondenceEnabled,
// which gates every per-project correspondence route + the SPA nav entry.
export async function correspondenceAdminRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.addHook('preHandler', requireAuth);
  r.addHook('preHandler', requireGlobalRole('ADMIN'));

  const projectRow = z.object({
    projectId: z.string(),
    projectName: z.string(),
    teamId: z.string(),
    teamName: z.string(),
    correspondenceEnabled: z.boolean(),
  });

  r.get('/projects', {
    schema: {
      tags: ['admin', 'correspondence'],
      summary: 'List every project (all teams) with its correspondence flag',
      response: { 200: z.array(projectRow) },
      security: [{ bearerAuth: [] }],
    },
    handler: async () => {
      const rows = await prisma.project.findMany({
        orderBy: [{ team: { name: 'asc' } }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          teamId: true,
          correspondenceEnabled: true,
          team: { select: { name: true } },
        },
      });
      return rows.map((p) => ({
        projectId: p.id,
        projectName: p.name,
        teamId: p.teamId,
        teamName: p.team.name,
        correspondenceEnabled: p.correspondenceEnabled,
      }));
    },
  });

  r.patch('/projects/:projectId', {
    schema: {
      tags: ['admin', 'correspondence'],
      summary: 'Enable/disable the correspondence module for a project',
      params: z.object({ projectId: z.string() }),
      body: z.object({ enabled: z.boolean() }),
      response: { 200: projectRow },
      security: [{ bearerAuth: [] }],
    },
    handler: async (req) => {
      const { projectId } = req.params as { projectId: string };
      const { enabled } = req.body as { enabled: boolean };

      const existing = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, teamId: true },
      });
      if (!existing) throw Errors.notFound('Project not found');

      const updated = await prisma.project.update({
        where: { id: projectId },
        data: { correspondenceEnabled: enabled },
        select: {
          id: true,
          name: true,
          teamId: true,
          correspondenceEnabled: true,
          team: { select: { name: true } },
        },
      });
      await logActivity(prisma, {
        teamId: updated.teamId,
        actorId: req.user?.sub ?? null,
        action: 'correspondence.module_toggled',
        meta: { projectId, enabled },
      });
      return {
        projectId: updated.id,
        projectName: updated.name,
        teamId: updated.teamId,
        teamName: updated.team.name,
        correspondenceEnabled: updated.correspondenceEnabled,
      };
    },
  });
}
