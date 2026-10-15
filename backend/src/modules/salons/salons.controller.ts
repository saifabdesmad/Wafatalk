import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { SalonsService } from './salons.service.js';
import {
  createSalonSchema,
  joinSalonSchema,
  salonAdminActionSchema,
  salonFilterSchema,
} from './salons.schema.js';

function extractClientIp(request: FastifyRequest): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded) {
    const list = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const ip = list.split(',')[0].trim();
    if (ip) return ip.replace('::ffff:', '');
  }
  return (request.ip || (request.raw.socket as any)?.remoteAddress || '127.0.0.1').replace('::ffff:', '');
}

export async function salonsRoutes(fastify: FastifyInstance) {
  // List Salons (with search & category filter)
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const filter = salonFilterSchema.parse(request.query);
      const result = await SalonsService.list(filter);
      return reply.send({ success: true, ...result });
    } catch (error: any) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  });

  // Get Single Salon by ID or Slug
  fastify.get('/:idOrSlug', async (request: any, reply: FastifyReply) => {
    try {
      const currentUserId = request.user?.id;
      const salon = await SalonsService.getByIdOrSlug(request.params.idOrSlug, currentUserId);
      return reply.send({ success: true, salon });
    } catch (error: any) {
      return reply.code(404).send({ success: false, message: error.message });
    }
  });

  // Create Salon (Authenticated)
  fastify.post('/', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply: FastifyReply) => {
    try {
      const input = createSalonSchema.parse(request.body);
      const salon = await SalonsService.create(request.user.id, input);
      return reply.code(201).send({
        success: true,
        message: 'Salon créé avec succès !',
        salon,
      });
    } catch (error: any) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  });

  // Join Salon (Authenticated)
  fastify.post('/:id/join', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply: FastifyReply) => {
    try {
      const body = joinSalonSchema.parse(request.body || {});
      const clientIp = extractClientIp(request);
      const result = await SalonsService.join(
        request.params.id,
        request.user.id,
        clientIp,
        body.accessCode,
        body.inviteToken
      );
      return reply.send({ success: true, ...result });
    } catch (error: any) {
      const msg = error.message || '';
      if (msg.startsWith('BAN_')) {
        return reply.code(403).send({ success: false, error: 'BANNED', message: msg });
      }
      if (msg.startsWith('INVALID_CODE')) {
        return reply.code(401).send({ success: false, error: 'INVALID_CODE', message: "Code d'accès incorrect pour ce salon privé." });
      }
      if (msg.startsWith('PRIVATE_CODE_REQUIRED')) {
        return reply.code(401).send({ success: false, error: 'PRIVATE_CODE_REQUIRED', message: msg });
      }
      return reply.code(400).send({ success: false, message: msg });
    }
  });

  // Verify Access Code / Token (Open to guests & authenticated users)
  fastify.post('/:id/verify-access', async (request: any, reply: FastifyReply) => {
    try {
      const body = joinSalonSchema.parse(request.body || {});
      const clientIp = extractClientIp(request);
      const userId = request.user?.id;
      const result = await SalonsService.checkAccess(
        request.params.id,
        userId,
        clientIp,
        body.accessCode,
        body.inviteToken
      );
      return reply.send({ success: true, allowed: result.allowed, isOwner: result.isOwner });
    } catch (error: any) {
      const msg = error.message || '';
      if (msg.startsWith('BAN_')) {
        return reply.code(403).send({ success: false, error: 'BANNED', message: msg });
      }
      if (msg.startsWith('INVALID_CODE')) {
        return reply.code(401).send({ success: false, error: 'INVALID_CODE', message: "Code d'accès incorrect pour ce salon privé." });
      }
      if (msg.startsWith('PRIVATE_CODE_REQUIRED')) {
        return reply.code(401).send({ success: false, error: 'PRIVATE_CODE_REQUIRED', message: msg });
      }
      return reply.code(400).send({ success: false, message: msg });
    }
  });

  // Leave Salon (Authenticated)
  fastify.post('/:id/leave', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply: FastifyReply) => {
    try {
      await SalonsService.leave(request.params.id, request.user.id);
      return reply.send({ success: true, message: 'Vous avez quitté le salon' });
    } catch (error: any) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  });

  // Admin Action: Mute, Cut Camera, Ban User, Ban IP
  fastify.post('/:id/admin-action', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply: FastifyReply) => {
    try {
      const body = salonAdminActionSchema.parse(request.body);
      const clientIp = extractClientIp(request);
      const result = await SalonsService.executeAdminAction(
        request.params.id,
        request.user.id,
        body.targetUserId,
        body.action,
        body.reason,
        clientIp
      );
      return reply.send(result);
    } catch (error: any) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  });

  // Get Ban List (Admin Only)
  fastify.get('/:id/bans', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply: FastifyReply) => {
    try {
      const bans = await SalonsService.getBans(request.params.id, request.user.id);
      return reply.send({ success: true, bans });
    } catch (error: any) {
      return reply.code(403).send({ success: false, message: error.message });
    }
  });

  // Unban (Admin Only)
  fastify.delete('/:id/bans/:banId', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply: FastifyReply) => {
    try {
      const result = await SalonsService.unban(request.params.id, request.user.id, request.params.banId);
      return reply.send(result);
    } catch (error: any) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  });
}
