// Script to remove all bot-generated accounts from WafaTalk SQLite database
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const isBotUser = (u) => {
  return (
    u.username.startsWith('wafa_user_') ||
    u.username.startsWith('googleuser') ||
    u.username.startsWith('User_Name-') ||
    u.username.startsWith('WafaOtp_') ||
    u.username.startsWith('AntiBot_') ||
    u.username.startsWith('cloud_tester_') ||
    u.username.startsWith('salon_tester_') ||
    u.email.includes('@test.com') ||
    u.email.startsWith('google.user.') ||
    u.email.startsWith('wafa.user.') ||
    u.email.startsWith('antibot.tester') ||
    u.email.startsWith('cloud.test.') ||
    u.email.startsWith('salon.tester.')
  );
};

async function main() {
  console.log('🧹 Starting cleanup of bot accounts...');

  const allUsers = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' }
  });

  const botUsers = allUsers.filter(isBotUser);
  const botIds = botUsers.map(u => u.id);

  console.log(`Found ${botUsers.length} bot account(s) to remove.`);

  if (botIds.length > 0) {
    // Delete the bot users
    const result = await prisma.user.deleteMany({
      where: { id: { in: botIds } }
    });
    console.log(`✅ Deleted ${result.count} bot users successfully.`);
  }

  // Also clean up any test email verification records
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
  console.log(`✅ Cleaned up ${deletedVerifs.count} test email verification record(s).`);

  // Show remaining users
  const remaining = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      displayName: true,
      email: true,
      role: true
    },
    orderBy: { createdAt: 'asc' }
  });

  console.log(`\n🎉 Remaining legitimate users (${remaining.length}):`);
  remaining.forEach((u, i) => {
    console.log(`${i + 1}. [${u.role}] @${u.username} (${u.displayName}) - ${u.email}`);
  });

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error during cleanup:', err);
  process.exit(1);
});
