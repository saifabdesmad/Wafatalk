import { FastifyInstance, FastifyReply } from 'fastify';
import { UsersService } from './users.service.js';
import { z } from 'zod';

const giftSchema = z.object({
  salonId: z.string().min(1),
  giftType: z.enum(['heart', 'star', 'crown', 'rocket', 'diamond']),
  costPoints: z.number().int().positive().default(10),
});

export async function usersRoutes(fastify: FastifyInstance) {
  // Get Friends List (Authenticated)
  fastify.get('/friends', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply: FastifyReply) => {
    try {
      const friends = await UsersService.getFriends(request.user.id);
      return reply.send({ success: true, friends });
    } catch (error: any) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  });

  // Send Gift in Salon (Authenticated)
  fastify.post('/gifts/send', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply: FastifyReply) => {
    try {
      const input = giftSchema.parse(request.body);
      const result = await UsersService.sendGift(
        request.user.id,
        input.salonId,
        input.giftType,
        input.costPoints
      );

      // Broadcast gift event via Socket.IO if available
      const io = (fastify as any).io;
      if (io) {
        io.to(`salon:${input.salonId}`).emit('salon:gift', {
          sender: result.gift.sender,
          giftType: input.giftType,
          costPoints: input.costPoints,
          timestamp: result.gift.createdAt,
        });
      }

      return reply.send({
        success: true,
        message: 'Cadeau envoyé avec succès !',
        ...result,
      });
    } catch (error: any) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  });
}
