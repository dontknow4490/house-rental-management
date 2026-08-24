# Database Schema & Entity Relationships (PostgreSQL & Prisma)

The database runs in a local PostgreSQL 16 container (`house_rental_postgres`) with persistent volume storage (`app_pgdata`).

---

## 1. Entity Relationship Overview

| Model | Purpose | Relations |
| :--- | :--- | :--- |
| **`User`** | Stores Admin and Tenant user accounts & password hashes | Has one `TenantProfile`, has many `MonthlyBill`, `Payment`, `Borrowing`, `MaintenanceRequest` |
| **`Room`** | Represents the 6 physical house rooms | Has many `TenantProfile`, `ElectricityReading`, `WaterPurchase`, `MonthlyBill`, `Adjustment` |
| **`TenantProfile`** | Links a `User` with a `Room` and stores tenancy metadata | Belongs to `User` and `Room` |
| **`SystemSetting`** | Key-value store for configurable rates & payment instructions | Standalone config store |
| **`ElectricityReading`** | Tracks monthly meter readings, delta units, and total charge | Belongs to `Room` |
| **`WaterPurchase`** | Logs drinking water purchases per room | Belongs to `Room` |
| **`Borrowing`** | Tracks loans given to tenants and repayments | Belongs to `User` (Tenant) |
| **`Adjustment`** | Records manual discounts, credits, repairs, and adjustments | Belongs to `Room` and `User` |
| **`MonthlyBill`** | Automated monthly billing invoice combining all charges | Belongs to `Room` and `User`, has many `Payment` |
| **`Payment`** | Records payment submissions and verification status | Belongs to `MonthlyBill` and `User`, has one `DigitalReceipt` |
| **`DigitalReceipt`** | Official printable digital receipt issued upon payment verification | Belongs to `Payment` |
| **`Notice`** | House announcements and maintenance notices | Standalone |
| **`MaintenanceRequest`** | Tenant repair requests with optional photo proof | Belongs to `User` and `Room` |
| **`AuditLog`** | Immutable chronological audit trail of all sensitive admin actions | Belongs to `User` |

---

## 2. Managing the Database Container

### Start Database
```bash
npm run db:up
# or: docker compose up -d
```

### Stop Database
```bash
npm run db:down
# or: docker compose down
```

### View Database Logs
```bash
npm run db:logs
```

### Open Prisma Studio (Visual DB Browser)
```bash
npm run prisma:studio
```
Prisma Studio opens at `http://localhost:5555`.

### Sync Schema Changes
```bash
npm run prisma:push
```
