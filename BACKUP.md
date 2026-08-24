# Database Backup & Restore Guide

The system includes automated local backup scripts for creating and restoring full PostgreSQL SQL dumps from the Docker container.

---

## 1. Creating a Database Backup

### Option A: Using the Windows Batch Script
Double-click `scripts/backup-db.bat` or run:
```cmd
scripts\backup-db.bat
```

### Option B: Using Docker Command Directly
```bash
docker exec -t house_rental_postgres pg_dump -U postgres -d house_rental_db > backups/house_rental_backup_manual.sql
```

The backup SQL file will be saved in the `backups/` directory with a timestamp (e.g. `backups/house_rental_backup_20260821_203000.sql`).

---

## 2. Restoring a Database from Backup

### Option A: Using the Windows Batch Script
Pass the backup file path to `scripts/restore-db.bat`:
```cmd
scripts\restore-db.bat backups\house_rental_backup_20260821_203000.sql
```

### Option B: Using Docker Command Directly
```bash
docker exec -i house_rental_postgres psql -U postgres -d house_rental_db < backups/house_rental_backup_20260821_203000.sql
```

---

## 3. Data Persistence Guarantee

The PostgreSQL Docker container uses a named Docker volume (`app_pgdata`):
- **Container Restart**: Data remains intact.
- **Laptop Restart**: Data remains intact when Docker Desktop boots.
- **`docker compose down`**: Volume is preserved and reattached when running `docker compose up -d`.
- *(Note: Do NOT run `docker compose down -v` unless you explicitly intend to wipe the database volume).*
