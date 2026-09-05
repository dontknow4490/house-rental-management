import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
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

  // Enable trust proxy for reverse proxies (Nginx/Cloudflare)
  app.set('trust proxy', 1);

  // Configure Helmet security HTTP headers
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allows cross-origin image loading for static uploads
      contentSecurityPolicy: false,
    }),
  );

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

  // Configure restricted CORS whitelist
  const lanIp = getLanIp();
  const allowedOrigins: string[] = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    `http://localhost:${process.env.PORT || 4000}`,
    `http://127.0.0.1:${process.env.PORT || 4000}`,
  ];

  if (process.env.FRONTEND_URL) {
    const origins = process.env.FRONTEND_URL.split(',')
      .map((url) => url.trim().replace(/\/$/, ''))
      .filter(Boolean);
    allowedOrigins.push(...origins);
  }

  if (process.env.NODE_ENV !== 'production' && lanIp) {
    allowedOrigins.push(`http://${lanIp}:3000`);
    allowedOrigins.push(`http://${lanIp}:${process.env.PORT || 4000}`);
  }

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or server-side fetch)
      if (!origin) return callback(null, true);

      const isAllowed = allowedOrigins.some((allowed) => allowed === origin);
      if (isAllowed) {
        callback(null, true);
      } else {
        console.warn(`[CORS WARN] Request blocked from unapproved origin: ${origin}`);
        callback(new Error(`CORS policy restriction: Origin '${origin}' is not allowed.`));
      }
    },
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

  await app.listen(port, '0.0.0.0');

  console.log(`====================================================`);
  console.log(` House Rental Backend API is running on port ${port}`);
  console.log(` Local Endpoint : http://localhost:${port}/api`);
  console.log(` LAN Endpoint   : http://${lanIp}:${port}/api`);
  console.log(`====================================================`);
}
bootstrap();
