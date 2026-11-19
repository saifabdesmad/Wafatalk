import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// List of verified real human accounts to preserve at all costs
const HUMAN_EMAILS = new Set([
  'admin@wafatalk.com',
  'saifabdesmad11@gmail.com',
  'saracouca03@gmail.com',
  'iyedabdessamad@gmail.com',
  'rayenabdesmad23@gmail.com',
  'fafoufoufa06@gmail.com',
  'karounechaouki@yahoo.fr',
  'jouinimostfa99@gmail.com',
  'benabdessamadiyed@gmail.com',
  'awatefthlibi26@gmail.com',
  'daycemfekih@gmail.com',
  'amenimili90@gmail.com',
  'amira.hedyaoui9@gmail.com',
  'ghannouchi.louay@gmail.com',
  'mouaffakch21@gmail.com',
  'nassimmansour210@gmail.com',
  'haydarnajeh711@gmail.com',
  'pijdkk@hoome.com',
  'anisbacha21@hotmail.com'
]);

const isBotUser = (u) => {
  if (HUMAN_EMAILS.has(u.email.toLowerCase())) return false;
  if (u.username === '@') return false;

  return (
    u.id.startsWith('user-') ||
    ['alexandre', 'sarah_b', 'youssef_k', 'lina_m', 'karim_d', 'alexandremoreau'].includes(u.username.toLowerCase()) ||
    u.username.startsWith('charlie_prod_') ||
    u.username.startsWith('bob_prod_') ||
    u.username.startsWith('alice_prod_') ||
    u.username.startsWith('p_bob_') ||
    u.username.startsWith('p_alice_') ||
    u.username.startsWith('usr_') ||
    u.username.startsWith('AntiBot_') ||
    u.username.startsWith('invalid_user') ||
    u.username.startsWith('test_') ||
    u.username.startsWith('testfinal') ||
    u.email.endsWith('@wafatalk.test') ||
    u.email.includes('test_deploy') ||
    u.email.includes('antibot.tester') ||
    u.email.includes('invalid.probe') ||
    u.email.includes('probe@') ||
    u.email.includes('test_node') ||
    u.email === 'alexandre.moreau@gmail.com' ||
    u.email === 'testfinal@gmail.com' ||
    u.email.includes('@test.com')
  );
};

async function main() {
  console.log('🔍 Inspection des utilisateurs en base de données...');
  const allUsers = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });

  const adminUser = allUsers.find(u => u.username === '@' || u.email === 'admin@wafatalk.com');
  if (!adminUser) {
    throw new Error('SuperAdmin @ non trouvé !');
  }

  const bots = allUsers.filter(isBotUser);
  const botIds = bots.map(b => b.id);
  const humans = allUsers.filter(u => !isBotUser(u));

  console.log(`\n👥 Total utilisateurs : ${allUsers.length}`);
  console.log(`🤖 Faux utilisateurs / bots identifiés : ${bots.length}`);
  bots.forEach((b, i) => {
    console.log(`   ${i + 1}. [${b.role}] @${b.username} (${b.displayName}) - ${b.email} [ID: ${b.id}]`);
  });

  console.log(`\n👤 Utilisateurs humains valides conservés : ${humans.length}`);
  humans.forEach((h, i) => {
    console.log(`   ${i + 1}. [${h.role}] @${h.username} (${h.displayName}) - ${h.email} [ID: ${h.id}]`);
  });

  if (botIds.length > 0) {
    console.log(`\n🧹 Suppression des faux comptes et nettoyage des dépendances...`);

    // 1. Réassigner la propriété des salons possédés par des bots vers le SuperAdmin @
    const reassignSalons = await prisma.salon.updateMany({
      where: { ownerId: { in: botIds } },
      data: { ownerId: adminUser.id }
    });
    console.log(`🏢 ${reassignSalons.count} salon(s) transféré(s) à @${adminUser.username}.`);

    // 2. Nettoyer les adhésions aux salons
    const delMembers = await prisma.salonMember.deleteMany({
      where: { userId: { in: botIds } }
    });
    console.log(`🗑️  ${delMembers.count} adhésion(s) de salon supprimée(s).`);

    // 3. Nettoyer les demandes d'amis
    const delRequests = await prisma.friendRequest.deleteMany({
      where: {
        OR: [
          { senderId: { in: botIds } },
          { receiverId: { in: botIds } }
        ]
      }
    });
    console.log(`🗑️  ${delRequests.count} demande(s) d'ami supprimée(s).`);

    // 4. Nettoyer les amitiés
    const delFriendships = await prisma.friendship.deleteMany({
      where: {
        OR: [
          { userId: { in: botIds } },
          { friendId: { in: botIds } }
        ]
      }
    });
    console.log(`🗑️  ${delFriendships.count} amitié(s) supprimée(s).`);

    // 5. Nettoyer messages
    await prisma.message.deleteMany({ where: { userId: { in: botIds } } });
    await prisma.directMessage.deleteMany({ where: { senderId: { in: botIds } } });
    await prisma.conversation.deleteMany({
      where: {
        OR: [
          { user1Id: { in: botIds } },
          { user2Id: { in: botIds } }
        ]
      }
    });
    await prisma.callSession.deleteMany({
      where: {
        OR: [
          { callerId: { in: botIds } },
          { receiverId: { in: botIds } }
        ]
      }
    });
    await prisma.giftLog.deleteMany({
      where: {
        OR: [
          { senderId: { in: botIds } },
          { receiverId: { in: botIds } }
        ]
      }
    });
    await prisma.salonBan.deleteMany({ where: { userId: { in: botIds } } });

    // 6. Supprimer les utilisateurs bots
    const deleted = await prisma.user.deleteMany({
      where: { id: { in: botIds } }
    });
    console.log(`✅ ${deleted.count} faux utilisateur(s) supprimé(s) avec succès.`);
  }

  // Nettoyer les vérifications email de test
  const delVerifs = await prisma.emailVerification.deleteMany({
    where: {
      OR: [
        { email: { contains: 'tester' } },
        { email: { contains: 'test.com' } },
        { email: { contains: 'wafatalk.test' } },
        { email: { contains: 'probe' } }
      ]
    }
  });
  console.log(`✅ ${delVerifs.count} vérification(s) email de test nettoyée(s).`);

  const remaining = await prisma.user.findMany({ select: { username: true, email: true, role: true } });
  console.log(`\n🎉 Total utilisateurs restants en base de production : ${remaining.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
