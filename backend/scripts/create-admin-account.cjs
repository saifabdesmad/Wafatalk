const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const username = '@';
  const displayName = '@';
  const email = 'admin@wafatalk.com';
  const passwordPlain = '112233Aa@@';
  const role = 'ADMIN';

  console.log(`=== Création / Mise à jour du compte SuperAdmin ===`);
  console.log(`Pseudo: ${username}`);
  console.log(`Email: ${email}`);
  console.log(`Rôle: ${role}`);

  const passwordHash = await bcrypt.hash(passwordPlain, 10);

  // Check if user already exists by username or email
  let user = await prisma.user.findFirst({
    where: {
      OR: [
        { username: username },
        { email: email }
      ]
    }
  });

  if (user) {
    console.log(`Utilisateur existant trouvé (id: ${user.id}). Mise à jour des accès et mot de passe...`);
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        username,
        displayName,
        email,
        passwordHash,
        role,
        isEmailVerified: true,
        status: 'OFFLINE',
        wafaPoints: 99999,
        avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=%40'
      }
    });
  } else {
    console.log(`Création d'un nouvel utilisateur dans la base de données...`);
    user = await prisma.user.create({
      data: {
        username,
        displayName,
        email,
        passwordHash,
        role,
        isEmailVerified: true,
        status: 'OFFLINE',
        wafaPoints: 99999,
        avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=%40'
      }
    });
  }

  console.log(`✅ Compte utilisateur créé/mis à jour avec succès :`);
  console.log(`   ID: ${user.id}`);
  console.log(`   Pseudo: ${user.username}`);
  console.log(`   Email: ${user.email}`);
  console.log(`   Rôle: ${user.role}`);

  // Associer en tant qu'ADMIN à TOUS les salons existants
  const allSalons = await prisma.salon.findMany({ select: { id: true, name: true, ownerId: true } });
  console.log(`\nAttribution des privilèges d'administrateur sur ${allSalons.length} salon(s)...`);

  for (const s of allSalons) {
    const isOwner = s.ownerId === user.id;
    await prisma.salonMember.upsert({
      where: {
        salonId_userId: { salonId: s.id, userId: user.id }
      },
      update: {
        role: isOwner ? 'OWNER' : 'ADMIN'
      },
      create: {
        salonId: s.id,
        userId: user.id,
        role: isOwner ? 'OWNER' : 'ADMIN'
      }
    });
    console.log(`   - Salon "${s.name}" (${s.id}) : ${isOwner ? 'OWNER' : 'ADMIN'}`);
  }

  // Vérifier la validation du mot de passe
  const isMatch = await bcrypt.compare(passwordPlain, user.passwordHash);
  console.log(`\nVérification du mot de passe crypté (bcrypt) : ${isMatch ? 'VALIDE' : 'ERREUR'}`);

  console.log(`\n🎉 Opération terminée avec succès.`);
}

main()
  .catch((err) => {
    console.error('Erreur lors de la création du compte :', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
