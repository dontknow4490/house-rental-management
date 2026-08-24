# Future Deployment Guide (भविष्यको तैनाथी योजना)

> **Important**: This application is currently configured for private local network operation. Do NOT deploy to the public internet until you decide to do so and have completed all security preparations.

---

## What Will Be Required for Public Cloud Deployment

When you are ready to deploy this system publicly on a VPS (e.g. DigitalOcean, AWS EC2, or a Linux server):

### 1. Domain & SSL/TLS Certificates
- A domain or subdomain (e.g., `rental.yourdomain.com`).
- Free SSL certificate via Let's Encrypt / Certbot (`https://`).

### 2. Reverse Proxy (Nginx / Caddy)
- Configure Nginx to proxy `https://rental.yourdomain.com` to Next.js (port 3000) and `/api` to NestJS (port 4000).
- Enforce HTTPS and secure cookie headers.

### 3. Production Environment Configuration
- Generate a cryptographically strong `JWT_SECRET` (e.g. `openssl rand -hex 32`).
- Update `DATABASE_URL` with a production PostgreSQL connection string.
- Set `NODE_ENV=production`.

### 4. Process Management
- Use **PM2** or **Docker Compose** on the server to ensure Next.js and NestJS restart automatically on reboot:
  ```bash
  pm2 start dist/src/main.js --name house-rental-api
  pm2 start npm --name house-rental-ui -- start
  ```

### 5. Automated Cloud Backup Cron
- Set up an automated daily cron job to run `pg_dump` and upload encrypted backups to S3 or a secondary backup server.
