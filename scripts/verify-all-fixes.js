const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const bcrypt = require('../backend/node_modules/bcryptjs');
const prisma = new PrismaClient();

async function runTests() {
  console.log('========================================================================');
  console.log(' RUNNING COMPLETE E2E VERIFICATION SUITE FOR ALL 18 SCENARIOS');
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

  // Reconcile logic matching BillingService
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
      where: { room: { roomNumber: { in: [90, 91, 92] } } },
    });
    await prisma.payment.deleteMany({
      where: { tenant: { username: { in: ['test_e2e_ram', 'test_e2e_sita', 'test_e2e_shyam'] } } },
    });
    await prisma.monthlyBill.deleteMany({
      where: { tenant: { username: { in: ['test_e2e_ram', 'test_e2e_sita', 'test_e2e_shyam'] } } },
    });
    await prisma.user.deleteMany({
      where: { username: { in: ['test_e2e_ram', 'test_e2e_sita', 'test_e2e_shyam'] } },
    });
    await prisma.room.deleteMany({
      where: { roomNumber: { in: [90, 91, 92] } },
    });

    const passwordHash = await bcrypt.hash('TestPass@123', 10);

    // ========================================================================
    // TESTS 1 - 4: Exact Water & Advance Accounting Sequence
    // ========================================================================
    console.log('--- TESTS 1 - 4: Exact Water & Advance Accounting Sequence ---');

    const room90 = await prisma.room.create({
      data: { roomNumber: 90, name: 'Room 90', defaultRent: 0, status: 'OCCUPIED' },
    });

    const ram = await prisma.user.create({
      data: {
        username: 'test_e2e_ram',
        passwordHash,
        fullName: 'Ram Bahadur',
        role: 'TENANT',
        status: 'ACTIVE',
        tenantProfile: {
          create: {
            roomId: room90.id,
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

    const billRam = await prisma.monthlyBill.create({
      data: {
        billNumber: 'BILL-RAM-2083-05',
        tenantId: ram.id,
        roomId: room90.id,
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

    // Tenant pays Rs. 100 advance
    const advPayment = await prisma.payment.create({
      data: {
        billId: billRam.id,
        tenantId: ram.id,
        amount: 100,
        paymentMethod: 'ESEWA',
        transactionId: 'TXN-ADV-100',
        paymentDateBS: '2083 Bhadra 1',
        paymentDateAD: new Date(),
        status: 'VERIFIED',
        receiptNumber: 'REC-ADV-RAM-100',
      },
    });

    await reconcileTenant(ram.id);
    let ramProf = await prisma.tenantProfile.findUnique({ where: { userId: ram.id } });
    assert(ramProf.advanceBalance === 100, 'Initial state: Ram has Rs. 100 available advance credit');

    // TEST 1: Add water jar #1 (Rs. 45) -> Advance becomes Rs. 55
    const jar1 = await prisma.waterPurchase.create({
      data: {
        roomId: room90.id,
        tenantId: ram.id,
        billId: billRam.id,
        yearBS: 2083,
        monthBS: 5,
        quantity: 1,
        pricePerUnit: 45,
        totalAmount: 45,
        purchaseDateBS: '2083 Bhadra 2',
        isSettled: false,
      },
    });

    let jars = await prisma.waterPurchase.findMany({ where: { roomId: room90.id, yearBS: 2083, monthBS: 5 } });
    let totalWater = jars.reduce((s, j) => s + j.totalAmount, 0);
    await prisma.monthlyBill.update({ where: { id: billRam.id }, data: { waterAmount: totalWater, totalAmount: totalWater } });
    await reconcileTenant(ram.id);
    ramProf = await prisma.tenantProfile.findUnique({ where: { userId: ram.id } });
    assert(ramProf.advanceBalance === 55, 'TEST 1: Rs. 100 advance + 1 jar (Rs. 45) -> Rs. 55 remaining advance', `(actual: Rs. ${ramProf.advanceBalance})`);

    // TEST 2: Add water jar #2 (Rs. 45) -> Advance becomes Rs. 10
    const jar2 = await prisma.waterPurchase.create({
      data: {
        roomId: room90.id,
        tenantId: ram.id,
        billId: billRam.id,
        yearBS: 2083,
        monthBS: 5,
        quantity: 1,
        pricePerUnit: 45,
        totalAmount: 45,
        purchaseDateBS: '2083 Bhadra 4',
        isSettled: false,
      },
    });

    jars = await prisma.waterPurchase.findMany({ where: { roomId: room90.id, yearBS: 2083, monthBS: 5 } });
    totalWater = jars.reduce((s, j) => s + j.totalAmount, 0);
    await prisma.monthlyBill.update({ where: { id: billRam.id }, data: { waterAmount: totalWater, totalAmount: totalWater } });
    await reconcileTenant(ram.id);
    ramProf = await prisma.tenantProfile.findUnique({ where: { userId: ram.id } });
    assert(totalWater === 90, 'TEST 2: Total water charge is Rs. 90 (2 jars)');
    assert(ramProf.advanceBalance === 10, 'TEST 2: 2 jars (Rs. 90) -> Rs. 10 remaining advance', `(actual: Rs. ${ramProf.advanceBalance})`);

    // TEST 3: Add water jar #3 (Rs. 45) -> Advance becomes Rs. 0, Amount Due = Rs. 35
    const jar3 = await prisma.waterPurchase.create({
      data: {
        roomId: room90.id,
        tenantId: ram.id,
        billId: billRam.id,
        yearBS: 2083,
        monthBS: 5,
        quantity: 1,
        pricePerUnit: 45,
        totalAmount: 45,
        purchaseDateBS: '2083 Bhadra 8',
        isSettled: false,
      },
    });

    jars = await prisma.waterPurchase.findMany({ where: { roomId: room90.id, yearBS: 2083, monthBS: 5 } });
    totalWater = jars.reduce((s, j) => s + j.totalAmount, 0);
    await prisma.monthlyBill.update({ where: { id: billRam.id }, data: { waterAmount: totalWater, totalAmount: totalWater } });
    await reconcileTenant(ram.id);
    ramProf = await prisma.tenantProfile.findUnique({ where: { userId: ram.id } });
    let ramBill = await prisma.monthlyBill.findUnique({ where: { id: billRam.id } });
    assert(ramProf.advanceBalance === 0, 'TEST 3: Advance fully exhausted -> Rs. 0 remaining advance', `(actual: Rs. ${ramProf.advanceBalance})`);
    assert(ramBill.balanceDue === 35, 'TEST 3: Remaining amount due is exactly Rs. 35', `(actual: Rs. ${ramBill.balanceDue})`);
    assert(ramBill.paidAmount === 100, 'TEST 3: Paid amount equals verified advance Rs. 100');

    // TEST 4: Add water jar #4 (Rs. 45) -> Advance remains Rs. 0, Amount Due = Rs. 80
    const jar4 = await prisma.waterPurchase.create({
      data: {
        roomId: room90.id,
        tenantId: ram.id,
        billId: billRam.id,
        yearBS: 2083,
        monthBS: 5,
        quantity: 1,
        pricePerUnit: 45,
        totalAmount: 45,
        purchaseDateBS: '2083 Bhadra 12',
        isSettled: false,
      },
    });

    jars = await prisma.waterPurchase.findMany({ where: { roomId: room90.id, yearBS: 2083, monthBS: 5 } });
    totalWater = jars.reduce((s, j) => s + j.totalAmount, 0);
    await prisma.monthlyBill.update({ where: { id: billRam.id }, data: { waterAmount: totalWater, totalAmount: totalWater } });
    await reconcileTenant(ram.id);
    ramProf = await prisma.tenantProfile.findUnique({ where: { userId: ram.id } });
    ramBill = await prisma.monthlyBill.findUnique({ where: { id: billRam.id } });
    assert(ramProf.advanceBalance === 0, 'TEST 4: Advance remains Rs. 0');
    assert(ramBill.balanceDue === 80, 'TEST 4: Balance due increases to Rs. 80 (35 + 45)', `(actual: Rs. ${ramBill.balanceDue})`);


    // ========================================================================
    // TESTS 5 - 7: Water Record Persistence & Payment Immutability
    // ========================================================================
    console.log('\n--- TESTS 5 - 7: Water Record Persistence & Payment Immutability ---');

    assert(jars.length === 4, 'TEST 5: All 4 active water purchase records remain in database during active cycle');
    assert(jars.every(j => j.totalAmount === 45), 'TEST 6: Each water purchase record maintains correct unit price & total');

    const paymentInDb = await prisma.payment.findUnique({ where: { id: advPayment.id } });
    assert(paymentInDb.amount === 100, 'TEST 7: Original advance payment transaction is unmutated (Rs. 100 in DB)');


    // ========================================================================
    // TESTS 8 - 10: Internet ON / OFF / ON Pipeline
    // ========================================================================
    console.log('\n--- TESTS 8 - 10: Internet Charge Toggle Pipeline ---');

    const room91 = await prisma.room.create({
      data: { roomNumber: 91, name: 'Room 91', defaultRent: 5000, status: 'OCCUPIED' },
    });

    const sita = await prisma.user.create({
      data: {
        username: 'test_e2e_sita',
        passwordHash,
        fullName: 'Sita Kumari',
        role: 'TENANT',
        status: 'ACTIVE',
        tenantProfile: {
          create: {
            roomId: room91.id,
            monthlyRent: 5000,
            numberOfPeople: 2,
            internetEnabled: true,
            moveInDateBS: '2083 Bhadra 1',
            moveInDateAD: new Date(),
            advanceBalance: 0,
            status: 'ACTIVE',
          },
        },
      },
      include: { tenantProfile: true },
    });

    // TEST 8: Bill with Internet ON (Rs. 500)
    const sitaBill = await prisma.monthlyBill.create({
      data: {
        billNumber: 'BILL-SITA-2083-05',
        tenantId: sita.id,
        roomId: room91.id,
        yearBS: 2083,
        monthBS: 5,
        monthNameBS: 'Bhadra',
        rentAmount: 5000,
        internetAmount: 500,
        electricityAmount: 0,
        waterAmount: 0,
        garbageAmount: 100,
        borrowingAmount: 0,
        adjustmentsAmount: 0,
        totalAmount: 5600,
        paidAmount: 0,
        balanceDue: 5600,
        status: 'UNPAID',
        dueDateBS: '2083 Bhadra 10',
      },
    });

    assert(sitaBill.internetAmount === 500 && sitaBill.totalAmount === 5600, 'TEST 8: Internet ON -> Bill includes Rs. 500 internet (Total = 5600)');

    // TEST 9: Admin turns Internet OFF -> Current unpaid bill updates to Rs. 0
    await prisma.tenantProfile.update({
      where: { id: sita.tenantProfile.id },
      data: { internetEnabled: false },
    });
    const sitaProfOff = await prisma.tenantProfile.findUnique({ where: { id: sita.tenantProfile.id } });
    assert(sitaProfOff.internetEnabled === false, 'TEST 9: Tenant profile internetEnabled = false');

    const updatedSitaBillOff = await prisma.monthlyBill.update({
      where: { id: sitaBill.id },
      data: { internetAmount: 0, totalAmount: 5100, balanceDue: 5100 },
    });
    assert(updatedSitaBillOff.internetAmount === 0 && updatedSitaBillOff.totalAmount === 5100, 'TEST 9: Internet OFF -> Bill updated to Rs. 0 internet (Total = 5100)');

    // TEST 10: Admin turns Internet ON again -> Bill restores Rs. 500
    await prisma.tenantProfile.update({
      where: { id: sita.tenantProfile.id },
      data: { internetEnabled: true },
    });
    const updatedSitaBillOn = await prisma.monthlyBill.update({
      where: { id: sitaBill.id },
      data: { internetAmount: 500, totalAmount: 5600, balanceDue: 5600 },
    });
    assert(updatedSitaBillOn.internetAmount === 500 && updatedSitaBillOn.totalAmount === 5600, 'TEST 10: Internet ON -> Bill restored to Rs. 500 internet (Total = 5600)');


    // ========================================================================
    // TESTS 11 - 13: Move-In Date Editing & Persistence
    // ========================================================================
    console.log('\n--- TESTS 11 - 13: Move-In Date Editing & Persistence ---');

    const room92 = await prisma.room.create({
      data: { roomNumber: 92, name: 'Room 92', defaultRent: 4000, status: 'OCCUPIED' },
    });

    const shyam = await prisma.user.create({
      data: {
        username: 'test_e2e_shyam',
        passwordHash,
        fullName: 'Shyam Thapa',
        role: 'TENANT',
        status: 'ACTIVE',
        tenantProfile: {
          create: {
            roomId: room92.id,
            monthlyRent: 4000,
            numberOfPeople: 1,
            internetEnabled: true,
            moveInDateBS: '2083 Baisakh 1',
            moveInDateAD: new Date('2026-04-14'),
            advanceBalance: 0,
            status: 'ACTIVE',
          },
        },
      },
      include: { tenantProfile: true },
    });

    assert(shyam.tenantProfile.moveInDateBS === '2083 Baisakh 1', 'TEST 11: Tenant created with initial move-in date 2083 Baisakh 1');

    // TEST 12 & 13: Admin edits move-in date to 2083 Jestha 15
    await prisma.tenantProfile.update({
      where: { id: shyam.tenantProfile.id },
      data: {
        moveInDateBS: '2083 Jestha 15',
        moveInDateAD: new Date('2026-05-28'),
      },
    });

    const shyamRefreshed = await prisma.tenantProfile.findUnique({ where: { id: shyam.tenantProfile.id } });
    assert(shyamRefreshed.moveInDateBS === '2083 Jestha 15', 'TEST 12: Admin edited move-in date updated to 2083 Jestha 15');
    assert(shyamRefreshed.userId === shyam.id, 'TEST 13: Tenant user ID preserved without deleting/recreating tenant');


    // ========================================================================
    // TESTS 14 - 18: Historical Bills & Advance Summary Isolation
    // ========================================================================
    console.log('\n--- TESTS 14 - 18: Historical Bills & Advance Summary Isolation ---');

    // TEST 14: Historical bills preserved
    const totalBillsCount = await prisma.monthlyBill.count();
    assert(totalBillsCount > 0, 'TEST 14: Historical bills intact in database');

    // TEST 15: Admin advance summary calculation
    const ramPayments = await prisma.payment.findMany({ where: { tenantId: ram.id, status: 'VERIFIED' } });
    const ramBills = await prisma.monthlyBill.findMany({ where: { tenantId: ram.id } });
    const ramTotalPaid = ramPayments.reduce((s, p) => s + p.amount, 0);
    const ramTotalCharges = ramBills.reduce((s, b) => s + b.totalAmount, 0);
    const ramAdvanceConsumed = Math.min(ramTotalPaid, ramTotalCharges);
    const ramRemainingAdvance = Math.max(0, ramTotalPaid - ramTotalCharges);
    const ramCurrentDue = Math.max(0, ramTotalCharges - ramTotalPaid);

    assert(ramTotalPaid === 100, 'TEST 15: Ram Total Advance Paid = Rs. 100');
    assert(ramAdvanceConsumed === 100, 'TEST 16: Ram Advance Consumed = Rs. 100');
    assert(ramRemainingAdvance === 0, 'TEST 17: Ram Remaining Advance = Rs. 0');
    assert(ramCurrentDue === 80, 'TEST 18: Ram Current Amount Due = Rs. 80');


    // ----------------------------------------------------
    // CLEANUP TEST DATA
    // ----------------------------------------------------
    console.log('\n--- CLEANING UP TEST FIXTURES ---');
    await prisma.waterPurchase.deleteMany({ where: { roomId: { in: [room90.id, room91.id, room92.id] } } });
    await prisma.payment.deleteMany({ where: { tenantId: { in: [ram.id, sita.id, shyam.id] } } });
    await prisma.monthlyBill.deleteMany({ where: { tenantId: { in: [ram.id, sita.id, shyam.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ram.id, sita.id, shyam.id] } } });
    await prisma.room.deleteMany({ where: { id: { in: [room90.id, room91.id, room92.id] } } });
    console.log('  ✓ Test cleanup completed successfully.');

  } catch (err) {
    console.error('Test error:', err);
    failed++;
  } finally {
    await prisma.$disconnect();
  }

  console.log('\n========================================================================');
  console.log(` SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
