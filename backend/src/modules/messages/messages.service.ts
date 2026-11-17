import { prisma } from '../../database/prisma.js';

export class MessagesService {
  static async getSalonMessages(
    salonId: string,
    limit: number = 50,
    beforeId?: string,
    currentUserId?: string
  ) {
    const where: any = { salonId };

    if (beforeId) {
      const cursorMsg = await prisma.message.findUnique({ where: { id: beforeId } });
      if (cursorMsg) {
        where.createdAt = { lt: cursorMsg.createdAt };
      }
    }

    const rawMessages = await prisma.message.findMany({
      where,
      take: limit * 2,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Filter out private whispers that do not belong to currentUserId
    const filtered = rawMessages.filter((m) => {
      if (m.type !== 'WHISPER') return true;
      if (!currentUserId) return false;
      if (m.userId === currentUserId) return true;
      if (m.metadata) {
        try {
          const meta = JSON.parse(m.metadata);
          if (meta.whisperToId === currentUserId) return true;
        } catch (e) {}
      }
      return false;
    }).slice(0, limit);

    filtered.reverse();

    return filtered.map((m) => {
      let metaObj: any = null;
      if (m.metadata) {
        try { metaObj = JSON.parse(m.metadata); } catch(e) {}
      }
      return {
        id: m.id,
        salonId: m.salonId,
        user: m.user,
        content: m.content,
        type: m.type,
        metadata: m.metadata,
        whisperToId: metaObj?.whisperToId,
        whisperToName: metaObj?.whisperToName,
        time: m.createdAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        createdAt: m.createdAt,
      };
    });
  }

  static async createMessage(
    salonId: string,
    userId: string,
    content: string,
    type: string = 'TEXT',
    metadata?: string
  ) {
    const message = await prisma.message.create({
      data: {
        salonId,
        userId,
        content,
        type,
        metadata,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    let metaObj: any = null;
    if (message.metadata) {
      try { metaObj = JSON.parse(message.metadata); } catch(e) {}
    }

    return {
      id: message.id,
      salonId: message.salonId,
      user: message.user,
      content: message.content,
      type: message.type,
      metadata: message.metadata,
      whisperToId: metaObj?.whisperToId,
      whisperToName: metaObj?.whisperToName,
      time: message.createdAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      createdAt: message.createdAt,
    };
  }
}
