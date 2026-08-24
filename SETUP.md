# Setup Guide (स्थापना निर्देशिका)

Complete step-by-step instructions to set up, initialize, and test the Private House Rental Management System.

---

## 1. Prerequisites

Ensure you have the following installed on your laptop:
- **Node.js** (v18+)
- **npm** (v9+)
- **Git**
- **Docker Desktop** (Running)

---

## 2. Step-by-Step Installation

### Step 1: Start PostgreSQL via Docker Compose
Run the following command in the project root:
```bash
npm run db:up
```
This starts the `house_rental_postgres` container on `127.0.0.1:5432` with a persistent volume named `app_pgdata`.

To check database container status:
```bash
docker ps
```

---

### Step 2: Install Dependencies
If not already installed:
```bash
# In backend/
cd backend
npm install

# In frontend/
cd ../frontend
npm install
cd ..
```

---

### Step 3: Run Database Migrations & Initial Setup
Run the setup script:
```bash
npm run setup
```
This prompts you to set your initial administrator password (or uses default `Admin@Yubraj99`), pushes the Prisma schema to PostgreSQL, and seeds the 6 rooms and sample fake test accounts.

---

### Step 4: Run Automated Tests
Verify all calculations, electricity validations, and billing rules:
```bash
npm run test:backend
```

---

### Step 5: Start in Local Network Mode (LAN Mode)
Run:
```bash
npm run start:lan
```
Or double-click `scripts/start-lan.bat`.

The console will display:
```
========================================================================
       HOUSE RENTAL MANAGEMENT SYSTEM (LOCAL NETWORK MODE)              
========================================================================
 Laptop Web Access : http://localhost:3000
 Phone Wi-Fi Access: http://192.168.1.83:3000
 Backend REST API  : http://192.168.1.83:4000/api
========================================================================
```

---

## 3. How to Connect from Your Phone

1. Ensure your smartphone is connected to the **same home Wi-Fi network** as your laptop.
2. Open Chrome/Safari on your phone and navigate to:
   ```
   http://192.168.1.83:3000
   ```
   *(Replace with your laptop's detected Wi-Fi IP address if different)*
3. Login as tenant (`tenant_ram` / `Password@123`).
4. You will immediately see the **TOTAL AMOUNT DUE** and can test submitting a payment proof screenshot!
