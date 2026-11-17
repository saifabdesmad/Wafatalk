import { prisma } from '../../database/prisma.js';

export class FriendsService {
  // Send a friend request (check not already friends, not already pending, not self)
  static async sendRequest(senderId: string, receiverId: string) {
    if (senderId === receiverId) throw new Error('Vous ne pouvez pas vous envoyer une demande à vous-même.');

    // Check both users exist
    const receiver = await prisma.user.findUnique({ where: { id: receiverId }, select: { id: true, displayName: true, username: true, avatarUrl: true } });
    if (!receiver) throw new Error('Utilisateur introuvable.');

    // Check if already friends
    const existing = await prisma.friendship.findUnique({ where: { userId_friendId: { userId: senderId, friendId: receiverId } } });
    if (existing) throw new Error('Vous êtes déjà amis avec cet utilisateur.');

    // Check if request already pending (either direction)
    const existingReq = await prisma.friendRequest.findFirst({
      where: {
        OR: [
          { senderId, receiverId, status: 'PENDING' },
          { senderId: receiverId, receiverId: senderId, status: 'PENDING' },
        ]
      }
    });
    if (existingReq) {
      if (existingReq.senderId === receiverId) {
        throw new Error("Cet utilisateur vous a déjà envoyé une demande d'ami. Acceptez-la !");
      }
      throw new Error("Une demande d'ami est déjà en attente pour cet utilisateur.");
    }

    const request = await prisma.friendRequest.create({
      data: { senderId, receiverId },
      include: {
        receiver: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
        sender: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
      }
    });
    return request;
  }

  // Accept a friend request → create bidirectional Friendship
  static async acceptRequest(requestId: string, currentUserId: string) {
    const req = await prisma.friendRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new Error('Demande introuvable.');
    if (req.receiverId !== currentUserId) throw new Error('Non autorisé.');
    if (req.status !== 'PENDING') throw new Error("Cette demande n'est plus en attente.");

    await prisma.$transaction([
      prisma.friendRequest.update({ where: { id: requestId }, data: { status: 'ACCEPTED' } }),
      prisma.friendship.upsert({
        where: { userId_friendId: { userId: req.senderId, friendId: req.receiverId } },
        create: { userId: req.senderId, friendId: req.receiverId },
        update: {},
      }),
      prisma.friendship.upsert({
        where: { userId_friendId: { userId: req.receiverId, friendId: req.senderId } },
        create: { userId: req.receiverId, friendId: req.senderId },
        update: {},
      }),
    ]);

    const updatedReq = await prisma.friendRequest.findUnique({
      where: { id: requestId },
      include: {
        sender: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
        receiver: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
      }
    });
    return updatedReq;
  }

  // Reject a friend request
  static async rejectRequest(requestId: string, currentUserId: string) {
    const req = await prisma.friendRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new Error('Demande introuvable.');
    if (req.receiverId !== currentUserId) throw new Error('Non autorisé.');
    if (req.status !== 'PENDING') throw new Error("Cette demande n'est plus en attente.");

    return prisma.friendRequest.update({ where: { id: requestId }, data: { status: 'REJECTED' } });
  }

  // Cancel a sent friend request
  static async cancelRequest(requestId: string, currentUserId: string) {
    const req = await prisma.friendRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new Error('Demande introuvable.');
    if (req.senderId !== currentUserId) throw new Error('Non autorisé.');
    if (req.status !== 'PENDING') throw new Error("Cette demande n'est plus en attente.");

    return prisma.friendRequest.update({ where: { id: requestId }, data: { status: 'CANCELLED' } });
  }

  // Unfriend
  static async removeFriend(userId: string, friendId: string) {
    await prisma.$transaction([
      prisma.friendship.deleteMany({ where: { userId, friendId } }),
      prisma.friendship.deleteMany({ where: { userId: friendId, friendId: userId } }),
    ]);
  }

  // Get pending received requests
  static async getPendingReceived(userId: string) {
    return prisma.friendRequest.findMany({
      where: { receiverId: userId, status: 'PENDING' },
      include: { sender: { select: { id: true, displayName: true, username: true, avatarUrl: true, country: true, status: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Get sent pending requests
  static async getSentRequests(userId: string) {
    return prisma.friendRequest.findMany({
      where: { senderId: userId, status: 'PENDING' },
      include: { receiver: { select: { id: true, displayName: true, username: true, avatarUrl: true, country: true, status: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Get friends list (accepted friendships)
  static async getFriends(userId: string) {
    const friendships = await prisma.friendship.findMany({
      where: { userId },
      include: {
        friend: {
          select: { id: true, displayName: true, username: true, avatarUrl: true, country: true, status: true },
        }
      }
    });
    return friendships.map(f => ({
      id: f.friend.id,
      username: f.friend.username,
      name: f.friend.displayName || f.friend.username,
      avatar: f.friend.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(f.friend.username)}`,
      country: f.friend.country || 'FR',
      status: f.friend.status.toLowerCase(),
    }));
  }

  // Check if two users are friends
  static async areFriends(userAId: string, userBId: string): Promise<boolean> {
    const f = await prisma.friendship.findUnique({
      where: { userId_friendId: { userId: userAId, friendId: userBId } }
    });
    return Boolean(f);
  }

  // Get friendship status between current user and another user: 'none' | 'friends' | 'request_sent' | 'request_received'
  static async getFriendshipStatus(currentUserId: string, targetUserId: string) {
    const friendship = await prisma.friendship.findUnique({
      where: { userId_friendId: { userId: currentUserId, friendId: targetUserId } }
    });
    if (friendship) return { status: 'friends', requestId: null };

    const sentReq = await prisma.friendRequest.findFirst({
      where: { senderId: currentUserId, receiverId: targetUserId, status: 'PENDING' }
    });
    if (sentReq) return { status: 'request_sent', requestId: sentReq.id };

    const receivedReq = await prisma.friendRequest.findFirst({
      where: { senderId: targetUserId, receiverId: currentUserId, status: 'PENDING' }
    });
    if (receivedReq) return { status: 'request_received', requestId: receivedReq.id };

    return { status: 'none', requestId: null };
  }

  // Get discover users with friendship status for each
  static async discoverUsers(currentUserId: string, search?: string) {
    const users = await prisma.user.findMany({
      where: {
        id: { not: currentUserId },
        ...(search ? {
          OR: [
            { username: { contains: search } },
            { displayName: { contains: search } },
          ]
        } : {}),
      },
      select: { id: true, username: true, displayName: true, avatarUrl: true, country: true, status: true, role: true },
      take: 60,
      orderBy: { createdAt: 'desc' },
    });

    // Get all friendships for current user
    const friendships = await prisma.friendship.findMany({ where: { userId: currentUserId }, select: { friendId: true } });
    const friendIds = new Set(friendships.map(f => f.friendId));

    // Get all pending requests
    const sentRequests = await prisma.friendRequest.findMany({
      where: { senderId: currentUserId, status: 'PENDING' },
      select: { receiverId: true, id: true }
    });
    const sentMap = new Map(sentRequests.map(r => [r.receiverId, r.id]));

    const receivedRequests = await prisma.friendRequest.findMany({
      where: { receiverId: currentUserId, status: 'PENDING' },
      select: { senderId: true, id: true }
    });
    const receivedMap = new Map(receivedRequests.map(r => [r.senderId, r.id]));

    return users.map(u => {
      let friendStatus = 'none';
      let requestId: string | null = null;
      if (friendIds.has(u.id)) { friendStatus = 'friends'; }
      else if (sentMap.has(u.id)) { friendStatus = 'request_sent'; requestId = sentMap.get(u.id)!; }
      else if (receivedMap.has(u.id)) { friendStatus = 'request_received'; requestId = receivedMap.get(u.id)!; }

      return {
        id: u.id,
        username: u.username,
        name: u.displayName || u.username,
        avatar: u.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(u.username)}`,
        country: u.country || 'FR',
        status: u.status.toLowerCase(),
        role: u.role === 'ADMIN' ? 'Admin WafaTalk' : u.role === 'MODERATOR' ? 'Modérateur' : 'Membre',
        friendStatus,
        requestId,
      };
    });
  }
}
