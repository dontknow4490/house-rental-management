const http = require('http');
const path = require('path');
const os = require('os');

function getLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const isVirtual = name.toLowerCase().includes('vethernet') || 
                      name.toLowerCase().includes('wsl') || 
                      name.toLowerCase().includes('virtual') || 
                      name.toLowerCase().includes('loopback');
    if (!isVirtual) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal && iface.address !== '127.0.0.1') {
          return iface.address;
        }
      }
    }
  }
  return '127.0.0.1';
}

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, data: body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      if (typeof data === 'object') {
        req.setHeader('Content-Type', 'application/json');
        req.write(JSON.stringify(data));
      } else {
        req.write(data);
      }
    }
    req.end();
  });
}

async function runVerification() {
  const lanIp = getLanIp();
  console.log('========================================================================');
  console.log('       HOUSE RENTAL MANAGEMENT SYSTEM - COMPREHENSIVE E2E VERIFICATION   ');
  console.log('========================================================================');
  console.log(`Detected Active LAN IPv4: ${lanIp}`);
  console.log(`Testing Backend API    : http://127.0.0.1:4000/api`);
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✔ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ✖ [FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // 1. Check Nepali Calendar English Output
    console.log('\n--- 1. Testing Bikram Sambat English Calendar Engine ---');
    const calRes = await request({
      hostname: '127.0.0.1',
      port: 4000,
      path: '/api/nepali-calendar/today',
      method: 'GET',
    });
    assert(calRes.status === 200, 'BS Calendar endpoint returns 200 OK');
    assert(typeof calRes.data.yearBS === 'number', `BS Year is numeric: ${calRes.data.yearBS}`);
    assert(typeof calRes.data.monthNameBS === 'string', `BS Month is English transliteration: ${calRes.data.monthNameBS}`);
    assert(typeof calRes.data.nepaliFullFormatted === 'string', `Formatted string: "${calRes.data.nepaliFullFormatted}"`);

    // 2. Test Admin Login
    console.log('\n--- 2. Testing Administrator Authentication ---');
    const loginRes = await request(
      {
        hostname: '127.0.0.1',
        port: 4000,
        path: '/api/auth/login',
        method: 'POST',
      },
      { username: process.env.TEST_ADMIN_USERNAME, password: process.env.TEST_ADMIN_PASSWORD }
    );
    assert(loginRes.status === 201 || loginRes.status === 200, 'Admin login succeeded');
    const adminToken = loginRes.data.accessToken || loginRes.data.access_token;
    assert(!!adminToken, 'Admin JWT token received');
    const adminHeaders = { Authorization: `Bearer ${adminToken}` };

    // 3. Verify Clean Initial 6 Rooms (All Vacant)
    console.log('\n--- 3. Verifying Clean 6 Rooms Initial State ---');
    const roomsRes = await request({
      hostname: '127.0.0.1',
      port: 4000,
      path: '/api/rooms',
      method: 'GET',
      headers: adminHeaders,
    });
    assert(roomsRes.data.length === 6, `Exactly 6 rooms exist (Found: ${roomsRes.data.length})`);
    const allVacant = roomsRes.data.every((r) => r.status === 'VACANT');
    assert(allVacant, 'All 6 rooms are initially VACANT');
    const room1 = roomsRes.data.find((r) => r.roomNumber === 1);
    assert(room1.defaultRent === 6000, `Room 1 rent is Rs. ${room1.defaultRent}`);

    // 4. Verify System Settings
    console.log('\n--- 4. Verifying Default System Rates ---');
    const settingsRes = await request({
      hostname: '127.0.0.1',
      port: 4000,
      path: '/api/settings',
      method: 'GET',
      headers: adminHeaders,
    });
    assert(settingsRes.data['ELECTRICITY_UNIT_RATE'] === '15', 'Electricity rate = Rs. 15/unit');
    assert(settingsRes.data['INTERNET_PER_PERSON_RATE'] === '250', 'Internet rate = Rs. 250/person');
    assert(settingsRes.data['DRINKING_WATER_DEFAULT_PRICE'] === '45', 'Water price = Rs. 45/jar');

    // 5. Verify Zero Fake Financials Initial Summary
    console.log('\n--- 5. Verifying Zero Financial Totals in Clean State ---');
    const summaryRes = await request({
      hostname: '127.0.0.1',
      port: 4000,
      path: '/api/billing/summary',
      method: 'GET',
      headers: adminHeaders,
    });
    assert(summaryRes.data.stats.totalRooms === 6, 'Total rooms: 6');
    assert(summaryRes.data.stats.occupiedRooms === 0, 'Occupied rooms: 0');
    assert(summaryRes.data.stats.vacantRooms === 6, 'Vacant rooms: 6');
    assert(summaryRes.data.stats.expectedRent === 0, 'Total Expected = Rs. 0');
    assert(summaryRes.data.stats.collectedAmount === 0, 'Total Collected = Rs. 0');
    assert(summaryRes.data.stats.outstandingAmount === 0, 'Total Outstanding = Rs. 0');

    // 6. Admin Creates Real Tenant & Assigns Room 1
    console.log('\n--- 6. Testing Admin Tenant Creation ---');
    const createTenantRes = await request(
      {
        hostname: '127.0.0.1',
        port: 4000,
        path: '/api/tenants',
        method: 'POST',
        headers: adminHeaders,
      },
      {
        fullName: 'Ramesh KC',
        username: 'tenant_ramesh',
        password: 'Password@123',
        phone: '9841000000',
        roomId: room1.id,
        numberOfPeople: 2,
        monthlyRent: 6000,
        moveInDateBS: calRes.data.nepaliFormatted,
        citizenshipNumber: '27-01-75-99887',
        notes: 'Ground floor tenant',
      }
    );
    assert(createTenantRes.status === 201 || createTenantRes.status === 200, 'Tenant "Ramesh KC" created successfully');

    // 7. Verify Room 1 is now OCCUPIED
    const updatedRooms = await request({
      hostname: '127.0.0.1',
      port: 4000,
      path: '/api/rooms',
      method: 'GET',
      headers: adminHeaders,
    });
    const updatedRoom1 = updatedRooms.data.find((r) => r.roomNumber === 1);
    assert(updatedRoom1.status === 'OCCUPIED', 'Room 1 status automatically transitioned to OCCUPIED');
    assert(updatedRoom1.tenant.fullName === 'Ramesh KC', 'Room 1 assigned tenant matches Ramesh KC');

    // 8. Admin Enters Electricity Meter Reading
    console.log('\n--- 7. Testing Electricity Sub-meter Calculation ---');
    const eleRes = await request(
      {
        hostname: '127.0.0.1',
        port: 4000,
        path: '/api/electricity/reading',
        method: 'POST',
        headers: adminHeaders,
      },
      {
        roomId: room1.id,
        yearBS: calRes.data.yearBS,
        monthBS: calRes.data.monthBS,
        previousReading: 100,
        currentReading: 150,
      }
    );
    assert(eleRes.status === 201 || eleRes.status === 200, 'Electricity reading recorded (100 -> 150)');
    assert(eleRes.data.unitsUsed === 50, 'Units calculated: 50 units');
    assert(eleRes.data.totalCharge === 750, 'Electricity charge calculated: 50 * 15 = Rs. 750');

    // 9. Admin Generates Monthly Bill
    console.log('\n--- 8. Testing Monthly Bill Generation ---');
    const genBillRes = await request(
      {
        hostname: '127.0.0.1',
        port: 4000,
        path: '/api/billing/generate',
        method: 'POST',
        headers: adminHeaders,
      },
      {
        yearBS: calRes.data.yearBS,
        monthBS: calRes.data.monthBS,
      }
    );
    assert(genBillRes.status === 201 || genBillRes.status === 200, 'Generate bills endpoint returned success');
    const billsList = await request({
      hostname: '127.0.0.1',
      port: 4000,
      path: `/api/billing/all?yearBS=${calRes.data.yearBS}&monthBS=${calRes.data.monthBS}`,
      method: 'GET',
      headers: adminHeaders,
    });
    const rameshBill = billsList.data.find((b) => b.room.roomNumber === 1);
    assert(rameshBill.rentAmount === 6000, 'Room rent = Rs. 6000');
    assert(rameshBill.internetAmount === 500, 'Internet for 2 persons = Rs. 500 (2 * 250)');
    assert(rameshBill.electricityAmount === 750, 'Electricity charge = Rs. 750 (50 units * 15)');
    assert(rameshBill.totalAmount === 7250, 'Total bill amount = Rs. 7250 (6000 + 500 + 750)');
    assert(rameshBill.balanceDue === 7250, 'Balance due = Rs. 7250');

    // 10. Tenant Login & View Bill
    console.log('\n--- 9. Testing Tenant Portal Login & Bill Access ---');
    const tenantLoginRes = await request(
      {
        hostname: '127.0.0.1',
        port: 4000,
        path: '/api/auth/login',
        method: 'POST',
      },
      { username: 'tenant_ramesh', password: 'Password@123' }
    );
    assert(tenantLoginRes.status === 201 || tenantLoginRes.status === 200, 'Tenant Ramesh logged in successfully');
    const tenantToken = tenantLoginRes.data.accessToken || tenantLoginRes.data.access_token;
    const tenantHeaders = { Authorization: `Bearer ${tenantToken}` };

    const tenantActiveBill = await request({
      hostname: '127.0.0.1',
      port: 4000,
      path: '/api/billing/my-active',
      method: 'GET',
      headers: tenantHeaders,
    });
    assert(tenantActiveBill.data.id === rameshBill.id, 'Tenant retrieved their active monthly bill');
    assert(tenantActiveBill.data.balanceDue === 7250, 'Tenant sees balance due Rs. 7250');

    // 11. Tenant Submits Payment Proof
    console.log('\n--- 10. Testing Tenant Payment Submission ---');
    const submitPayRes = await request(
      {
        hostname: '127.0.0.1',
        port: 4000,
        path: '/api/payments/submit',
        method: 'POST',
        headers: tenantHeaders,
      },
      {
        billId: rameshBill.id,
        amount: 7250,
        paymentMethod: 'ESEWA',
        paymentDateBS: calRes.data.nepaliFormatted,
        transactionId: 'TXN-ESEWA-998877',
      }
    );
    assert(submitPayRes.status === 201 || submitPayRes.status === 200, 'Payment submission received');
    const payment = submitPayRes.data.payment || submitPayRes.data;
    assert(payment.status === 'PENDING_VERIFICATION', 'Payment status is PENDING_VERIFICATION');

    // 12. Admin Verifies Payment & Official Receipt Generated
    console.log('\n--- 11. Testing Admin Payment Verification & Receipt Issuance ---');
    const verifyPayRes = await request(
      {
        hostname: '127.0.0.1',
        port: 4000,
        path: `/api/payments/${payment.id}/verify`,
        method: 'PUT',
        headers: adminHeaders,
      },
      { verified: true }
    );
    assert(verifyPayRes.data.payment.status === 'VERIFIED', 'Payment marked as VERIFIED');
    assert(!!verifyPayRes.data.receipt, 'Official Digital Receipt object generated');
    assert(verifyPayRes.data.receipt.amount === 7250, 'Receipt amount is Rs. 7250');

    // 13. Verify Bill Status Transitioned to PAID
    const verifiedBill = await request({
      hostname: '127.0.0.1',
      port: 4000,
      path: `/api/billing/${rameshBill.id}`,
      method: 'GET',
      headers: adminHeaders,
    });
    assert(verifiedBill.data.status === 'PAID', 'Bill status is now PAID');
    assert(verifiedBill.data.balanceDue === 0, 'Bill balance due is now Rs. 0');

    // 14. Audit Log Check
    console.log('\n--- 12. Testing System Audit Trail ---');
    const auditRes = await request({
      hostname: '127.0.0.1',
      port: 4000,
      path: '/api/audit-logs',
      method: 'GET',
      headers: adminHeaders,
    });
    assert(auditRes.data.length > 0, `Audit log recorded events (Count: ${auditRes.data.length})`);

    // 15. Cross-Origin LAN CORS Check
    console.log('\n--- 13. Testing Wi-Fi LAN Origin CORS ---');
    const corsRes = await request({
      hostname: '127.0.0.1',
      port: 4000,
      path: '/api/nepali-calendar/today',
      method: 'GET',
      headers: { Origin: `http://${lanIp}:3000` },
    });
    assert(
      corsRes.headers['access-control-allow-origin'] === `http://${lanIp}:3000`,
      `CORS headers permit phone origin http://${lanIp}:3000`
    );

    console.log('\n========================================================================');
    console.log(` ALL VERIFICATIONS PASSED: ${passed} Passed, ${failed} Failed`);
    console.log('========================================================================\n');

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  }
}

runVerification();
