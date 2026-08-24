# System Architecture & Security Specification

This document details the architectural design, security boundaries, and data flow of the Private House Rental Management System.

---

## 1. High-Level Architecture

```
                      [ Home Wi-Fi Network ]
                                 │
            ┌────────────────────┴────────────────────┐
            ▼                                         ▼
   [ Admin Laptop ]                           [ Tenant Phone ]
  http://localhost:3000                    http://<LAN-IP>:3000
            │                                         │
            └────────────────────┬────────────────────┘
                                 ▼
                     [ Next.js Frontend (3000) ]
                     (Responsive / Mobile-First)
                                 │
                                 ▼ (REST API / Bearer Token / Cookies)
                     [ NestJS Backend (4000) ]
                     (Guards, Logic, BS Engine)
                                 │
            ┌────────────────────┴────────────────────┐
            ▼                                         ▼
[ PostgreSQL 16 (Docker) ]                  [ Local Filesystem ]
 (127.0.0.1:5432 - Private)                  - /uploads/proofs/
 (Volume: app_pgdata)                       - /uploads/qr/
                                            - /uploads/private/citizenship/
```

---

## 2. Security & Data Isolation Model

### 1. No Public Registration
- Tenant accounts can only be created by the administrator. There is no self-registration endpoint.

### 2. Strict Tenant Data Isolation
- Authorization is enforced on the NestJS backend controllers using `@UseGuards(JwtAuthGuard, RolesGuard)`.
- Tenant endpoints inject the `@CurrentUser()` decorator and scope database queries to `tenantId === user.id`.
- If a tenant attempts to view another tenant's bill, receipts, or document, the server immediately returns a `403 Forbidden` response.

### 3. Admin-Only Citizenship Records
- Citizenship numbers and document scans are strictly prohibited from tenant access.
- Uploaded files are stored in `uploads/private/citizenship/` outside the public static directory.
- Files are streamed strictly through an authenticated endpoint (`GET /api/documents/citizenship/:id/view`) protected by `@Roles(Role.ADMIN)`.

### 4. Password Security
- Passwords are never stored in plain text and are hashed using `bcrypt` (12 rounds).
- Passwords are never returned in API payloads and are omitted from user queries using Prisma projections.

### 5. Private Database Isolation
- PostgreSQL is bound exclusively to `127.0.0.1:5432` on the laptop host and is never exposed directly to the LAN.
- The mobile phone only talks to Next.js (port 3000) and NestJS (port 4000).

---

## 3. Bikram Sambat (BS) Nepali Calendar Engine

The calendar service (`NepaliCalendarService`) provides:
- Conversion from Gregorian AD `Date` to Bikram Sambat (BS) date objects (`yearBS`, `monthBS`, `dayBS`, `monthNameBS`, `dayNameBS`, `nepaliFormatted`).
- Nepali digit translation (`toNepaliDigits(1250)` -> `१२५०`).
- Month mapping:
  `बैशाख`, `जेठ`, `असार`, `साउन`, `भदौ`, `असोज`, `कात्तिक`, `मंसिर`, `पुस`, `माघ`, `फागुन`, `चैत`.
- Real-time today computation without requiring manual entry from the administrator.

---

## 4. Calculation Rules

### Electricity:
```
unitsUsed = currentReading - previousReading
totalCharge = unitsUsed × unitRate (default Rs. 15)
validation: currentReading >= previousReading (throws 400 Bad Request if lower)
```

### Internet:
```
internetCharge = numberOfPeople × internetPerPersonRate (default Rs. 250)
```

### Water:
```
waterCharge = quantity × pricePerUnit (default Rs. 45)
```

### Monthly Bill Total:
```
totalAmount = rentAmount + internetAmount + electricityAmount + waterAmount + borrowingAmount + adjustmentsAmount
balanceDue = max(0, totalAmount - paidAmount)
```
