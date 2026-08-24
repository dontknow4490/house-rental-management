const os = require('os');
const { spawn, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');

function getLanIp() {
  const interfaces = os.networkInterfaces();
  const priorityKeywords = ['wi-fi', 'wifi', 'wireless', 'wlan', 'ethernet'];
  
  // 1. Prioritize active physical Wi-Fi and Ethernet adapters
  for (const keyword of priorityKeywords) {
    for (const name of Object.keys(interfaces)) {
      const lowerName = name.toLowerCase();
      const isExcluded = lowerName.includes('*') || 
                         lowerName.includes('virtual') || 
                         lowerName.includes('vethernet') || 
                         lowerName.includes('wsl') || 
                         lowerName.includes('docker') || 
                         lowerName.includes('loopback') ||
                         lowerName.includes('host-only');
      if (lowerName.includes(keyword) && !isExcluded) {
        for (const iface of interfaces[name] || []) {
          if (iface.family === 'IPv4' && !iface.internal && iface.address !== '127.0.0.1') {
            return iface.address;
          }
        }
      }
    }
  }

  // 2. Check other non-virtual adapters
  for (const name of Object.keys(interfaces)) {
    const lowerName = name.toLowerCase();
    const isExcluded = lowerName.includes('*') || 
                       lowerName.includes('virtual') || 
                       lowerName.includes('vethernet') || 
                       lowerName.includes('wsl') || 
                       lowerName.includes('docker') || 
                       lowerName.includes('loopback') ||
                       lowerName.includes('host-only');
    if (!isExcluded) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal && iface.address !== '127.0.0.1') {
          return iface.address;
        }
      }
    }
  }

  // 3. Fallback to any non-internal IPv4
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal && iface.address !== '127.0.0.1') {
        return iface.address;
      }
    }
  }

  return '127.0.0.1';
}

function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') resolve(true);
      else resolve(false);
    });
    server.once('listening', () => {
      server.close(() => resolve(false));
    });
    server.listen(port, '0.0.0.0');
  });
}

function freePortWindows(port) {
  if (process.platform !== 'win32') return;
  try {
    const output = execFileSync('netstat.exe', ['-ano', '-p', 'TCP'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const lines = output.split(/\r?\n/);
    for (const line of lines) {
      if (line.includes(`:${port}`) && (line.includes('LISTENING') || line.includes('LISTEN'))) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0' && parseInt(pid, 10) !== process.pid) {
          try {
            execFileSync('taskkill.exe', ['/F', '/PID', pid, '/T'], { stdio: 'ignore' });
          } catch {}
        }
      }
    }
  } catch {}
}

async function ensurePortAvailable(port, maxAttempts = 15) {
  for (let i = 0; i < maxAttempts; i++) {
    const inUse = await isPortInUse(port);
    if (!inUse) return true;
    freePortWindows(port);
    await new Promise((r) => setTimeout(r, 300));
  }
  return !(await isPortInUse(port));
}

async function start() {
  const lanIp = getLanIp();
  const rootDir = path.resolve(__dirname, '..');
  const backendDir = path.join(rootDir, 'backend');
  const frontendDir = path.join(rootDir, 'frontend');

  // Ensure ports 3000 and 4000 are completely free before launching
  await ensurePortAvailable(3000);
  await ensurePortAvailable(4000);

  console.log('\n========================================================================');
  console.log('       HOUSE RENTAL MANAGEMENT SYSTEM                                   ');
  console.log('========================================================================');
  console.log(`  Local:    http://localhost:3000`);
  console.log(`  Network:  http://${lanIp}:3000`);
  console.log('------------------------------------------------------------------------');
  console.log(`  Backend API : http://${lanIp}:4000/api`);
  console.log(`  Database    : 127.0.0.1:5432 (PostgreSQL Private)`);
  console.log('========================================================================\n');

  const nodeExe = process.execPath;
  const backendMainJs = path.join(backendDir, 'dist', 'src', 'main.js');
  const nestCli = path.join(backendDir, 'node_modules', '@nestjs', 'cli', 'bin', 'nest.js');
  const nextCli = path.join(frontendDir, 'node_modules', 'next', 'dist', 'bin', 'next');

  // Ensure backend is freshly built
  console.log('[Info] Compiling backend service...');
  execFileSync(nodeExe, [nestCli, 'build'], {
    cwd: backendDir,
    stdio: 'inherit',
  });

  let isShuttingDown = false;
  let backend = null;
  let frontend = null;

  async function spawnBackend() {
    if (isShuttingDown) return;
    await ensurePortAvailable(4000);
    backend = spawn(nodeExe, [backendMainJs], {
      cwd: backendDir,
      stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...process.env, PORT: '4000' },
    });

    backend.on('error', (err) => {
      console.error('[Backend Error]:', err.message);
    });

    backend.on('exit', (code, signal) => {
      if (!isShuttingDown && code !== 0) {
        console.warn(`[Backend] Process exited (code: ${code}, signal: ${signal}). Restarting in 2s...`);
        setTimeout(spawnBackend, 2000);
      }
    });
  }

  async function spawnFrontend() {
    if (isShuttingDown) return;
    await ensurePortAvailable(3000);
    frontend = spawn(nodeExe, [nextCli, 'dev', '-H', '0.0.0.0', '-p', '3000'], {
      cwd: frontendDir,
      stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...process.env, PORT: '3000' },
    });

    frontend.on('error', (err) => {
      console.error('[Frontend Error]:', err.message);
    });

    frontend.on('exit', (code, signal) => {
      if (!isShuttingDown && code !== 0) {
        console.warn(`[Frontend] Process exited (code: ${code}, signal: ${signal}). Restarting in 2s...`);
        setTimeout(spawnFrontend, 2000);
      }
    });
  }

  // Clean .next cache if switching from next build to prevent Windows OneDrive lock conflicts
  const nextCacheDir = path.join(frontendDir, '.next');
  if (fs.existsSync(nextCacheDir)) {
    try {
      fs.rmSync(nextCacheDir, { recursive: true, force: true });
    } catch {}
  }

  // Launch both services cleanly
  await spawnBackend();
  await spawnFrontend();

  function cleanup() {
    if (isShuttingDown) return;
    isShuttingDown = true;

    if (backend && backend.pid) {
      if (process.platform === 'win32') {
        try {
          execFileSync('taskkill.exe', ['/F', '/PID', String(backend.pid), '/T'], {
            stdio: 'ignore',
          });
        } catch {}
      } else {
        try { backend.kill(); } catch {}
      }
    }
    if (frontend && frontend.pid) {
      if (process.platform === 'win32') {
        try {
          execFileSync('taskkill.exe', ['/F', '/PID', String(frontend.pid), '/T'], {
            stdio: 'ignore',
          });
        } catch {}
      } else {
        try { frontend.kill(); } catch {}
      }
    }
    process.exit(0);
  }

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('SIGHUP', cleanup);

  // Keep process alive indefinitely
  setInterval(() => {}, 1000 * 60 * 60);
}

start();
