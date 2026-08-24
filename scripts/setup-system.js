const readline = require('readline');
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log('========================================================================');
console.log('        HOUSE RENTAL MANAGEMENT SYSTEM - INITIAL SETUP                  ');
console.log('========================================================================');

rl.question('Enter initial administrator username [Default: admin]: ', (usernameInput) => {
  const chosenUsername = usernameInput.trim() || 'admin';

  rl.question('Enter initial administrator password (min 6 characters): ', (passwordInput) => {
    const chosenPassword = passwordInput.trim();

    if (!chosenPassword || chosenPassword.length < 6) {
      console.error('\n[ERROR] Administrator password must be at least 6 characters long.');
      rl.close();
      process.exit(1);
    }

    const dockerCmd = process.platform === 'win32' ? 'docker.exe' : 'docker';
    const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

    console.log('\n[1/3] Ensuring PostgreSQL container is running...');
    spawnSync(dockerCmd, ['compose', 'up', '-d'], { cwd: rootDir, stdio: 'inherit' });

    console.log('\n[2/3] Syncing Prisma Database Schema...');
    spawnSync(npxCmd, ['prisma', 'db', 'push'], { cwd: path.join(rootDir, 'backend'), stdio: 'inherit' });

    console.log('\n[3/3] Seeding database with initial rooms, rates, and admin...');
    const env = {
      ...process.env,
      INITIAL_ADMIN_USERNAME: chosenUsername,
      INITIAL_ADMIN_PASSWORD: chosenPassword,
      ALLOW_DESTRUCTIVE_SEED: 'true',
    };
    spawnSync(npxCmd, ['prisma', 'db', 'seed'], { cwd: path.join(rootDir, 'backend'), env, stdio: 'inherit' });

    console.log('\n========================================================================');
    console.log(' Setup completed successfully!');
    console.log(' Administrator account is ready:');
    console.log(` Username: ${chosenUsername}`);
    console.log(' Password: (configured)');
    console.log('\n You can change your username and password anytime from:');
    console.log(' Admin -> Account/Security Settings');
    console.log('========================================================================\n');
    rl.close();
  });
});
