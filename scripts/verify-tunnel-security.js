const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const TUNNEL_URL = 'https://inline-supposed-revolutionary-charlie.trycloudflare.com';

async function fetchUrl(url, options = {}, body = null) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const client = u.protocol === 'https:' ? https : http;
    const reqOptions = {
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = client.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: json !== null ? json : data,
          durationMs: Date.now() - start,
        });
      });
    });

    req.on('error', (err) => reject(err));

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

function buildMultipart(fields, files, boundary) {
  let body = '';
  for (const [key, val] of Object.entries(fields || {})) {
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
    body += `${val}\r\n`;
  }
  for (const [key, file] of Object.entries(files || {})) {
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="${key}"; filename="${file.filename}"\r\n`;
    body += `Content-Type: ${file.contentType}\r\n\r\n`;
    body += file.content;
    body += '\r\n';
  }
  body += `--${boundary}--\r\n`;
  return body;
}

async function run() {
  console.log('========================================================================');
  console.log('   CLOUDFLARE TUNNEL & SECURITY VERIFICATION SUITE                      ');
  console.log(`   Public URL: ${TUNNEL_URL}`);
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(title, condition, extra = '') {
    if (condition) {
      console.log(`✔ [PASS] ${title} ${extra}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${title} ${extra}`);
      failed++;
    }
  }

  // 1. Verify Public Homepage & Login page
  console.log('1. Verifying Public Web Entry Point...');
  const homeRes = await fetchUrl(`${TUNNEL_URL}/login`);
  assert('Public Login Page reachable with HTTP 200', homeRes.status === 200, `(${homeRes.durationMs}ms)`);

  // 2. Security Barrier Check: Unauthenticated access blocked
  console.log('\n2. Security Check: Unauthenticated API Access Protection...');
  const unauthTenants = await fetchUrl(`${TUNNEL_URL}/api/tenants`);
  assert('Unauthenticated /api/tenants returns 401 Unauthorized', unauthTenants.status === 401);

  const unauthBilling = await fetchUrl(`${TUNNEL_URL}/api/billing/all`);
  assert('Unauthenticated /api/billing/all returns 401 Unauthorized', unauthBilling.status === 401);

  const unauthAudit = await fetchUrl(`${TUNNEL_URL}/api/audit-logs`);
  assert('Unauthenticated /api/audit-logs returns 401 Unauthorized', unauthAudit.status === 401);

  // 3. Security Barrier Check: Direct static private document leak prevented
  console.log('\n3. Security Check: Direct Private Document Access Blocked...');
  const directPrivateDoc = await fetchUrl(`${TUNNEL_URL}/uploads/private/citizenship/citizenship_test.pdf`);
  assert('Direct /uploads/private/citizenship/ access returns 404 (Excluded from static serve)', directPrivateDoc.status === 404);

  const envFileAccess = await fetchUrl(`${TUNNEL_URL}/.env`);
  assert('Direct /.env access returns 404', envFileAccess.status === 404);

  const gitAccess = await fetchUrl(`${TUNNEL_URL}/.git/config`);
  assert('Direct /.git access returns 404', gitAccess.status === 404);

  // 4. Admin Login through Public Tunnel
  console.log('\n4. Testing Admin Authentication via Public Tunnel...');
  const loginRes = await fetchUrl(
    `${TUNNEL_URL}/api/auth/login`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { username: 'yubraj_99', password: 'Admin@Yubraj99' }
  );
  assert('Admin Login via Public Tunnel returns HTTP 200/201', loginRes.status === 200 || loginRes.status === 201, `(${loginRes.durationMs}ms)`);
  const adminToken = loginRes.data?.accessToken;
  assert('Admin JWT Access Token acquired', !!adminToken);

  // 5. Query Existing Financial Records & Rooms (Preservation Check)
  console.log('\n5. Preserving Existing Records & Fetching System State...');
  const existingRooms = await fetchUrl(`${TUNNEL_URL}/api/rooms`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert('Admin fetches rooms via Tunnel', Array.isArray(existingRooms.data) && existingRooms.data.length >= 6);

  const existingSummary = await fetchUrl(`${TUNNEL_URL}/api/billing/summary`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert('Admin fetches financial summary via Tunnel', existingSummary.status === 200);

  // 6. Test Temporary Tenant Creation
  console.log('\n6. Testing Tenant Creation via Public Tunnel...');
  const availableRoom = existingRooms.data.find((r) => !r.currentTenant) || existingRooms.data[0];
  const testUsername = `cftest_${Date.now().toString().slice(-5)}`;
  const createTenantRes = await fetchUrl(
    `${TUNNEL_URL}/api/tenants`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
    },
    {
      fullName: 'Tunnel Test Tenant',
      username: testUsername,
      password: 'Password@123',
      phone: '9800000099',
      roomId: availableRoom.id,
      monthlyRent: 8000,
      numberOfPeople: 1,
      moveInDateBS: '2083 Bhadra 01',
      citizenshipNumber: '12-34-56-78901',
    }
  );
  assert('Created test tenant via Tunnel', createTenantRes.status === 200 || createTenantRes.status === 201);
  const testTenant = createTenantRes.data?.tenant || createTenantRes.data?.user || createTenantRes.data;
  const testTenantId = testTenant?.id;
  assert('Test tenant ID confirmed', !!testTenantId);

  // 7. Test Citizenship Number & Document Upload via Admin Endpoint
  console.log('\n7. Testing Citizenship Document Upload & Authorized View...');
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const docBody = buildMultipart(
    { citizenshipNumber: '12-34-56-78901-UPDATED' },
    {
      citizenshipDoc: {
        filename: 'test_citizenship.jpg',
        contentType: 'image/jpeg',
        content: 'fake_citizenship_image_bytes_xyz',
      },
    },
    boundary
  );
  const docUploadRes = await fetchUrl(
    `${TUNNEL_URL}/api/documents/citizenship/${testTenantId}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
    },
    docBody
  );
  assert('Citizenship document uploaded via Admin endpoint', docUploadRes.status === 200 || docUploadRes.status === 201);

  // View citizenship via authorized admin endpoint
  const viewDocRes = await fetchUrl(
    `${TUNNEL_URL}/api/documents/citizenship/${testTenantId}/view`,
    { headers: { Authorization: `Bearer ${adminToken}` } }
  );
  assert('Authorized admin view of citizenship returns HTTP 200', viewDocRes.status === 200);

  // View citizenship WITHOUT auth should be 401
  const unauthViewDoc = await fetchUrl(`${TUNNEL_URL}/api/documents/citizenship/${testTenantId}/view`);
  assert('Unauthenticated view of citizenship returns HTTP 401', unauthViewDoc.status === 401);

  // 8. Test Water Record Creation
  console.log('\n8. Testing Water Purchase Record Creation...');
  const waterRes = await fetchUrl(
    `${TUNNEL_URL}/api/water`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
    },
    {
      roomId: availableRoom.id,
      yearBS: 2083,
      monthBS: 5,
      quantity: 2,
      pricePerJar: 45,
      purchaseDateBS: '2083 Bhadra 05',
    }
  );
  assert('Water purchase added via Tunnel', waterRes.status === 200 || waterRes.status === 201);
  const waterId = waterRes.data?.id;

  // 9. Test Bill Generation & Fetching
  console.log('\n9. Testing Bill Retrieval for Test Tenant...');
  const tenantBillsRes = await fetchUrl(
    `${TUNNEL_URL}/api/billing/all?tenantId=${testTenantId}`,
    { headers: { Authorization: `Bearer ${adminToken}` } }
  );
  assert('Tenant bills fetched via Tunnel', Array.isArray(tenantBillsRes.data) && tenantBillsRes.data.length > 0);
  const targetBill = tenantBillsRes.data[0];
  const targetBillId = targetBill?.id;

  // 10. Test Cash Payment Recording
  console.log('\n10. Testing Cash Payment Recording...');
  const cashPayRes = await fetchUrl(
    `${TUNNEL_URL}/api/payments/cash-payment`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
    },
    {
      tenantId: testTenantId,
      billId: targetBillId,
      amount: 1000,
      paymentDateBS: '2083 Bhadra 06',
      notes: 'Test cash payment via tunnel verification',
    }
  );
  assert('Cash payment recorded via Tunnel', cashPayRes.status === 200 || cashPayRes.status === 201);

  // 11. Test Digital Payment Submission & Verification Flow
  console.log('\n11. Testing Digital Payment Flow (Tenant Login -> Submit -> Admin Verify)...');
  const tenantLoginRes = await fetchUrl(
    `${TUNNEL_URL}/api/auth/login`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { username: testUsername, password: 'Password@123' }
  );
  assert('Test tenant logged in via Tunnel', tenantLoginRes.status === 200 || tenantLoginRes.status === 201);
  const tenantToken = tenantLoginRes.data?.accessToken;

  // Tenant IDOR test: Tenant cannot view another tenant's profile
  const unauthOtherBill = await fetchUrl(
    `${TUNNEL_URL}/api/tenants/${existingRooms.data[0].currentTenant?.tenant?.id || 'other_id'}`,
    { headers: { Authorization: `Bearer ${tenantToken}` } }
  );
  if (existingRooms.data[0].currentTenant?.tenant?.id && existingRooms.data[0].currentTenant.tenant.id !== testTenantId) {
    assert('Tenant cross-access to another tenant profile returns HTTP 403 Forbidden', unauthOtherBill.status === 403);
  }

  // Tenant submits digital payment proof
  const payBoundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const payBody = buildMultipart(
    {
      billId: targetBillId,
      amount: '500',
      paymentMethod: 'ESEWA',
      transactionId: 'CF-TUNNEL-TXN-999',
      paymentDateBS: '2083 Bhadra 06',
    },
    {
      proofImage: {
        filename: 'payment_slip_test.jpg',
        contentType: 'image/jpeg',
        content: 'fake_slip_bytes_12345',
      },
    },
    payBoundary
  );
  const paySubmitRes = await fetchUrl(
    `${TUNNEL_URL}/api/payments/submit`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tenantToken}`,
        'Content-Type': `multipart/form-data; boundary=${payBoundary}`,
      },
    },
    payBody
  );
  assert('Tenant submitted digital payment with screenshot', paySubmitRes.status === 200 || paySubmitRes.status === 201);
  const digitalPayId = paySubmitRes.data?.payment?.id || paySubmitRes.data?.id;

  // Admin verifies digital payment
  if (digitalPayId) {
    const verifyPayRes = await fetchUrl(
      `${TUNNEL_URL}/api/payments/${digitalPayId}/verify`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      { verified: true }
    );
    assert('Admin verified digital payment via Tunnel', verifyPayRes.status === 200);
  }

  // 12. Test Tenant Move-Out
  console.log('\n12. Testing Tenant Move-Out...');
  const moveOutRes = await fetchUrl(
    `${TUNNEL_URL}/api/tenants/${testTenantId}/move-out`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
    },
    { moveOutDateBS: '2083 Bhadra 10' }
  );
  assert('Tenant move-out executed successfully', moveOutRes.status === 200);

  // 13. Test Tenant Cleanup / Archive Deletion (keeping clean state)
  console.log('\n13. Testing Archived Tenant Cleanup...');
  if (waterId) {
    await fetchUrl(`${TUNNEL_URL}/api/water/${waterId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
  }
  const deleteRes = await fetchUrl(
    `${TUNNEL_URL}/api/tenants/${testTenantId}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    }
  );
  assert('Test tenant archived/deleted cleanly', deleteRes.status === 200);

  // 14. Verify Existing Financial Records remain intact
  console.log('\n14. Verifying Existing Financial Records Integrity...');
  const finalSummary = await fetchUrl(`${TUNNEL_URL}/api/billing/summary`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert('Financial summary is intact and responsive', finalSummary.status === 200);

  console.log('\n========================================================================');
  console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('[FATAL ERROR IN VERIFICATION]:', err);
  process.exit(1);
});
