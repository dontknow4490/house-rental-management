import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { DEFAULT_SETTINGS } from '../src/settings/settings.service';

const prisma = new PrismaClient();

async function main() {
  console.log('Initializing Database for House Rental Management System...');

  // 1. Environment & Security Guards
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[SECURITY ABORT] Destructive database seeding is strictly prohibited in production (NODE_ENV=production).'
    );
  }

  const rawAdminUsername = process.env.INITIAL_ADMIN_USERNAME?.trim();
  const rawAdminPassword = process.env.INITIAL_ADMIN_PASSWORD?.trim();

  if (!rawAdminUsername || !rawAdminPassword) {
    throw new Error(
      '[SECURITY ABORT] INITIAL_ADMIN_USERNAME and INITIAL_ADMIN_PASSWORD environment variables are required to seed the database.'
    );
  }

  const adminUsername = rawAdminUsername.toLowerCase();
  const adminPassword = rawAdminPassword;

  // 2. Conditional Destructive Cleanup Guard
  const allowDestructive = process.env.ALLOW_DESTRUCTIVE_SEED === 'true';
  if (allowDestructive) {
    console.log('ALLOW_DESTRUCTIVE_SEED=true: Cleaning transactional records...');
    await prisma.digitalReceipt.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.adjustment.deleteMany({});
    await prisma.monthlyBill.deleteMany({});
    await prisma.electricityReading.deleteMany({});
    await prisma.waterPurchase.deleteMany({});
    await prisma.customPurchase.deleteMany({});
    await prisma.maintenanceRequest.deleteMany({});
    await prisma.notice.deleteMany({});
    await prisma.auditLog.deleteMany({});
    await prisma.tenantProfile.deleteMany({});
    await prisma.user.deleteMany({ where: { role: 'TENANT' } });
  } else {
    console.log('Skipping destructive table cleanup (ALLOW_DESTRUCTIVE_SEED is not set to "true").');
  }

  // 3. Seed System Settings
  for (const [key, meta] of Object.entries(DEFAULT_SETTINGS)) {
    const existing = await prisma.systemSetting.findUnique({ where: { key } });
    if (!existing) {
      await prisma.systemSetting.create({
        data: {
          key,
          value: meta.value,
          description: meta.description,
        },
      });
    } else if (key !== 'ESEWA_QR_IMAGE') {
      await prisma.systemSetting.update({
        where: { key },
        data: {
          description: meta.description,
        },
      });
    }
  }
  console.log('✔ System Settings initialized (Electricity: 15/unit, Internet: 250/person, Garbage: 100/room, Water: 45/jar)');

  // 4. Seed Initial Admin Account
  const adminPasswordHash = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.user.upsert({
    where: { username: adminUsername },
    update: {
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      fullName: 'System Administrator',
    },
    create: {
      username: adminUsername,
      passwordHash: adminPasswordHash,
      fullName: 'System Administrator',
      phone: '9800000000',
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  });
  console.log(`✔ Administrator account ready: ${admin.username}`);

  // 5. Seed 6 Vacant Rooms
  const initialRooms = [
    { roomNumber: 1, name: 'Room 1', defaultRent: 6000 },
    { roomNumber: 2, name: 'Room 2', defaultRent: 5500 },
    { roomNumber: 3, name: 'Room 3', defaultRent: 6000 },
    { roomNumber: 4, name: 'Room 4', defaultRent: 6500 },
    { roomNumber: 5, name: 'Room 5', defaultRent: 6000 },
    { roomNumber: 6, name: 'Room 6', defaultRent: 6000 },
  ];

  for (const r of initialRooms) {
    await prisma.room.upsert({
      where: { roomNumber: r.roomNumber },
      update: { defaultRent: r.defaultRent, name: r.name, status: 'VACANT' },
      create: {
        roomNumber: r.roomNumber,
        name: r.name,
        defaultRent: r.defaultRent,
        status: 'VACANT',
      },
    });
  }
  console.log('✔ 6 Rooms initialized (All 6 VACANT with default rents)');
  console.log('✨ Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
