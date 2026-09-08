// Script to list all WafaTalk users directly in the terminal
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('\n📊 --- Utilisateurs enregistrés dans la Base de Données WafaTalk ---\n');
  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      email: true,
      displayName: true,
      role: true,
      status: true,
      wafaPoints: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  console.table(users);
  console.log(`Total: ${users.length} utilisateur(s) trouvé(s).\n`);
  process.exit(0);
}

main().catch(err => {
  console.error('Erreur:', err);
  process.exit(1);
});
