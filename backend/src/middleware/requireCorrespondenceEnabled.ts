import type { preHandlerHookHandler } from 'fastify';
import { prisma } from '../data/prisma.js';
import { Errors } from '../lib/errors.js';

// v1.90: gate every correspondence route on the project's optional-module flag.
// When the module is off for a project, the routes 404 — the module appears
// not to exist for that project. Runs AFTER requireTeamRoleOrGrantedProject +
// requireProjectAccess, so the (teamId, projectId) chain is already validated;
// this only adds the enablement check.
export function requireCorrespondenceEnabled(): preHandlerHookHandler {
  return async (request) => {
    const params = request.params as { teamId?: string; projectId?: string };
    if (!params.teamId || !params.projectId) {
      throw Errors.internal(
        'requireCorrespondenceEnabled installed on a route without :teamId / :projectId',
      );
    }
    const project = await prisma.project.findUnique({
      where: { id: params.projectId },
      select: { teamId: true, correspondenceEnabled: true },
    });
    if (!project || project.teamId !== params.teamId || !project.correspondenceEnabled) {
      throw Errors.notFound('Project not found');
    }
  };
}
