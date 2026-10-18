-- DropIndex
DROP INDEX "RawMaterialEntry_status_idx";

-- AlterTable
ALTER TABLE "RawMaterialEntry" ADD COLUMN     "deleteReason" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT;

-- AlterTable
ALTER TABLE "ReadyProduct" ADD COLUMN     "deleteReason" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT;

-- CreateIndex
CREATE INDEX "RawMaterialEntry_status_deletedAt_idx" ON "RawMaterialEntry"("status", "deletedAt");

-- AddForeignKey
ALTER TABLE "RawMaterialEntry" ADD CONSTRAINT "RawMaterialEntry_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadyProduct" ADD CONSTRAINT "ReadyProduct_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- A soft-deleted record must say who deleted it and why.
ALTER TABLE "RawMaterialEntry" ADD CONSTRAINT "raw_entry_delete_complete"
  CHECK (("deletedAt" IS NULL AND "deletedById" IS NULL AND "deleteReason" IS NULL)
      OR ("deletedAt" IS NOT NULL AND "deletedById" IS NOT NULL AND length(trim("deleteReason")) > 0));
-- Only entries with no inspection decision can be deleted.
ALTER TABLE "RawMaterialEntry" ADD CONSTRAINT "raw_entry_delete_only_pending"
  CHECK ("deletedAt" IS NULL OR "status" = 'PENDING_INSPECTION');
ALTER TABLE "ReadyProduct" ADD CONSTRAINT "product_delete_complete"
  CHECK (("deletedAt" IS NULL AND "deletedById" IS NULL AND "deleteReason" IS NULL)
      OR ("deletedAt" IS NOT NULL AND "deletedById" IS NOT NULL AND length(trim("deleteReason")) > 0 AND "active" = false));
