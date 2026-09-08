import { prisma } from '../../database/prisma.js';

export class MessagesService {
  static async getSalonMessages(salonId: string, limit: number = 50, beforeId?: string) {
    const where: any = { salonId };

    if (beforeId) {
      const cursorMsg = await prisma.message.findUnique({ where: { id: beforeId } });
      if (cursorMsg) {
        where.createdAt = { lt: cursorMsg.createdAt };
      }
    }

    const messages = await prisma.message.findMany({
      where,
      take: limit,
      orderBy: { createdAt: 'asc' },
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

    return messages.map((m) => ({
      id: m.id,
      salonId: m.salonId,
      user: m.user,
      content: m.content,
      type: m.type,
      time: m.createdAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      createdAt: m.createdAt,
    }));
  }

  static async createMessage(salonId: string, userId: string, content: string, type: string = 'TEXT') {
    const message = await prisma.message.create({
      data: {
        salonId,
        userId,
        content,
        type,
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

    return {
      id: message.id,
      salonId: message.salonId,
      user: message.user,
      content: message.content,
      type: message.type,
      time: message.createdAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      createdAt: message.createdAt,
    };
  }
}
