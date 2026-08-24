const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const bcrypt = require('../backend/node_modules/bcryptjs');
const prisma = new PrismaClient();

async function runFinancialTests() {
  console.log('========================================================================');
  console.log(' COMPREHENSIVE FINANCIAL, WATER & ADVANCE ACCOUNTING VERIFICATION SUITE');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, title, details = '') {
    if (condition) {
      console.log(`  ✓ [PASS] ${title} ${details}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${title} ${details}`);
      failed++;
    }
  }

  // Helper to reconcile bills and advance
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
    // ------------------------------------------------------------------------
    // SETUP: Create a dedicated test room and tenant for accounting testing
    // ------------------------------------------------------------------------
    console.log('--- SETUP: Initializing Test Tenant & Room ---');

    // Clean up any previous test artifacts
    await prisma.waterPurchase.deleteMany({
      where: { room: { roomNumber: 88 } },
    });
    await prisma.payment.deleteMany({
      where: { tenant: { username: 'test_accounting_tenant' } },
    });
    await prisma.monthlyBill.deleteMany({
      where: { tenant: { username: 'test_accounting_tenant' } },
    });
    await prisma.user.deleteMany({
      where: { username: { in: ['test_accounting_tenant', 'test_net_tenant'] } },
    });
    await prisma.room.deleteMany({
      where: { roomNumber: { in: [88, 89] } },
    });

    const testRoom = await prisma.room.create({
      data: {
        roomNumber: 88,
        name: 'Financial Test Room 88',
        defaultRent: 0, // Rent 0 for isolated water & advance math testing
        status: 'OCCUPIED',
      },
    });

    const passwordHash = await bcrypt.hash('Test@123', 10);
    const tenantUser = await prisma.user.create({
      data: {
        username: 'test_accounting_tenant',
        passwordHash,
        fullName: 'Ram Bahadur',
        role: 'TENANT',
        status: 'ACTIVE',
        tenantProfile: {
          create: {
            roomId: testRoom.id,
            monthlyRent: 0,
            numberOfPeople: 1,
            internetEnabled: false,
            moveInDateBS: '2083 Bhadra 1',
            moveInDateAD: new Date(),
            status: 'ACTIVE',
            advanceBalance: 0,
          },
        },
      },
      include: { tenantProfile: true },
    });

    // Create an initial monthly bill for 2083 Bhadra
    const bill = await prisma.monthlyBill.create({
      data: {
        billNumber: 'BILL-TEST-88-2083-05',
        tenantId: tenantUser.id,
        roomId: testRoom.id,
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
    const advancePayment = await prisma.payment.create({
      data: {
        billId: bill.id,
        tenantId: tenantUser.id,
        amount: 100,
        paymentMethod: 'ESEWA',
        transactionId: 'TXN-ADV-100',
        paymentDateBS: '2083 Bhadra 1',
        paymentDateAD: new Date(),
        status: 'VERIFIED',
        receiptNumber: 'REC-ADV-100',
      },
    });

    await reconcileTenant(tenantUser.id);
    let prof = await prisma.tenantProfile.findUnique({ where: { userId: tenantUser.id } });
    assert(prof.advanceBalance === 100, 'Initial advance balance is exactly Rs. 100');


    // ------------------------------------------------------------------------
    // STEP 1: Add Water Jar #1 (Rs. 45)
    // ------------------------------------------------------------------------
    console.log('\n--- STEP 1: Adding Water Purchase #1 (Rs. 45) ---');
    const water1 = await prisma.waterPurchase.create({
      data: {
        roomId: testRoom.id,
        tenantId: tenantUser.id,
        billId: bill.id,
        yearBS: 2083,
        monthBS: 5,
        quantity: 1,
        pricePerUnit: 45,
        totalAmount: 45,
        purchaseDateBS: '2083 Bhadra 2',
        isSettled: false,
      },
    });

    // Update bill totalAmount for month 2083 Bhadra
    const allWaterMonth1 = await prisma.waterPurchase.findMany({
      where: { roomId: testRoom.id, yearBS: 2083, monthBS: 5 },
    });
    const waterTotal1 = allWaterMonth1.reduce((sum, w) => sum + w.totalAmount, 0);
    await prisma.monthlyBill.update({
      where: { id: bill.id },
      data: { waterAmount: waterTotal1, totalAmount: waterTotal1 },
    });

    await reconcileTenant(tenantUser.id);
    prof = await prisma.tenantProfile.findUnique({ where: { userId: tenantUser.id } });
    let updatedBill = await prisma.monthlyBill.findUnique({ where: { id: bill.id } });

    assert(waterTotal1 === 45, 'Total water charge is Rs. 45 (1 jar)');
    assert(prof.advanceBalance === 55, 'Remaining advance is exactly Rs. 55 (100 - 45)', `(actual: Rs. ${prof.advanceBalance})`);
    assert(updatedBill.balanceDue === 0, 'Bill balance due is Rs. 0');
    assert(updatedBill.status === 'PAID', 'Bill status is PAID');


    // ------------------------------------------------------------------------
    // STEP 2: Add Water Jar #2 (Rs. 45)
    // ------------------------------------------------------------------------
    console.log('\n--- STEP 2: Adding Water Purchase #2 (Rs. 45) ---');
    const water2 = await prisma.waterPurchase.create({
      data: {
        roomId: testRoom.id,
        tenantId: tenantUser.id,
        billId: bill.id,
        yearBS: 2083,
        monthBS: 5,
        quantity: 1,
        pricePerUnit: 45,
        totalAmount: 45,
        purchaseDateBS: '2083 Bhadra 5',
        isSettled: false,
      },
    });

    const allWaterMonth2 = await prisma.waterPurchase.findMany({
      where: { roomId: testRoom.id, yearBS: 2083, monthBS: 5 },
    });
    const waterTotal2 = allWaterMonth2.reduce((sum, w) => sum + w.totalAmount, 0);
    await prisma.monthlyBill.update({
      where: { id: bill.id },
      data: { waterAmount: waterTotal2, totalAmount: waterTotal2 },
    });

    await reconcileTenant(tenantUser.id);
    prof = await prisma.tenantProfile.findUnique({ where: { userId: tenantUser.id } });
    updatedBill = await prisma.monthlyBill.findUnique({ where: { id: bill.id } });

    assert(allWaterMonth2.length === 2, 'Both water records (Jar 1 and Jar 2) exist in database');
    assert(waterTotal2 === 90, 'Total water charge is Rs. 90 (2 jars)');
    assert(prof.advanceBalance === 10, 'Remaining advance is exactly Rs. 10 (100 - 90)', `(actual: Rs. ${prof.advanceBalance})`);
    assert(updatedBill.balanceDue === 0, 'Bill balance due is Rs. 0');
    assert(updatedBill.status === 'PAID', 'Bill status is PAID');


    // ------------------------------------------------------------------------
    // STEP 3: Add Water Jar #3 (Rs. 45) - Advance Exhausted, Creates Rs. 35 Due
    // ------------------------------------------------------------------------
    console.log('\n--- STEP 3: Adding Water Purchase #3 (Rs. 45) - Advance Exhaustion ---');
    const water3 = await prisma.waterPurchase.create({
      data: {
        roomId: testRoom.id,
        tenantId: tenantUser.id,
        billId: bill.id,
        yearBS: 2083,
        monthBS: 5,
        quantity: 1,
        pricePerUnit: 45,
        totalAmount: 45,
        purchaseDateBS: '2083 Bhadra 10',
        isSettled: false,
      },
    });

    const allWaterMonth3 = await prisma.waterPurchase.findMany({
      where: { roomId: testRoom.id, yearBS: 2083, monthBS: 5 },
    });
    const waterTotal3 = allWaterMonth3.reduce((sum, w) => sum + w.totalAmount, 0);
    await prisma.monthlyBill.update({
      where: { id: bill.id },
      data: { waterAmount: waterTotal3, totalAmount: waterTotal3 },
    });

    await reconcileTenant(tenantUser.id);
    prof = await prisma.tenantProfile.findUnique({ where: { userId: tenantUser.id } });
    updatedBill = await prisma.monthlyBill.findUnique({ where: { id: bill.id } });

    assert(allWaterMonth3.length === 3, 'All 3 water records exist in database');
    assert(waterTotal3 === 135, 'Total water charge is Rs. 135 (3 jars)');
    assert(prof.advanceBalance === 0, 'Remaining advance is exactly Rs. 0 (exhausted)', `(actual: Rs. ${prof.advanceBalance})`);
    assert(updatedBill.paidAmount === 100, 'Bill paid amount equals total verified advance (Rs. 100)');
    assert(updatedBill.balanceDue === 35, 'Bill balance due is exactly Rs. 35 (135 - 100)', `(actual: Rs. ${updatedBill.balanceDue})`);
    assert(updatedBill.status === 'PARTIALLY_PAID', 'Bill status is PARTIALLY_PAID');


    // ------------------------------------------------------------------------
    // STEP 4: Add Water Jar #4 (Rs. 45) - Amount Due Increases to Rs. 80
    // ------------------------------------------------------------------------
    console.log('\n--- STEP 4: Adding Water Purchase #4 (Rs. 45) - Additional Payable ---');
    const water4 = await prisma.waterPurchase.create({
      data: {
        roomId: testRoom.id,
        tenantId: tenantUser.id,
        billId: bill.id,
        yearBS: 2083,
        monthBS: 5,
        quantity: 1,
        pricePerUnit: 45,
        totalAmount: 45,
        purchaseDateBS: '2083 Bhadra 15',
        isSettled: false,
      },
    });

    const allWaterMonth4 = await prisma.waterPurchase.findMany({
      where: { roomId: testRoom.id, yearBS: 2083, monthBS: 5 },
    });
    const waterTotal4 = allWaterMonth4.reduce((sum, w) => sum + w.totalAmount, 0);
    await prisma.monthlyBill.update({
      where: { id: bill.id },
      data: { waterAmount: waterTotal4, totalAmount: waterTotal4 },
    });

    await reconcileTenant(tenantUser.id);
    prof = await prisma.tenantProfile.findUnique({ where: { userId: tenantUser.id } });
    updatedBill = await prisma.monthlyBill.findUnique({ where: { id: bill.id } });

    assert(allWaterMonth4.length === 4, 'All 4 water records exist in database');
    assert(waterTotal4 === 180, 'Total water charge is Rs. 180 (4 jars)');
    assert(prof.advanceBalance === 0, 'Remaining advance remains Rs. 0');
    assert(updatedBill.paidAmount === 100, 'Bill paid amount remains Rs. 100');
    assert(updatedBill.balanceDue === 80, 'Bill balance due is exactly Rs. 80 (180 - 100)', `(actual: Rs. ${updatedBill.balanceDue})`);


    // ------------------------------------------------------------------------
    // STEP 5: Verify Payment Transaction Immutability
    // ------------------------------------------------------------------------
    console.log('\n--- STEP 5: Payment Record Immutability ---');
    const originalPayment = await prisma.payment.findUnique({
      where: { id: advancePayment.id },
    });
    assert(originalPayment.amount === 100, 'Original advance payment transaction amount is unmutated (Rs. 100)');
    assert(originalPayment.status === 'VERIFIED', 'Original payment status is VERIFIED');


    // ------------------------------------------------------------------------
    // STEP 6: Internet Charge Toggle Pipeline
    // ------------------------------------------------------------------------
    console.log('\n--- STEP 6: Internet Charge Toggle Pipeline ---');
    const netRoom = await prisma.room.create({
      data: {
        roomNumber: 89,
        name: 'Internet Test Room 89',
        defaultRent: 5000,
        status: 'OCCUPIED',
      },
    });

    const netTenant = await prisma.user.create({
      data: {
        username: 'test_net_tenant',
        passwordHash,
        fullName: 'Sita Sharma',
        role: 'TENANT',
        status: 'ACTIVE',
        tenantProfile: {
          create: {
            roomId: netRoom.id,
            monthlyRent: 5000,
            numberOfPeople: 2,
            internetEnabled: true,
            moveInDateBS: '2083 Bhadra 1',
            moveInDateAD: new Date(),
            status: 'ACTIVE',
            advanceBalance: 0,
          },
        },
      },
      include: { tenantProfile: true },
    });

    // 1. Initial bill with Internet ON
    const ratePerPerson = 250;
    const internetOnAmount = netTenant.tenantProfile.internetEnabled ? (netTenant.tenantProfile.numberOfPeople * ratePerPerson) : 0;
    assert(internetOnAmount === 500, 'Internet charge is Rs. 500 (2 people * 250) when internetEnabled is true');

    const netBill = await prisma.monthlyBill.create({
      data: {
        billNumber: 'BILL-TEST-89-2083-05',
        tenantId: netTenant.id,
        roomId: netRoom.id,
        yearBS: 2083,
        monthBS: 5,
        monthNameBS: 'Bhadra',
        rentAmount: 5000,
        internetAmount: internetOnAmount,
        electricityAmount: 0,
        waterAmount: 0,
        garbageAmount: 100,
        borrowingAmount: 0,
        adjustmentsAmount: 0,
        totalAmount: 5000 + internetOnAmount + 100,
        paidAmount: 0,
        balanceDue: 5000 + internetOnAmount + 100,
        status: 'UNPAID',
        dueDateBS: '2083 Bhadra 10',
      },
    });

    assert(netBill.totalAmount === 5600, 'Initial bill total is Rs. 5600 (5000 rent + 500 net + 100 garbage)');

    // 2. Admin turns Internet OFF
    await prisma.tenantProfile.update({
      where: { id: netTenant.tenantProfile.id },
      data: { internetEnabled: false },
    });

    const updatedProfileOff = await prisma.tenantProfile.findUnique({
      where: { id: netTenant.tenantProfile.id },
    });
    assert(updatedProfileOff.internetEnabled === false, 'Tenant profile updated to internetEnabled = false');

    // Simulate bill refresh for current unpaid bill
    const internetOffAmount = updatedProfileOff.internetEnabled ? (updatedProfileOff.numberOfPeople * ratePerPerson) : 0;
    const refreshedBillOff = await prisma.monthlyBill.update({
      where: { id: netBill.id },
      data: {
        internetAmount: internetOffAmount,
        totalAmount: 5000 + internetOffAmount + 100,
        balanceDue: 5000 + internetOffAmount + 100,
      },
    });

    assert(refreshedBillOff.internetAmount === 0, 'Current unpaid bill internet charge is updated to Rs. 0');
    assert(refreshedBillOff.totalAmount === 5100, 'Current bill total reduced to Rs. 5100 (5000 rent + 0 net + 100 garbage)');

    // 3. Admin turns Internet ON again
    await prisma.tenantProfile.update({
      where: { id: netTenant.tenantProfile.id },
      data: { internetEnabled: true },
    });
    const updatedProfileOn = await prisma.tenantProfile.findUnique({
      where: { id: netTenant.tenantProfile.id },
    });
    const internetReenabledAmount = updatedProfileOn.internetEnabled ? (updatedProfileOn.numberOfPeople * ratePerPerson) : 0;
    const refreshedBillOn = await prisma.monthlyBill.update({
      where: { id: netBill.id },
      data: {
        internetAmount: internetReenabledAmount,
        totalAmount: 5000 + internetReenabledAmount + 100,
        balanceDue: 5000 + internetReenabledAmount + 100,
      },
    });

    assert(refreshedBillOn.internetAmount === 500, 'Current bill internet charge restored to Rs. 500 when re-enabled');
    assert(refreshedBillOn.totalAmount === 5600, 'Current bill total restored to Rs. 5600');


    // ------------------------------------------------------------------------
    // STEP 7: Move-In Date Editing & Persistence
    // ------------------------------------------------------------------------
    console.log('\n--- STEP 7: Move-In Date Editing & Persistence ---');
    const updatedMoveIn = await prisma.tenantProfile.update({
      where: { id: netTenant.tenantProfile.id },
      data: {
        moveInDateBS: '2083 Jestha 15',
        moveInDateAD: new Date('2026-05-28'),
      },
    });

    const refreshedMoveIn = await prisma.tenantProfile.findUnique({
      where: { id: netTenant.tenantProfile.id },
    });
    assert(refreshedMoveIn.moveInDateBS === '2083 Jestha 15', 'Tenant move-in date (BS) correctly updated and persisted');


    // ------------------------------------------------------------------------
    // CLEANUP TEST FIXTURES
    // ------------------------------------------------------------------------
    console.log('\n--- CLEANING UP TEST FIXTURES ---');
    await prisma.waterPurchase.deleteMany({
      where: { roomId: { in: [testRoom.id, netRoom.id] } },
    });
    await prisma.payment.deleteMany({
      where: { tenantId: { in: [tenantUser.id, netTenant.id] } },
    });
    await prisma.monthlyBill.deleteMany({
      where: { tenantId: { in: [tenantUser.id, netTenant.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [tenantUser.id, netTenant.id] } },
    });
    await prisma.room.deleteMany({
      where: { id: { in: [testRoom.id, netRoom.id] } },
    });
    console.log('  ✓ Test cleanup completed successfully.');

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    await prisma.$disconnect();
  }

  console.log('\n========================================================================');
  console.log(` FINAL TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runFinancialTests();
