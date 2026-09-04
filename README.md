# Private House Rental Management System (घर भाडा व्यवस्थापन प्रणाली)

A secure, private rental management system custom-built for managing a **single 6-room private house**. Built with **Next.js**, **NestJS**, **TypeScript**, **Tailwind CSS**, **Prisma ORM**, and **PostgreSQL (Docker)**.

> **Privacy & Local Network Notice**: This is a private, self-hosted system running locally on the administrator's laptop and accessible from mobile phones over the home Wi-Fi network without public cloud or SaaS dependencies.

---

## Key Features

1. **Prominent Bikram Sambat (BS) Nepali Calendar**:
   - Automatic live Nepali date (`आज: २०८३ भदौ ५ गते, शुक्रबार`).
   - Nepali months (बैशाख to चैत) and localized digit rendering.
   - Monthly billing cycles, electricity readings, water purchases, and receipts aligned with BS dates.

2. **Automated Monthly Billing**:
   - **Room Rent**: Configurable per room (Room 1: Rs. 6,000, Room 2: Rs. 5,500, Room 3: Rs. 6,500, Rooms 4-6: configurable).
   - **Internet**: Auto-calculated based on occupants (`Rs. 250/person/month`).
   - **Electricity**: Auto-calculated from meter readings (`(Current - Previous) × Rs. 15/unit`) with validation preventing current readings from being lower than previous readings.
   - **Drinking Water**: Quantity × price per jar (`Rs. 45/jar`).
   - **Custom Purchases / Extras**: Line-item tracking for groceries, gas cylinders, and custom charges.
   - **Adjustments & Discounts**: Manual credits, discounts, repairs, and balance carryovers.

3. **Tenant Fast-Pay & Payment Verification**:
   - Mobile-first tenant experience: `Amount Due` -> `[ PAY NOW ]` -> `Breakdown`.
   - Dynamic eSewa QR code, bank transfer details, and cash instructions.
   - Payment proof screenshot upload with transaction ID tracking.
   - Admin verification queue: One-click verify or reject with reason.
   - Official system-generated **Digital Receipts** with printable/downloadable layout.

4. **Strict Security & Tenant Data Isolation**:
   - Role-based access control (`ADMIN` vs `TENANT`).
   - Server-side authorization: Tenants can only view their own bills, payments, and receipts.
   - Admin-only secure storage for tenant **Citizenship / ID documents** (never exposed publicly).
   - Passwords hashed with `bcrypt` (cost factor 12).
   - HTTP-only secure cookies and Bearer token support for local Wi-Fi cross-device communication.

5. **Local Network Testing (Wi-Fi Access)**:
   - Zero cloud exposure.
   - Built-in script automatically detects laptop Wi-Fi IPv4 (`192.168.1.83`) and serves the app to mobile phones on the same network.

---

## Technology Stack

- **Frontend**: Next.js 15 (App Router), TypeScript, Tailwind CSS, Lucide Icons
- **Backend**: NestJS 10, TypeScript, REST API, Passport JWT, Multer
- **Database**: PostgreSQL 16 (Running locally via Docker Compose)
- **ORM**: Prisma ORM 5
- **Calendar**: Custom standalone Bikram Sambat (BS) engine

---

## Quick Start (3 Steps)

### 1. Start Database
```bash
npm run db:up
```

### 2. Run Setup / Seed
```bash
npm run setup
```

### 3. Start for Laptop & Phone Access (LAN Mode)
```bash
npm run start:lan
```
Open your mobile browser to `http://<LAPTOP-LAN-IP>:3000` (e.g. `http://192.168.1.83:3000`).

---

## Initial Accounts & Rooms

- **Administrator**: `yubraj_99` (Default Password: `Admin@Yubraj99`)
- **Rooms**: 6 Rooms initialized (Room 1 to 6), all initially **VACANT** with zero fake mock tenants. Real tenants are added directly from **Admin -> Tenants -> Add Tenant**.
- *Admin credentials can be updated anytime from **Admin -> Account / Security Settings**.*

---

## Documentation

- [`SETUP.md`](file:///c:/Users/Yuvraj/OneDrive/Desktop/app/SETUP.md): Installation & Docker setup
- [`ARCHITECTURE.md`](file:///c:/Users/Yuvraj/OneDrive/Desktop/app/ARCHITECTURE.md): Architecture & Security model
- [`DATABASE.md`](file:///c:/Users/Yuvraj/OneDrive/Desktop/app/DATABASE.md): PostgreSQL Schema & Prisma models
- [`BACKUP.md`](file:///c:/Users/Yuvraj/OneDrive/Desktop/app/BACKUP.md): Database Backup & Restore instructions
- [`DEPLOYMENT.md`](file:///c:/Users/Yuvraj/OneDrive/Desktop/app/DEPLOYMENT.md): Future public deployment guidelines
