import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { getUploadsRoot, getUploadSubdir } from './common/utils/upload-path.util';

function getLanIp(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        if (!name.toLowerCase().includes('vethernet') && !name.toLowerCase().includes('wsl')) {
          return iface.address;
        }
      }
    }
  }
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

process.on('uncaughtException', (err) => {
  console.error('[CRITICAL] Uncaught Exception in Backend:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL] Unhandled Rejection in Backend:', reason);
});

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Set global API prefix
  app.setGlobalPrefix('api');

  // Enable Cookie Parser for secure HTTP-only cookies
  app.use(cookieParser());

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
    }),
  );

  // Enable CORS with credentials for local and LAN access
  app.enableCors({
    origin: true, // Automatically reflects request origin for localhost, LAN IPs, and mobile devices
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Accept, Authorization, X-Requested-With',
  });

  // Ensure persistent uploads directory structure exists
  const uploadDir = getUploadsRoot();
  const dirs = ['qr', 'proofs', 'maintenance', 'private/citizenship'];
  for (const d of dirs) {
    getUploadSubdir(d);
  }

  // Serve static assets ONLY for public uploads (QR, receipts proof, maintenance photo)
  // Private citizenship documents under /uploads/private are strictly excluded from static serving
  app.useStaticAssets(join(uploadDir, 'qr'), { prefix: '/uploads/qr/' });
  app.useStaticAssets(join(uploadDir, 'proofs'), { prefix: '/uploads/proofs/' });
  app.useStaticAssets(join(uploadDir, 'maintenance'), { prefix: '/uploads/maintenance/' });

  const port = process.env.PORT || 4000;
  const lanIp = getLanIp();

  await app.listen(port, '0.0.0.0');

  console.log(`====================================================`);
  console.log(` House Rental Backend API is running on port ${port}`);
  console.log(` Local Endpoint : http://localhost:${port}/api`);
  console.log(` LAN Endpoint   : http://${lanIp}:${port}/api`);
  console.log(`====================================================`);
}
bootstrap();
