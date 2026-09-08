import bcrypt from 'bcryptjs';
import { prisma } from './prisma.js';

async function main() {
  console.log('🌱 Starting WafaTalk database seed...');

  const passwordHash = await bcrypt.hash('demo123456', 10);

  // 1. Create Main Users
  const userAlex = await prisma.user.upsert({
    where: { username: 'alexandre' },
    update: {},
    create: {
      id: 'user-alexandre',
      username: 'alexandre',
      email: 'alexandre@wafatalk.com',
      displayName: 'Alexandre',
      passwordHash,
      avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80',
      bio: 'Créateur & hôte de salons sur WafaTalk ✨',
      wafaPoints: 450,
      status: 'ONLINE',
      role: 'ADMIN',
    },
  });

  const userSarah = await prisma.user.upsert({
    where: { username: 'sarah_b' },
    update: {},
    create: {
      id: 'user-sarah',
      username: 'sarah_b',
      email: 'sarah@wafatalk.com',
      displayName: 'Sarah B.',
      passwordHash,
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&auto=format&fit=crop&q=80',
      bio: 'Modératrice & mélomane 🎧',
      wafaPoints: 320,
      status: 'IN_SALON',
      role: 'MODERATOR',
    },
  });

  const userYoussef = await prisma.user.upsert({
    where: { username: 'youssef_k' },
    update: {},
    create: {
      id: 'user-youssef',
      username: 'youssef_k',
      email: 'youssef@wafatalk.com',
      displayName: 'Youssef K.',
      passwordHash,
      avatarUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=80&auto=format&fit=crop&q=80',
      bio: 'Gamer et amateur de thé à la menthe 🍵',
      wafaPoints: 210,
      status: 'ONLINE',
    },
  });

  const userLina = await prisma.user.upsert({
    where: { username: 'lina_m' },
    update: {},
    create: {
      id: 'user-lina',
      username: 'lina_m',
      email: 'lina@wafatalk.com',
      displayName: 'Lina M.',
      passwordHash,
      avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&auto=format&fit=crop&q=80',
      bio: 'En jam acoustique permanente 🎸',
      wafaPoints: 540,
      status: 'IN_SALON',
    },
  });

  const userKarim = await prisma.user.upsert({
    where: { username: 'karim_d' },
    update: {},
    create: {
      id: 'user-karim',
      username: 'karim_d',
      email: 'karim@wafatalk.com',
      displayName: 'Karim D.',
      passwordHash,
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&auto=format&fit=crop&q=80',
      bio: 'Codeur nocturne & dev IA',
      wafaPoints: 180,
      status: 'IDLE',
    },
  });

  // 2. Create Friendships
  const friends = [userSarah.id, userYoussef.id, userLina.id, userKarim.id];
  for (const friendId of friends) {
    await prisma.friendship.upsert({
      where: {
        userId_friendId: {
          userId: userAlex.id,
          friendId,
        },
      },
      update: { status: 'ACCEPTED' },
      create: {
        userId: userAlex.id,
        friendId,
        status: 'ACCEPTED',
      },
    });
  }

  // 3. Create Salons
  const salons = [
    {
      id: 'salon-1',
      name: 'Chill & Discussion du Soir ☕',
      slug: 'chill-discussion-du-soir',
      description: 'On refait le monde dans la bienveillance. Ambiance tamisée & thé à la menthe.',
      category: 'chill',
      bannerUrl: 'linear-gradient(135deg, #0d837d, #14a39b)',
      isPrivate: false,
      ownerId: userAlex.id,
    },
    {
      id: 'salon-2',
      name: 'Gaming Squads & Tournois 🎮',
      slug: 'gaming-squads-tournois',
      description: 'Valorant, EA FC & Rocket League. Venez trouver vos coéquipiers pour monter en rang !',
      category: 'gaming',
      bannerUrl: 'linear-gradient(135deg, #f25b3e, #ff7a59)',
      isPrivate: false,
      ownerId: userYoussef.id,
    },
    {
      id: 'salon-3',
      name: 'Vocal Musique & Jam Session 🎵',
      slug: 'vocal-musique-jam-session',
      description: 'Écoute d\'albums, partage de playlists lo-fi et impro guitare en direct.',
      category: 'music',
      bannerUrl: 'linear-gradient(135deg, #f8b84e, #ea580c)',
      isPrivate: false,
      ownerId: userLina.id,
    },
    {
      id: 'salon-4',
      name: 'Débats Tech & IA Antigravity 🤖',
      slug: 'debats-tech-ia-antigravity',
      description: 'Tendances du web, agents autonomes et projets de création numérique.',
      category: 'vocal',
      bannerUrl: 'linear-gradient(135deg, #094a46, #0d837d)',
      isPrivate: false,
      ownerId: userKarim.id,
    },
    {
      id: 'salon-5',
      name: 'Le Cercle Privé des VIP 🔒',
      slug: 'le-cercle-prive-des-vip',
      description: 'Salon exclusif pour organiser les sorties du week-end et échanger en toute discrétion.',
      category: 'private',
      bannerUrl: 'linear-gradient(135deg, #1f2937, #374151)',
      isPrivate: true,
      ownerId: userAlex.id,
    },
    {
      id: 'salon-6',
      name: 'Pause Café & Rires 😂',
      slug: 'pause-cafe-et-rires',
      description: 'Anecdotes légères, mèmes et bonne humeur garantie avant le weekend !',
      category: 'chill',
      bannerUrl: 'linear-gradient(135deg, #10b981, #0d837d)',
      isPrivate: false,
      ownerId: userSarah.id,
    },
  ];

  for (const s of salons) {
    const createdSalon = await prisma.salon.upsert({
      where: { slug: s.slug },
      update: {},
      create: s,
    });

    // Add members to each salon
    await prisma.salonMember.upsert({
      where: {
        salonId_userId: {
          salonId: createdSalon.id,
          userId: s.ownerId,
        },
      },
      update: {},
      create: {
        salonId: createdSalon.id,
        userId: s.ownerId,
        role: 'OWNER',
      },
    });

    await prisma.salonMember.upsert({
      where: {
        salonId_userId: {
          salonId: createdSalon.id,
          userId: userAlex.id,
        },
      },
      update: {},
      create: {
        salonId: createdSalon.id,
        userId: userAlex.id,
        role: s.ownerId === userAlex.id ? 'OWNER' : 'SPEAKER',
      },
    });
  }

  // 4. Seed Initial Messages in Salon 1
  const salon1 = await prisma.salon.findUnique({ where: { slug: 'chill-discussion-du-soir' } });
  if (salon1) {
    const count = await prisma.message.count({ where: { salonId: salon1.id } });
    if (count === 0) {
      await prisma.message.createMany({
        data: [
          {
            salonId: salon1.id,
            userId: userSarah.id,
            content: 'Bienvenue à tous dans le salon chill ! Prenez une tasse de thé 🍵',
            type: 'TEXT',
          },
          {
            salonId: salon1.id,
            userId: userYoussef.id,
            content: 'Superbe ambiance ce soir. Qui est chaud pour écouter un peu de jazz après ?',
            type: 'TEXT',
          },
          {
            salonId: salon1.id,
            userId: userAlex.id,
            content: 'Carrément ! Je règle le son de la radio d\'ambiance.',
            type: 'TEXT',
          },
        ],
      });
    }
  }

  console.log('✅ WafaTalk database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
