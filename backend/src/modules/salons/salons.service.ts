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

  static async getByIdOrSlug(idOrSlug: string) {
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

    return {
      ...salon,
      participantsCount: salon.members.length,
      avatars: salon.members.map((m) => m.user.avatarUrl).filter(Boolean),
    };
  }

  static async create(userId: string, input: CreateSalonInput) {
    const baseSlug = input.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const slug = `${baseSlug}-${Date.now().toString().slice(-4)}`;

    let passwordHash: string | undefined;
    if (input.isPrivate && input.password) {
      passwordHash = await bcrypt.hash(input.password, 10);
    }

    const salon = await prisma.salon.create({
      data: {
        name: input.name,
        slug,
        description: input.description || input.topic,
        category: input.category,
        bannerUrl: input.bannerUrl || 'linear-gradient(135deg, #0d837d, #14a39b)',
        isPrivate: input.isPrivate,
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

    return salon;
  }

  static async join(salonId: string, userId: string, role: string = 'LISTENER') {
    const salon = await prisma.salon.findUnique({ where: { id: salonId } });
    if (!salon) throw new Error('Salon introuvable.');

    const member = await prisma.salonMember.upsert({
      where: {
        salonId_userId: { salonId, userId },
      },
      update: {},
      create: {
        salonId,
        userId,
        role: salon.ownerId === userId ? 'OWNER' : role,
      },
      include: {
        user: {
          select: { id: true, username: true, displayName: true, avatarUrl: true, status: true },
        },
      },
    });

    return member;
  }

  static async leave(salonId: string, userId: string) {
    await prisma.salonMember.deleteMany({
      where: { salonId, userId },
    });
    return { success: true };
  }
}
