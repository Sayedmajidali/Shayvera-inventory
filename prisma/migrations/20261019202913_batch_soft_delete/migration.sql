-- AlterTable
ALTER TABLE "ProductBatch" ADD COLUMN     "deleteReason" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMPTZ(3);

