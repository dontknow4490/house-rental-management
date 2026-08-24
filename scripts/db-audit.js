const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const counts = {
    users: await prisma.user.count(),
    tenantProfiles: await prisma.tenantProfile.count(),
    rooms: await prisma.room.count(),
    bills: await prisma.monthlyBill.count(),
    payments: await prisma.payment.count(),
    receipts: await prisma.digitalReceipt.count(),
    electricityReadings: await prisma.electricityReading.count(),
    waterPurchases: await prisma.waterPurchase.count(),
    settings: await prisma.systemSetting.count(),
  };

  console.log('=== DATABASE INTEGRITY AUDIT ===');
  console.log(JSON.stringify(counts, null, 2));

  const rooms = await prisma.room.findMany({
    orderBy: { roomNumber: 'asc' },
    select: { roomNumber: true, status: true, defaultRent: true },
  });
  console.log('\n=== ROOMS AUDIT ===\n', rooms);

  const profiles = await prisma.tenantProfile.findMany({
    include: {
      user: { select: { fullName: true, username: true, role: true } },
      room: { select: { roomNumber: true } },
    },
  });
  console.log('\n=== TENANT PROFILES AUDIT ===\n', profiles.map(p => ({
    name: p.user?.fullName,
    username: p.user?.username,
    room: p.room?.roomNumber,
    rent: p.monthlyRent,
    internetEnabled: p.internetEnabled,
    moveInDateBS: p.moveInDateBS,
    status: p.status,
    advanceBalance: p.advanceBalance,
  })));
}

main().catch(console.error).finally(() => prisma.$disconnect());
