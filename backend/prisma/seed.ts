import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SUPERADMIN_EMAIL || 'superadmin@orbit.local').toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD || 'SuperAdmin@123';
  const fullName = process.env.SUPERADMIN_NAME || 'Orbit Super Admin';

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      fullName,
      role: Role.SUPERADMIN,
      isActive: true,
    },
    create: {
      email,
      passwordHash,
      fullName,
      role: Role.SUPERADMIN,
      isActive: true,
    },
  });

  console.log('SuperAdmin ready:');
  console.log(`  email: ${user.email}`);
  console.log(`  role:  ${user.role}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
