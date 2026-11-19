import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanFakeUsers() {
  console.log('🧹 Début du nettoyage des faux utilisateurs, bots et comptes de test...');

  // 1. Trouver le compte humain / administrateur principal
  const adminUser = await prisma.user.findFirst({
    where: {
      OR: [
        { username: '@' },
        { email: 'admin@wafatalk.com' }
      ]
    }
  });

  if (!adminUser) {
    throw new Error('❌ Erreur critique : Aucun utilisateur administrateur humain (@) trouvé dans la base.');
  }

  console.log(`👑 Utilisateur valide / humain identifié : [${adminUser.role}] @${adminUser.username} (${adminUser.email}, ID: ${adminUser.id})`);

  // 2. Trouver tous les faux utilisateurs, bots et comptes tests
  const allUsers = await prisma.user.findMany();
  const fakeUsers = allUsers.filter(u => u.id !== adminUser.id);
  const fakeIds = fakeUsers.map(u => u.id);

  console.log(`\n🔍 ${fakeUsers.length} faux utilisateur(s) / bot(s) détecté(s) à supprimer :`);
  fakeUsers.forEach((u, i) => {
    console.log(`   ${i + 1}. [${u.role}] @${u.username} (${u.displayName}) - ${u.email} [ID: ${u.id}]`);
  });

  // 3. Réassigner la propriété de tous les salons à l'administrateur valide
  const updatedSalons = await prisma.salon.updateMany({
    where: {
      ownerId: { in: fakeIds }
    },
    data: {
      ownerId: adminUser.id
    }
  });
  console.log(`\n🏢 ${updatedSalons.count} salon(s) réassigné(s) avec succès à @${adminUser.username}.`);

  // S'assurer que l'admin est inscrit comme OWNER dans SalonMember pour tous les salons
  const allSalons = await prisma.salon.findMany({ select: { id: true } });
  for (const s of allSalons) {
    await prisma.salonMember.upsert({
      where: {
        salonId_userId: { salonId: s.id, userId: adminUser.id }
      },
      update: { role: 'OWNER' },
      create: { salonId: s.id, userId: adminUser.id, role: 'OWNER' }
    });
  }

  // 4. Nettoyer toutes les relations liées aux faux comptes
  if (fakeIds.length > 0) {
    const deletedMembers = await prisma.salonMember.deleteMany({
      where: { userId: { in: fakeIds } }
    });
    console.log(`🗑️  ${deletedMembers.count} adhésion(s) de salon de faux utilisateurs supprimée(s).`);

    const deletedFriendRequests = await prisma.friendRequest.deleteMany({
      where: {
        OR: [
          { senderId: { in: fakeIds } },
          { receiverId: { in: fakeIds } }
        ]
      }
    });
    console.log(`🗑️  ${deletedFriendRequests.count} demande(s) d'ami de faux utilisateurs supprimée(s).`);

    const deletedFriendships = await prisma.friendship.deleteMany({
      where: {
        OR: [
          { userId: { in: fakeIds } },
          { friendId: { in: fakeIds } }
        ]
      }
    });
    console.log(`🗑️  ${deletedFriendships.count} amitié(s) de faux utilisateurs supprimée(s).`);

    const deletedMessages = await prisma.message.deleteMany({
      where: { userId: { in: fakeIds } }
    });
    console.log(`🗑️  ${deletedMessages.count} message(s) de salon de faux utilisateurs supprimé(s).`);

    const deletedDMs = await prisma.directMessage.deleteMany({
      where: { senderId: { in: fakeIds } }
    });
    console.log(`🗑️  ${deletedDMs.count} message(s) privé(s) de faux utilisateurs supprimé(s).`);

    const deletedConvs = await prisma.conversation.deleteMany({
      where: {
        OR: [
          { user1Id: { in: fakeIds } },
          { user2Id: { in: fakeIds } }
        ]
      }
    });
    console.log(`🗑️  ${deletedConvs.count} conversation(s) de faux utilisateurs supprimée(s).`);

    const deletedCalls = await prisma.callSession.deleteMany({
      where: {
        OR: [
          { callerId: { in: fakeIds } },
          { receiverId: { in: fakeIds } }
        ]
      }
    });
    console.log(`🗑️  ${deletedCalls.count} session(s) d'appel de faux utilisateurs supprimée(s).`);

    const deletedGifts = await prisma.giftLog.deleteMany({
      where: {
        OR: [
          { senderId: { in: fakeIds } },
          { receiverId: { in: fakeIds } }
        ]
      }
    });
    console.log(`🗑️  ${deletedGifts.count} cadeau(x) de faux utilisateurs supprimé(s).`);

    const deletedBans = await prisma.salonBan.deleteMany({
      where: { userId: { in: fakeIds } }
    });
    console.log(`🗑️  ${deletedBans.count} ban(s) de faux utilisateurs supprimé(s).`);

    // 5. Supprimer définitivement les faux utilisateurs
    const deletedUsers = await prisma.user.deleteMany({
      where: { id: { in: fakeIds } }
    });
    console.log(`\n✅ ${deletedUsers.count} faux utilisateur(s) / bot(s) supprimé(s) de la table User.`);
  }

  // 6. Nettoyer les vérifications email de test
  const deletedVerifs = await prisma.emailVerification.deleteMany({
    where: {
      OR: [
        { email: { contains: 'tester' } },
        { email: { contains: 'test.com' } },
        { email: { startsWith: 'wafa.user.' } },
        { email: { startsWith: 'google.user.' } }
      ]
    }
  });
  console.log(`✅ ${deletedVerifs.count} vérification(s) email de test nettoyée(s).`);

  // 7. Afficher l'état final des utilisateurs restants
  const remainingUsers = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      displayName: true,
      email: true,
      role: true,
      status: true,
      wafaPoints: true,
      createdAt: true
    }
  });

  console.log(`\n======================================================`);
  console.log(`🎉 UTILISATEURS VALIDES RESTANTS DANS LA BASE (${remainingUsers.length}) :`);
  remainingUsers.forEach((u, idx) => {
    console.log(`${idx + 1}. [${u.role}] @${u.username} ("${u.displayName}") - ${u.email} [ID: ${u.id}]`);
  });
  console.log(`======================================================\n`);

  await prisma.$disconnect();
}

cleanFakeUsers().catch(err => {
  console.error('❌ Erreur lors du nettoyage :', err);
  process.exit(1);
});
