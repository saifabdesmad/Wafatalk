import { prisma } from '../../database/prisma.js';
import { resolveAvatarUrl } from '../../utils/avatar.js';

export class FriendsService {
  // Send a friend request (check not already friends, not already pending, not self)
  static async sendRequest(senderId: string, receiverId: string) {
    if (senderId === receiverId) throw new Error("Vous ne pouvez pas vous envoyer un clin d'œil à vous-même.");

    // Check both users exist
    const receiver = await prisma.user.findUnique({ where: { id: receiverId }, select: { id: true, displayName: true, username: true, avatarUrl: true } });
    if (!receiver) throw new Error('Utilisateur introuvable.');

    // Check if blocked in either direction
    const blocked = await prisma.blockedUser.findFirst({
      where: {
        OR: [
          { blockerId: senderId, blockedId: receiverId },
          { blockerId: receiverId, blockedId: senderId },
        ],
      },
    });
    if (blocked) {
      if (blocked.blockerId === senderId) {
        throw new Error('Vous avez bloqué cet utilisateur. Débloquez-le pour interagir.');
      }
      throw new Error("Impossible d'envoyer un clin d'œil à cet utilisateur.");
    }

    // Check if already friends
    const existing = await prisma.friendship.findUnique({ where: { userId_friendId: { userId: senderId, friendId: receiverId } } });
    if (existing) throw new Error('Vous êtes déjà amis avec cet utilisateur.');

    // 1. Check if the receiver already sent a PENDING request to sender (reciprocal wink!)
    const reverseReq = await prisma.friendRequest.findFirst({
      where: { senderId: receiverId, receiverId: senderId, status: 'PENDING' }
    });
    if (reverseReq) {
      // Reciprocal wink -> immediately accept and connect!
      const acceptedReq = await this.acceptRequest(reverseReq.id, senderId);
      return acceptedReq;
    }

    // 2. Check if a request already exists from sender to receiver
    const directReq = await prisma.friendRequest.findFirst({
      where: { senderId, receiverId }
    });

    if (directReq) {
      if (directReq.status === 'PENDING') {
        throw new Error("Un clin d'œil est déjà en attente pour cet utilisateur.");
      }

      // Re-activate previously cancelled, rejected or stale request
      const updated = await prisma.friendRequest.update({
        where: { id: directReq.id },
        data: {
          status: 'PENDING',
          updatedAt: new Date(),
        },
        include: {
          receiver: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
          sender: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
        }
      });
      return updated;
    }

    // 3. Create fresh request with safe unique-constraint fallback
    try {
      const request = await prisma.friendRequest.create({
        data: { senderId, receiverId, status: 'PENDING' },
        include: {
          receiver: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
          sender: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
        }
      });
      return request;
    } catch (err: any) {
      if (err.code === 'P2002' || err.message?.includes('Unique constraint')) {
        // Direct unique constraint fallback: update existing record to PENDING
        return await prisma.friendRequest.update({
          where: { senderId_receiverId: { senderId, receiverId } },
          data: { status: 'PENDING', updatedAt: new Date() },
          include: {
            receiver: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
            sender: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
          }
        });
      }
      throw err;
    }
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

  // Unfriend (removes bidirectional friendship and resets any stale friend requests)
  static async removeFriend(userId: string, friendId: string) {
    await prisma.$transaction([
      prisma.friendship.deleteMany({ where: { userId, friendId } }),
      prisma.friendship.deleteMany({ where: { userId: friendId, friendId: userId } }),
      prisma.friendRequest.deleteMany({
        where: {
          OR: [
            { senderId: userId, receiverId: friendId },
            { senderId: friendId, receiverId: userId },
          ],
        },
      }),
    ]);
  }

  // Toggle favorite status for a friend
  static async toggleFavorite(userId: string, friendId: string) {
    const existing = await prisma.friendship.findUnique({
      where: { userId_friendId: { userId, friendId } },
    });
    if (!existing) throw new Error('Cet utilisateur ne fait pas partie de votre liste d\'amis.');

    const updated = await prisma.friendship.update({
      where: { userId_friendId: { userId, friendId } },
      data: { isFavorite: !existing.isFavorite },
    });
    return { isFavorite: updated.isFavorite };
  }

  // Toggle call block status for a friend
  static async toggleCallBlock(userId: string, friendId: string) {
    const existing = await prisma.friendship.findUnique({
      where: { userId_friendId: { userId, friendId } },
    });
    if (!existing) throw new Error('Cet utilisateur ne fait pas partie de votre liste d\'amis.');

    const updated = await prisma.friendship.update({
      where: { userId_friendId: { userId, friendId } },
      data: { callsBlocked: !existing.callsBlocked },
    });
    return { callsBlocked: updated.callsBlocked };
  }

  // Block a user completely (removes friendship + requests + prevents all contact)
  static async blockUser(blockerId: string, targetUserId: string) {
    if (blockerId === targetUserId) throw new Error('Vous ne pouvez pas vous bloquer vous-même.');
    const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
    if (!target) throw new Error('Utilisateur introuvable.');

    await prisma.$transaction([
      prisma.blockedUser.upsert({
        where: { blockerId_blockedId: { blockerId, blockedId: targetUserId } },
        create: { blockerId, blockedId: targetUserId },
        update: {},
      }),
      prisma.friendship.deleteMany({
        where: {
          OR: [
            { userId: blockerId, friendId: targetUserId },
            { userId: targetUserId, friendId: blockerId },
          ],
        },
      }),
      prisma.friendRequest.deleteMany({
        where: {
          OR: [
            { senderId: blockerId, receiverId: targetUserId },
            { senderId: targetUserId, receiverId: blockerId },
          ],
        },
      }),
    ]);
  }

  // Unblock a previously blocked user
  static async unblockUser(blockerId: string, targetUserId: string) {
    await prisma.blockedUser.deleteMany({
      where: { blockerId, blockedId: targetUserId },
    });
  }

  // Get list of users blocked by current user
  static async getBlockedUsers(userId: string) {
    const rows = await prisma.blockedUser.findMany({
      where: { blockerId: userId },
      include: {
        blocked: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            country: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.blocked.id,
      username: r.blocked.username,
      name: r.blocked.displayName || r.blocked.username,
      avatar: resolveAvatarUrl(r.blocked.avatarUrl, r.blocked.displayName || r.blocked.username),
      country: r.blocked.country || 'FR',
      blockedAt: r.createdAt,
    }));
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

  // Get friends list (accepted friendships, favorites first, excluding blocked users)
  static async getFriends(userId: string) {
    const [friendships, blocks] = await Promise.all([
      prisma.friendship.findMany({
        where: { userId, status: 'ACCEPTED' },
        orderBy: [{ isFavorite: 'desc' }, { updatedAt: 'desc' }],
        include: {
          friend: {
            select: {
              id: true,
              displayName: true,
              username: true,
              avatarUrl: true,
              country: true,
              status: true,
              bio: true,
              socialStatus: true,
              interests: true,
              role: true,
              wafaPoints: true,
              createdAt: true,
              birthDate: true,
            },
          }
        }
      }),
      prisma.blockedUser.findMany({
        where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
        select: { blockerId: true, blockedId: true },
      }),
    ]);

    const blockedIds = new Set<string>();
    blocks.forEach(b => {
      if (b.blockerId === userId) blockedIds.add(b.blockedId);
      if (b.blockedId === userId) blockedIds.add(b.blockerId);
    });

    return friendships
      .filter(f => !blockedIds.has(f.friend.id))
      .map(f => ({
        id: f.friend.id,
        username: f.friend.username,
        name: f.friend.displayName || f.friend.username,
        avatar: resolveAvatarUrl(f.friend.avatarUrl, f.friend.displayName || f.friend.username),
        country: f.friend.country || 'FR',
        status: f.friend.status.toLowerCase(),
        bio: f.friend.bio || "Membre actif de WafaTalk ✨",
        socialStatus: f.friend.socialStatus || "Célibataire",
        interests: f.friend.interests ? f.friend.interests.split(',').map(s => s.trim()) : ['Discussion', 'Chill', 'Musique'],
        role: f.friend.role === 'SUPERADMIN' ? 'SuperAdmin' : f.friend.role === 'ADMIN' ? 'Admin WafaTalk' : f.friend.role === 'MODERATOR' ? 'Modérateur' : 'Membre',
        wafaPoints: f.friend.wafaPoints,
        createdAt: f.friend.createdAt,
        birthDate: f.friend.birthDate,
        friendStatus: 'friends',
        isFavorite: Boolean(f.isFavorite),
        callsBlocked: Boolean(f.callsBlocked),
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

  // Get discover users with friendship status for each (excluding blocked relationships)
  static async discoverUsers(currentUserId: string, search?: string) {
    const blocks = await prisma.blockedUser.findMany({
      where: { OR: [{ blockerId: currentUserId }, { blockedId: currentUserId }] },
      select: { blockerId: true, blockedId: true },
    });
    const blockedIds = new Set<string>([currentUserId]);
    blocks.forEach(b => {
      blockedIds.add(b.blockerId);
      blockedIds.add(b.blockedId);
    });
    // Ensure currentUserId is excluded, and keep only blocks not involving self ID check mistake
    const excludedIds = Array.from(blockedIds);

    const users = await prisma.user.findMany({
      where: {
        id: { notIn: excludedIds },
        ...(search ? {
          OR: [
            { username: { contains: search } },
            { displayName: { contains: search } },
          ]
        } : {}),
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        country: true,
        status: true,
        role: true,
        bio: true,
        socialStatus: true,
        interests: true,
        wafaPoints: true,
        createdAt: true,
        birthDate: true,
      },
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
        avatar: resolveAvatarUrl(u.avatarUrl, u.displayName || u.username),
        country: u.country || 'FR',
        status: u.status.toLowerCase(),
        role: u.role === 'ADMIN' ? 'Admin WafaTalk' : u.role === 'MODERATOR' ? 'Modérateur' : 'Membre',
        bio: u.bio || "Membre actif de WafaTalk ✨",
        socialStatus: u.socialStatus || "Célibataire",
        interests: u.interests ? u.interests.split(',').map(s => s.trim()) : ['Discussion', 'Chill', 'Musique'],
        wafaPoints: u.wafaPoints,
        createdAt: u.createdAt,
        birthDate: u.birthDate,
        friendStatus,
        requestId,
      };
    });
  }

  // Get complete rich profile description for any user
  static async getUserProfile(currentUserId: string, targetUserId: string) {
    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        country: true,
        status: true,
        role: true,
        bio: true,
        socialStatus: true,
        interests: true,
        wafaPoints: true,
        createdAt: true,
        birthDate: true,
        receivedGifts: {
          select: { id: true, giftType: true, createdAt: true },
          take: 10,
        },
        memberships: {
          where: { isMuted: false },
          take: 1,
          orderBy: { joinedAt: 'desc' },
          include: {
            salon: { select: { id: true, name: true, slug: true } }
          }
        }
      }
    });

    if (!user) throw new Error('Utilisateur introuvable.');

    const [{ status: friendStatus, requestId }, friendshipRow, blockByMe, blockByTarget] = await Promise.all([
      this.getFriendshipStatus(currentUserId, targetUserId),
      prisma.friendship.findUnique({ where: { userId_friendId: { userId: currentUserId, friendId: targetUserId } } }),
      prisma.blockedUser.findUnique({ where: { blockerId_blockedId: { blockerId: currentUserId, blockedId: targetUserId } } }),
      prisma.blockedUser.findUnique({ where: { blockerId_blockedId: { blockerId: targetUserId, blockedId: currentUserId } } }),
    ]);

    return {
      id: user.id,
      username: user.username,
      name: user.displayName || user.username,
      avatar: resolveAvatarUrl(user.avatarUrl, user.displayName || user.username),
      country: user.country || 'FR',
      status: user.status.toLowerCase(),
      role: user.role === 'SUPERADMIN' ? 'SuperAdmin' : user.role === 'ADMIN' ? 'Admin WafaTalk' : user.role === 'MODERATOR' ? 'Modérateur' : 'Membre',
      bio: user.bio || "Partage sa bonne humeur et discute dans les salons vocaux et textuels de WafaTalk ✨",
      socialStatus: user.socialStatus || "Célibataire",
      interests: user.interests ? user.interests.split(',').map(s => s.trim()) : ['Discussion', 'Chill', 'Musique', 'Rencontres'],
      wafaPoints: user.wafaPoints,
      giftsCount: user.receivedGifts.length,
      createdAt: user.createdAt,
      birthDate: user.birthDate,
      friendStatus,
      requestId,
      isFavorite: Boolean(friendshipRow?.isFavorite),
      callsBlocked: Boolean(friendshipRow?.callsBlocked),
      isBlockedByMe: Boolean(blockByMe),
      hasBlockedMe: Boolean(blockByTarget),
      currentSalon: user.memberships[0]?.salon || null,
    };
  }
}
