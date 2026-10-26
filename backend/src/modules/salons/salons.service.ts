import bcrypt from 'bcryptjs';
import { prisma } from '../../database/prisma.js';
import { CreateSalonInput, SalonFilterInput } from './salons.schema.js';

export class SalonsService {
  static async list(filter: SalonFilterInput) {
    const where: any = {};

    if (filter.category && filter.category !== 'all') {
      where.category = filter.category;
    }

    if (filter.search) {
      where.OR = [
        { name: { contains: filter.search } },
        { description: { contains: filter.search } },
      ];
    }

    const skip = (filter.page - 1) * filter.limit;

    const [salons, total] = await Promise.all([
      prisma.salon.findMany({
        where,
        skip,
        take: filter.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          owner: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  displayName: true,
                  avatarUrl: true,
                  status: true,
                },
              },
            },
          },
          _count: {
            select: {
              members: true,
              messages: true,
            },
          },
        },
      }),
      prisma.salon.count({ where }),
    ]);

    const formatted = salons.map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      topic: s.description || '',
      category: s.category,
      bannerBg: s.bannerUrl || 'linear-gradient(135deg, #0d837d, #14a39b)',
      isPrivate: s.isPrivate,
      isLive: true,
      hasVoice: true,
      participantsCount: s._count.members,
      avatars: s.members.map((m) => m.user.avatarUrl).filter(Boolean),
      owner: s.owner,
      createdAt: s.createdAt,
    }));

    return {
      salons: formatted,
      pagination: {
        page: filter.page,
        limit: filter.limit,
        total,
        totalPages: Math.ceil(total / filter.limit),
      },
    };
  }

  static async getByIdOrSlug(idOrSlug: string, currentUserId?: string) {
    const salon = await prisma.salon.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
      include: {
        owner: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
                status: true,
                wafaPoints: true,
              },
            },
          },
        },
        messages: {
          take: 50,
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
        },
      },
    });

    if (!salon) throw new Error('Salon introuvable.');

    const isOwner = currentUserId && salon.ownerId === currentUserId;

    return {
      id: salon.id,
      name: salon.name,
      slug: salon.slug,
      description: salon.description,
      category: salon.category,
      bannerUrl: salon.bannerUrl,
      isPrivate: salon.isPrivate,
      accessCode: isOwner ? salon.accessCode : undefined,
      inviteToken: salon.inviteToken,
      ownerId: salon.ownerId,
      owner: salon.owner,
      members: salon.members,
      messages: salon.messages,
      participantsCount: salon.members.length,
      avatars: salon.members.map((m) => m.user.avatarUrl).filter(Boolean),
      createdAt: salon.createdAt,
    };
  }

  static async create(userId: string, input: CreateSalonInput) {
    const baseSlug = input.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const slug = `${baseSlug || 'salon'}-${Date.now().toString().slice(-4)}`;

    // Generate unique invite token
    const inviteToken = `inv_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;

    // Generate or use access code if private
    let accessCode: string | null = null;
    let passwordHash: string | null = null;

    if (input.isPrivate) {
      accessCode = (input.accessCode || input.password || Math.floor(1000 + Math.random() * 9000).toString()).trim();
      passwordHash = await bcrypt.hash(accessCode, 10);
    }

    const salon = await prisma.salon.create({
      data: {
        name: input.name,
        slug,
        description: input.description || input.topic,
        category: input.category,
        bannerUrl: input.bannerUrl || 'linear-gradient(135deg, #0d837d, #14a39b)',
        isPrivate: input.isPrivate,
        accessCode,
        inviteToken,
        passwordHash,
        maxMembers: input.maxMembers,
        ownerId: userId,
        members: {
          create: {
            userId,
            role: 'OWNER',
          },
        },
      },
      include: {
        owner: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
      },
    });

    return {
      ...salon,
      accessCode, // return plaintext access code to creator
      inviteToken,
    };
  }

  static async checkAccess(salonId: string, userId?: string, ipAddress?: string, accessCode?: string, inviteToken?: string) {
    const salon = await prisma.salon.findUnique({
      where: { id: salonId },
    });
    if (!salon) throw new Error('Salon introuvable.');

    // 1. Check if user or IP is banned
    if (userId || ipAddress) {
      const banConditions: any[] = [];
      if (userId) banConditions.push({ userId });
      if (ipAddress) banConditions.push({ ipAddress });

      const ban = await prisma.salonBan.findFirst({
        where: {
          salonId,
          OR: banConditions,
        },
      });

      if (ban) {
        if (ban.banType === 'IP') {
          throw new Error('BAN_IP: Accès refusé : votre adresse IP est bannie de ce salon.');
        }
        throw new Error('BAN_USER: Accès refusé : vous avez été banni de ce salon.');
      }
    }

    // 2. If Public, access is granted
    if (!salon.isPrivate) {
      return { allowed: true, salon };
    }

    // 3. If Private:
    // Creator is always allowed
    if (userId && salon.ownerId === userId) {
      return { allowed: true, salon, isOwner: true };
    }

    // Direct Invite Token match
    if (inviteToken && salon.inviteToken && inviteToken.trim() === salon.inviteToken.trim()) {
      return { allowed: true, salon };
    }

    // Access Code verification: Must match plain accessCode or passwordHash
    if (accessCode) {
      const cleanInput = accessCode.trim().toLowerCase();
      const isPlainMatch = Boolean(salon.accessCode && salon.accessCode.trim().toLowerCase() === cleanInput);
      let isHashMatch = false;
      if (!isPlainMatch && salon.passwordHash) {
        isHashMatch = await bcrypt.compare(accessCode.trim(), salon.passwordHash).catch(() => false);
      }
      if (isPlainMatch || isHashMatch) {
        return { allowed: true, salon };
      }
      // Provided code does NOT match -> Reject immediately
      throw new Error('INVALID_CODE: Code d\'accès incorrect pour ce salon privé.');
    }

    throw new Error('PRIVATE_CODE_REQUIRED: Code d\'accès ou invitation requis pour ce salon privé.');
  }

  static async join(salonId: string, userId: string, ipAddress?: string, accessCode?: string, inviteToken?: string) {
    const { salon } = await this.checkAccess(salonId, userId, ipAddress, accessCode, inviteToken);

    const member = await prisma.salonMember.upsert({
      where: {
        salonId_userId: { salonId, userId },
      },
      update: {},
      create: {
        salonId,
        userId,
        role: salon.ownerId === userId ? 'OWNER' : 'LISTENER',
      },
      include: {
        user: {
          select: { id: true, username: true, displayName: true, avatarUrl: true, status: true },
        },
      },
    });

    return {
      member,
      salon: {
        id: salon.id,
        name: salon.name,
        slug: salon.slug,
        isPrivate: salon.isPrivate,
        ownerId: salon.ownerId,
        accessCode: salon.ownerId === userId ? salon.accessCode : undefined,
        inviteToken: salon.inviteToken,
      },
    };
  }

  static async leave(salonId: string, userId: string) {
    await prisma.salonMember.deleteMany({
      where: { salonId, userId },
    });
    return { success: true };
  }

  // Admin Actions: Mute / Cut Camera / Ban User / Ban IP / Promote Admin / Revoke Admin
  static async executeAdminAction(
    salonId: string,
    adminUserId: string,
    targetUserId: string,
    action: 'mute' | 'unmute' | 'cut_camera' | 'ban_user' | 'ban_ip' | 'promote_admin' | 'revoke_admin',
    reason?: string,
    targetIp?: string
  ) {
    const salon = await prisma.salon.findUnique({
      where: { id: salonId },
      include: { owner: true },
    });

    if (!salon) throw new Error('Salon introuvable.');

    // Check requester permissions
    const requesterMember = await prisma.salonMember.findUnique({
      where: { salonId_userId: { salonId, userId: adminUserId } },
    });
    const requesterUser = await prisma.user.findUnique({
      where: { id: adminUserId },
      select: { role: true },
    });

    const isOwner = salon.ownerId === adminUserId || requesterMember?.role === 'OWNER';
    const isSuperAdmin = requesterUser?.role === 'SUPERADMIN' || requesterUser?.role === 'ADMIN';
    const isSalonAdmin = requesterMember?.role === 'ADMIN';

    if (!isOwner && !isSuperAdmin && !isSalonAdmin) {
      throw new Error('Action refusée : Seuls le propriétaire et les administrateurs ont les droits de gestion.');
    }

    if (adminUserId === targetUserId) {
      throw new Error('Impossible d\'appliquer cette action sur vous-même.');
    }

    // Role promotion / demotion can ONLY be done by the Salon Owner or SuperAdmin
    if (action === 'promote_admin' || action === 'revoke_admin') {
      if (!isOwner && !isSuperAdmin) {
        throw new Error('Action refusée : Seul le propriétaire du salon peut nommer ou révoquer un administrateur.');
      }
    }

    // A Salon Admin cannot moderate the Owner or another Admin
    if (!isOwner && !isSuperAdmin && isSalonAdmin) {
      const targetMember = await prisma.salonMember.findUnique({
        where: { salonId_userId: { salonId, userId: targetUserId } },
      });
      if (targetUserId === salon.ownerId || targetMember?.role === 'ADMIN' || targetMember?.role === 'OWNER') {
        throw new Error('Action refusée : Un administrateur ne peut pas modérer le propriétaire ou un autre administrateur.');
      }
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, username: true, displayName: true },
    });

    if (!targetUser) throw new Error('Utilisateur cible introuvable.');

    if (action === 'promote_admin') {
      await prisma.salonMember.upsert({
        where: { salonId_userId: { salonId, userId: targetUserId } },
        update: { role: 'ADMIN' },
        create: { salonId, userId: targetUserId, role: 'ADMIN' },
      });
      return { success: true, action: 'promote_admin', targetUser, newRole: 'ADMIN' };
    }

    if (action === 'revoke_admin') {
      await prisma.salonMember.updateMany({
        where: { salonId, userId: targetUserId },
        data: { role: 'LISTENER' },
      });
      return { success: true, action: 'revoke_admin', targetUser, newRole: 'LISTENER' };
    }

    if (action === 'mute' || action === 'unmute') {
      await prisma.salonMember.updateMany({
        where: { salonId, userId: targetUserId },
        data: { isMuted: action === 'mute' },
      });
      return { success: true, action, targetUser };
    }

    if (action === 'cut_camera') {
      return { success: true, action: 'cut_camera', targetUser };
    }

    if (action === 'ban_user') {
      // Record permanent ban by username & userId
      await prisma.salonBan.create({
        data: {
          salonId,
          userId: targetUserId,
          username: targetUser.username,
          banType: 'USER',
          reason: reason || 'Banni par l\'administrateur du salon',
          bannedBy: adminUserId,
        },
      });

      // Remove from members
      await prisma.salonMember.deleteMany({
        where: { salonId, userId: targetUserId },
      });

      return { success: true, action: 'ban_user', targetUser };
    }

    if (action === 'ban_ip') {
      // Record permanent ban by IP address
      await prisma.salonBan.create({
        data: {
          salonId,
          userId: targetUserId,
          username: targetUser.username,
          ipAddress: targetIp || '127.0.0.1',
          banType: 'IP',
          reason: reason || 'Adresse IP bannie par l\'administrateur du salon',
          bannedBy: adminUserId,
        },
      });

      // Remove from members
      await prisma.salonMember.deleteMany({
        where: { salonId, userId: targetUserId },
      });

      return { success: true, action: 'ban_ip', targetUser, targetIp };
    }

    throw new Error('Action non reconnue.');
  }

  static async getBans(salonId: string, adminUserId: string) {
    const salon = await prisma.salon.findUnique({ where: { id: salonId } });
    if (!salon) throw new Error('Salon introuvable.');

    const requesterMember = await prisma.salonMember.findUnique({
      where: { salonId_userId: { salonId, userId: adminUserId } },
    });
    const requesterUser = await prisma.user.findUnique({
      where: { id: adminUserId },
      select: { role: true },
    });

    const isOwner = salon.ownerId === adminUserId || requesterMember?.role === 'OWNER';
    const isSuperAdmin = requesterUser?.role === 'SUPERADMIN' || requesterUser?.role === 'ADMIN';
    const isSalonAdmin = requesterMember?.role === 'ADMIN';

    if (!isOwner && !isSuperAdmin && !isSalonAdmin) {
      throw new Error('Action refusée : Seuls le propriétaire et les administrateurs ont les droits de gestion.');
    }

    return prisma.salonBan.findMany({
      where: { salonId },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async unban(salonId: string, adminUserId: string, banId: string) {
    const salon = await prisma.salon.findUnique({ where: { id: salonId } });
    if (!salon) throw new Error('Salon introuvable.');

    const requesterMember = await prisma.salonMember.findUnique({
      where: { salonId_userId: { salonId, userId: adminUserId } },
    });
    const requesterUser = await prisma.user.findUnique({
      where: { id: adminUserId },
      select: { role: true },
    });

    const isOwner = salon.ownerId === adminUserId || requesterMember?.role === 'OWNER';
    const isSuperAdmin = requesterUser?.role === 'SUPERADMIN' || requesterUser?.role === 'ADMIN';
    const isSalonAdmin = requesterMember?.role === 'ADMIN';

    if (!isOwner && !isSuperAdmin && !isSalonAdmin) {
      throw new Error('Action refusée : Seuls le propriétaire et les administrateurs ont les droits de gestion.');
    }

    const ban = await prisma.salonBan.findUnique({
      where: { id: banId },
    });
    if (!ban || ban.salonId !== salonId) {
      throw new Error('Bannissement introuvable dans ce salon.');
    }

    await prisma.salonBan.delete({
      where: { id: banId },
    });

    return { success: true, message: 'Bannissement levé avec succès.', unbanned: ban };
  }
}
