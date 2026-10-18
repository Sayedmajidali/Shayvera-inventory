-- AlterTable
ALTER TABLE "public"."ProductTransaction" ADD COLUMN     "idempotencyKey" TEXT;

-- AlterTable
ALTER TABLE "public"."RawMaterialTransaction" ADD COLUMN     "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ProductTransaction_idempotencyKey_key" ON "public"."ProductTransaction"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "RawMaterialTransaction_idempotencyKey_key" ON "public"."RawMaterialTransaction"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "public"."InventoryAdjustment" ADD CONSTRAINT "InventoryAdjustment_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "public"."ProductBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

