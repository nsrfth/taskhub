import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AuthController } from '../controllers/authController.js';
import { AuthService } from '../services/authService.js';
import {
  loginBody,
  performResetBody,
  registerBody,
  requestResetBody,
  verificationPerformBody,
  verificationRequestBody,
} from '../schemas/auth.js';
import { requireAuth } from '../middleware/auth.js';
import type { Env } from '../config/env.js';

export async function authRoutes(app: FastifyInstance, opts: { env: Env }): Promise<void> {
  const env = opts.env;
  // Rate-limit applied to write-side auth endpoints. Read from env so tests
  // can crank it up without hitting the limiter; in prod the .env default of
  // 10/min/IP is what we want.
  const RL_TAG = {
    rateLimit: { max: env.AUTH_RATE_LIMIT_MAX, timeWindow: env.AUTH_RATE_LIMIT_WINDOW },
  } as const;
  const svc = new AuthService(env, {
    signAccess: (p) => app.signAccess(p as any),
    signRefresh: (p, exp) => app.signRefresh(p, exp),
    verifyRefresh: (t) => app.verifyRefresh(t),
  });
  const ctrl = new AuthController(env, svc);

  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post('/register', {
    config: RL_TAG,
    schema: {
      tags: ['auth'],
      summary: 'Create a new account',
      body: registerBody,
      // devVerifyToken: non-prod only, used by tests + dev flows. Listed in
      // the schema so the fastify-type-provider-zod serializer doesn't strip it.
      response: {
        201: z.object({
          accessToken: z.string(),
          user: z.any(),
          devVerifyToken: z.string().optional(),
        }),
      },
    },
    handler: ctrl.register,
  });

  r.post('/login', {
    config: RL_TAG,
    schema: {
      tags: ['auth'],
      summary: 'Log in with email + password',
      body: loginBody,
      response: { 200: z.object({ accessToken: z.string(), user: z.any() }) },
    },
    handler: ctrl.login,
  });

  r.post('/refresh', {
    config: RL_TAG,
    schema: { tags: ['auth'], summary: 'Rotate refresh token, return new access token' },
    handler: ctrl.refresh,
  });

  r.post('/logout', {
    schema: { tags: ['auth'], summary: 'Revoke the current refresh token' },
    handler: ctrl.logout,
  });

  r.post('/password/reset-request', {
    config: RL_TAG,
    schema: { tags: ['auth'], summary: 'Begin password reset', body: requestResetBody },
    handler: ctrl.requestReset,
  });

  r.post('/password/reset', {
    config: RL_TAG,
    schema: { tags: ['auth'], summary: 'Complete password reset', body: performResetBody },
    handler: ctrl.performReset,
  });

  r.post('/verification/request', {
    config: RL_TAG,
    schema: {
      tags: ['auth'],
      summary: 'Re-issue an email verification token (anti-enumeration response)',
      body: verificationRequestBody,
    },
    handler: ctrl.requestVerification,
  });

  r.post('/verification/perform', {
    config: RL_TAG,
    schema: {
      tags: ['auth'],
      summary: 'Claim a verification token; marks the user as email-verified',
      body: verificationPerformBody,
    },
    handler: ctrl.performVerification,
  });

  r.get('/me', {
    preHandler: requireAuth,
    schema: { tags: ['auth'], summary: 'Get the current user', security: [{ bearerAuth: [] }] },
    handler: ctrl.me,
  });
}
