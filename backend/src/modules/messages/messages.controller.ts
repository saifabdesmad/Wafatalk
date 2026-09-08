import { FastifyInstance, FastifyReply } from 'fastify';
import { MessagesService } from './messages.service.js';
import { z } from 'zod';

const createMsgSchema = z.object({
  content: z.string().min(1).max(1000),
  type: z.enum(['TEXT', 'SYSTEM', 'GIFT', 'IMAGE']).default('TEXT'),
});

export async function messagesRoutes(fastify: FastifyInstance) {
  // Get Messages for a Salon
  fastify.get('/salons/:salonId/messages', async (request: any, reply: FastifyReply) => {
    try {
      const { salonId } = request.params;
      const { limit, beforeId } = request.query as any;
      const messages = await MessagesService.getSalonMessages(
        salonId,
        limit ? parseInt(limit) : 50,
        beforeId
      );
      return reply.send({ success: true, messages });
    } catch (error: any) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  });

  // Post Message (Authenticated REST Fallback)
  fastify.post('/salons/:salonId/messages', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply: FastifyReply) => {
    try {
      const { salonId } = request.params;
      const input = createMsgSchema.parse(request.body);
      const message = await MessagesService.createMessage(
        salonId,
        request.user.id,
        input.content,
        input.type
      );

      // Broadcast via Socket.IO if connected
      const io = (fastify as any).io;
      if (io) {
        io.to(`salon:${salonId}`).emit('chat:message', message);
      }

      return reply.code(201).send({ success: true, message });
    } catch (error: any) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  });
}
