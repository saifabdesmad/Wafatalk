import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ConversationsService } from './conversations.service.js';

export async function conversationsRoutes(fastify: FastifyInstance) {
  // Pre-handler hook to authenticate user for all conversation routes
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /api/conversations : list user's direct conversations
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = (request as any).user;
      const conversations = await ConversationsService.getUserConversations(user.id);
      return reply.code(200).send({ success: true, conversations });
    } catch (error: any) {
      return reply.code(500).send({ success: false, message: error.message });
    }
  });

  // POST /api/conversations/with/:targetUserId : get or create conversation with a user
  fastify.post('/with/:targetUserId', async (request: FastifyRequest<{ Params: { targetUserId: string } }>, reply: FastifyReply) => {
    try {
      const user = (request as any).user;
      const { targetUserId } = request.params;
      const conversation = await ConversationsService.getOrCreateConversation(user.id, targetUserId);
      return reply.code(200).send({ success: true, conversation });
    } catch (error: any) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  });

  // GET /api/conversations/:id/messages : retrieve message history
  fastify.get('/:id/messages', async (request: FastifyRequest<{ Params: { id: string }; Querystring: { limit?: string; beforeId?: string } }>, reply: FastifyReply) => {
    try {
      const user = (request as any).user;
      const { id } = request.params;
      const limit = parseInt(request.query.limit || '50', 10);
      const beforeId = request.query.beforeId;

      const messages = await ConversationsService.getConversationMessages(id, user.id, limit, beforeId);
      return reply.code(200).send({ success: true, messages });
    } catch (error: any) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  });

  // POST /api/conversations/:id/messages : send a direct message
  fastify.post('/:id/messages', async (request: FastifyRequest<{ Params: { id: string }; Body: { content: string; type?: string } }>, reply: FastifyReply) => {
    try {
      const user = (request as any).user;
      const { id } = request.params;
      const { content, type } = request.body;

      if (!content || !content.trim()) {
        return reply.code(400).send({ success: false, message: 'Le message ne peut pas être vide.' });
      }

      const result = await ConversationsService.createDirectMessage(id, user.id, content, type || 'TEXT');
      return reply.code(201).send({ success: true, message: result.message });
    } catch (error: any) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  });

  // POST /api/conversations/:id/read : mark messages as read
  fastify.post('/:id/read', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const user = (request as any).user;
      const { id } = request.params;
      await ConversationsService.markMessagesAsRead(id, user.id);
      return reply.code(200).send({ success: true });
    } catch (error: any) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  });
}
