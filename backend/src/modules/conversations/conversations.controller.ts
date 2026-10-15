import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ConversationsService } from './conversations.service.js';
import { prisma } from '../../database/prisma.js';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';

// Ensure uploads directory exists
const UPLOADS_DIR = path.resolve('./uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Allowed MIME types
const ALLOWED_MIME_TYPES: Record<string, string> = {
  // Images
  'image/jpeg': 'IMAGE',
  'image/jpg': 'IMAGE',
  'image/png': 'IMAGE',
  'image/gif': 'IMAGE',
  'image/webp': 'IMAGE',
  'image/svg+xml': 'IMAGE',
  // Videos
  'video/mp4': 'VIDEO',
  'video/webm': 'VIDEO',
  'video/ogg': 'VIDEO',
  'video/quicktime': 'VIDEO',
  // Files
  'application/pdf': 'FILE',
  'application/msword': 'FILE',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'FILE',
  'application/vnd.ms-excel': 'FILE',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'FILE',
  'application/zip': 'FILE',
  'application/x-zip-compressed': 'FILE',
  'text/plain': 'FILE',
  'audio/mpeg': 'FILE',
  'audio/ogg': 'FILE',
  'audio/wav': 'FILE',
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

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

  // POST /api/conversations/:id/upload : upload a media/file attachment
  fastify.post('/:id/upload', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const user = (request as any).user;
      const { id: conversationId } = request.params;

      const data = await (request as any).file();
      if (!data) {
        return reply.code(400).send({ success: false, message: 'Aucun fichier fourni.' });
      }

      const mimeType = data.mimetype as string;
      const messageTypeKey = ALLOWED_MIME_TYPES[mimeType];
      if (!messageTypeKey) {
        return reply.code(400).send({ success: false, message: 'Type de fichier non supporté.' });
      }

      // Read into buffer and check size
      const chunks: Buffer[] = [];
      let totalSize = 0;
      for await (const chunk of data.file) {
        totalSize += chunk.length;
        if (totalSize > MAX_FILE_SIZE) {
          return reply.code(413).send({ success: false, message: 'Fichier trop volumineux. Maximum 50 MB.' });
        }
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      // Save file
      const ext = path.extname(data.filename || '').toLowerCase() || '';
      const fileName = `${randomUUID()}${ext}`;
      const filePath = path.join(UPLOADS_DIR, fileName);
      fs.writeFileSync(filePath, buffer);

      // Build public URL
      const protocol = request.protocol || 'http';
      const host = request.hostname || 'localhost:4000';
      const mediaUrl = `${protocol}://${host}/uploads/${fileName}`;

      const viewMode = (data.fields?.viewMode?.value || 'PERMANENT') as 'PERMANENT' | 'ONE_VIEW';
      const originalName = data.filename || 'fichier';
      const caption = data.fields?.caption?.value || '';

      const result = await ConversationsService.createDirectMessage(
        conversationId,
        user.id,
        caption,
        messageTypeKey,
        {
          mediaUrl,
          mediaType: mimeType,
          mediaName: originalName,
          mediaSize: totalSize,
          viewMode,
        }
      );

      // Broadcast in real-time to the conversation room and recipient
      const io = (fastify as any).io;
      if (io) {
        io.to(`conv:${conversationId}`).emit('dm:message', result.message);
        if (result.targetUserId) {
          io.to(`user:${result.targetUserId}`).emit('dm:notification', {
            conversationId,
            message: result.message,
          });
        }
      }

      return reply.code(201).send({ success: true, message: result.message, targetUserId: result.targetUserId });
    } catch (error: any) {
      console.error('Upload error:', error);
      return reply.code(500).send({ success: false, message: error.message || 'Erreur lors de l\'upload.' });
    }
  });

  // POST /api/conversations/messages/:msgId/view : mark a one-view message as viewed
  fastify.post('/messages/:msgId/view', async (request: FastifyRequest<{ Params: { msgId: string } }>, reply: FastifyReply) => {
    try {
      const user = (request as any).user;
      const { msgId } = request.params;
      const result = await ConversationsService.markOneViewViewed(msgId, user.id);

      // Notify room if freshly opened
      const io = (fastify as any).io;
      if (io && !result.alreadyViewed) {
        const msg = await prisma.directMessage.findUnique({
          where: { id: msgId },
          select: { conversationId: true },
        });
        if (msg) {
          io.to(`conv:${msg.conversationId}`).emit('dm:one_view_seen', {
            conversationId: msg.conversationId,
            messageId: msgId,
            viewedByUserId: user.id,
          });
        }
      }

      return reply.code(200).send({ success: true, ...result });
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
