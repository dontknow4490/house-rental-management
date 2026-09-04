# Production VPS Deployment Guide (Docker Compose + Nginx + Let's Encrypt)

> **Production Setup Overview**: Single Linux VPS hosting Next.js frontend, NestJS backend, PostgreSQL database with persistent volume, Nginx reverse proxy, and Let's Encrypt HTTPS SSL certificates.

---

## 1. Prerequisites on Linux VPS
Ensure your VPS (Ubuntu 22.04 LTS / 24.04 LTS recommended) has Docker and Docker Compose installed:
```bash
sudo apt update && sudo apt install -y docker.io docker-compose-v2 certbot
sudo systemctl enable --now docker
```

---

## 2. Environment Configuration
Create a production `.env` file in the project root directory:
```bash
cat << 'EOF' > .env
# Database Credentials
POSTGRES_USER=house_rental_admin
POSTGRES_PASSWORD=$(openssl rand -hex 16)
POSTGRES_DB=house_rental_db
DATABASE_URL=postgresql://house_rental_admin:${POSTGRES_PASSWORD}@postgres:5432/house_rental_db?schema=public

# Application Environment
NODE_ENV=production
PORT=4000
FRONTEND_URL=https://rental.yourdomain.com
ALLOW_DESTRUCTIVE_SEED=false

# Cryptographic JWT Secret
JWT_SECRET=$(openssl rand -hex 32)
JWT_EXPIRES_IN=7d

# Initial Setup Admin Account
INITIAL_ADMIN_USERNAME=admin_prod
INITIAL_ADMIN_PASSWORD=$(openssl rand -base64 16)
EOF
```

---

## 3. SSL / TLS Certificate Setup with Let's Encrypt

1. **Temporary HTTP startup for ACME challenge**:
   ```bash
   docker compose -f docker-compose.prod.yml up -d nginx
   ```
2. **Generate Certificate via Certbot**:
   ```bash
   sudo certbot certonly --webroot -w ./certbot/www -d rental.yourdomain.com --email admin@yourdomain.com --agree-tos --no-eff-email
   ```
3. **Activate HTTPS in `nginx.conf`**:
   Uncomment the HTTPS block in `nginx.conf` and replace `rental.yourdomain.com` with your real domain.

---

## 4. Build & Launch Production Containers

Start the multi-container stack in detached mode:
```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### What happens automatically on startup:
1. `postgres` starts and initializes health checks.
2. `backend` waits for PostgreSQL health, executes `npx prisma migrate deploy` non-destructively, and runs NestJS on port 4000.
3. `frontend` builds Next.js assets and starts server on port 3000.
4. `nginx` proxies traffic:
   - `https://rental.yourdomain.com/` -> Next.js Frontend
   - `https://rental.yourdomain.com/api/` -> NestJS Backend
   - `https://rental.yourdomain.com/uploads/` -> Static uploads (QR, proofs, maintenance photos)
   - `https://rental.yourdomain.com/uploads/private/` -> **403 Forbidden (Blocked from public static access)**

---

## 5. Automated Daily Database Backups

Add a daily cron job (`crontab -e`) to back up PostgreSQL to `./backups/`:
```bash
0 2 * * * docker exec house_rental_postgres_prod pg_dump -U house_rental_admin -d house_rental_db | gzip > /var/backups/house_rental_$(date +\%Y\%m\%d).sql.gz
```

---

## 6. Maintenance & Log Monitoring
- **View Container Status**: `docker compose -f docker-compose.prod.yml ps`
- **View Live Backend Logs**: `docker compose -f docker-compose.prod.yml logs -f backend`
- **Restart Application**: `docker compose -f docker-compose.prod.yml restart`
