import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireScope } from '../middleware/requireScope.js';
import { Errors } from '../lib/errors.js';
import {
  createProjectBucketBody,
  projectBucketResponse,
  projectBucketsListResponse,
  reorderBucketProjectsBody,
  reorderProjectBucketsBody,
  setProjectBucketsBody,
  updateProjectBucketBody,
} from '../schemas/userProjectBuckets.js';
import { UserProjectBucketsService } from '../services/userProjectBucketsService.js';

const svc = new UserProjectBucketsService();

export async function meProjectBucketsRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.addHook('preHandler', requireAuth);
  r.addHook('preHandler', requireScope('projects:read'));

  r.get('/project-buckets', {
    schema: {
      tags: ['me'],
      summary: 'List personal project buckets for the current user',
      response: { 200: projectBucketsListResponse },
      security: [{ bearerAuth: [] }],
    },
    handler: async (req, reply) => {
      if (!req.user) throw Errors.unauthorized();
      const buckets = await svc.list(req.user.sub);
      return reply.send({ buckets });
    },
  });

  r.post('/project-buckets', {
    preHandler: requireScope('projects:read'),
    schema: {
      tags: ['me'],
      summary: 'Create a personal project bucket',
      body: createProjectBucketBody,
      response: { 201: projectBucketResponse },
      security: [{ bearerAuth: [] }],
    },
    handler: async (req, reply) => {
      if (!req.user) throw Errors.unauthorized();
      const bucket = await svc.create(req.user.sub, req.body);
      return reply.status(201).send(bucket);
    },
  });

  r.patch('/project-buckets/reorder', {
    schema: {
      tags: ['me'],
      summary: 'Reorder personal project buckets',
      body: reorderProjectBucketsBody,
      response: { 200: projectBucketsListResponse },
      security: [{ bearerAuth: [] }],
    },
    handler: async (req, reply) => {
      if (!req.user) throw Errors.unauthorized();
      const buckets = await svc.reorderBuckets(req.user.sub, req.body.bucketIds);
      return reply.send({ buckets });
    },
  });

  r.patch('/project-buckets/:bucketId', {
    schema: {
      tags: ['me'],
      summary: 'Update a personal project bucket',
      params: z.object({ bucketId: z.string() }),
      body: updateProjectBucketBody,
      response: { 200: projectBucketResponse },
      security: [{ bearerAuth: [] }],
    },
    handler: async (req, reply) => {
      if (!req.user) throw Errors.unauthorized();
      const bucket = await svc.update(req.user.sub, req.params.bucketId, req.body);
      return reply.send(bucket);
    },
  });

  r.delete('/project-buckets/:bucketId', {
    schema: {
      tags: ['me'],
      summary: 'Delete a personal project bucket (projects are not deleted)',
      params: z.object({ bucketId: z.string() }),
      response: { 204: z.null() },
      security: [{ bearerAuth: [] }],
    },
    handler: async (req, reply) => {
      if (!req.user) throw Errors.unauthorized();
      await svc.remove(req.user.sub, req.params.bucketId);
      return reply.code(204).send();
    },
  });

  r.post('/project-buckets/:bucketId/projects/:projectId', {
    schema: {
      tags: ['me'],
      summary: 'Add a visible project to a personal bucket',
      params: z.object({ bucketId: z.string(), projectId: z.string() }),
      response: { 200: projectBucketResponse },
      security: [{ bearerAuth: [] }],
    },
    handler: async (req, reply) => {
      if (!req.user) throw Errors.unauthorized();
      const bucket = await svc.addProject(
        req.user.sub,
        req.user.globalRole,
        req.params.bucketId,
        req.params.projectId,
      );
      return reply.send(bucket);
    },
  });

  r.delete('/project-buckets/:bucketId/projects/:projectId', {
    schema: {
      tags: ['me'],
      summary: 'Remove a project from a personal bucket',
      params: z.object({ bucketId: z.string(), projectId: z.string() }),
      response: { 200: projectBucketResponse },
      security: [{ bearerAuth: [] }],
    },
    handler: async (req, reply) => {
      if (!req.user) throw Errors.unauthorized();
      const bucket = await svc.removeProject(
        req.user.sub,
        req.params.bucketId,
        req.params.projectId,
      );
      return reply.send(bucket);
    },
  });

  r.patch('/project-buckets/:bucketId/projects/reorder', {
    schema: {
      tags: ['me'],
      summary: 'Reorder projects within a personal bucket',
      params: z.object({ bucketId: z.string() }),
      body: reorderBucketProjectsBody,
      response: { 200: projectBucketResponse },
      security: [{ bearerAuth: [] }],
    },
    handler: async (req, reply) => {
      if (!req.user) throw Errors.unauthorized();
      const bucket = await svc.reorderProjects(
        req.user.sub,
        req.params.bucketId,
        req.body.projectIds,
      );
      return reply.send(bucket);
    },
  });

  r.put('/project-buckets/assignments', {
    schema: {
      tags: ['me'],
      summary: 'Set which personal buckets contain a project (replaces prior assignments for that project)',
      body: setProjectBucketsBody,
      response: { 200: projectBucketsListResponse },
      security: [{ bearerAuth: [] }],
    },
    handler: async (req, reply) => {
      if (!req.user) throw Errors.unauthorized();
      const buckets = await svc.setProjectBuckets(
        req.user.sub,
        req.user.globalRole,
        req.body.projectId,
        req.body.bucketIds,
      );
      return reply.send({ buckets });
    },
  });
}
