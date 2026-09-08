import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { SalonsService } from './salons.service.js';
import { createSalonSchema, salonFilterSchema } from './salons.schema.js';

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
      const salon = await SalonsService.getByIdOrSlug(request.params.idOrSlug);
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
      const member = await SalonsService.join(request.params.id, request.user.id);
      return reply.send({ success: true, member });
    } catch (error: any) {
      return reply.code(400).send({ success: false, message: error.message });
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
}
