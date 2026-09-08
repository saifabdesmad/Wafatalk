import { prisma } from '../../database/prisma.js';

export class UsersService {
  static async getFriends(userId: string) {
    const friendships = await prisma.friendship.findMany({
      where: {
        userId,
        status: 'ACCEPTED',
      },
    });

    const friendIds = friendships.map((f) => f.friendId);
    const users = await prisma.user.findMany({
      where: { id: { in: friendIds } },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
        status: true,
        memberships: {
          take: 1,
          orderBy: { joinedAt: 'desc' },
          include: {
            salon: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
      },
    });

    return users.map((u) => {
      const activeSalon = u.memberships[0]?.salon;
      return {
        id: u.id,
        name: u.displayName,
        avatar: u.avatarUrl,
        status: u.status.toLowerCase(), // 'online', 'idle', 'in_salon', 'offline'
        role: activeSalon ? 'En vocal' : u.status === 'ONLINE' ? 'En ligne' : 'Absent',
        room: activeSalon ? activeSalon.name : 'Disponible',
      };
    });
  }

  static async sendGift(senderId: string, salonId: string, giftType: string, costPoints: number) {
    const sender = await prisma.user.findUnique({ where: { id: senderId } });
    if (!sender) throw new Error('Utilisateur expéditeur introuvable.');

    if (sender.wafaPoints < costPoints) {
      throw new Error(`Points Wafa insuffisants (Solde: ${sender.wafaPoints} pts, Requis: ${costPoints} pts).`);
    }

    // Deduct points from sender and record gift log
    const [updatedSender, giftLog] = await prisma.$transaction([
      prisma.user.update({
        where: { id: senderId },
        data: { wafaPoints: { decrement: costPoints } },
        select: { id: true, wafaPoints: true },
      }),
      prisma.giftLog.create({
        data: {
          senderId,
          salonId,
          giftType,
          costPoints,
        },
        include: {
          sender: {
            select: { id: true, displayName: true, avatarUrl: true },
          },
        },
      }),
    ]);

    return {
      newBalance: updatedSender.wafaPoints,
      gift: giftLog,
    };
  }
}
