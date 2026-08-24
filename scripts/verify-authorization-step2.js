const http = require('http');
const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const bcrypt = require('../backend/node_modules/bcryptjs');

const prisma = new PrismaClient();
const BASE_URL = 'http://127.0.0.1:4000/api';

async function apiRequest(endpoint, method = 'GET', token = '', body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(`${BASE_URL}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`);
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method,
        headers,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(data);
          } catch {}
          resolve({
            status: res.statusCode,
            data: json || data,
          });
        });
      },
    );

    req.on('error', (err) => reject(err));
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runStep2AuthorizationTests() {
  console.log('========================================================================');
  console.log(' STEP 2 AUTHORIZATION & DATA ISOLATION REMEDIATION TEST SUITE');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(testName, condition, details = '') {
    if (condition) {
      console.log(`  ✓ [PASS] ${testName} ${details}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${testName} ${details}`);
      failed++;
    }
  }

  let testAdminUser = null;
  let testTenantUserA = null;
  let testTenantUserB = null;
  let roomA = null;
  let roomB = null;

  let adminToken = '';
  let tenantTokenA = '';
  let tenantTokenB = '';

  try {
    // 1. Setup temporary test users and rooms in DB
    console.log('--- Setting up test accounts and rooms ---');
    const passwordHash = await bcrypt.hash('TestPass@123', 10);

    // Get or create test rooms 88 and 89
    roomA = await prisma.room.upsert({
      where: { roomNumber: 88 },
      update: { status: 'OCCUPIED' },
      create: { roomNumber: 88, name: 'Test Room 88', defaultRent: 5000, status: 'OCCUPIED' },
    });

    roomB = await prisma.room.upsert({
      where: { roomNumber: 89 },
      update: { status: 'OCCUPIED' },
      create: { roomNumber: 89, name: 'Test Room 89', defaultRent: 5500, status: 'OCCUPIED' },
    });

    // Create Admin User
    testAdminUser = await prisma.user.upsert({
      where: { username: 'test_admin_auth' },
      update: { passwordHash, role: 'ADMIN', status: 'ACTIVE' },
      create: {
        username: 'test_admin_auth',
        passwordHash,
        fullName: 'Test Admin Security',
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });

    // Create Tenant A
    testTenantUserA = await prisma.user.upsert({
      where: { username: 'test_tenant_a' },
      update: { passwordHash, role: 'TENANT', status: 'ACTIVE' },
      create: {
        username: 'test_tenant_a',
        passwordHash,
        fullName: 'Test Tenant A',
        role: 'TENANT',
        status: 'ACTIVE',
      },
    });

    await prisma.tenantProfile.upsert({
      where: { userId: testTenantUserA.id },
      update: { roomId: roomA.id, status: 'ACTIVE' },
      create: {
        userId: testTenantUserA.id,
        roomId: roomA.id,
        monthlyRent: 5000,
        moveInDateBS: '2081-01-01',
        moveInDateAD: new Date(),
        status: 'ACTIVE',
      },
    });

    // Create Tenant B
    testTenantUserB = await prisma.user.upsert({
      where: { username: 'test_tenant_b' },
      update: { passwordHash, role: 'TENANT', status: 'ACTIVE' },
      create: {
        username: 'test_tenant_b',
        passwordHash,
        fullName: 'Test Tenant B',
        role: 'TENANT',
        status: 'ACTIVE',
      },
    });

    await prisma.tenantProfile.upsert({
      where: { userId: testTenantUserB.id },
      update: { roomId: roomB.id, status: 'ACTIVE' },
      create: {
        userId: testTenantUserB.id,
        roomId: roomB.id,
        monthlyRent: 5500,
        moveInDateBS: '2081-01-01',
        moveInDateAD: new Date(),
        status: 'ACTIVE',
      },
    });

    // Perform logins to obtain JWT tokens
    const adminLoginRes = await apiRequest('/auth/login', 'POST', '', {
      username: 'test_admin_auth',
      password: 'TestPass@123',
    });
    adminToken = adminLoginRes.data.accessToken;

    const tenantALoginRes = await apiRequest('/auth/login', 'POST', '', {
      username: 'test_tenant_a',
      password: 'TestPass@123',
    });
    tenantTokenA = tenantALoginRes.data.accessToken;

    const tenantBLoginRes = await apiRequest('/auth/login', 'POST', '', {
      username: 'test_tenant_b',
      password: 'TestPass@123',
    });
    tenantTokenB = tenantBLoginRes.data.accessToken;

    console.log('✔ Test tokens obtained successfully.\n');

    // ========================================================================
    // EXECUTE ALL REQUIRED TESTS 1 THROUGH 9
    // ========================================================================

    console.log('--- Executing Authorization Tests ---');

    // TEST 1: Unauthenticated user -> protected endpoint -> Expected: 401
    const t1_rooms = await apiRequest('/rooms');
    const t1_billing = await apiRequest('/billing/all');
    assert('TEST 1: Unauthenticated GET /api/rooms returns 401', t1_rooms.status === 401, `(HTTP ${t1_rooms.status})`);
    assert('TEST 1: Unauthenticated GET /api/billing/all returns 401', t1_billing.status === 401, `(HTTP ${t1_billing.status})`);

    // TEST 2: Tenant -> GET /api/rooms -> Expected: 403
    const t2 = await apiRequest('/rooms', 'GET', tenantTokenA);
    assert('TEST 2: Tenant GET /api/rooms returns 403 Forbidden', t2.status === 403, `(HTTP ${t2.status})`);

    // TEST 3: Tenant -> GET /api/rooms/:otherRoomId -> Expected: 403
    const t3 = await apiRequest(`/rooms/${roomB.id}`, 'GET', tenantTokenA);
    assert('TEST 3: Tenant GET /api/rooms/:otherRoomId returns 403 Forbidden', t3.status === 403, `(HTTP ${t3.status})`);

    // TEST 4: Tenant -> GET /api/electricity/all-readings -> Expected: 403
    const t4_all = await apiRequest('/electricity/all-readings', 'GET', tenantTokenA);
    const t4_dash = await apiRequest('/electricity/dashboard', 'GET', tenantTokenA);
    assert('TEST 4: Tenant GET /api/electricity/all-readings returns 403 Forbidden', t4_all.status === 403, `(HTTP ${t4_all.status})`);
    assert('TEST 4: Tenant GET /api/electricity/dashboard returns 403 Forbidden', t4_dash.status === 403, `(HTTP ${t4_dash.status})`);

    // TEST 5: Tenant -> GET /api/electricity/history/:otherRoomId -> Expected: 403
    const t5_other = await apiRequest(`/electricity/history/${roomB.id}`, 'GET', tenantTokenA);
    const t5_own = await apiRequest(`/electricity/history/${roomA.id}`, 'GET', tenantTokenA);
    assert('TEST 5: Tenant GET /api/electricity/history/otherRoomId returns 403 Forbidden', t5_other.status === 403, `(HTTP ${t5_other.status})`);
    assert('TEST 5: Tenant GET /api/electricity/history/ownRoomId succeeds (HTTP 200)', t5_own.status === 200, `(HTTP ${t5_own.status})`);

    // TEST 6: Tenant -> GET /api/water?roomId=<other-room> -> Expected: 403
    const t6_other = await apiRequest(`/water?roomId=${roomB.id}`, 'GET', tenantTokenA);
    const t6_own = await apiRequest(`/water?roomId=${roomA.id}`, 'GET', tenantTokenA);
    const t6_no_query = await apiRequest('/water', 'GET', tenantTokenA);
    assert('TEST 6: Tenant GET /api/water?roomId=otherRoom returns 403 Forbidden', t6_other.status === 403, `(HTTP ${t6_other.status})`);
    assert('TEST 6: Tenant GET /api/water?roomId=ownRoom succeeds (HTTP 200)', t6_own.status === 200, `(HTTP ${t6_own.status})`);
    assert('TEST 6: Tenant GET /api/water (no query) auto-scopes to own room (HTTP 200)', t6_no_query.status === 200, `(HTTP ${t6_no_query.status})`);

    // TEST 7: Tenant -> GET /api/adjustments?roomId=<other-room> -> Expected: 403
    const t7_other_room = await apiRequest(`/adjustments?roomId=${roomB.id}`, 'GET', tenantTokenA);
    const t7_other_tenant = await apiRequest(`/adjustments?tenantId=${testTenantUserB.id}`, 'GET', tenantTokenA);
    const t7_own = await apiRequest('/adjustments', 'GET', tenantTokenA);
    assert('TEST 7: Tenant GET /api/adjustments?roomId=otherRoom returns 403 Forbidden', t7_other_room.status === 403, `(HTTP ${t7_other_room.status})`);
    assert('TEST 7: Tenant GET /api/adjustments?tenantId=otherTenant returns 403 Forbidden', t7_other_tenant.status === 403, `(HTTP ${t7_other_tenant.status})`);
    assert('TEST 7: Tenant GET /api/adjustments (own account) succeeds (HTTP 200)', t7_own.status === 200, `(HTTP ${t7_own.status})`);

    // TEST 8: Admin -> same endpoints -> Expected: 200 OK (all admin functions work)
    const t8_rooms = await apiRequest('/rooms', 'GET', adminToken);
    const t8_elec_dash = await apiRequest('/electricity/dashboard', 'GET', adminToken);
    const t8_elec_all = await apiRequest('/electricity/all-readings', 'GET', adminToken);
    const t8_elec_hist = await apiRequest(`/electricity/history/${roomA.id}`, 'GET', adminToken);
    const t8_water = await apiRequest(`/water?roomId=${roomA.id}`, 'GET', adminToken);
    const t8_adj = await apiRequest(`/adjustments?tenantId=${testTenantUserA.id}`, 'GET', adminToken);

    assert('TEST 8: Admin GET /api/rooms succeeds (HTTP 200)', t8_rooms.status === 200, `(HTTP ${t8_rooms.status})`);
    assert('TEST 8: Admin GET /api/electricity/dashboard succeeds (HTTP 200)', t8_elec_dash.status === 200, `(HTTP ${t8_elec_dash.status})`);
    assert('TEST 8: Admin GET /api/electricity/all-readings succeeds (HTTP 200)', t8_elec_all.status === 200, `(HTTP ${t8_elec_all.status})`);
    assert('TEST 8: Admin GET /api/electricity/history/:roomId succeeds (HTTP 200)', t8_elec_hist.status === 200, `(HTTP ${t8_elec_hist.status})`);
    assert('TEST 8: Admin GET /api/water succeeds (HTTP 200)', t8_water.status === 200, `(HTTP ${t8_water.status})`);
    assert('TEST 8: Admin GET /api/adjustments succeeds (HTTP 200)', t8_adj.status === 200, `(HTTP ${t8_adj.status})`);

    // TEST 9: Tenant -> existing legitimate tenant dashboard features -> Expected: 200 OK
    const t9_me = await apiRequest('/auth/me', 'GET', tenantTokenA);
    const t9_active_bill = await apiRequest('/billing/my-active', 'GET', tenantTokenA);
    const t9_bill_hist = await apiRequest('/billing/my-history', 'GET', tenantTokenA);
    const t9_payments = await apiRequest('/payments', 'GET', tenantTokenA);
    const t9_notif = await apiRequest('/notifications', 'GET', tenantTokenA);

    assert('TEST 9: Tenant GET /api/auth/me succeeds (HTTP 200)', t9_me.status === 200, `(HTTP ${t9_me.status})`);
    assert('TEST 9: Tenant GET /api/billing/my-active succeeds (HTTP 200)', t9_active_bill.status === 200, `(HTTP ${t9_active_bill.status})`);
    assert('TEST 9: Tenant GET /api/billing/my-history succeeds (HTTP 200)', t9_bill_hist.status === 200, `(HTTP ${t9_bill_hist.status})`);
    assert('TEST 9: Tenant GET /api/payments succeeds (HTTP 200)', t9_payments.status === 200, `(HTTP ${t9_payments.status})`);
    assert('TEST 9: Tenant GET /api/notifications succeeds (HTTP 200)', t9_notif.status === 200, `(HTTP ${t9_notif.status})`);

  } catch (err) {
    console.error('Unhandled error during test execution:', err);
    failed++;
  } finally {
    // Clean up temporary test data
    console.log('\n--- Cleaning up temporary test records ---');
    try {
      if (testTenantUserA) {
        await prisma.tenantProfile.deleteMany({ where: { userId: testTenantUserA.id } });
        await prisma.user.delete({ where: { id: testTenantUserA.id } });
      }
      if (testTenantUserB) {
        await prisma.tenantProfile.deleteMany({ where: { userId: testTenantUserB.id } });
        await prisma.user.delete({ where: { id: testTenantUserB.id } });
      }
      if (testAdminUser) {
        await prisma.user.delete({ where: { id: testAdminUser.id } });
      }
      if (roomA) {
        await prisma.room.delete({ where: { id: roomA.id } });
      }
      if (roomB) {
        await prisma.room.delete({ where: { id: roomB.id } });
      }
      console.log('✔ Cleanup completed cleanly.');
    } catch (e) {
      console.error('Error cleaning up test data:', e.message);
    }
    await prisma.$disconnect();
  }

  console.log('\n========================================================================');
  console.log(` SUMMARY: ${passed} PASSED, ${failed} FAILED out of ${passed + failed} assertions.`);
  console.log('========================================================================\n');
}

runStep2AuthorizationTests();
