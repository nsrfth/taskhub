import type { preHandlerHookHandler } from 'fastify';
import { Errors } from '../lib/errors.js';
import { resolveProjectAccess } from '../lib/projectAccess.js';

export function requireProjectAccess(): preHandlerHookHandler {
  return async (request) => {
    if (!request.user) throw Errors.unauthorized();
    const params = request.params as { teamId?: string; projectId?: string };
    if (!params.teamId || !params.projectId) {
      throw Errors.internal(
        'requireProjectAccess installed on a route without :teamId / :projectId',
      );
    }

    const access = await resolveProjectAccess(
      params.projectId,
      params.teamId,
      request.user.sub,
      request.user.globalRole,
      'nested',
    );
    if (access === 'NONE') throw Errors.notFound('Project not found');
    (request as { projectAccess?: string }).projectAccess = access;
  };
}

export function requireProjectWriteAccess(): preHandlerHookHandler {
  return async (request) => {
    if (!request.user) throw Errors.unauthorized();
    const params = request.params as { teamId?: string; projectId?: string };
    if (!params.teamId || !params.projectId) {
      throw Errors.internal(
        'requireProjectWriteAccess installed on a route without :teamId / :projectId',
      );
    }

    const access = await resolveProjectAccess(
      params.projectId,
      params.teamId,
      request.user.sub,
      request.user.globalRole,
      'nested',
    );
    if (access === 'NONE') throw Errors.notFound('Project not found');
    if (access === 'READ') throw Errors.forbidden('Read-only access to this project');
  };
}
