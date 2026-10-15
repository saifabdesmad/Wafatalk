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

      const parts = request.parts();
      let fileBuffer: Buffer | null = null;
      let filename = '';
      let mimeType = '';
      let totalSize = 0;
      let viewMode: 'PERMANENT' | 'ONE_VIEW' = 'PERMANENT';
      let caption = '';

      for await (const part of parts) {
        if (part.type === 'file') {
          filename = part.filename || 'fichier';
          mimeType = (part.mimetype as string) || '';
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) {
            totalSize += chunk.length;
            if (totalSize > MAX_FILE_SIZE) {
              return reply.code(413).send({ success: false, message: 'Fichier trop volumineux. Maximum 50 MB.' });
            }
            chunks.push(chunk);
          }
          fileBuffer = Buffer.concat(chunks);
        } else if (part.type === 'field') {
          if (part.fieldname === 'viewMode') {
            viewMode = part.value === 'ONE_VIEW' ? 'ONE_VIEW' : 'PERMANENT';
          } else if (part.fieldname === 'caption') {
            caption = String(part.value || '');
          }
        }
      }

      if (!fileBuffer || !filename) {
        return reply.code(400).send({ success: false, message: 'Aucun fichier fourni.' });
      }

      // Detect message type dynamically
      let messageTypeKey = 'FILE';
      const ext = path.extname(filename).toLowerCase() || '';
      if (mimeType.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico', '.heic'].includes(ext)) {
        messageTypeKey = 'IMAGE';
      } else if (mimeType.startsWith('video/') || ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv', '.3gp'].includes(ext)) {
        messageTypeKey = 'VIDEO';
      }

      // Save file
      const fileName = `${randomUUID()}${ext}`;
      const filePath = path.join(UPLOADS_DIR, fileName);
      fs.writeFileSync(filePath, fileBuffer);

      // Build public URL with proper port and protocol
      const protocol = (request.headers['x-forwarded-proto'] as string) || request.protocol || 'http';
      const host = request.headers.host || `${request.hostname}:${process.env.PORT || 4000}`;
      const mediaUrl = `${protocol}://${host}/uploads/${fileName}`;

      const result = await ConversationsService.createDirectMessage(
        conversationId,
        user.id,
        caption,
        messageTypeKey,
        {
          mediaUrl,
          mediaType: mimeType,
          mediaName: filename,
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
