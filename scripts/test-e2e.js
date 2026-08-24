const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const prisma = new PrismaClient();

function getPhysicalLanIp() {
  const interfaces = os.networkInterfaces();
  const physicalCandidates = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    const lname = name.toLowerCase();
    const isVirtual =
      lname.includes('wsl') ||
      lname.includes('docker') ||
      lname.includes('vEthernet') ||
      lname.includes('vethernet') ||
      lname.includes('virtual') ||
      lname.includes('vmware') ||
      lname.includes('loopback') ||
      lname.includes('*') ||
      lname.includes('local area connection*');

    if (isVirtual) continue;

    for (const iface of addrs || []) {
      if (iface.family === 'IPv4' && !iface.internal && iface.address !== '127.0.0.1') {
        const isPriority =
          lname.includes('wi-fi') ||
          lname.includes('wifi') ||
          lname.includes('wireless') ||
          lname.includes('wlan') ||
          lname.includes('ethernet');
        physicalCandidates.push({
          name,
          address: iface.address,
          priority: isPriority ? 1 : 2,
        });
      }
    }
  }

  if (physicalCandidates.length > 0) {
    physicalCandidates.sort((a, b) => a.priority - b.priority);
    return physicalCandidates[0].address;
  }

  return '127.0.0.1';
}

async function request(url, options = {}, body = null) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const reqOptions = {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        const duration = Date.now() - start;
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: json || data,
          durationMs: duration,
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

async function runE2ETests() {
  const lanIp = getPhysicalLanIp();
  console.log('========================================================================');
  console.log(' RUNNING END-TO-END VERIFICATION SUITE                                  ');
  console.log(` Detected Physical LAN IP: ${lanIp}`);
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

  try {
    console.log('Resetting database to clean initial state...');
    execSync('npx prisma db seed', {
      cwd: path.join(__dirname, '../backend'),
      stdio: 'ignore',
      shell: true,
    });

    // 1. Test Frontend on Localhost
    console.log('\n1. Testing Laptop Frontend (http://localhost:3000)...');
    const feLocal = await request('http://localhost:3000/login');
    assert('Frontend Localhost HTTP 200', feLocal.status === 200, `(${feLocal.durationMs}ms)`);

    // 2. Test Frontend on LAN IP
    console.log(`\n2. Testing Phone Frontend URL (http://${lanIp}:3000)...`);
    const feLan = await request(`http://${lanIp}:3000/login`);
    assert('Frontend Phone LAN HTTP 200', feLan.status === 200, `(${feLan.durationMs}ms)`);

    // 3. Test Nepali Calendar Today API
    console.log(`\n3. Testing Nepali Calendar API (http://${lanIp}:4000/api/nepali-calendar/today)...`);
    const todayRes = await request(`http://${lanIp}:4000/api/nepali-calendar/today`);
    assert('Calendar API HTTP 200', todayRes.status === 200, `(${todayRes.durationMs}ms)`);
    assert(
      'Calendar API returns English BS date format (e.g. 2083 Bhadra 6)',
      typeof todayRes.data?.nepaliFormatted === 'string' &&
        !/[\u0900-\u097F]/.test(todayRes.data.nepaliFormatted),
      `(${todayRes.data?.nepaliFormatted})`,
    );

    // 4. Test CORS from Phone Origin on Calendar API
    console.log('\n4. Testing Phone CORS Handshake...');
    const corsRes = await request(
      `http://${lanIp}:4000/api/nepali-calendar/today`,
      {
        headers: {
          Origin: `http://${lanIp}:3000`,
        },
      },
    );
    assert('CORS Response 200', corsRes.status === 200);
    assert(
      'CORS Allow-Origin matches Phone origin',
      corsRes.headers['access-control-allow-origin'] === `http://${lanIp}:3000`,
    );

    // 5. Test Admin Login
    console.log('\n5. Testing Administrator Login (yubraj_99)...');
    const adminLogin = await request(
      `http://${lanIp}:4000/api/auth/login`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: `http://${lanIp}:3000`,
        },
      },
      {
        username: 'yubraj_99',
        password: 'Admin@Yubraj99',
      },
    );
    assert('Admin Login HTTP 200', adminLogin.status === 200 || adminLogin.status === 201, `(${adminLogin.durationMs}ms)`);
    assert('Admin Access Token received', !!adminLogin.data?.accessToken);
    assert('Admin Role confirmed', adminLogin.data?.user?.role === 'ADMIN');

    const adminToken = adminLogin.data?.accessToken;

    // 6. Test QR Code Upload Flow (JPG, PNG, and Invalid format rejection)
    console.log('\n6. Testing QR Code Upload (JPG, PNG & Format Validation)...');
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    
    // JPG Upload with qrImage field
    const jpgBody = buildMultipart(
      {},
      {
        qrImage: {
          filename: 'esewa_qr.jpg',
          contentType: 'image/jpeg',
          content: 'fake_jpg_binary_header_bytes_123',
        },
      },
      boundary,
    );
    const jpgUploadRes = await request(
      `http://${lanIp}:4000/api/settings/upload-qr`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
      },
      jpgBody,
    );
    assert('Admin JPG QR Upload HTTP 200/201', jpgUploadRes.status === 200 || jpgUploadRes.status === 201);
    assert('QR Path saved in settings response', !!jpgUploadRes.data?.qrPath);

    // PNG Upload with qrImage field
    const pngBoundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const pngBody = buildMultipart(
      {},
      {
        qrImage: {
          filename: 'fonepay_qr.png',
          contentType: 'image/png',
          content: 'fake_png_binary_header_bytes_456',
        },
      },
      pngBoundary,
    );
    const pngUploadRes = await request(
      `http://${lanIp}:4000/api/settings/upload-qr`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': `multipart/form-data; boundary=${pngBoundary}`,
        },
      },
      pngBody,
    );
    assert('Admin PNG QR Upload HTTP 200/201', pngUploadRes.status === 200 || pngUploadRes.status === 201);

    // Invalid file format upload (e.g. .txt)
    const txtBoundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const txtBody = buildMultipart(
      {},
      {
        qrImage: {
          filename: 'document.txt',
          contentType: 'text/plain',
          content: 'hello text',
        },
      },
      txtBoundary,
    );
    const txtUploadRes = await request(
      `http://${lanIp}:4000/api/settings/upload-qr`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': `multipart/form-data; boundary=${txtBoundary}`,
        },
      },
      txtBody,
    );
    assert('Unsupported QR format (.txt) correctly rejected with HTTP 400', txtUploadRes.status === 400);

    // Public payment settings verification
    const pubSettingsRes = await request(`http://${lanIp}:4000/api/settings/public-payment`);
    assert(
      'Public payment settings includes uploaded QR code',
      !!(pubSettingsRes.data?.paymentQrCode || pubSettingsRes.data?.esewaQrImage),
      `(${pubSettingsRes.data?.paymentQrCode || pubSettingsRes.data?.esewaQrImage})`,
    );

    // 7. Test Admin Protected Operations (Rooms)
    console.log('\n7. Testing Admin Protected Operations...');
    const roomsRes = await request(`http://${lanIp}:4000/api/rooms`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert('Admin Fetch 6 Rooms', Array.isArray(roomsRes.data) && roomsRes.data.length === 6, `(${roomsRes.durationMs}ms)`);
    assert('Room 1 electricity status is defined', roomsRes.data[0]?.electricityStatus !== undefined);
    assert('Room 1 currentReading is properly returned as null or number', roomsRes.data[0]?.currentReading === null || typeof roomsRes.data[0]?.currentReading === 'number');

    // 8. Test Tenant Registration with Earlier Move-In Date (Back-billing test)
    console.log('\n8. Testing Earlier Move-In Date & Automatic Back-Billing Generation...');
    // Create tenant in Room 2 with move-in date 2 months prior: 2083-03-15 (Asar 15)
    const r2 = roomsRes.data[1];
    const testUsername = `tenant_auto_${Date.now().toString().slice(-4)}`;
    const createTenantRes = await request(
      `http://${lanIp}:4000/api/tenants`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        fullName: 'Hari Prasad',
        username: testUsername,
        password: 'Password@123',
        phone: '9841000002',
        roomId: r2.id,
        monthlyRent: 8500,
        numberOfPeople: 2,
        moveInDateBS: '2083 Asar 15',
      },
    );
    assert('Created tenant with earlier move-in date (2083 Asar 15)', createTenantRes.status === 200 || createTenantRes.status === 201);
    const createdTenantId = createTenantRes.data?.tenant?.id;

    // Verify generated bills: Asar (month 3), Shrawan (month 4), and Bhadra (month 5)
    const asarBillRes = await request(
      `http://${lanIp}:4000/api/billing/all?yearBS=2083&monthBS=3`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    const asarBill = asarBillRes.data?.find((b) => b.tenantId === createdTenantId);
    assert('Auto-generated Asar (Month 3) Bill exists', !!asarBill && asarBill.monthBS === 3);
    assert('Asar Bill has correct rent (Rs. 8500)', asarBill?.rentAmount === 8500);
    assert('Asar Bill status is initially UNPAID', asarBill?.status === 'UNPAID');

    const shrawanBillRes = await request(
      `http://${lanIp}:4000/api/billing/all?yearBS=2083&monthBS=4`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    const shrawanBill = shrawanBillRes.data?.find((b) => b.tenantId === createdTenantId);
    assert('Auto-generated Shrawan (Month 4) Bill exists', !!shrawanBill && shrawanBill.monthBS === 4);

    const bhadraBillRes = await request(
      `http://${lanIp}:4000/api/billing/all?yearBS=2083&monthBS=5`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    let bhadraBill = bhadraBillRes.data?.find((b) => b.tenantId === createdTenantId);
    assert('Auto-generated Bhadra (Month 5) Current Month Bill exists', !!bhadraBill && bhadraBill.monthBS === 5);
    const initialBhadraTotal = bhadraBill?.totalAmount;

    // 9. Test Month-Based Electricity Readings & Automatic Rollover / Edit Recalculation
    console.log('\n9. Testing Month-Based Electricity Readings, Rollover & Cascading Recalculation...');
    // Step 9a: Log Shrawan 2083 reading (Previous = 100, Current = 150 -> Units = 50)
    const logShrawanRes = await request(
      `http://${lanIp}:4000/api/electricity/reading`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        roomId: r2.id,
        yearBS: 2083,
        monthBS: 4, // Shrawan
        previousReading: 100,
        currentReading: 150,
      },
    );
    assert('Saved Shrawan (Month 4) Reading (100 -> 150, 50 units)', logShrawanRes.status === 200 || logShrawanRes.status === 201);
    assert('Shrawan units consumed is 50', logShrawanRes.data?.unitsUsed === 50);

    // Step 9b: Log Bhadra 2083 reading (Current = 190, previous automatically rolled over from Shrawan = 150 -> Units = 40)
    const logBhadraRes = await request(
      `http://${lanIp}:4000/api/electricity/reading`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        roomId: r2.id,
        yearBS: 2083,
        monthBS: 5, // Bhadra
        currentReading: 190,
      },
    );
    assert('Saved Bhadra (Month 5) Reading (150 -> 190, 40 units)', logBhadraRes.status === 200 || logBhadraRes.status === 201);
    assert('Bhadra previous reading automatically rolled over to 150', logBhadraRes.data?.previousReading === 150);
    assert('Bhadra units consumed calculated as 40 (190 - 150)', logBhadraRes.data?.unitsUsed === 40);
    assert('Bhadra electricity charge calculated as Rs. 600 (40 * 15)', logBhadraRes.data?.totalCharge === 600);

    // Step 9c: Edit Shrawan reading from 150 -> 160. Verify Bhadra previous reading automatically becomes 160, and Bhadra units become 30 (190 - 160 = 30, charge = Rs. 450)
    const editShrawanRes = await request(
      `http://${lanIp}:4000/api/electricity/reading`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        roomId: r2.id,
        yearBS: 2083,
        monthBS: 4, // Shrawan
        previousReading: 100,
        currentReading: 160,
      },
    );
    assert('Edited Shrawan current reading to 160', editShrawanRes.status === 200 || editShrawanRes.status === 201);

    // Query Bhadra dashboard status to verify cascading update
    const bhadraDashRes = await request(
      `http://${lanIp}:4000/api/electricity/dashboard?yearBS=2083&monthBS=5`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    const bhadraRoomStatus = bhadraDashRes.data?.rooms?.find((r) => r.roomId === r2.id);
    assert('Bhadra previous reading automatically updated to 160 after Shrawan edit', bhadraRoomStatus?.previousReading === 160);
    assert('Bhadra units consumed recalculated to 30 (190 - 160)', bhadraRoomStatus?.unitsConsumed === 30);
    assert('Bhadra electricity charge recalculated to Rs. 450 (30 * 15)', bhadraRoomStatus?.totalAmount === 450);

    // Verify Bhadra monthly bill was updated with Rs. 450 electricity
    const updatedBhadraBillRes = await request(
      `http://${lanIp}:4000/api/billing/all?yearBS=2083&monthBS=5`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    bhadraBill = updatedBhadraBillRes.data?.find((b) => b.tenantId === createdTenantId);
    assert('Bhadra Monthly Bill electricityAmount updated to Rs. 450', bhadraBill?.electricityAmount === 450);

    // Step 9d: Test Move-in Month Reading Rollover (2083 Asar Month 3)
    const logAsarRes = await request(
      `http://${lanIp}:4000/api/electricity/reading`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        roomId: r2.id,
        yearBS: 2083,
        monthBS: 3, // 2083 Asar (Move-in month)
        previousReading: 50,
        currentReading: 100,
      },
    );
    assert('Saved 2083 Asar Reading (50 -> 100)', logAsarRes.status === 200 || logAsarRes.status === 201);
    assert('2083 Asar units consumed calculated as 50 (100 - 50)', logAsarRes.data?.unitsUsed === 50);

    // 10. Test BS Year Boundary Back-Billing (e.g. 2082 Chaitra 10)
    console.log('\n10. Testing Year Boundary Back-Billing (2082 Chaitra)...');
    const r3 = roomsRes.data[2];
    const yearBoundUsername = `tenant_yb_${Date.now().toString().slice(-4)}`;
    const createYbTenant = await request(
      `http://${lanIp}:4000/api/tenants`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        fullName: 'Sita Sharma',
        username: yearBoundUsername,
        password: 'Password@123',
        phone: '9841000003',
        roomId: r3.id,
        monthlyRent: 9000,
        numberOfPeople: 1,
        moveInDateBS: '2082 Chaitra 10',
      },
    );
    assert('Created tenant with previous year move-in date (2082 Chaitra 10)', createYbTenant.status === 200 || createYbTenant.status === 201);
    const ybTenantId = createYbTenant.data?.tenant?.id;

    // Check Chaitra 2082 bill (year 2082, month 12)
    const chaitra2082BillRes = await request(
      `http://${lanIp}:4000/api/billing/all?yearBS=2082&monthBS=12`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    const chaitraBill = chaitra2082BillRes.data?.find((b) => b.tenantId === ybTenantId);
    assert('Auto-generated 2082 Chaitra (Year boundary) Bill exists', !!chaitraBill && chaitraBill.yearBS === 2082 && chaitraBill.monthBS === 12);

    // Check Baisakh 2083 bill (year 2083, month 1)
    const baisakh2083BillRes = await request(
      `http://${lanIp}:4000/api/billing/all?yearBS=2083&monthBS=1`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    const baisakhBill = baisakh2083BillRes.data?.find((b) => b.tenantId === ybTenantId);
    assert('Auto-generated 2083 Baisakh Bill exists across year boundary', !!baisakhBill && baisakhBill.yearBS === 2083 && baisakhBill.monthBS === 1);

    // 11. Test Tenant Password Restrictions & Admin Reset
    console.log('\n11. Testing Tenant Password Restrictions & Admin Reset...');
    const tenantLogin = await request(
      `http://${lanIp}:4000/api/auth/login`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: `http://${lanIp}:3000`,
        },
      },
      {
        username: testUsername,
        password: 'Password@123',
      },
    );
    assert('Tenant Login HTTP 200', tenantLogin.status === 200 || tenantLogin.status === 201, `(${tenantLogin.durationMs}ms)`);
    const tenantToken = tenantLogin.data?.accessToken;

    // Test 11a: Tenant MUST NOT be able to change password via API
    const tenantPwdChangeRes = await request(
      `http://${lanIp}:4000/api/auth/change-password`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tenantToken}`,
        },
      },
      {
        currentPassword: 'Password@123',
        newPassword: 'HackedPassword@999',
      },
    );
    assert('Tenant change-password endpoint returns HTTP 403 Forbidden', tenantPwdChangeRes.status === 403);

    // Test 11b: Admin CAN reset tenant password
    const adminResetPwdRes = await request(
      `http://${lanIp}:4000/api/tenants/${createdTenantId}/reset-password`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        newPassword: 'NewAdminSetPassword@123',
      },
    );
    assert('Admin can reset tenant password (HTTP 200)', adminResetPwdRes.status === 200);

    // Login with new admin-set password
    const tenantReLogin = await request(
      `http://${lanIp}:4000/api/auth/login`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      {
        username: testUsername,
        password: 'NewAdminSetPassword@123',
      },
    );
    assert('Tenant can login with admin-reset password', tenantReLogin.status === 200 || tenantReLogin.status === 201);
    const activeTenantToken = tenantReLogin.data?.access_token || tenantReLogin.data?.accessToken;

    // 12. Test Combined Multi-Month Payment & Rs. 0 Balance Settlement
    console.log('\n12. Testing Combined Multi-Month Payment & Rs. 0 Balance Settlement...');
    const myActiveBillRes = await request(
      `http://${lanIp}:4000/api/billing/my-active`,
      { headers: { Authorization: `Bearer ${activeTenantToken}` } },
    );
    assert('Tenant Active Bill fetched successfully', myActiveBillRes.status === 200, `(${myActiveBillRes.durationMs}ms)`);
    const totalOutstandingDue = myActiveBillRes.data?.totalOutstanding;
    const unpaidCount = myActiveBillRes.data?.unpaidBillsCount;
    assert('Tenant active bill endpoint returns combined total outstanding due', typeof totalOutstandingDue === 'number' && totalOutstandingDue > 0);
    assert('Multiple unpaid months detected in combined bill summary', unpaidCount >= 2);

    // Verify exact billing period formatting on auto-generated bills
    assert('Asar Bill has exact billing period (2083 Asar 15 → 2083 Shrawan 15)', myActiveBillRes.data?.unpaidBills?.[0]?.billingPeriodBS === '2083 Asar 15 → 2083 Shrawan 15');
    const bhadraUnpaid = myActiveBillRes.data?.unpaidBills?.find((b) => b.monthBS === 5);
    assert('Bhadra Bill has exact billing period (2083 Bhadra 15 → 2083 Ashwin 15)', bhadraUnpaid?.billingPeriodBS === '2083 Bhadra 15 → 2083 Ashwin 15');
    assert('Bhadra Bill is marked as ongoing period', bhadraUnpaid?.isOngoing === true);

    // Submit payment WITHOUT screenshot must FAIL (HTTP 400)
    const payNoProofRes = await request(
      `http://${lanIp}:4000/api/payments/submit`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeTenantToken}`,
        },
      },
      {
        billId: myActiveBillRes.data?.id,
        amount: totalOutstandingDue,
        paymentMethod: 'ESEWA',
      },
    );
    assert('Payment submission without screenshot rejected with HTTP 400', payNoProofRes.status === 400);

    // Submit ONE COMBINED payment with screenshot covering ALL outstanding bills + Rs. 5,000 EXTRA ADVANCE
    const extraAdvanceAmount = 5000;
    const totalPaymentAmount = totalOutstandingDue + extraAdvanceAmount;
    const proofBoundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const proofBody = buildMultipart(
      {
        billId: myActiveBillRes.data?.id,
        amount: String(totalPaymentAmount),
        paymentMethod: 'ESEWA',
        transactionId: 'TXN-COMBINED-ADVANCE-9988',
        paymentDateBS: '2083 Bhadra 6',
      },
      {
        proofImage: {
          filename: 'combined_advance_payment_slip.jpg',
          contentType: 'image/jpeg',
          content: 'fake_image_proof_bytes_combined_advance_123',
        },
      },
      proofBoundary,
    );
    const payWithProofRes = await request(
      `http://${lanIp}:4000/api/payments/submit`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${activeTenantToken}`,
          'Content-Type': `multipart/form-data; boundary=${proofBoundary}`,
        },
      },
      proofBody,
    );
    assert('Combined payment with advance submission accepted (HTTP 200/201)', payWithProofRes.status === 200 || payWithProofRes.status === 201);
    const submittedPaymentId = payWithProofRes.data?.payment?.id;

    // Admin verifies the combined payment
    const verifyRes = await request(
      `http://${lanIp}:4000/api/payments/${submittedPaymentId}/verify`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        verified: true,
      },
    );
    assert('Admin verified combined payment successfully (HTTP 200)', verifyRes.status === 200);
    assert('Digital receipt issued with receipt number', !!verifyRes.data?.receipt?.receiptNumber);

    // Verify tenant dashboard active bill endpoint returns Total Due = Rs. 0 and Advance Balance = Rs. 5,000
    const postPayTenantSummary = await request(
      `http://${lanIp}:4000/api/billing/my-active`,
      { headers: { Authorization: `Bearer ${activeTenantToken}` } },
    );
    assert('After full payment, totalOutstanding is exactly 0', postPayTenantSummary.data?.totalOutstanding === 0);
    assert('After full payment, allBillsPaid is true', postPayTenantSummary.data?.allBillsPaid === true);
    assert('After full payment, effectiveStatus is PAID', postPayTenantSummary.data?.effectiveStatus === 'PAID');
    assert('After full payment, advanceBalance is credited with Rs. 5000', postPayTenantSummary.data?.advanceBalance === extraAdvanceAmount);

    // Test Advance Auto-Deduction: Generate Month 6 (Ashwin) Bill
    console.log('\nTesting Advance Balance Auto-Deduction on New Bill Generation...');
    const genAshwinBill = await request(
      `http://${lanIp}:4000/api/billing/generate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        yearBS: 2083,
        monthBS: 6, // Ashwin
      },
    );
    assert('Generated 2083 Ashwin bills', genAshwinBill.status === 200 || genAshwinBill.status === 201);

    // Check tenant active bill summary now: advance balance was applied across generated bills
    const postGenAshwinTenantSummary = await request(
      `http://${lanIp}:4000/api/billing/my-active`,
      { headers: { Authorization: `Bearer ${activeTenantToken}` } },
    );
    const ashwinBill = postGenAshwinTenantSummary.data?.unpaidBills?.find((b) => b.monthBS === 6) || postGenAshwinTenantSummary.data?.recentBills?.find((b) => b.monthBS === 6);
    assert('Ashwin bill is generated with advance pool deduction applied', !!ashwinBill && (ashwinBill.paidAmount === 5000 || ashwinBill.status === 'PAID' || ashwinBill.status === 'PARTIALLY_PAID'));
    assert('Tenant remaining advanceBalance is 0 after full deduction', postGenAshwinTenantSummary.data?.advanceBalance === 0);

    // 13. Test Admin Bill Correction Workflow
    console.log('\n13. Testing Admin Bill Correction Workflow & Reason Audit...');
    const asarBillId = myActiveBillRes.data?.unpaidBills?.[0]?.id;
    const correctBillRes = await request(
      `http://${lanIp}:4000/api/billing/${asarBillId}/correct`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        rentAmount: 9000,
        correctionReason: 'Corrected monthly rent adjustment for additional occupant',
      },
    );
    assert('Admin corrected bill successfully (HTTP 200)', correctBillRes.status === 200);
    assert('Corrected bill has updated rent (Rs. 9000)', correctBillRes.data?.bill?.rentAmount === 9000);
    assert('Corrected bill has saved correctionReason', correctBillRes.data?.bill?.correctionReason === 'Corrected monthly rent adjustment for additional occupant');

    // 14. Test Maintenance Reporting Workflow & Categories
    console.log('\n14. Testing Maintenance Reporting Workflow & Category Sanitization...');
    const submitMaint = await request(
      `http://${lanIp}:4000/api/maintenance`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tenantToken}`,
        },
      },
      {
        title: 'Switchboard sparking',
        category: 'Electrical',
        description: 'Main room switchboard makes buzzing noise when turning on heater.',
      },
    );
    assert('Tenant Submitted Maintenance Request (Electrical)', submitMaint.status === 200 || submitMaint.status === 201);
    const maintId = submitMaint.data?.id || submitMaint.data?.request?.id;

    // Admin updates maintenance status
    const updateMaint = await request(
      `http://${lanIp}:4000/api/maintenance/${maintId}/status`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      { status: 'IN_PROGRESS' },
    );
    assert('Admin Updated Maintenance Status to IN_PROGRESS', updateMaint.status === 200);

    // =========================================================================
    // 14. BENCHMARK LATENCY
    // =========================================================================
    console.log('\n14. API Response Time Benchmarks...');
    const benchRooms = await request(`http://${lanIp}:4000/api/rooms`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert('GET /api/rooms is fast (< 200ms)', benchRooms.status === 200 && benchRooms.durationMs < 200, `(${benchRooms.durationMs}ms)`);

    const benchSummary = await request(`http://${lanIp}:4000/api/billing/summary`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert('GET /api/billing/summary is fast (< 200ms)', benchSummary.status === 200 && benchSummary.durationMs < 200, `(${benchSummary.durationMs}ms)`);

    const benchTenants = await request(`http://${lanIp}:4000/api/tenants`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert('GET /api/tenants is fast (< 200ms)', benchTenants.status === 200 && benchTenants.durationMs < 200, `(${benchTenants.durationMs}ms)`);

    const benchCal = await request(`http://${lanIp}:4000/api/nepali-calendar/today`);
    assert('GET /api/nepali-calendar/today is fast (< 50ms)', benchCal.status === 200 && benchCal.durationMs < 50, `(${benchCal.durationMs}ms)`);

    // =========================================================================
    // 15. TEST IN-APP NOTIFICATIONS & ELECTRICITY BREAKDOWN
    // =========================================================================
    console.log('\n15. Testing In-App Notifications & Electricity Breakdown...');

    // Use Room 4
    const notifTenantUser = `notif_tenant_${Date.now()}`;
    const createNotifTenant = await request(
      `http://${lanIp}:4000/api/tenants`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        fullName: 'Notification Test User',
        phone: '9841000999',
        username: notifTenantUser,
        password: 'Password123!',
        roomId: roomsRes.data[3].id,
        monthlyRent: 8000,
        numberOfPeople: 1,
        moveInDateBS: '2083-03-01',
      },
    );
    assert('Created tenant for notifications & breakdown testing', createNotifTenant.status === 200 || createNotifTenant.status === 201);
    const notifTenantId = createNotifTenant.data?.id;

    // Login as notif tenant
    const notifTenantLogin = await request(
      `http://${lanIp}:4000/api/auth/login`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      {
        username: notifTenantUser.toLowerCase(),
        password: 'Password123!',
      },
    );
    assert('Notif test tenant logged in', notifTenantLogin.status === 200 || notifTenantLogin.status === 201);
    const notifTenantToken = notifTenantLogin.data?.accessToken || notifTenantLogin.data?.access_token;

    // A. Check tenant active bill has electricityReading objects in unpaidBills & recentBills
    const notifActiveBill = await request(
      `http://${lanIp}:4000/api/billing/my-active`,
      { headers: { Authorization: `Bearer ${notifTenantToken}` } },
    );
    assert('Tenant active bill API returns successful response', notifActiveBill.status === 200);
    assert('Tenant active bill returns unpaidBills with electricityReading objects', 
      Array.isArray(notifActiveBill.data?.unpaidBills) && 
      notifActiveBill.data?.unpaidBills.length > 0 &&
      notifActiveBill.data?.unpaidBills[0].electricityReading !== undefined
    );
    assert('Tenant active bill returns recentBills for past overview',
      Array.isArray(notifActiveBill.data?.recentBills) &&
      notifActiveBill.data?.recentBills.length > 0
    );

    // B. Check tenant billing history has electricityReading
    const notifBillHistory = await request(
      `http://${lanIp}:4000/api/billing/my-history`,
      { headers: { Authorization: `Bearer ${notifTenantToken}` } },
    );
    assert('Tenant billing history returns list of bills with electricity details',
      Array.isArray(notifBillHistory.data) &&
      notifBillHistory.data.length > 0 &&
      notifBillHistory.data[0].electricityReading !== undefined
    );

    // C. Tenant submits payment proof -> Admin receives notification
    const initialAdminNotifs = await request(
      `http://${lanIp}:4000/api/notifications`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    const initialAdminUnread = initialAdminNotifs.data?.unreadCount || 0;

    const notifBillToPay = notifActiveBill.data?.unpaidBills?.[0];
    const notifBoundary = `---------------------------${Date.now()}`;
    const notifProofBody = buildMultipart(
      {
        billId: notifBillToPay?.id,
        amount: String(notifBillToPay?.balanceDue || 8500),
        paymentMethod: 'ESEWA',
        paymentDateBS: '2083 Bhadra 1',
        transactionId: 'TXN-NOTIF-TEST-123',
      },
      {
        proofImage: {
          filename: 'notif_proof.jpg',
          contentType: 'image/jpeg',
          content: 'fake_screenshot_bytes_for_notif_test',
        },
      },
      notifBoundary,
    );

    const boundaryPaymentRes = await request(
      `http://${lanIp}:4000/api/payments/submit`,
      {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${notifBoundary}`,
          Authorization: `Bearer ${notifTenantToken}`,
        },
      },
      notifProofBody,
    );
    assert('Tenant submitted payment with proof for notification test', boundaryPaymentRes.status === 200 || boundaryPaymentRes.status === 201);
    const submittedPayId = boundaryPaymentRes.data?.payment?.id;

    // Verify Admin received notification
    const adminNotifsAfter = await request(
      `http://${lanIp}:4000/api/notifications`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    assert('Admin unread notifications count incremented', (adminNotifsAfter.data?.unreadCount || 0) > initialAdminUnread);
    const submitNotif = adminNotifsAfter.data?.notifications?.find((n) => n.type === 'PAYMENT_SUBMITTED');
    assert('Admin received PAYMENT_SUBMITTED notification with details', !!submitNotif && submitNotif.title.includes('Payment'));

    // D. Admin rejects payment with reason -> Tenant receives notification
    const rejectRes = await request(
      `http://${lanIp}:4000/api/payments/${submittedPayId}/verify`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        verified: false,
        rejectionReason: 'Transaction ID mismatch on eSewa portal',
      },
    );
    assert('Admin rejected test payment with reason', rejectRes.status === 200);

    const tenantNotifsAfterReject = await request(
      `http://${lanIp}:4000/api/notifications`,
      { headers: { Authorization: `Bearer ${notifTenantToken}` } },
    );
    const rejectNotif = tenantNotifsAfterReject.data?.notifications?.find((n) => n.type === 'PAYMENT_REJECTED');
    assert('Tenant received PAYMENT_REJECTED notification', !!rejectNotif);
    assert('Tenant rejection notification contains rejection reason', 
      rejectNotif?.message?.includes('Transaction ID mismatch')
    );

    // E. Mark single notification as read
    if (rejectNotif) {
      const markReadRes = await request(
        `http://${lanIp}:4000/api/notifications/${rejectNotif.id}/read`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${notifTenantToken}`,
          },
        },
        {},
      );
      assert('Marked single notification as read', markReadRes.status === 200);
    }

    // F. Mark all notifications as read
    const markAllReadRes = await request(
      `http://${lanIp}:4000/api/notifications/read-all`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {},
    );
    assert('Marked all admin notifications as read', markAllReadRes.status === 200);
    const adminNotifsFinal = await request(
      `http://${lanIp}:4000/api/notifications`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    assert('Admin unread count is 0 after read-all', adminNotifsFinal.data?.unreadCount === 0);

    // =========================================================================
    // 16. TEST EXACT 3-MONTH MULTI-BILL PARTIAL PAYMENT (19,500 APPROVED, 300 REJECTED)
    // =========================================================================
    console.log('\n--- 16. Testing Exact 3-Month Partial Payment & Rejection Accounting ---');

    // Use Room 5 (vacant seeded room)
    const exactRoomId = roomsRes.data[4].id;

    // Register tenant with move-in date 2083 Asar 4 (rent 6000 + 500 internet = 6500 total/mo)
    const exactTenantRes = await request(
      `http://${lanIp}:4000/api/tenants`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        fullName: 'Bikram Accounting Tester',
        phone: '9801234999',
        username: 'bikram_accounting',
        password: 'Password123!',
        roomId: exactRoomId,
        monthlyRent: 6150, // 6150 rent + 250 internet + 100 garbage = 6500 per month
        numberOfPeople: 1,
        moveInDateBS: '2083-03-04',
      },
    );
    assert('Created tenant for 3-month accounting test', exactTenantRes.status === 200 || exactTenantRes.status === 201);
    const exactTenantId = exactTenantRes.data?.id;

    const exactTenantLogin = await request(
      `http://${lanIp}:4000/api/auth/login`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { username: 'bikram_accounting', password: 'Password123!' },
    );
    assert('Bikram accounting tenant logged in', exactTenantLogin.status === 200 || exactTenantLogin.status === 201);
    const exactTenantToken = exactTenantLogin.data?.accessToken || exactTenantLogin.data?.access_token;

    // Generate 3 months of bills: Asar (6500), Shrawan (6500), Bhadra (6500 + 300 electricity = 6800)
    const elecRes = await request(
      `http://${lanIp}:4000/api/electricity/reading`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        roomId: exactRoomId,
        yearBS: 2083,
        monthBS: 5, // Bhadra
        previousReading: 100,
        currentReading: 120, // 20 units * 15 = 300
      },
    );
    assert('Saved Bhadra electricity reading for 3-month tenant', elecRes.status === 200 || elecRes.status === 201);

    await request(
      `http://${lanIp}:4000/api/billing/generate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      { yearBS: 2083, monthBS: 5 },
    );

    // Verify tenant's total outstanding across all 3 bills = Rs. 19,800
    const exactActiveBillBefore = await request(
      `http://${lanIp}:4000/api/billing/my-active`,
      { headers: { Authorization: `Bearer ${exactTenantToken}` } },
    );
    assert('Tenant has exactly 3 unpaid bills generated', exactActiveBillBefore.data?.unpaidBills?.length === 3);
    assert('Total outstanding before payment is exactly Rs. 19,800', exactActiveBillBefore.data?.totalOutstanding === 19800);

    // Step 1: Tenant submits partial payment of Rs. 19,500
    const exactFirstBillId = exactActiveBillBefore.data?.unpaidBills[0]?.id;
    const exactBoundary1 = `---------------------------${Date.now()}_1`;
    const exactProof1Body = buildMultipart(
      {
        billId: exactFirstBillId,
        amount: '19500',
        paymentMethod: 'ESEWA',
        transactionId: 'TXN19500PARTIAL',
      },
      {
        proofImage: {
          filename: 'proof_19500.jpg',
          contentType: 'image/jpeg',
          content: 'fake_screenshot_bytes_19500',
        },
      },
      exactBoundary1,
    );

    const exactPay1Res = await request(
      `http://${lanIp}:4000/api/payments/submit`,
      {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${exactBoundary1}`,
          Authorization: `Bearer ${exactTenantToken}`,
        },
      },
      exactProof1Body,
    );
    assert('Submitted Rs. 19,500 payment proof', exactPay1Res.status === 200 || exactPay1Res.status === 201);
    const exactPayment1Id = exactPay1Res.data?.payment?.id;

    // Step 2: Admin verifies/approves the Rs. 19,500 payment
    const exactVerify1Res = await request(
      `http://${lanIp}:4000/api/payments/${exactPayment1Id}/verify`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      { verified: true },
    );
    assert('Admin approved Rs. 19,500 payment', exactVerify1Res.status === 200);

    // Verify tenant bill status after Rs. 19,500 approval:
    // Asar (6500) -> PAID (due: 0)
    // Shrawan (6500) -> PAID (due: 0)
    // Bhadra (6800) -> PARTIALLY_PAID (paid: 6500, due: 300)
    const exactActiveBillAfterVerify1 = await request(
      `http://${lanIp}:4000/api/billing/my-active`,
      { headers: { Authorization: `Bearer ${exactTenantToken}` } },
    );
    assert('Total outstanding after Rs. 19,500 approval is exactly Rs. 300', exactActiveBillAfterVerify1.data?.totalOutstanding === 300);
    assert('Remaining unpaid bill count is 1 (Bhadra)', exactActiveBillAfterVerify1.data?.unpaidBills?.length === 1);
    assert('Bhadra bill paidAmount is 6500 and balanceDue is 300', 
      exactActiveBillAfterVerify1.data?.unpaidBills[0]?.paidAmount === 6500 &&
      exactActiveBillAfterVerify1.data?.unpaidBills[0]?.balanceDue === 300
    );

    // Step 3: Tenant submits remaining Rs. 300 payment
    const exactRemainingBillId = exactActiveBillAfterVerify1.data?.unpaidBills[0]?.id;
    const exactBoundary2 = `---------------------------${Date.now()}_2`;
    const exactProof2Body = buildMultipart(
      {
        billId: exactRemainingBillId,
        amount: '300',
        paymentMethod: 'ESEWA',
        transactionId: 'TXN300REMAINDER',
      },
      {
        proofImage: {
          filename: 'proof_300.jpg',
          contentType: 'image/jpeg',
          content: 'fake_screenshot_bytes_300',
        },
      },
      exactBoundary2,
    );

    const exactPay2Res = await request(
      `http://${lanIp}:4000/api/payments/submit`,
      {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${exactBoundary2}`,
          Authorization: `Bearer ${exactTenantToken}`,
        },
      },
      exactProof2Body,
    );
    if (exactPay2Res.status !== 200 && exactPay2Res.status !== 201) {
      console.log('[DEBUG exactPay2Res error]:', exactPay2Res.status, exactPay2Res.data);
    }
    assert('Submitted Rs. 300 remaining payment proof', exactPay2Res.status === 200 || exactPay2Res.status === 201);
    const exactPayment2Id = exactPay2Res.data?.payment?.id;

    // Step 4: Admin REJECTS the Rs. 300 payment with reason
    const exactReject2Res = await request(
      `http://${lanIp}:4000/api/payments/${exactPayment2Id}/verify`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        verified: false,
        rejectionReason: 'Invalid transaction receipt screenshot',
      },
    );
    assert('Admin rejected the Rs. 300 payment with reason', exactReject2Res.status === 200);

    // Step 5: CRUCIAL ASSERTION - Verify that rejecting Rs. 300 does NOT revert Rs. 19,500!
    const exactActiveBillAfterReject = await request(
      `http://${lanIp}:4000/api/billing/my-active`,
      { headers: { Authorization: `Bearer ${exactTenantToken}` } },
    );
    assert('CRITICAL: Total due remains exactly Rs. 300 after Rs. 300 rejection (NOT 6,500)', exactActiveBillAfterReject.data?.totalOutstanding === 300);
    assert('CRITICAL: Only 1 unpaid bill remains', exactActiveBillAfterReject.data?.unpaidBills?.length === 1);
    assert('CRITICAL: Bhadra bill balanceDue is exactly 300 and paidAmount is 6500',
      exactActiveBillAfterReject.data?.unpaidBills[0]?.balanceDue === 300 &&
      exactActiveBillAfterReject.data?.unpaidBills[0]?.paidAmount === 6500
    );

    // 17. Test Default Room Rents, Payment Account Settings, Garbage Charge (Rs. 100), and Admin Billing All Unpaid View
    console.log('\n17. Testing Default Room Rents, Payment Settings, Garbage Charge (Rs. 100), and Admin Billing Unpaid View...');

    // 17a: Verify 6 Default Room Rents
    const allRoomsCheck = await request(`http://${lanIp}:4000/api/rooms`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const expectedRents = { 1: 6000, 2: 5500, 3: 6000, 4: 6500, 5: 6000, 6: 6000 };
    for (const [rNum, expectedRent] of Object.entries(expectedRents)) {
      const rm = allRoomsCheck.data?.find((r) => r.roomNumber === Number(rNum));
      assert(`Room ${rNum} default rent is Rs. ${expectedRent}`, rm?.defaultRent === expectedRent);
    }

    // 17b: Verify Payment Account Details
    const publicPaymentCheck = await request(`http://${lanIp}:4000/api/settings/public-payment`);
    assert('eSewa ID is 9761848471', publicPaymentCheck.data?.esewaId === '9761848471');
    assert('eSewa Account Name is Yubraj Shrestha', publicPaymentCheck.data?.esewaAccountName === 'Yubraj Shrestha');
    assert('Bank Name is Nabil Bank', publicPaymentCheck.data?.bankName === 'Nabil Bank');
    assert('Bank Account Number is 15310017504670', publicPaymentCheck.data?.bankAccountNumber === '15310017504670');
    assert('Bank Account Name is Yubraj Shrestha', publicPaymentCheck.data?.bankAccountName === 'Yubraj Shrestha');
    assert('Bank Branch is Imadol', publicPaymentCheck.data?.bankBranch === 'Imadol');

    // 17c: Verify Garbage Charge (Rs. 100) automatically included in monthly bills
    // Generate bills for Bhadra 2083
    await request(
      `http://${lanIp}:4000/api/billing/generate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      { yearBS: 2083, monthBS: 5 },
    );

    const allBhadraBillsRes = await request(
      `http://${lanIp}:4000/api/billing/all?yearBS=2083&monthBS=5`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    assert('Bhadra monthly bills retrieved', Array.isArray(allBhadraBillsRes.data) && allBhadraBillsRes.data.length > 0);
    const sampleBill = allBhadraBillsRes.data[0];
    assert('Sample monthly bill has garbageAmount of Rs. 100', sampleBill?.garbageAmount === 100);

    // Check itemized breakdown API
    const sampleDetailRes = await request(
      `http://${lanIp}:4000/api/billing/${sampleBill.id}`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    assert('Bill Breakdown contains Garbage Charge: Rs. 100', sampleDetailRes.data?.breakdown?.garbage?.amount === 100);

    // 17d: Verify Admin Billing Unpaid View API
    const unpaidBillsRes = await request(
      `http://${lanIp}:4000/api/billing/all?unpaidOnly=true`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    assert('Admin Billing Unpaid API HTTP 200', unpaidBillsRes.status === 200);
    assert('Admin Billing Unpaid API returns all unpaid bills across months', Array.isArray(unpaidBillsRes.data) && unpaidBillsRes.data.length >= 1);
    assert('All returned bills have unpaid or partial status', unpaidBillsRes.data.every((b) => ['UNPAID', 'PARTIALLY_PAID', 'PENDING_VERIFICATION'].includes(b.status)));

    // 18. Test New Features: Notification Deletion, Tenant Room Number in Profile, Bill Gen, Move-in Elec Validation, Rejection Reason
    console.log('\n18. Testing Notification Deletion, Profile Room Display, Electricity Move-in Validation & Rejection Reason...');

    // 18a: Test Tenant Assigned Room Number in Profile (/api/auth/me)
    const room3Obj = allRoomsCheck.data?.find((r) => r.roomNumber === 3);
    
    // Move out previous tenant in Room 3 so Room 3 becomes vacant
    if (ybTenantId) {
      await request(
        `http://${lanIp}:4000/api/tenants/${ybTenantId}/move-out`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
        },
        { moveOutDateBS: '2083-02-25' },
      );
    }

    const tenant3Username = `tenant_r3_${Date.now().toString().slice(-4)}`;
    const tenant3Res = await request(
      `http://${lanIp}:4000/api/tenants`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        fullName: 'Bikash Tamang',
        username: tenant3Username,
        password: 'Password@123',
        phone: '9841333333',
        roomId: room3Obj.id,
        monthlyRent: 6000,
        numberOfPeople: 1,
        moveInDateBS: '2083-03-10', // Asar 10 (Month 3)
      },
    );
    assert('Created tenant in Room 3 (Move-in: 2083 Asar 10)', tenant3Res.status === 200 || tenant3Res.status === 201);

    const tenant3Login = await request(
      `http://${lanIp}:4000/api/auth/login`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { username: tenant3Username, password: 'Password@123' },
    );
    const tenant3Token = tenant3Login.data?.accessToken;
    assert('Tenant 3 logged in', !!tenant3Token);

    const tenant3Profile = await request(
      `http://${lanIp}:4000/api/auth/me`,
      { headers: { Authorization: `Bearer ${tenant3Token}` } },
    );
    assert('Tenant 3 Profile has exact assigned roomNumber (3)', tenant3Profile.data?.tenantProfile?.roomNumber === 3);
    assert('Tenant 3 Profile has exact roomName containing "Room 3"', tenant3Profile.data?.tenantProfile?.roomName?.includes('Room 3'));

    // 18b: Test Electricity Reading Move-In Date Restriction
    // Move-in is 2083 Asar (month 3). Try to enter reading for 2083 Jestha (month 2)
    const invalidElecRes = await request(
      `http://${lanIp}:4000/api/electricity/reading`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        roomId: room3Obj.id,
        yearBS: 2083,
        monthBS: 2, // Jestha (before Asar move-in)
        currentReading: 100,
      },
    );
    assert('Entering electricity reading before tenant move-in correctly rejected with HTTP 400', invalidElecRes.status === 400);

    // Enter valid reading for 2083 Asar (month 3)
    const validElecRes = await request(
      `http://${lanIp}:4000/api/electricity/reading`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        roomId: room3Obj.id,
        yearBS: 2083,
        monthBS: 3, // Asar
        previousReading: 50,
        currentReading: 80,
      },
    );
    assert('Entering electricity reading during/after tenant move-in succeeds with HTTP 200/201', validElecRes.status === 200 || validElecRes.status === 201);

    // 18c: Test Admin Dashboard Generate Monthly Bills
    const genBillsRes = await request(
      `http://${lanIp}:4000/api/billing/generate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      { yearBS: 2083, monthBS: 5 },
    );
    assert('Admin Dashboard Generate Bills API HTTP 200/201', genBillsRes.status === 200 || genBillsRes.status === 201);

    // 18d: Test Payment Rejection Details in Notification
    // Tenant 3 submits payment proof
    const t3ActiveBill = await request(
      `http://${lanIp}:4000/api/billing/my-active`,
      { headers: { Authorization: `Bearer ${tenant3Token}` } },
    );
    const t3BillId = t3ActiveBill.data?.unpaidBills[0]?.id;
    const t3Boundary = `----WebKitFormBoundary${Date.now()}`;
    const t3ProofBody = buildMultipart(
      {
        billId: t3BillId,
        amount: '6350',
        paymentMethod: 'ESEWA',
        transactionId: 'TXNREJECTTEST999',
      },
      {
        proofImage: {
          filename: 'proof_reject.jpg',
          contentType: 'image/jpeg',
          content: 'fake_reject_test_proof_bytes',
        },
      },
      t3Boundary,
    );
    const t3PayRes = await request(
      `http://${lanIp}:4000/api/payments/submit`,
      {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${t3Boundary}`,
          Authorization: `Bearer ${tenant3Token}`,
        },
      },
      t3ProofBody,
    );
    assert('Tenant 3 submitted payment proof', t3PayRes.status === 200 || t3PayRes.status === 201);
    const t3PaymentId = t3PayRes.data?.payment?.id;

    // Admin rejects with clear reason
    const rejectionReasonText = 'Screenshot is blurry and transaction ID is not clearly readable';
    const t3RejectRes = await request(
      `http://${lanIp}:4000/api/payments/${t3PaymentId}/verify`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        verified: false,
        rejectionReason: rejectionReasonText,
      },
    );
    assert('Admin rejected payment with reason', t3RejectRes.status === 200);

    // Tenant fetches notifications and asserts rejection details
    const t3NotifsRes = await request(
      `http://${lanIp}:4000/api/notifications`,
      { headers: { Authorization: `Bearer ${tenant3Token}` } },
    );
    const rejectionNotif = t3NotifsRes.data?.notifications?.find((n) => n.type === 'PAYMENT_REJECTED');
    assert('Tenant received PAYMENT_REJECTED notification', !!rejectionNotif);
    assert('Notification data contains exact rejection reason', rejectionNotif?.data?.rejectionReason === rejectionReasonText);
    assert('Notification data contains submitted amount (Rs. 6350)', rejectionNotif?.data?.amount === 6350);
    assert('Notification data contains billingPeriod', typeof rejectionNotif?.data?.billingPeriod === 'string');
    assert('Notification data contains remainingDue', typeof rejectionNotif?.data?.remainingDue === 'number');

    // 18e: Test Clear/Delete Notifications (Single & Clear-All)
    // Delete single notification
    const delSingleRes = await request(
      `http://${lanIp}:4000/api/notifications/${rejectionNotif.id}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tenant3Token}` },
      },
    );
    assert('Delete single notification HTTP 200', delSingleRes.status === 200);

    // Verify notification was removed for Tenant 3
    const t3AfterSingleDel = await request(
      `http://${lanIp}:4000/api/notifications`,
      { headers: { Authorization: `Bearer ${tenant3Token}` } },
    );
    assert('Deleted notification is no longer in tenant notification list', !t3AfterSingleDel.data?.notifications?.some((n) => n.id === rejectionNotif.id));

    // Clear all notifications for Admin
    const clearAllRes = await request(
      `http://${lanIp}:4000/api/notifications/clear-all`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
    );
    assert('Clear all notifications HTTP 200', clearAllRes.status === 200);

    const adminNotifsAfterClear = await request(
      `http://${lanIp}:4000/api/notifications`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    assert('Admin notification count is 0 after clear-all', adminNotifsAfterClear.data?.notifications?.length === 0);
    assert('Admin unread count is 0 after clear-all', adminNotifsAfterClear.data?.unreadCount === 0);

    // ------------------------------------------------------------------------
    // SECTION 19: WATER & BORROWING BILLING INTEGRATION & TENANT ROOM DISPLAY
    // ------------------------------------------------------------------------
    console.log('\n--- Section 19: Water & Borrowing Billing Integration & Tenant Room Display ---');

    // 19a: Fetch rooms and create clean tenant for Section 19 in Room 2
    const allRoomsRes = await request(
      `http://${lanIp}:4000/api/rooms`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    const room2Record = allRoomsRes.data?.find((r) => r.roomNumber === 2);
    assert('Room 2 exists in room list', !!room2Record);

    // Ensure room 2 is vacant for Section 19
    const existingRoom2Active = await prisma.tenantProfile.findFirst({
      where: { roomId: room2Record.id, status: 'ACTIVE' },
    });
    if (existingRoom2Active) {
      await prisma.tenantProfile.update({
        where: { id: existingRoom2Active.id },
        data: { status: 'MOVED_OUT' },
      });
      await prisma.room.update({
        where: { id: room2Record.id },
        data: { status: 'VACANT' },
      });
    }

    const s19TenantRes = await request(
      `http://${lanIp}:4000/api/tenants`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        fullName: 'Water & Loan Test Tenant',
        username: 's19_water_tenant',
        password: 'password123',
        phone: '9841999888',
        roomId: room2Record.id,
        numberOfPeople: 1,
        monthlyRent: 5500,
        moveInDateBS: '2083 Bhadra 1',
      },
    );
    assert('Created dedicated tenant in Room 2 for Section 19', s19TenantRes.status === 200 || s19TenantRes.status === 201);

    // 19b: Verify Tenant Member Room Mapping
    const tenantsListRes = await request(
      `http://${lanIp}:4000/api/tenants`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    assert('Get all tenants HTTP 200', tenantsListRes.status === 200);
    const tenant2Record = tenantsListRes.data?.find((t) => t.username === 's19_water_tenant');
    const s19TenantId = tenant2Record?.id || s19TenantRes.data?.id || s19TenantRes.data?.user?.id;
    assert('Tenant 2 has profile object', !!tenant2Record?.profile);
    assert('Tenant 2 profile has roomNumber (2)', tenant2Record?.profile?.roomNumber === 2);
    assert('Tenant 2 profile has nested room.roomNumber (2)', tenant2Record?.profile?.room?.roomNumber === 2);

    // 19c: Generate base bill for Year 2083 Month 5 Room 2
    const genBillRes = await request(
      `http://${lanIp}:4000/api/billing/generate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      { yearBS: 2083, monthBS: 5, roomId: room2Record.id },
    );
    assert('Generate bill for Room 2 Month 5 HTTP 200/201', genBillRes.status === 200 || genBillRes.status === 201);
    const baseBill = genBillRes.data?.bills?.[0] || genBillRes.data?.[0];
    assert('Base bill created with garbage amount Rs. 100', baseBill?.garbageAmount === 100);

    // 19d: Add Water Purchase: Room 2, Month 5, 2 Jars @ Rs. 50 = Rs. 100
    const addWaterRes = await request(
      `http://${lanIp}:4000/api/water`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        roomId: room2Record.id,
        yearBS: 2083,
        monthBS: 5,
        quantity: 2,
        pricePerUnit: 50,
        note: 'Drinking water 2 jars',
      },
    );
    assert('Add water purchase HTTP 200/201', addWaterRes.status === 200 || addWaterRes.status === 201);
    const waterPurchaseId = addWaterRes.data?.id;

    // Fetch the bill for Room 2 Month 5: must reflect waterAmount: 100
    const billsAfterWaterRes = await request(
      `http://${lanIp}:4000/api/billing/all?yearBS=2083&monthBS=5`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    const billAfterWater = billsAfterWaterRes.data?.find((b) => b.roomId === room2Record.id && b.tenantId === s19TenantId);
    assert('Monthly bill includes waterAmount (Rs. 100)', billAfterWater?.waterAmount === 100);
    assert('Monthly bill totalAmount includes water charge', billAfterWater?.totalAmount === baseBill.totalAmount + 100);

    // 19e: Add Borrowing for Tenant: Rs. 1500 in Month 5
    const addBorrowRes = await request(
      `http://${lanIp}:4000/api/borrowing`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        tenantId: s19TenantId,
        amount: 1500,
        borrowDateBS: '2083-05-10',
        reason: 'Medical emergency advance',
        includeInBill: true,
      },
    );
    assert('Create borrowing HTTP 200/201', addBorrowRes.status === 200 || addBorrowRes.status === 201);
    const borrowingId = addBorrowRes.data?.id;

    // Fetch the bill for Room 2 Month 5: must reflect borrowingAmount: 1500
    const billsAfterBorrowRes = await request(
      `http://${lanIp}:4000/api/billing/all?yearBS=2083&monthBS=5`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    const billAfterBorrow = billsAfterBorrowRes.data?.find((b) => b.roomId === room2Record.id && b.tenantId === s19TenantId);
    assert('Monthly bill includes borrowingAmount (Rs. 1500)', billAfterBorrow?.borrowingAmount === 1500);
    assert('Monthly bill totalAmount includes borrowing amount', billAfterBorrow?.totalAmount === baseBill.totalAmount + 100 + 1500);

    // 19f: Partial Repayment of Borrowing: Repay Rs. 500
    const repayRes = await request(
      `http://${lanIp}:4000/api/borrowing/${borrowingId}/repay`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        repayAmount: 500,
      },
    );
    assert('Record borrowing repayment HTTP 200', repayRes.status === 200);

    // Fetch the bill for Room 2 Month 5: must now reflect borrowingAmount: 1000
    const billsAfterRepayRes = await request(
      `http://${lanIp}:4000/api/billing/all?yearBS=2083&monthBS=5`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    const billAfterRepay = billsAfterRepayRes.data?.find((b) => b.roomId === room2Record.id && b.tenantId === s19TenantId);
    assert('Monthly bill borrowingAmount updated to Rs. 1000 after partial repayment', billAfterRepay?.borrowingAmount === 1000);
    assert('Monthly bill totalAmount updated after borrowing repayment', billAfterRepay?.totalAmount === baseBill.totalAmount + 100 + 1000);

    // 19g: Delete Water Purchase and Verify Recalculation
    const delWaterRes = await request(
      `http://${lanIp}:4000/api/water/${waterPurchaseId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
    );
    assert('Delete water purchase HTTP 200', delWaterRes.status === 200);

    const billsAfterDelWaterRes = await request(
      `http://${lanIp}:4000/api/billing/all?yearBS=2083&monthBS=5`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    const billAfterDelWater = billsAfterDelWaterRes.data?.find((b) => b.roomId === room2Record.id && b.tenantId === s19TenantId);
    assert('Monthly bill waterAmount updated to Rs. 0 after deletion', billAfterDelWater?.waterAmount === 0);
    assert('Monthly bill totalAmount properly recalculated', billAfterDelWater?.totalAmount === baseBill.totalAmount + 1000);

    // ------------------------------------------------------------------------
    // SECTION 20: WATER & BORROWING DATA MAPPING, BILL BREAKDOWN & SETTLED LOANS
    // ------------------------------------------------------------------------
    console.log('\n--- Section 20: Water & Borrowing Data Mapping, Bill Breakdown & Settled Loans ---');

    // 20a: Add new water purchase and verify GET /api/water returns tenant and totalCost
    const s20WaterRes = await request(
      `http://${lanIp}:4000/api/water`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        roomId: room2Record.id,
        yearBS: 2083,
        monthBS: 5,
        quantity: 3,
        pricePerUnit: 45,
        note: 'Fresh drinking water delivery',
      },
    );
    assert('Created water purchase for Room 2', s20WaterRes.status === 200 || s20WaterRes.status === 201);

    const getWaterRes = await request(
      `http://${lanIp}:4000/api/water`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    assert('GET /api/water returns HTTP 200', getWaterRes.status === 200);
    assert('Water purchase array is returned', Array.isArray(getWaterRes.data) && getWaterRes.data.length > 0);
    const waterEntry = getWaterRes.data.find((w) => w.roomId === room2Record.id);
    assert('Water entry has resolved tenantName', typeof waterEntry?.tenantName === 'string' && waterEntry.tenantName.length > 0);
    assert('Water entry has valid numeric totalCost (135)', waterEntry?.totalCost === 135 && !isNaN(waterEntry.totalCost));
    assert('Water entry has valid numeric totalAmount (135)', waterEntry?.totalAmount === 135 && !isNaN(waterEntry.totalAmount));
    assert('Water entry contains room info with roomNumber 2', waterEntry?.room?.roomNumber === 2);

    // 20b: Verify GET /api/borrowing returns roomNumber and tenant.tenantProfile.room
    const getBorrowingsRes = await request(
      `http://${lanIp}:4000/api/borrowing`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    assert('GET /api/borrowing returns HTTP 200', getBorrowingsRes.status === 200);
    const borrowEntry = getBorrowingsRes.data.find((b) => b.id === borrowingId);
    assert('Borrowing entry has roomNumber (2)', borrowEntry?.roomNumber === 2);
    assert('Borrowing entry has nested room.roomNumber (2)', borrowEntry?.room?.roomNumber === 2);
    assert('Borrowing entry has tenant.fullName', typeof borrowEntry?.tenant?.fullName === 'string');

    // 20c: Fully Repay the remaining Rs. 1000 of borrowing
    const fullRepayRes = await request(
      `http://${lanIp}:4000/api/borrowing/${borrowingId}/repay`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        repayAmount: 1000,
      },
    );
    assert('Fully repaid remaining borrowing HTTP 200', fullRepayRes.status === 200);
    assert('Borrowing status changed to PAID', fullRepayRes.data?.status === 'PAID');
    assert('Borrowing outstandingAmount is exactly 0', fullRepayRes.data?.outstandingAmount === 0);

    // Check that the monthly bill updated borrowingAmount to 0
    const billsAfterFullRepayRes = await request(
      `http://${lanIp}:4000/api/billing/all?yearBS=2083&monthBS=5`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    const billAfterFullRepay = billsAfterFullRepayRes.data?.find((b) => b.roomId === room2Record.id && b.tenantId === s19TenantId);
    assert('Monthly bill borrowingAmount updated to Rs. 0 when loan fully paid', billAfterFullRepay?.borrowingAmount === 0);

    // 20d: Check detailed bill breakdown endpoint
    const billDetailRes = await request(
      `http://${lanIp}:4000/api/billing/${billAfterFullRepay.id}`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    assert('GET /api/billing/:id breakdown returns HTTP 200', billDetailRes.status === 200);
    assert('Breakdown has rent amount', typeof billDetailRes.data?.rentAmount === 'number' && billDetailRes.data.rentAmount > 0);
    assert('Breakdown has electricityAmount', typeof billDetailRes.data?.electricityAmount === 'number');
    assert('Breakdown has internetAmount', typeof billDetailRes.data?.internetAmount === 'number');
    assert('Breakdown has garbageAmount (Rs. 100)', billDetailRes.data?.garbageAmount === 100);
    assert('Breakdown has waterAmount (Rs. 135)', billDetailRes.data?.waterAmount === 135);
    assert('Breakdown has itemized water list', Array.isArray(billDetailRes.data?.breakdown?.water?.items));
    assert('Breakdown total equals rent + elec + net + garbage + water', 
      billDetailRes.data?.totalAmount === 
      billDetailRes.data.rentAmount + billDetailRes.data.electricityAmount + billDetailRes.data.internetAmount + 100 + 135
    );

    // ------------------------------------------------------------------------
    // SECTION 21: MULTI-MONTH BILL BREAKDOWN, FUTURE ELECTRICITY, DASHBOARD EXPECTED RENT & NOTIFICATIONS
    // ------------------------------------------------------------------------
    console.log('\n--- Section 21: Multi-Month Bill Breakdown, Future Electricity, Dashboard Expected Rent & Notifications ---');

    // 21a: Test Multi-Bill Breakdown endpoint
    const unpaidBillsForTenantRes = await request(
      `http://${lanIp}:4000/api/billing/all?unpaidOnly=true`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    assert('GET /api/billing/all?unpaidOnly=true returns HTTP 200', unpaidBillsForTenantRes.status === 200);
    const unpaidBillIds = unpaidBillsForTenantRes.data?.slice(0, 3).map((b) => b.id) || [];

    if (unpaidBillIds.length > 0) {
      const multiBreakdownRes = await request(
        `http://${lanIp}:4000/api/billing/breakdown-multi?billIds=${unpaidBillIds.join(',')}`,
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );
      assert('GET /api/billing/breakdown-multi returns HTTP 200', multiBreakdownRes.status === 200);
      assert('Multi breakdown returns array of bills', Array.isArray(multiBreakdownRes.data?.bills));
      assert('Multi breakdown count matches requested bills', multiBreakdownRes.data?.count === unpaidBillIds.length);
      assert('Multi breakdown has numeric totalOutstanding', typeof multiBreakdownRes.data?.totalOutstanding === 'number');
      const expectedTotal = multiBreakdownRes.data.bills.reduce((acc, b) => acc + (b.balanceDue ?? b.totalAmount ?? 0), 0);
      assert('Multi breakdown totalOutstanding equals sum of individual bill dues', Math.abs(multiBreakdownRes.data.totalOutstanding - expectedTotal) < 0.01);
    }

    // 21b: Test Future-Month Electricity Reading Rejection (HTTP 400)
    const futureReadingRes = await request(
      `http://${lanIp}:4000/api/electricity/reading`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        roomId: room2Record.id,
        yearBS: 2085,
        monthBS: 1,
        currentReading: 500,
        previousReading: 400,
      },
    );
    assert('Entering electricity reading for future month is rejected with HTTP 400', futureReadingRes.status === 400);

    // 21c: Test Dashboard Expected Rent matches Total Outstanding Amount
    const dashboardSummaryRes = await request(
      `http://${lanIp}:4000/api/billing/summary`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    assert('GET /api/billing/summary returns HTTP 200', dashboardSummaryRes.status === 200);
    const expectedRentStat = dashboardSummaryRes.data?.stats?.expectedRent;
    const totalOutstandingStat = dashboardSummaryRes.data?.stats?.totalOutstandingAllTime;
    assert('Dashboard Expected Rent exactly equals Total Outstanding Amount', expectedRentStat === totalOutstandingStat);

    // 21d: Test Maintenance Notification Pipeline
    const maintenanceCreateRes = await request(
      `http://${lanIp}:4000/api/maintenance`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeTenantToken}`,
        },
      },
      {
        title: 'Leaking bathroom tap',
        category: 'Other',
        description: 'Water tap is constantly dripping',
        priority: 'MEDIUM',
      },
    );
    assert('Tenant can submit maintenance request (HTTP 200/201)', maintenanceCreateRes.status === 200 || maintenanceCreateRes.status === 201);
    const maintenanceRequestId = maintenanceCreateRes.data?.id;

    // Check Admin notifications: Admin must have received MAINTENANCE_UPDATE notification
    const adminNotifsRes = await request(
      `http://${lanIp}:4000/api/notifications`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    assert('Admin notifications fetched successfully (HTTP 200)', adminNotifsRes.status === 200);
    const adminMaintenanceNotif = adminNotifsRes.data?.notifications?.find(
      (n) => n.type === 'MAINTENANCE_UPDATE' && n.title.includes('Maintenance Request'),
    );
    assert('Admin received notification for new maintenance request', !!adminMaintenanceNotif);

    // Admin updates maintenance request status
    const updateMaintRes = await request(
      `http://${lanIp}:4000/api/maintenance/${maintenanceRequestId}/status`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        status: 'IN_PROGRESS',
        adminNotes: 'Plumber scheduled for tomorrow morning',
      },
    );
    assert('Admin can update maintenance request status (HTTP 200)', updateMaintRes.status === 200);

    // Check Tenant notifications: Tenant must have received status update notification
    const tenantNotifsRes = await request(
      `http://${lanIp}:4000/api/notifications`,
      { headers: { Authorization: `Bearer ${activeTenantToken}` } },
    );
    assert('Tenant notifications fetched successfully (HTTP 200)', tenantNotifsRes.status === 200);
    const tenantMaintNotif = tenantNotifsRes.data?.notifications?.find(
      (n) => n.type === 'MAINTENANCE_UPDATE' && n.title.includes('Status Updated'),
    );
    assert('Tenant received notification for maintenance status update', !!tenantMaintNotif);

    // 21e: Test Notice Notification Pipeline
    const createNoticeRes = await request(
      `http://${lanIp}:4000/api/notices`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        title: 'Roof Cleaning Scheduled',
        content: 'Please keep items away from the terrace this Sunday.',
        category: 'MAINTENANCE',
        isActive: true,
      },
    );
    assert('Admin can publish notice (HTTP 200/201)', createNoticeRes.status === 200 || createNoticeRes.status === 201);

    // Check Tenant notifications: Tenant must have received SYSTEM notification about the new notice
    const tenantNotifsAfterNoticeRes = await request(
      `http://${lanIp}:4000/api/notifications`,
      { headers: { Authorization: `Bearer ${activeTenantToken}` } },
    );
    const tenantNoticeNotif = tenantNotifsAfterNoticeRes.data?.notifications?.find(
      (n) => n.type === 'SYSTEM' && n.title.includes('Roof Cleaning Scheduled'),
    );
    assert('Tenant received notification when new notice was published', !!tenantNoticeNotif);

    // 21f: Test Water List API
    const waterListRes = await request(
      `http://${lanIp}:4000/api/water`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    assert('Water list API returns valid array (HTTP 200)', waterListRes.status === 200 && Array.isArray(waterListRes.data));
    assert('Water list items have billStatus string when present', waterListRes.data.length === 0 || typeof waterListRes.data[0]?.billStatus === 'string');

    // =========================================================================
    // SECTION 22: Nepali Bikram Sambat Calendar (2000-2100 BS), Permanent QR & Cash Payments
    // =========================================================================
    console.log('\n--- Section 22: Nepali Calendar (2000-2100 BS), Permanent QR & Cash Payment Flow ---');

    // 22a: Nepali Calendar conversions across standard and extended BS range (2000 - 2100 BS)
    const calTodayRes = await request(`http://${lanIp}:4000/api/nepali-calendar/today`);
    assert('Nepali calendar today endpoint returns HTTP 200', calTodayRes.status === 200);
    assert('Nepali calendar today has yearBS >= 2080', typeof calTodayRes.data?.yearBS === 'number' && calTodayRes.data.yearBS >= 2080);
    assert('Nepali calendar today has valid monthBS (1-12)', calTodayRes.data?.monthBS >= 1 && calTodayRes.data?.monthBS <= 12);
    assert('Nepali calendar today has monthNameBS string', typeof calTodayRes.data?.monthNameBS === 'string' && calTodayRes.data.monthNameBS.length > 0);

    const calMonth2083Res = await request(`http://${lanIp}:4000/api/nepali-calendar/month-days?yearBS=2083&monthBS=5`);
    assert('Nepali calendar 2083 Bhadra month days returned (HTTP 200)', calMonth2083Res.status === 200 && calMonth2083Res.data?.daysCount === 31);

    const calMonth2095Res = await request(`http://${lanIp}:4000/api/nepali-calendar/month-days?yearBS=2095&monthBS=1`);
    assert('Nepali calendar extended year 2095 Baisakh month days returned (HTTP 200)', calMonth2095Res.status === 200 && calMonth2095Res.data?.daysCount === 31);

    const calConvertRes = await request(`http://${lanIp}:4000/api/nepali-calendar/convert/ad-to-bs?adDate=2026-08-22`);
    assert('AD to BS conversion returns valid Nepali date', calConvertRes.status === 200 && calConvertRes.data?.yearBS === 2083);

    // 22b: Permanent eSewa QR Code persistence
    const testQrData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const updateQrRes = await request(
      `http://${lanIp}:4000/api/settings`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        esewaQrImage: testQrData,
      },
    );
    assert('Admin can upload/configure permanent eSewa QR code (HTTP 200/201)', updateQrRes.status === 200 || updateQrRes.status === 201);

    // Verify QR code is returned in public settings
    const settingsAfterQr = await request(`http://${lanIp}:4000/api/settings/public-payment`);
    assert('Settings endpoint returns permanent eSewa QR image', settingsAfterQr.data?.esewaQrImage === testQrData);

    // Perform another settings update WITHOUT specifying esewaQrImage — verify it is NOT erased!
    await request(
      `http://${lanIp}:4000/api/settings`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        houseName: 'Yubraj Residence Permanent Test',
      },
    );
    const settingsAfterOtherUpdate = await request(`http://${lanIp}:4000/api/settings/public-payment`);
    assert('Permanent eSewa QR is preserved across general settings updates', settingsAfterOtherUpdate.data?.esewaQrImage === testQrData);

    // 22c: Direct Cash Payment Clearing Workflow
    // Find an unpaid bill
    const unpaidBillsSec22Res = await request(
      `http://${lanIp}:4000/api/billing/all?unpaidOnly=true`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    assert('Admin can fetch unpaid bills (HTTP 200)', unpaidBillsSec22Res.status === 200 && Array.isArray(unpaidBillsSec22Res.data));
    
    if (unpaidBillsSec22Res.data.length > 0) {
      const targetBill = unpaidBillsSec22Res.data[0];
      const targetTenantId = targetBill.tenantId;
      const targetBillId = targetBill.id;
      
      // Calculate total outstanding balance for this tenant across all unpaid periods
      const tenantAllUnpaid = unpaidBillsSec22Res.data.filter((b) => b.tenantId === targetTenantId);
      const totalTenantDue = tenantAllUnpaid.reduce((sum, b) => sum + (b.balanceDue || 0), 0);

      // Admin records direct cash payment for this tenant's total outstanding
      const cashPayRes = await request(
        `http://${lanIp}:4000/api/payments/cash-payment`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
        },
        {
          tenantId: targetTenantId,
          billId: targetBillId,
          amount: totalTenantDue,
          paymentDateBS: '2083-05-07',
          notes: 'Direct cash payment received and verified by admin in person',
        },
      );

      assert('Admin can record cash payment (HTTP 200/201)', cashPayRes.status === 200 || cashPayRes.status === 201);
      assert('Cash payment response has paymentMethod CASH', cashPayRes.data?.payment?.paymentMethod === 'CASH');
      assert('Cash payment status is immediately VERIFIED', cashPayRes.data?.payment?.status === 'VERIFIED');
      assert('Cash payment generates receiptNumber', typeof cashPayRes.data?.receipt?.receiptNumber === 'string');

      // Verify the bill is now completely PAID and balanceDue is 0
      const refreshedBillRes = await request(
        `http://${lanIp}:4000/api/billing/${targetBillId}`,
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );
      assert('Target bill balanceDue is now 0 after cash payment', refreshedBillRes.data?.balanceDue === 0);
      assert('Target bill status is now PAID after cash payment', refreshedBillRes.data?.status === 'PAID');

      // Verify tenant can view the digital receipt for this cash payment
      const receiptNumber = cashPayRes.data.receipt.receiptNumber;
      const receiptRes = await request(
        `http://${lanIp}:4000/api/payments/receipt/${receiptNumber}`,
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );
      assert('Digital receipt can be retrieved by receiptNumber (HTTP 200)', receiptRes.status === 200);
      assert('Digital receipt specifies CASH paymentMethod', receiptRes.data?.paymentMethod === 'CASH');
      assert('Digital receipt has correct amount', receiptRes.data?.amount === totalTenantDue);
    }

    // 22d: Test Admin Explicit QR Removal
    const deleteQrRes = await request(
      `http://${lanIp}:4000/api/settings/qr`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
    );
    assert('Admin can explicitly remove eSewa QR code (HTTP 200)', deleteQrRes.status === 200);
    const settingsAfterDeleteQr = await request(`http://${lanIp}:4000/api/settings/public-payment`);
    assert('eSewa QR code is null or empty after explicit removal', !settingsAfterDeleteQr.data?.esewaQrImage);

    // =========================================================================
    // SECTION 23: MOVED-OUT TENANT DUES, SAFE ARCHIVE, & WATER SETTLEMENT ISOLATION
    // =========================================================================
    console.log('\n--- Section 23: Moved-Out Tenant Dues, Safe Archive, & Water Settlement Isolation ---');

    // --- Scenario A: Admin Cash Payment Path ---
    // 1. Create a dedicated tenant in Room 6
    const sec23RoomId = roomsRes.data[5].id;
    const existingRoom6Active = await prisma.tenantProfile.findFirst({
      where: { roomId: sec23RoomId, status: 'ACTIVE' },
    });
    if (existingRoom6Active) {
      await prisma.tenantProfile.update({
        where: { id: existingRoom6Active.id },
        data: { status: 'MOVED_OUT' },
      });
      await prisma.room.update({
        where: { id: sec23RoomId },
        data: { status: 'VACANT' },
      });
    }

    const moveOutTenantRes = await request(
      `http://${lanIp}:4000/api/tenants`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        fullName: 'Moved Out Dues Tenant',
        phone: '9801234888',
        username: 'moved_out_dues_tenant_' + Date.now(),
        password: 'Password123!',
        roomId: sec23RoomId,
        monthlyRent: 6000,
        numberOfPeople: 1,
        moveInDateBS: '2083-05-01',
      },
    );
    assert('Created tenant for Move Out with Dues test', moveOutTenantRes.status === 200 || moveOutTenantRes.status === 201);
    const moveOutTenantId = moveOutTenantRes.data?.tenant?.id || moveOutTenantRes.data?.id;

    // 2. Add first water jar for Room 6 before billing
    const water1Res = await request(
      `http://${lanIp}:4000/api/water`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        roomId: sec23RoomId,
        yearBS: 2083,
        monthBS: 5,
        quantity: 1,
        pricePerUnit: 45,
        note: 'First delivery jar',
      },
    );
    assert('Added first water jar for Room 6 (HTTP 200/201)', water1Res.status === 200 || water1Res.status === 201);
    const water1Id = water1Res.data?.id;

    // 3. Generate bill for Month 5 (includes rent + water)
    const sec23BillGen = await request(
      `http://${lanIp}:4000/api/billing/generate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        yearBS: 2083,
        monthBS: 5,
        roomId: sec23RoomId,
      },
    );
    assert('Generated bill for Room 6 (HTTP 200/201)', sec23BillGen.status === 200 || sec23BillGen.status === 201);
    const sec23Bill = sec23BillGen.data?.bills?.[0];
    const sec23BillDue = Number(sec23Bill?.balanceDue ?? sec23Bill?.totalAmount ?? 6395);
    assert('Bill has positive balance due before move out', sec23BillDue > 0);

    // 4. Move the tenant out while dues remain unpaid
    const moveOutActionRes = await request(
      `http://${lanIp}:4000/api/tenants/${moveOutTenantId}/move-out`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        moveOutDateBS: '2083-05-15',
      },
    );
    assert('Tenant moved out with outstanding dues (HTTP 200)', moveOutActionRes.status === 200);

    // 5. Verify app does NOT crash when fetching bills and summary
    const unpaidBillsAfterMoveOut = await request(
      `http://${lanIp}:4000/api/billing/all?unpaidOnly=true`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    assert('Unpaid bills API functions without crash after tenant move-out (HTTP 200)', unpaidBillsAfterMoveOut.status === 200);
    const movedOutBill = unpaidBillsAfterMoveOut.data?.find((b) => b.tenantId === moveOutTenantId);
    assert('Moved-out tenant unpaid bill remains accessible in billing query', !!movedOutBill);

    // 6. Admin records direct Cash Payment for the moved-out tenant's bill
    const cashPayMovedOutRes = await request(
      `http://${lanIp}:4000/api/payments/cash-payment`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        tenantId: moveOutTenantId,
        billId: movedOutBill.id,
        amount: sec23BillDue,
        paymentDateBS: '2083-05-16',
        notes: 'Cash payment from moved-out tenant to clear remaining dues',
      },
    );
    assert('Admin can record cash payment for moved-out tenant (HTTP 200/201)', cashPayMovedOutRes.status === 200 || cashPayMovedOutRes.status === 201);
    assert('Cash payment for moved-out tenant generates receipt', !!cashPayMovedOutRes.data?.receipt?.receiptNumber);

    // 7. Verify moved-out tenant bill is now PAID, balance is 0, and Water 1 is permanently deleted
    const refreshedMovedOutBill = await request(
      `http://${lanIp}:4000/api/billing/${movedOutBill.id}`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    assert('Moved-out tenant bill balanceDue is 0 after cash payment', refreshedMovedOutBill.data?.balanceDue === 0);
    assert('Moved-out tenant bill status is PAID', refreshedMovedOutBill.data?.status === 'PAID');
    assert('Historical bill retains waterAmount (Rs. 45) after cash payment', refreshedMovedOutBill.data?.waterAmount === 45);

    const waterListAfterPay = await request(
      `http://${lanIp}:4000/api/water`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    const waterItem1AfterPay = waterListAfterPay.data?.find((w) => w.id === water1Id);
    assert('First water jar is deleted from API after cash bill payment', !waterItem1AfterPay);

    // Direct DB check for Path A:
    const dbWater1Check = await prisma.waterPurchase.findUnique({ where: { id: water1Id } });
    assert('Database confirms water_purchases row is permanently deleted (Path A: Cash)', dbWater1Check === null);

    // --- Scenario B: Digital Payment Path (eSewa Online Payment & Verification) ---
    const sec23Room4Id = roomsRes.data[3].id;
    const existingRoom4Active = await prisma.tenantProfile.findFirst({
      where: { roomId: sec23Room4Id, status: 'ACTIVE' },
    });
    if (existingRoom4Active) {
      await prisma.tenantProfile.update({
        where: { id: existingRoom4Active.id },
        data: { status: 'MOVED_OUT' },
      });
      await prisma.room.update({
        where: { id: sec23Room4Id },
        data: { status: 'VACANT' },
      });
    }

    const digitalTenantUsername = 'digital_pay_tenant_' + Date.now();
    const digitalTenantRes = await request(
      `http://${lanIp}:4000/api/tenants`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        fullName: 'Digital Pay Tenant',
        phone: '9801234999',
        username: digitalTenantUsername,
        password: 'Password123!',
        roomId: sec23Room4Id,
        monthlyRent: 6500,
        numberOfPeople: 1,
        moveInDateBS: '2083-05-01',
      },
    );
    const digitalTenantId = digitalTenantRes.data?.tenant?.id || digitalTenantRes.data?.id;
    assert('Created dedicated tenant for digital payment test', !!digitalTenantId);

    // Add water jar for Room 4
    const waterDigitalRes = await request(
      `http://${lanIp}:4000/api/water`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        roomId: sec23Room4Id,
        yearBS: 2083,
        monthBS: 5,
        quantity: 1,
        pricePerUnit: 45,
        note: 'Online delivery jar',
      },
    );
    const waterDigitalId = waterDigitalRes.data?.id;
    assert('Added water jar for digital tenant (HTTP 200/201)', !!waterDigitalId);

    // Generate bill for Room 4 (Month 5)
    const billDigitalGen = await request(
      `http://${lanIp}:4000/api/billing/generate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        yearBS: 2083,
        monthBS: 5,
        roomId: sec23Room4Id,
      },
    );
    const billDigital = billDigitalGen.data?.bills?.[0];
    const billDigitalDue = Number(billDigital?.balanceDue ?? billDigital?.totalAmount ?? 6895);
    assert('Digital tenant bill generated with water charge', billDigitalDue > 0 && billDigital?.waterAmount === 45);

    // Tenant logs in and submits digital payment with proof
    const digitalLoginRes = await request(
      `http://${lanIp}:4000/api/auth/login`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      { username: digitalTenantUsername, password: 'Password123!' },
    );
    const digitalTenantToken = digitalLoginRes.data.accessToken || digitalLoginRes.data.access_token;

    const digitalSubmitRes = await request(
      `http://${lanIp}:4000/api/payments/submit`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${digitalTenantToken}`,
        },
      },
      {
        billId: billDigital.id,
        amount: billDigitalDue,
        paymentMethod: 'ESEWA',
        transactionId: 'TXN-ESEWA-' + Date.now(),
        paymentDateBS: '2083-05-18',
        proofImagePath: '/uploads/proofs/test-esewa.png',
      },
    );
    assert('Tenant submitted digital payment (HTTP 200/201)', digitalSubmitRes.status === 200 || digitalSubmitRes.status === 201);
    const digitalPaymentId = digitalSubmitRes.data?.payment?.id;

    // Admin verifies digital payment
    const verifyDigitalRes = await request(
      `http://${lanIp}:4000/api/payments/${digitalPaymentId}/verify`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      { verified: true },
    );
    assert('Admin verified digital payment (HTTP 200)', verifyDigitalRes.status === 200);

    // Verify digital tenant bill is paid and water is permanently deleted from PostgreSQL
    const refreshedDigitalBill = await request(
      `http://${lanIp}:4000/api/billing/${billDigital.id}`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    assert('Digital tenant bill balanceDue is 0 after verification', refreshedDigitalBill.data?.balanceDue === 0);
    assert('Digital tenant bill status is PAID', refreshedDigitalBill.data?.status === 'PAID');
    assert('Historical bill retains waterAmount (Rs. 45) after digital payment', refreshedDigitalBill.data?.waterAmount === 45);

    const dbWaterDigitalCheck = await prisma.waterPurchase.findUnique({ where: { id: waterDigitalId } });
    assert('Database confirms water_purchases row is permanently deleted (Path B: Digital)', dbWaterDigitalCheck === null);

    // --- Scenario C: Manual Admin Water Delete ---
    const waterManualRes = await request(
      `http://${lanIp}:4000/api/water`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        roomId: sec23RoomId,
        yearBS: 2083,
        monthBS: 6,
        quantity: 2,
        pricePerUnit: 45,
        note: 'Manual delete test jar',
      },
    );
    const waterManualId = waterManualRes.data?.id;
    assert('Added water record for manual delete test', !!waterManualId);

    const deleteManualRes = await request(
      `http://${lanIp}:4000/api/water/${waterManualId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
    );
    assert('Admin can manually delete a water record (HTTP 200)', deleteManualRes.status === 200);

    const dbWaterManualCheck = await prisma.waterPurchase.findUnique({ where: { id: waterManualId } });
    assert('Database confirms water_purchases row is physically removed (Path C: Admin Delete)', dbWaterManualCheck === null);

    // --- Scenario D: Duplicate Prevention & Isolation ---
    // Add new water jar for Room 6
    const water2Res = await request(
      `http://${lanIp}:4000/api/water`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        roomId: sec23RoomId,
        yearBS: 2083,
        monthBS: 5,
        quantity: 1,
        pricePerUnit: 45,
        note: 'Second delivery jar',
      },
    );
    const water2Id = water2Res.data?.id;
    assert('Added second water jar for Room 6 (HTTP 200/201)', !!water2Id);
    assert('Second water jar has distinct permanent ID', water2Id !== water1Id);

    const waterListAfter2 = await request(
      `http://${lanIp}:4000/api/water`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    const activeJars = waterListAfter2.data?.filter((w) => w.id === water2Id);
    const oldJars = waterListAfter2.data?.filter((w) => w.id === water1Id);
    assert('Only the second water jar exists in active water records', activeJars?.length === 1);
    assert('Old paid/deleted water jar never reappears in database', oldJars?.length === 0);

    // Clean up water2
    await request(`http://${lanIp}:4000/api/water/${water2Id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` } });

    // --- Scenario E: Direct Database Verification ---
    const allDeletedIds = [water1Id, waterDigitalId, waterManualId];
    const dbDeletedCheck = await prisma.waterPurchase.findMany({
      where: { id: { in: allDeletedIds } },
    });
    assert('Direct PostgreSQL query confirms 0 deleted water rows remain in water_purchases table', dbDeletedCheck.length === 0);

    // --- Scenario F: Safe Archival vs True Deletion ---
    // 1. Delete tenant with financial records -> Safe Archival
    const archiveTenantRes = await request(
      `http://${lanIp}:4000/api/tenants/${moveOutTenantId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
    );
    assert('Tenant with financial history is safely archived (action: ARCHIVED)', archiveTenantRes.data?.action === 'ARCHIVED');
    
    // Verify historical bill is still intact and preserves water charge amount
    const historicalBillCheck = await request(
      `http://${lanIp}:4000/api/billing/${movedOutBill.id}`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    assert('Historical bill remains completely intact after tenant archival (HTTP 200)', historicalBillCheck.status === 200);
    assert('Historical bill retains waterAmount (Rs. 45) even after water purchase deletion', historicalBillCheck.data?.waterAmount === 45);

    // 2. Create tenant with NO financial records -> True Deletion
    const cleanTenantRes = await request(
      `http://${lanIp}:4000/api/tenants`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        fullName: 'Clean Transient Tenant',
        phone: '9801234777',
        username: 'clean_transient_' + Date.now(),
        password: 'Password123!',
        roomId: sec23RoomId,
        monthlyRent: 6000,
        numberOfPeople: 1,
        moveInDateBS: '2084-01-01', // Future move-in date generates 0 back-bills -> 0 dependencies
      },
    );
    const cleanTenantId = cleanTenantRes.data?.tenant?.id || cleanTenantRes.data?.id;
    assert('Created clean tenant with no bills (HTTP 200/201)', !!cleanTenantId);

    const deleteCleanTenantRes = await request(
      `http://${lanIp}:4000/api/tenants/${cleanTenantId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
    );
    assert('Tenant with 0 financial records is permanently deleted (action: DELETED)', deleteCleanTenantRes.data?.action === 'DELETED');

    // =========================================================================
    // SECTION 24: CITIZENSHIP NUMBER PERSISTENCE, DOCUMENT UPLOAD, & MULTI-CYCLE WATER
    // =========================================================================
    console.log('\n--- Section 24: Citizenship Number, Document Upload, & Multi-Cycle Water ---');

    // 1. Tenant Creation & Citizenship Number Persistence
    const sec24RoomId = roomsRes.data[4].id; // Room 5
    const existingRoom5Active = await prisma.tenantProfile.findFirst({
      where: { roomId: sec24RoomId, status: 'ACTIVE' },
    });
    if (existingRoom5Active) {
      await prisma.tenantProfile.update({
        where: { id: existingRoom5Active.id },
        data: { status: 'MOVED_OUT' },
      });
      await prisma.room.update({
        where: { id: sec24RoomId },
        data: { status: 'VACANT' },
      });
    }

    const sec24TenantUsername = 'sec24_tenant_' + Date.now();
    const sec24TenantRes = await request(
      `http://${lanIp}:4000/api/tenants`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        fullName: 'Bikash Shrestha',
        phone: '9841122334',
        username: sec24TenantUsername,
        password: 'Password123!',
        roomId: sec24RoomId,
        monthlyRent: 6000,
        numberOfPeople: 2,
        moveInDateBS: '2083-05-01',
        citizenshipNumber: '27-01-75-12345',
        notes: 'Verified tenant with initial citizenship',
      },
    );
    assert('Created tenant with initial citizenship number (HTTP 200/201)', sec24TenantRes.status === 200 || sec24TenantRes.status === 201);
    const sec24TenantId = sec24TenantRes.data?.tenant?.id || sec24TenantRes.data?.id;

    // Verify citizenship number persisted in DB
    const dbProfile1 = await prisma.tenantProfile.findUnique({ where: { userId: sec24TenantId } });
    assert('Citizenship number is persisted in PostgreSQL', dbProfile1?.citizenshipNumber === '27-01-75-12345');

    // 2. Edit Tenant: update citizenship number via PUT /api/tenants/:id
    const updateTenantRes = await request(
      `http://${lanIp}:4000/api/tenants/${sec24TenantId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        fullName: 'Bikash Shrestha Updated',
        phone: '9841122999',
        monthlyRent: 6200,
        numberOfPeople: 2,
        citizenshipNumber: '27-01-75-99999',
        notes: 'Updated notes and citizenship',
      },
    );
    assert('Admin updated tenant details and citizenship number (HTTP 200)', updateTenantRes.status === 200);

    const dbProfile2 = await prisma.tenantProfile.findUnique({ where: { userId: sec24TenantId } });
    assert('Updated citizenship number is persisted in PostgreSQL after edit', dbProfile2?.citizenshipNumber === '27-01-75-99999');
    assert('Updated rent is persisted in PostgreSQL', dbProfile2?.monthlyRent === 6200);

    // 3. Citizenship Document Upload Flow
    // Create dummy citizenship file in backend uploads directory
    const dummyUploadDir = path.join(__dirname, '../backend/uploads/private/citizenship');
    if (!fs.existsSync(dummyUploadDir)) {
      fs.mkdirSync(dummyUploadDir, { recursive: true });
    }
    const dummyFileName = `citizenship_${sec24TenantId}_test.png`;
    const dummyFilePath = path.join(dummyUploadDir, dummyFileName);
    fs.writeFileSync(dummyFilePath, Buffer.from('Fake PNG Image Data for Citizenship'));

    // Directly test Document Service save
    const saveDocDirect = await request(
      `http://${lanIp}:4000/api/documents/citizenship/${sec24TenantId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        citizenshipNumber: '27-01-75-77777',
      },
    );
    assert('Can update citizenship number via Documents endpoint (HTTP 200/201)', saveDocDirect.status === 200 || saveDocDirect.status === 201);

    // Update doc path in db to test view endpoint
    await prisma.tenantProfile.update({
      where: { userId: sec24TenantId },
      data: { citizenshipDocPath: `/uploads/private/citizenship/${dummyFileName}` },
    });

    const viewDocRes = await request(
      `http://${lanIp}:4000/api/documents/citizenship/${sec24TenantId}/view`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    assert('Citizenship view endpoint returns HTTP 200 and document content', viewDocRes.status === 200);

    // 4. Multi-Cycle Water Settlement & Continuous Purchase Flow
    // Step A: Add Water Jar in Month 5 (2083-05)
    const waterMonth5Res = await request(
      `http://${lanIp}:4000/api/water`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        roomId: sec24RoomId,
        yearBS: 2083,
        monthBS: 5,
        quantity: 1,
        pricePerUnit: 45,
        note: 'Month 5 jar delivery',
      },
    );
    assert('Added Month 5 water jar (HTTP 200/201)', waterMonth5Res.status === 200 || waterMonth5Res.status === 201);
    const waterMonth5Id = waterMonth5Res.data?.id;

    // Step B: Generate Month 5 bill
    const bill5Gen = await request(
      `http://${lanIp}:4000/api/billing/generate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        yearBS: 2083,
        monthBS: 5,
        roomId: sec24RoomId,
      },
    );
    const bill5 = bill5Gen.data?.bills?.[0];
    assert('Month 5 bill includes waterAmount (Rs. 45)', bill5?.waterAmount === 45);

    // Step C: Pay Month 5 bill with Cash
    const pay5Res = await request(
      `http://${lanIp}:4000/api/payments/cash-payment`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        tenantId: sec24TenantId,
        billId: bill5.id,
        amount: Number(bill5.balanceDue || bill5.totalAmount),
        paymentDateBS: '2083-05-20',
        notes: 'Month 5 cash payment full settlement',
      },
    );
    assert('Month 5 cash payment cleared (HTTP 200/201)', pay5Res.status === 200 || pay5Res.status === 201);

    // Step D: Confirm Month 5 water jar is permanently deleted
    const dbWater5Check = await prisma.waterPurchase.findUnique({ where: { id: waterMonth5Id } });
    assert('Month 5 water jar is permanently deleted from PostgreSQL upon payment', dbWater5Check === null);

    // Step E: Add NEW Water Jar for the SAME room in NEW Month 6 (2083-06)
    const waterMonth6Res = await request(
      `http://${lanIp}:4000/api/water`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        roomId: sec24RoomId,
        yearBS: 2083,
        monthBS: 6,
        quantity: 2,
        pricePerUnit: 45,
        note: 'Month 6 new delivery (2 jars)',
      },
    );
    assert('Added Month 6 water jars after Month 5 was settled and deleted (HTTP 200/201)', waterMonth6Res.status === 200 || waterMonth6Res.status === 201);
    const waterMonth6Id = waterMonth6Res.data?.id;
    assert('Month 6 water jar has distinct permanent ID', waterMonth6Id !== waterMonth5Id);

    // Step F: Generate Month 6 bill
    const bill6Gen = await request(
      `http://${lanIp}:4000/api/billing/generate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        yearBS: 2083,
        monthBS: 6,
        roomId: sec24RoomId,
      },
    );
    const bill6 = bill6Gen.data?.bills?.[0];
    assert('Month 6 bill includes new waterAmount (Rs. 90)', bill6?.waterAmount === 90);

    // Step G: Pay Month 6 bill with Cash
    const pay6Res = await request(
      `http://${lanIp}:4000/api/payments/cash-payment`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        tenantId: sec24TenantId,
        billId: bill6.id,
        amount: Number(bill6.balanceDue || bill6.totalAmount),
        paymentDateBS: '2083-06-15',
        notes: 'Month 6 cash payment full settlement',
      },
    );
    assert('Month 6 cash payment cleared (HTTP 200/201)', pay6Res.status === 200 || pay6Res.status === 201);

    // Step H: Confirm Month 6 water jar is permanently deleted
    const dbWater6Check = await prisma.waterPurchase.findUnique({ where: { id: waterMonth6Id } });
    assert('Month 6 water jar is permanently deleted from PostgreSQL upon payment', dbWater6Check === null);

    // Step I: Verify historical Month 5 and Month 6 bills preserve their respective water charges
    const historical5 = await prisma.monthlyBill.findUnique({ where: { id: bill5.id } });
    const historical6 = await prisma.monthlyBill.findUnique({ where: { id: bill6.id } });
    assert('Historical Month 5 bill retains waterAmount = 45 and balanceDue = 0', historical5?.waterAmount === 45 && historical5?.balanceDue === 0);
    assert('Historical Month 6 bill retains waterAmount = 90 and balanceDue = 0', historical6?.waterAmount === 90 && historical6?.balanceDue === 0);

    // ------------------------------------------------------------------------
    // SECTION 25: MOVE-OUT, VACANT ROOM RE-RENTAL & STRICT CASH PAYMENT SCOPING
    // ------------------------------------------------------------------------
    console.log('\n--- Section 25: Move-Out, Vacant Room Re-Rental & Strict Cash Payment Scoping ---');

    // 25.1: Create Tenant A in Room 2
    const tenantAPhone = '9811112233';
    const room2Obj = await prisma.room.findFirst({ where: { roomNumber: 2 } });
    
    // Ensure room 2 is vacant or clean for this test
    const existingActiveTenant = await prisma.tenantProfile.findFirst({
      where: { roomId: room2Obj.id, status: 'ACTIVE' },
    });
    if (existingActiveTenant) {
      await prisma.tenantProfile.update({
        where: { id: existingActiveTenant.id },
        data: { status: 'MOVED_OUT' },
      });
      await prisma.room.update({
        where: { id: room2Obj.id },
        data: { status: 'VACANT' },
      });
    }

    const createTenantARes = await request(
      `http://${lanIp}:4000/api/tenants`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        fullName: 'Tenant Alpha Test',
        username: 'tenant_alpha_' + Date.now(),
        phone: tenantAPhone,
        password: 'Password123!',
        roomId: room2Obj.id,
        monthlyRent: 6000,
        moveInDateBS: '2083-07-01',
      },
    );
    assert('Tenant A created in Room 2 (HTTP 200/201)', createTenantARes.status === 200 || createTenantARes.status === 201);
    const tenantAId = createTenantARes.data?.tenant?.id || createTenantARes.data?.id || createTenantARes.data?.user?.id;

    // Verify Room 2 is now OCCUPIED
    const room2OccupiedCheck = await prisma.room.findUnique({ where: { id: room2Obj.id } });
    assert('Room 2 status is OCCUPIED after Tenant A moves in', room2OccupiedCheck?.status === 'OCCUPIED');

    // 25.2: Backend rejects adding another tenant to Room 2 while occupied
    const duplicateAddRes = await request(
      `http://${lanIp}:4000/api/tenants`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        fullName: 'Unauthorized Tenant',
        username: 'unauth_' + Date.now(),
        phone: '9899999999',
        password: 'Password123!',
        roomId: room2Obj.id,
        monthlyRent: 6000,
        moveInDateBS: '2083-07-01',
      },
    );
    assert('Backend rejects adding tenant to occupied room with HTTP 400', duplicateAddRes.status === 400);

    // 25.3: Generate Month 7 bill for Tenant A in Room 2
    const billAGen = await request(
      `http://${lanIp}:4000/api/billing/generate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        yearBS: 2083,
        monthBS: 7,
        roomId: room2Obj.id,
      },
    );
    const billA = billAGen.data?.bills?.find((b) => b.tenantId === tenantAId);
    assert('Generated Month 7 bill for Tenant A in Room 2', billA !== undefined);
    assert('Tenant A Month 7 bill has balanceDue > 0', Number(billA?.balanceDue) > 0);

    // 25.4: Tenant A moves out of Room 2
    const moveOutARes = await request(
      `http://${lanIp}:4000/api/tenants/${tenantAId}/move-out`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        moveOutDateBS: '2083-07-25',
      },
    );
    assert('Tenant A moved out successfully (HTTP 200)', moveOutARes.status === 200);

    // Verify Room 2 is immediately VACANT
    const room2VacantCheck = await prisma.room.findUnique({ where: { id: room2Obj.id } });
    assert('Room 2 status immediately becomes VACANT after Tenant A move-out', room2VacantCheck?.status === 'VACANT');

    // Verify GET /api/rooms returns Room 2 as VACANT with no active tenant
    const getRoomsRes = await request(
      `http://${lanIp}:4000/api/rooms`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    const room2InApi = getRoomsRes.data?.find((r) => r.id === room2Obj.id);
    assert('GET /api/rooms returns Room 2 status as VACANT', room2InApi?.status === 'VACANT');
    assert('GET /api/rooms returns Room 2 tenant as null', room2InApi?.tenant === null || room2InApi?.tenant === undefined);

    // Verify Tenant A historical bill is preserved in PostgreSQL
    const billACheck = await prisma.monthlyBill.findUnique({ where: { id: billA.id } });
    assert('Tenant A historical bill is preserved intact in database', billACheck !== null && billACheck.tenantId === tenantAId);

    // 25.5: Add Tenant B to the newly VACANT Room 2
    const tenantBPhone = '9822223344';
    const createTenantBRes = await request(
      `http://${lanIp}:4000/api/tenants`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        fullName: 'Tenant Bravo Test',
        username: 'tenant_bravo_' + Date.now(),
        phone: tenantBPhone,
        password: 'Password123!',
        roomId: room2Obj.id,
        monthlyRent: 6500,
        moveInDateBS: '2083-08-01',
      },
    );
    assert('Tenant B successfully moved into previously vacated Room 2 (HTTP 200/201)', createTenantBRes.status === 200 || createTenantBRes.status === 201);
    const tenantBId = createTenantBRes.data?.tenant?.id || createTenantBRes.data?.id || createTenantBRes.data?.user?.id;

    // Verify Room 2 is now OCCUPIED by Tenant B
    const room2OccupiedBCheck = await prisma.room.findUnique({ where: { id: room2Obj.id } });
    assert('Room 2 status is OCCUPIED after Tenant B moves in', room2OccupiedBCheck?.status === 'OCCUPIED');

    // 25.6: Add water for Tenant B in Month 8 & generate Month 8 bill
    const waterBRes = await request(
      `http://${lanIp}:4000/api/water`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        roomId: room2Obj.id,
        yearBS: 2083,
        monthBS: 8,
        quantity: 2,
        pricePerUnit: 50,
        note: 'Tenant B delivery',
      },
    );
    assert('Water added for Tenant B in Month 8 (HTTP 200/201)', waterBRes.status === 200 || waterBRes.status === 201);

    const billBGen = await request(
      `http://${lanIp}:4000/api/billing/generate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        yearBS: 2083,
        monthBS: 8,
        roomId: room2Obj.id,
      },
    );
    const billB = billBGen.data?.bills?.find((b) => b.tenantId === tenantBId);
    assert('Generated Month 8 bill for Tenant B in Room 2', billB !== undefined);
    assert('Tenant B Month 8 bill reflects correct rent (Rs. 6500)', billB?.rentAmount === 6500);
    assert('Tenant B Month 8 bill includes water (Rs. 100)', billB?.waterAmount === 100);

    // 25.7: Verify Tenant B does NOT inherit Tenant A's Month 7 bills or dues
    const tenantBBillsRes = await request(
      `http://${lanIp}:4000/api/billing/all?tenantId=${tenantBId}`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    const tenantBBills = Array.isArray(tenantBBillsRes.data) ? tenantBBillsRes.data : [];
    const containsTenantABill = tenantBBills.some((b) => b.id === billA.id || b.monthBS === 7);
    assert('Tenant B does not inherit Tenant A past bills or dues', !containsTenantABill);

    // 25.8: Backend Cash Payment Rejection on Mismatched Tenant and Bill
    const mismatchedCashPayRes = await request(
      `http://${lanIp}:4000/api/payments/cash-payment`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        tenantId: tenantBId,
        billId: billA.id, // Bill A belongs to Tenant A!
        amount: 2000,
        paymentDateBS: '2083-08-05',
        notes: 'Invalid cross-tenant payment attempt',
      },
    );
    assert('Backend rejects mismatched cash payment (tenantId != bill.tenantId) with HTTP 400', mismatchedCashPayRes.status === 400);

    // 25.9: Admin settles moved-out Tenant A outstanding dues with Cash
    const cashPaySec25MovedOutRes = await request(
      `http://${lanIp}:4000/api/payments/cash-payment`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        tenantId: tenantAId,
        billId: billA.id,
        amount: Number(billA.balanceDue),
        paymentDateBS: '2083-08-10',
        notes: 'Final settlement for moved-out Tenant A',
      },
    );
    assert('Cash payment clears moved-out Tenant A dues (HTTP 200/201)', cashPaySec25MovedOutRes.status === 200 || cashPaySec25MovedOutRes.status === 201);

    // Verify Tenant A bill is now PAID and balance is 0
    const billASettled = await prisma.monthlyBill.findUnique({ where: { id: billA.id } });
    assert('Tenant A bill is marked PAID with balanceDue = 0', billASettled?.status === 'PAID' && billASettled?.balanceDue === 0);

    // Verify digital receipt was issued for Tenant A
    const receiptCheck = await prisma.digitalReceipt.findFirst({
      where: { payment: { tenantId: tenantAId, billId: billA.id } },
    });
    assert('Digital receipt issued for settled moved-out tenant bill', receiptCheck !== null);

    // Verify Room 2 is still OCCUPIED by Tenant B and untouched
    const room2FinalCheck = await prisma.room.findUnique({ where: { id: room2Obj.id } });
    assert('Room 2 remains OCCUPIED by Tenant B without disruption', room2FinalCheck?.status === 'OCCUPIED');

    // Reset database cleanly for user
    execSync('npx prisma db seed', {
      cwd: path.join(__dirname, '../backend'),
      stdio: 'ignore',
      shell: true,
    });

    console.log('\n========================================================================');
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('========================================================================\n');

    if (failed > 0) process.exit(1);
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  }
}

runE2ETests();
