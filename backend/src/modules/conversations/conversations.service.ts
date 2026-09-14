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

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          user1Id,
          user2Id,
        },
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
    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [{ user1Id: userId }, { user2Id: userId }],
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
      orderBy: { createdAt: 'asc' },
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

    return messages.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      sender: m.sender,
      content: m.content,
      type: m.type,
      isRead: m.isRead,
      isFromMe: m.senderId === currentUserId,
      time: m.createdAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      createdAt: m.createdAt,
    }));
  }

  /**
   * Create a new direct message
   */
  static async createDirectMessage(conversationId: string, senderId: string, content: string, type: string = 'TEXT') {
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
        content: content.trim(),
        type,
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

    // Bump conversation updatedAt
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    return {
      message: {
        id: message.id,
        conversationId: message.conversationId,
        sender: message.sender,
        content: message.content,
        type: message.type,
        isRead: message.isRead,
        time: message.createdAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        createdAt: message.createdAt,
      },
      targetUserId,
    };
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
}
