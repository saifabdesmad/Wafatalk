import { prisma } from '../../database/prisma.js';

export class ConversationsService {
  /**
   * Get or create a 1-on-1 direct conversation between two users
   */
  static async getOrCreateConversation(userAId: string, userBId: string) {
    if (userAId === userBId) {
      throw new Error('Vous ne pouvez pas ouvrir un salon privé avec vous-même.');
    }

    // Sort user IDs deterministically to enforce uniqueness [user1Id, user2Id]
    const [user1Id, user2Id] = [userAId, userBId].sort();

    // Verify both users exist
    const [user1, user2] = await Promise.all([
      prisma.user.findUnique({
        where: { id: user1Id },
        select: { id: true, username: true, displayName: true, avatarUrl: true, country: true, status: true },
      }),
      prisma.user.findUnique({
        where: { id: user2Id },
        select: { id: true, username: true, displayName: true, avatarUrl: true, country: true, status: true },
      }),
    ]);

    if (!user1 || !user2) {
      throw new Error('Un des utilisateurs est introuvable.');
    }

    let conversation = await prisma.conversation.findUnique({
      where: {
        user1Id_user2Id: { user1Id, user2Id },
      },
      include: {
        user1: { select: { id: true, username: true, displayName: true, avatarUrl: true, country: true, status: true } },
        user2: { select: { id: true, username: true, displayName: true, avatarUrl: true, country: true, status: true } },
      },
    });

    const now = new Date();

    // If conversation expired past 24h, delete it and start fresh
    if (conversation && conversation.expiresAt && conversation.expiresAt <= now) {
      await prisma.conversation.delete({ where: { id: conversation.id } }).catch(() => {});
      conversation = null;
    }

    if (!conversation) {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h TTL
      conversation = await prisma.conversation.create({
        data: {
          user1Id,
          user2Id,
          expiresAt,
        },
        include: {
          user1: { select: { id: true, username: true, displayName: true, avatarUrl: true, country: true, status: true } },
          user2: { select: { id: true, username: true, displayName: true, avatarUrl: true, country: true, status: true } },
        },
      });
    } else if (!conversation.expiresAt) {
      // Backfill missing expiresAt
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      conversation = await prisma.conversation.update({
        where: { id: conversation.id },
        data: { expiresAt },
        include: {
          user1: { select: { id: true, username: true, displayName: true, avatarUrl: true, country: true, status: true } },
          user2: { select: { id: true, username: true, displayName: true, avatarUrl: true, country: true, status: true } },
        },
      });
    }

    return conversation;
  }

  /**
   * Get all conversations for a user with last message preview and other user profile
   */
  static async getUserConversations(userId: string) {
    const now = new Date();
    const conversations = await prisma.conversation.findMany({
      where: {
        AND: [
          { OR: [{ user1Id: userId }, { user2Id: userId }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        user1: { select: { id: true, username: true, displayName: true, avatarUrl: true, country: true, status: true } },
        user2: { select: { id: true, username: true, displayName: true, avatarUrl: true, country: true, status: true } },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { id: true, content: true, type: true, createdAt: true, senderId: true, isRead: true },
        },
      },
    });

    return conversations.map((conv) => {
      const otherUser = conv.user1Id === userId ? conv.user2 : conv.user1;
      const lastMessage = conv.messages[0] || null;

      return {
        id: conv.id,
        updatedAt: conv.updatedAt,
        expiresAt: conv.expiresAt,
        otherUser,
        lastMessage: lastMessage
          ? {
              content: lastMessage.content,
              type: lastMessage.type,
              time: lastMessage.createdAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
              isFromMe: lastMessage.senderId === userId,
              isRead: lastMessage.isRead,
            }
          : null,
      };
    });
  }

  /**
   * Retrieve message history for a conversation
   */
  static async getConversationMessages(conversationId: string, currentUserId: string, limit: number = 50, beforeId?: string) {
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conv || (conv.user1Id !== currentUserId && conv.user2Id !== currentUserId)) {
      throw new Error('Conversation introuvable ou accès non autorisé.');
    }

    if (conv.expiresAt && conv.expiresAt <= new Date()) {
      throw new Error('Cette conversation a expiré après 24 heures et a été supprimée.');
    }

    const where: any = { conversationId };

    if (beforeId) {
      const cursorMsg = await prisma.directMessage.findUnique({ where: { id: beforeId } });
      if (cursorMsg) {
        where.createdAt = { lt: cursorMsg.createdAt };
      }
    }

    const messages = await prisma.directMessage.findMany({
      where,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    messages.reverse();

    return messages.map((m) => {
      const viewedBy = m.viewedBy ? m.viewedBy.split(',').filter(Boolean) : [];
      const isFromMe = m.senderId === currentUserId;
      const isAlreadyViewedByMe = m.viewMode === 'ONE_VIEW' && !isFromMe && viewedBy.includes(currentUserId);

      return {
        id: m.id,
        conversationId: m.conversationId,
        sender: m.sender,
        content: m.content,
        type: m.type,
        mediaUrl: isAlreadyViewedByMe ? null : m.mediaUrl,
        mediaType: m.mediaType,
        mediaName: m.mediaName,
        mediaSize: m.mediaSize,
        viewMode: m.viewMode,
        viewedBy,
        isRead: m.isRead,
        isFromMe,
        time: m.createdAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        createdAt: m.createdAt,
      };
    });
  }

  /**
   * Create a new direct message (text or media)
   */
  static async createDirectMessage(
    conversationId: string,
    senderId: string,
    content: string,
    type: string = 'TEXT',
    opts?: {
      mediaUrl?: string;
      mediaType?: string;
      mediaName?: string;
      mediaSize?: number;
      viewMode?: 'PERMANENT' | 'ONE_VIEW';
    }
  ) {
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conv || (conv.user1Id !== senderId && conv.user2Id !== senderId)) {
      throw new Error('Conversation introuvable ou accès non autorisé.');
    }

    const targetUserId = conv.user1Id === senderId ? conv.user2Id : conv.user1Id;

    const message = await prisma.directMessage.create({
      data: {
        conversationId,
        senderId,
        content: content.trim() || '',
        type,
        mediaUrl: opts?.mediaUrl,
        mediaType: opts?.mediaType,
        mediaName: opts?.mediaName,
        mediaSize: opts?.mediaSize,
        viewMode: opts?.viewMode || 'PERMANENT',
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    if (conv.expiresAt && conv.expiresAt <= new Date()) {
      throw new Error('Cette conversation a expiré après 24 heures et a été supprimée.');
    }

    // Set 24h expiry on first message if not set, or preserve existing
    let expiresAt = conv.expiresAt;
    if (!expiresAt) {
      expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    }
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        updatedAt: new Date(),
        expiresAt,
      },
    });

    return {
      message: {
        id: message.id,
        conversationId: message.conversationId,
        sender: message.sender,
        content: message.content,
        type: message.type,
        mediaUrl: message.mediaUrl,
        mediaType: message.mediaType,
        mediaName: message.mediaName,
        mediaSize: message.mediaSize,
        viewMode: message.viewMode,
        viewedBy: [],
        isRead: message.isRead,
        time: message.createdAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        createdAt: message.createdAt,
      },
      targetUserId,
    };
  }

  /**
   * Mark a one-view message as viewed by a user. Returns true if content should be revealed.
   */
  static async markOneViewViewed(messageId: string, userId: string): Promise<{ alreadyViewed: boolean }> {
    const msg = await prisma.directMessage.findUnique({ where: { id: messageId } });
    if (!msg) throw new Error('Message introuvable.');

    const viewers = msg.viewedBy ? msg.viewedBy.split(',').filter(Boolean) : [];
    if (viewers.includes(userId)) {
      return { alreadyViewed: true };
    }

    viewers.push(userId);
    await prisma.directMessage.update({
      where: { id: messageId },
      data: { viewedBy: viewers.join(',') },
    });

    return { alreadyViewed: false };
  }

  /**
   * Mark unread messages as read
   */
  static async markMessagesAsRead(conversationId: string, currentUserId: string) {
    await prisma.directMessage.updateMany({
      where: {
        conversationId,
        senderId: { not: currentUserId },
        isRead: false,
      },
      data: { isRead: true },
    });
  }

  /**
   * Create a CallSession
   */
  static async createCallSession(conversationId: string, callerId: string, receiverId: string, type: string = 'AUDIO') {
    let convId = conversationId;
    try {
      const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
      if (!conv) {
        const ensured = await this.getOrCreateConversation(callerId, receiverId);
        convId = ensured.id;
      }
    } catch (e) {
      const ensured = await this.getOrCreateConversation(callerId, receiverId);
      convId = ensured.id;
    }

    return prisma.callSession.create({
      data: {
        conversationId: convId,
        callerId,
        receiverId,
        type: type.toUpperCase(),
        status: 'RINGING',
        startedAt: new Date(),
      },
    });
  }

  /**
   * Finalize a CallSession and create a system log in chat
   */
  static async endCallSession(callId: string, status: string = 'COMPLETED', durationSec: number = 0) {
    const session = await prisma.callSession.findUnique({
      where: { id: callId },
    });

    if (!session) return null;

    const updated = await prisma.callSession.update({
      where: { id: callId },
      data: {
        status,
        durationSec,
        endedAt: new Date(),
      },
    });

    // Create a call log system message in the conversation
    const mins = Math.floor(durationSec / 60);
    const secs = durationSec % 60;
    const timeFormatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    const icon = session.type === 'VIDEO' ? '📹' : '📞';
    let logText = '';

    if (status === 'COMPLETED') {
      logText = `${icon} Appel ${session.type.toLowerCase()} terminé — Durée : ${timeFormatted}`;
    } else if (status === 'MISSED') {
      logText = `${icon} Appel ${session.type.toLowerCase()} manqué`;
    } else if (status === 'REJECTED') {
      logText = `${icon} Appel ${session.type.toLowerCase()} décliné`;
    }

    if (logText) {
      await prisma.directMessage.create({
        data: {
          conversationId: session.conversationId,
          senderId: session.callerId,
          content: logText,
          type: 'CALL_LOG',
        },
      });
    }

    return updated;
  }

  /**
   * Delete all conversations and messages that have expired (past 24h TTL)
   */
  static async cleanupExpiredConversations(io?: any) {
    const now = new Date();
    const expired = await prisma.conversation.findMany({
      where: {
        expiresAt: { lte: now },
      },
      select: { id: true },
    });

    if (expired.length === 0) return 0;

    const ids = expired.map((c) => c.id);

    if (io) {
      for (const id of ids) {
        io.to(`conv:${id}`).emit('dm:conversation_expired', { conversationId: id });
      }
    }

    // Cascade deletes messages & calls via prisma schema
    await prisma.conversation.deleteMany({
      where: { id: { in: ids } },
    });

    console.log(`🗑️  Cleaned up ${ids.length} expired conversation(s).`);
    return ids.length;
  }
}
