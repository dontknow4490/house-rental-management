-- AlterTable
ALTER TABLE "monthly_bills" ADD COLUMN IF NOT EXISTS "customPurchasesAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE IF NOT EXISTS "custom_purchases" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "tenantId" TEXT,
    "itemName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "yearBS" INTEGER NOT NULL,
    "monthBS" INTEGER NOT NULL,
    "purchaseDateBS" TEXT NOT NULL,
    "purchaseDateAD" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "isSettled" BOOLEAN NOT NULL DEFAULT false,
    "billId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "custom_purchases_roomId_yearBS_monthBS_idx" ON "custom_purchases"("roomId", "yearBS", "monthBS");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "custom_purchases_tenantId_idx" ON "custom_purchases"("tenantId");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'custom_purchases_roomId_fkey'
    ) THEN
        ALTER TABLE "custom_purchases" ADD CONSTRAINT "custom_purchases_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'custom_purchases_tenantId_fkey'
    ) THEN
        ALTER TABLE "custom_purchases" ADD CONSTRAINT "custom_purchases_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'custom_purchases_billId_fkey'
    ) THEN
        ALTER TABLE "custom_purchases" ADD CONSTRAINT "custom_purchases_billId_fkey" FOREIGN KEY ("billId") REFERENCES "monthly_bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
