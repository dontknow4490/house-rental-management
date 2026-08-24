const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const bcrypt = require('../backend/node_modules/bcryptjs');
const prisma = new PrismaClient();

async function runTests() {
  console.log('========================================================================');
  console.log(' MULTI-CHARGE ADVANCE CONSUMPTION & FINANCIAL INVARIANT REGRESSION TEST');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message, details = '') {
    if (condition) {
      console.log(`  ✓ [PASS] ${message} ${details}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${message} ${details}`);
      failed++;
    }
  }

  // Exact reconciliation logic from BillingService
  async function reconcileTenant(tenantId) {
    const verifiedPayments = await prisma.payment.findMany({
      where: { tenantId, status: 'VERIFIED' },
      orderBy: { createdAt: 'asc' },
    });
    let verifiedPool = Number(
      verifiedPayments.reduce((acc, p) => acc + Number(p.amount), 0).toFixed(2)
    );

    const bills = await prisma.monthlyBill.findMany({
      where: { tenantId },
      orderBy: [{ yearBS: 'asc' }, { monthBS: 'asc' }],
    });

    for (const b of bills) {
      const total = Number(b.totalAmount.toFixed(2));
      if (verifiedPool >= total) {
        await prisma.monthlyBill.update({
          where: { id: b.id },
          data: { paidAmount: total, balanceDue: 0, status: 'PAID' },
        });
        verifiedPool = Number((verifiedPool - total).toFixed(2));
      } else if (verifiedPool > 0) {
        const paid = verifiedPool;
        const due = Number(Math.max(0, total - paid).toFixed(2));
        await prisma.monthlyBill.update({
          where: { id: b.id },
          data: { paidAmount: paid, balanceDue: due, status: 'PARTIALLY_PAID' },
        });
        verifiedPool = 0;
      } else {
        await prisma.monthlyBill.update({
          where: { id: b.id },
          data: { paidAmount: 0, balanceDue: total, status: 'UNPAID' },
        });
      }
    }

    const profile = await prisma.tenantProfile.findUnique({ where: { userId: tenantId } });
    if (profile) {
      await prisma.tenantProfile.update({
        where: { id: profile.id },
        data: { advanceBalance: verifiedPool },
      });
    }

    return { remainingAdvance: verifiedPool };
  }

  try {
    // ----------------------------------------------------
    // CLEANUP STALE TEST DATA FIRST
    // ----------------------------------------------------
    await prisma.waterPurchase.deleteMany({
      where: { room: { roomNumber: { in: [71, 72] } } },
    });
    await prisma.payment.deleteMany({
      where: { tenant: { username: { in: ['test_multi_charge', 'test_water_adv'] } } },
    });
    await prisma.monthlyBill.deleteMany({
      where: { tenant: { username: { in: ['test_multi_charge', 'test_water_adv'] } } },
    });
    await prisma.user.deleteMany({
      where: { username: { in: ['test_multi_charge', 'test_water_adv'] } },
    });
    await prisma.room.deleteMany({
      where: { roomNumber: { in: [71, 72] } },
    });

    const passwordHash = await bcrypt.hash('TestPass@123', 10);

    // ========================================================================
    // TEST SUITE 1: Multi-Charge Scenario (45 -> 40 -> 30 -> 45)
    // ========================================================================
    console.log('--- TEST SUITE 1: Multi-Charge Scenario (100 -> 55 -> 15 -> 0/due 15 -> 0/due 60) ---');

    const room71 = await prisma.room.create({
      data: { roomNumber: 71, name: 'Room 71 Multi-Charge', defaultRent: 0, status: 'OCCUPIED' },
    });

    const tenant1 = await prisma.user.create({
      data: {
        username: 'test_multi_charge',
        passwordHash,
        fullName: 'Hari Prasad',
        role: 'TENANT',
        status: 'ACTIVE',
        tenantProfile: {
          create: {
            roomId: room71.id,
            monthlyRent: 0,
            numberOfPeople: 1,
            internetEnabled: false,
            moveInDateBS: '2083 Bhadra 1',
            moveInDateAD: new Date(),
            advanceBalance: 0,
            status: 'ACTIVE',
          },
        },
      },
      include: { tenantProfile: true },
    });

    const bill1 = await prisma.monthlyBill.create({
      data: {
        billNumber: 'BILL-MULTI-71-2083-05',
        tenantId: tenant1.id,
        roomId: room71.id,
        yearBS: 2083,
        monthBS: 5,
        monthNameBS: 'Bhadra',
        rentAmount: 0,
        internetAmount: 0,
        electricityAmount: 0,
        waterAmount: 0,
        garbageAmount: 0,
        borrowingAmount: 0,
        adjustmentsAmount: 0,
        totalAmount: 0,
        paidAmount: 0,
        balanceDue: 0,
        status: 'PAID',
        dueDateBS: '2083 Bhadra 10',
      },
    });

    // Tenant pays Rs. 100 Advance
    const p1 = await prisma.payment.create({
      data: {
        billId: bill1.id,
        tenantId: tenant1.id,
        amount: 100,
        paymentMethod: 'ESEWA',
        transactionId: 'TXN-MULTI-100',
        paymentDateBS: '2083 Bhadra 1',
        paymentDateAD: new Date(),
        status: 'VERIFIED',
        receiptNumber: 'REC-MULTI-100',
      },
    });

    await reconcileTenant(tenant1.id);
    let prof1 = await prisma.tenantProfile.findUnique({ where: { userId: tenant1.id } });
    assert(prof1.advanceBalance === 100, 'Initial State: Advance is exactly Rs. 100');

    // 1. Charge #1: Water Rs. 45 -> Advance = 55, Due = 0
    await prisma.waterPurchase.create({
      data: {
        roomId: room71.id,
        tenantId: tenant1.id,
        billId: bill1.id,
        yearBS: 2083,
        monthBS: 5,
        quantity: 1,
        pricePerUnit: 45,
        totalAmount: 45,
        purchaseDateBS: '2083 Bhadra 2',
      },
    });
    await prisma.monthlyBill.update({ where: { id: bill1.id }, data: { waterAmount: 45, totalAmount: 45 } });
    await reconcileTenant(tenant1.id);
    prof1 = await prisma.tenantProfile.findUnique({ where: { userId: tenant1.id } });
    let b1 = await prisma.monthlyBill.findUnique({ where: { id: bill1.id } });
    assert(prof1.advanceBalance === 55, 'Charge 1: Rs. 45 water -> Remaining Advance = Rs. 55', `(actual: Rs. ${prof1.advanceBalance})`);
    assert(b1.balanceDue === 0, 'Charge 1: Balance Due = Rs. 0');

    // 2. Charge #2: Another charge Rs. 40 (Water #2 @ Rs. 40) -> Advance = 15, Due = 0
    await prisma.waterPurchase.create({
      data: {
        roomId: room71.id,
        tenantId: tenant1.id,
        billId: bill1.id,
        yearBS: 2083,
        monthBS: 5,
        quantity: 1,
        pricePerUnit: 40,
        totalAmount: 40,
        purchaseDateBS: '2083 Bhadra 4',
      },
    });
    const totalWater2 = 45 + 40; // 85
    await prisma.monthlyBill.update({ where: { id: bill1.id }, data: { waterAmount: totalWater2, totalAmount: totalWater2 } });
    await reconcileTenant(tenant1.id);
    prof1 = await prisma.tenantProfile.findUnique({ where: { userId: tenant1.id } });
    b1 = await prisma.monthlyBill.findUnique({ where: { id: bill1.id } });
    assert(prof1.advanceBalance === 15, 'Charge 2: Rs. 40 charge -> Remaining Advance = Rs. 15 (55 - 40)', `(actual: Rs. ${prof1.advanceBalance})`);
    assert(b1.balanceDue === 0, 'Charge 2: Balance Due = Rs. 0');

    // 3. Charge #3: Another charge Rs. 30 (Electricity Rs. 30) -> Advance = 0, Due = 15
    const totalWithElec = 85 + 30; // 115
    await prisma.monthlyBill.update({
      where: { id: bill1.id },
      data: { electricityAmount: 30, totalAmount: totalWithElec },
    });
    await reconcileTenant(tenant1.id);
    prof1 = await prisma.tenantProfile.findUnique({ where: { userId: tenant1.id } });
    b1 = await prisma.monthlyBill.findUnique({ where: { id: bill1.id } });
    assert(prof1.advanceBalance === 0, 'Charge 3: Rs. 30 charge -> Remaining Advance = Rs. 0 (exhausted)', `(actual: Rs. ${prof1.advanceBalance})`);
    assert(b1.balanceDue === 15, 'Charge 3: Balance Due = Rs. 15 (115 - 100)', `(actual: Rs. ${b1.balanceDue})`);
    assert(b1.paidAmount === 100, 'Charge 3: Paid amount equals verified advance Rs. 100');

    // 4. Charge #4: Another charge Rs. 45 (Water #3 @ Rs. 45) -> Advance = 0, Due = 60
    await prisma.waterPurchase.create({
      data: {
        roomId: room71.id,
        tenantId: tenant1.id,
        billId: bill1.id,
        yearBS: 2083,
        monthBS: 5,
        quantity: 1,
        pricePerUnit: 45,
        totalAmount: 45,
        purchaseDateBS: '2083 Bhadra 10',
      },
    });
    const totalWater4 = 85 + 45; // 130
    const totalWithAll = totalWater4 + 30; // 160
    await prisma.monthlyBill.update({
      where: { id: bill1.id },
      data: { waterAmount: totalWater4, totalAmount: totalWithAll },
    });
    await reconcileTenant(tenant1.id);
    prof1 = await prisma.tenantProfile.findUnique({ where: { userId: tenant1.id } });
    b1 = await prisma.monthlyBill.findUnique({ where: { id: bill1.id } });
    assert(prof1.advanceBalance === 0, 'Charge 4: Remaining Advance remains Rs. 0');
    assert(b1.balanceDue === 60, 'Charge 4: Balance Due is exactly Rs. 60 (160 - 100)', `(actual: Rs. ${b1.balanceDue})`);
    assert(b1.paidAmount === 100, 'Charge 4: Paid amount remains Rs. 100');


    // ========================================================================
    // TEST SUITE 2: Invariant & No Duplicate Counting Check
    // ========================================================================
    console.log('\n--- TEST SUITE 2: Financial Invariants & No Duplicate Counting ---');

    const verifiedPayments = await prisma.payment.findMany({ where: { tenantId: tenant1.id, status: 'VERIFIED' } });
    const allTenantBills = await prisma.monthlyBill.findMany({ where: { tenantId: tenant1.id } });
    const totalP = verifiedPayments.reduce((s, p) => s + p.amount, 0);
    const totalC = allTenantBills.reduce((s, b) => s + b.totalAmount, 0);

    const calculatedAdv = Math.max(0, totalP - totalC);
    const calculatedDue = Math.max(0, totalC - totalP);

    assert(prof1.advanceBalance === calculatedAdv, `Invariant: remainingAdvance (${prof1.advanceBalance}) === max(0, P - C) (${calculatedAdv})`);
    assert(b1.balanceDue === calculatedDue, `Invariant: currentDue (${b1.balanceDue}) === max(0, C - P) (${calculatedDue})`);
    assert(totalP === 100, 'Total verified payments strictly equals Rs. 100 (never duplicated to 415 or any other number)');
    assert(prof1.advanceBalance <= totalP, 'Invariant: remainingAdvance <= totalVerifiedPayments');
    assert(prof1.advanceBalance >= 0, 'Invariant: remainingAdvance >= 0');
    assert(b1.balanceDue >= 0, 'Invariant: balanceDue >= 0');


    // ========================================================================
    // CLEANUP
    // ========================================================================
    console.log('\n--- CLEANING UP TEST DATA ---');
    await prisma.waterPurchase.deleteMany({ where: { roomId: room71.id } });
    await prisma.payment.deleteMany({ where: { tenantId: tenant1.id } });
    await prisma.monthlyBill.deleteMany({ where: { tenantId: tenant1.id } });
    await prisma.user.deleteMany({ where: { id: tenant1.id } });
    await prisma.room.deleteMany({ where: { id: room71.id } });
    console.log('  ✓ Test cleanup completed successfully.');

  } catch (err) {
    console.error('Test error:', err);
    failed++;
  } finally {
    await prisma.$disconnect();
  }

  console.log('\n========================================================================');
  console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
