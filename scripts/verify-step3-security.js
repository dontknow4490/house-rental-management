const http = require('http');
const fs = require('fs');
const path = require('path');
const { validateUploadedFile } = require('../backend/dist/src/common/utils/file-upload.util');

const BASE_URL = 'http://127.0.0.1:4000/api';

async function request(endpoint, method = 'GET', headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(`${BASE_URL}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`);
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
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data,
          });
        });
      },
    );
    req.on('error', (err) => reject(err));
    req.end();
  });
}

async function runStep3SecurityTests() {
  console.log('========================================================================');
  console.log(' STEP 3 BACKEND HARDENING & UPLOAD SECURITY VERIFICATION SUITE');
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

  try {
    // 1. HELMET SECURITY HEADERS TEST
    console.log('--- TEST GROUP 1: Helmet HTTP Security Headers ---');
    const resHeaders = await request('/nepali-calendar/today');
    assert(
      'Helmet sets X-Content-Type-Options: nosniff',
      resHeaders.headers['x-content-type-options'] === 'nosniff',
      `(${resHeaders.headers['x-content-type-options']})`,
    );
    assert(
      'Helmet sets X-Frame-Options: SAMEORIGIN / DENY',
      !!resHeaders.headers['x-frame-options'],
      `(${resHeaders.headers['x-frame-options']})`,
    );
    assert(
      'Helmet removes X-Powered-By header',
      resHeaders.headers['x-powered-by'] === undefined,
      `(x-powered-by: ${resHeaders.headers['x-powered-by']})`,
    );

    // 2. RESTRICTED CORS TEST
    console.log('\n--- TEST GROUP 2: Restricted CORS Policy ---');
    const resCorsAllowed = await request('/nepali-calendar/today', 'GET', { Origin: 'http://localhost:3000' });
    assert(
      'CORS permits whitelisted origin (http://localhost:3000)',
      resCorsAllowed.headers['access-control-allow-origin'] === 'http://localhost:3000',
      `(${resCorsAllowed.headers['access-control-allow-origin']})`,
    );

    const resCorsBlocked = await request('/nepali-calendar/today', 'GET', { Origin: 'http://evil-malicious-site.com' });
    assert(
      'CORS blocks unapproved origin (http://evil-malicious-site.com)',
      resCorsBlocked.headers['access-control-allow-origin'] !== 'http://evil-malicious-site.com',
      `(Returned origin header: ${resCorsBlocked.headers['access-control-allow-origin'] || 'none'})`,
    );

    // 3. MAGIC BYTE FILE VALIDATION TEST
    console.log('\n--- TEST GROUP 3: Server-side Magic Byte Validation ---');
    const tempDir = path.join(__dirname, '..', 'scratch');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    // Valid PNG file (Header: 89 50 4E 47 0D 0A 1A 0A)
    const validPngPath = path.join(tempDir, 'test_valid.png');
    fs.writeFileSync(validPngPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00]));

    // Fake PNG file (Fake extension .png, but text content "MALICIOUS SCRIPT")
    const fakePngPath = path.join(tempDir, 'test_fake.png');
    fs.writeFileSync(fakePngPath, '<html><script>alert("hacked")</script></html>');

    let validPassed = false;
    try {
      validateUploadedFile({ originalname: 'test_valid.png', path: validPngPath }, { allowPdf: false });
      validPassed = true;
    } catch {}
    assert('Valid PNG image passes magic-byte check', validPassed);

    let fakeRejected = false;
    try {
      validateUploadedFile({ originalname: 'test_fake.png', path: fakePngPath }, { allowPdf: false });
    } catch (e) {
      fakeRejected = true;
    }
    assert('Fake file with dangerous content fails magic-byte check & is unlinked', fakeRejected);

    // Cleanup scratch test files
    if (fs.existsSync(validPngPath)) fs.unlinkSync(validPngPath);
    if (fs.existsSync(fakePngPath)) fs.unlinkSync(fakePngPath);

    // 4. RATE LIMITING TEST
    console.log('\n--- TEST GROUP 4: Throttler Rate Limiting ---');
    let hit429 = false;
    for (let i = 0; i < 20; i++) {
      const res = await request('/auth/login', 'POST', { 'Content-Type': 'application/json' });
      if (res.status === 429) {
        hit429 = true;
        break;
      }
    }
    assert('Rate limiting returns 429 Too Many Requests on excessive login attempts', hit429);

  } catch (err) {
    console.error('Error running Step 3 security tests:', err);
    failed++;
  }

  console.log('\n========================================================================');
  console.log(` STEP 3 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED out of ${passed + failed} assertions.`);
  console.log('========================================================================\n');
}

runStep3SecurityTests();
