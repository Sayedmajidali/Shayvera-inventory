-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "public"."EntryStatus" AS ENUM ('PENDING_INSPECTION', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."InspectionDecision" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."RawTxnType" AS ENUM ('INWARD_APPROVED', 'INSPECTION_REVERSAL', 'PRODUCTION_ISSUE', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "public"."StockBucket" AS ENUM ('SALEABLE', 'QUARANTINE', 'DAMAGED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "public"."ProductTxnType" AS ENUM ('OPENING', 'RECEIPT', 'PRODUCTION_RECEIPT', 'ADJUSTMENT', 'DISPATCH', 'RETURN', 'DISPOSITION', 'REVERSAL');

-- CreateEnum
CREATE TYPE "public"."AlertStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "public"."DocStatus" AS ENUM ('POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "public"."ReturnCondition" AS ENUM ('SALEABLE', 'DAMAGED', 'EXPIRED', 'PENDING_INSPECTION');

-- CreateEnum
CREATE TYPE "public"."AttachmentCategory" AS ENUM ('RAW_MATERIAL_BILL', 'DISPATCH_BILL', 'SHIPMENT_DOCUMENT', 'RETURN_DOCUMENT', 'PRODUCT_IMAGE');

-- CreateEnum
CREATE TYPE "public"."AttachmentStatus" AS ENUM ('ACTIVE', 'REPLACED');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "public"."Role" NOT NULL DEFAULT 'STAFF',
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ip" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "public"."DocumentSequence" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "public"."Unit" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "allowsDecimal" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Supplier" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "gstNumber" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Store" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "storeType" TEXT NOT NULL,
    "contact" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProductCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RawMaterial" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "currentBalance" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RawMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RawMaterialEntry" (
    "id" TEXT NOT NULL,
    "entryNo" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "rawMaterialId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitId" TEXT NOT NULL,
    "poNumber" TEXT,
    "invoiceNumber" TEXT,
    "notes" TEXT,
    "status" "public"."EntryStatus" NOT NULL DEFAULT 'PENDING_INSPECTION',
    "idempotencyKey" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RawMaterialEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."QualityInspection" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "decision" "public"."InspectionDecision" NOT NULL,
    "notes" TEXT,
    "rejectionReason" TEXT,
    "inspectedById" TEXT NOT NULL,
    "inspectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMP(3),
    "reversedById" TEXT,
    "reversalReason" TEXT,

    CONSTRAINT "QualityInspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RawMaterialTransaction" (
    "id" TEXT NOT NULL,
    "txnNo" TEXT NOT NULL,
    "type" "public"."RawTxnType" NOT NULL,
    "rawMaterialId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "balanceAfter" DECIMAL(18,3) NOT NULL,
    "entryId" TEXT,
    "inspectionId" TEXT,
    "reference" TEXT,
    "reason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawMaterialTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ReadyProduct" (
    "id" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "categoryId" TEXT,
    "unitId" TEXT NOT NULL,
    "lowStockThreshold" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "expiryAlertDays" INTEGER NOT NULL DEFAULT 30,
    "tracksExpiry" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "imageAttachmentId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReadyProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProductBatch" (
    "id" TEXT NOT NULL,
    "batchNo" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "receivedDate" DATE NOT NULL,
    "expiryDate" DATE,
    "initialQty" DECIMAL(18,3) NOT NULL,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StockBalance" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "bucket" "public"."StockBucket" NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProductTransaction" (
    "id" TEXT NOT NULL,
    "txnNo" TEXT NOT NULL,
    "type" "public"."ProductTxnType" NOT NULL,
    "productId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "bucket" "public"."StockBucket" NOT NULL,
    "unitId" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "storeId" TEXT,
    "dispatchId" TEXT,
    "returnId" TEXT,
    "adjustmentId" TEXT,
    "dispositionId" TEXT,
    "reversalOfId" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."InventoryAdjustment" (
    "id" TEXT NOT NULL,
    "adjustmentNo" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "bucket" "public"."StockBucket" NOT NULL,
    "quantityDelta" DECIMAL(18,3) NOT NULL,
    "reason" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LowStockAlert" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "status" "public"."AlertStatus" NOT NULL DEFAULT 'OPEN',
    "availableQty" DECIMAL(18,3) NOT NULL,
    "threshold" DECIMAL(18,3) NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "LowStockAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Dispatch" (
    "id" TEXT NOT NULL,
    "dispatchNo" TEXT NOT NULL,
    "dispatchDate" TIMESTAMP(3) NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderRef" TEXT,
    "invoiceNumber" TEXT,
    "notes" TEXT,
    "status" "public"."DocStatus" NOT NULL DEFAULT 'POSTED',
    "idempotencyKey" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMP(3),
    "reversedById" TEXT,
    "reversalReason" TEXT,

    CONSTRAINT "Dispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DispatchLine" (
    "id" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "returnedQty" DECIMAL(18,3) NOT NULL DEFAULT 0,

    CONSTRAINT "DispatchLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DispatchAllocation" (
    "id" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "returnedQty" DECIMAL(18,3) NOT NULL DEFAULT 0,

    CONSTRAINT "DispatchAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProductReturn" (
    "id" TEXT NOT NULL,
    "returnNo" TEXT NOT NULL,
    "returnDate" TIMESTAMP(3) NOT NULL,
    "storeId" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "status" "public"."DocStatus" NOT NULL DEFAULT 'POSTED',
    "idempotencyKey" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMP(3),
    "reversedById" TEXT,
    "reversalReason" TEXT,

    CONSTRAINT "ProductReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProductReturnLine" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "dispatchLineId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "condition" "public"."ReturnCondition" NOT NULL,
    "notes" TEXT,

    CONSTRAINT "ProductReturnLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProductReturnAllocation" (
    "id" TEXT NOT NULL,
    "returnLineId" TEXT NOT NULL,
    "dispatchAllocationId" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,

    CONSTRAINT "ProductReturnAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."QuarantineDisposition" (
    "id" TEXT NOT NULL,
    "dispositionNo" TEXT NOT NULL,
    "returnLineId" TEXT,
    "batchId" TEXT NOT NULL,
    "toBucket" "public"."StockBucket" NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "notes" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuarantineDisposition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StoreSale" (
    "id" TEXT NOT NULL,
    "saleNo" TEXT NOT NULL,
    "saleDate" TIMESTAMP(3) NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BillAttachment" (
    "id" TEXT NOT NULL,
    "category" "public"."AttachmentCategory" NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "billNumber" TEXT,
    "notes" TEXT,
    "status" "public"."AttachmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "supplierId" TEXT,
    "storeId" TEXT,
    "rawMaterialEntryId" TEXT,
    "dispatchId" TEXT,
    "returnId" TEXT,
    "replacesId" TEXT,
    "replacementReason" TEXT,
    "replacedAt" TIMESTAMP(3),
    "replacedById" TEXT,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "public"."Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "public"."Session"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "public"."AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "public"."AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "public"."AuditLog"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_code_key" ON "public"."Unit"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_code_key" ON "public"."Supplier"("code");

-- CreateIndex
CREATE INDEX "Supplier_name_idx" ON "public"."Supplier"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Store_code_key" ON "public"."Store"("code");

-- CreateIndex
CREATE INDEX "Store_name_idx" ON "public"."Store"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategory_name_key" ON "public"."ProductCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "RawMaterial_normalizedName_unitId_key" ON "public"."RawMaterial"("normalizedName", "unitId");

-- CreateIndex
CREATE UNIQUE INDEX "RawMaterialEntry_entryNo_key" ON "public"."RawMaterialEntry"("entryNo");

-- CreateIndex
CREATE UNIQUE INDEX "RawMaterialEntry_idempotencyKey_key" ON "public"."RawMaterialEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "RawMaterialEntry_status_idx" ON "public"."RawMaterialEntry"("status");

-- CreateIndex
CREATE INDEX "RawMaterialEntry_entryDate_idx" ON "public"."RawMaterialEntry"("entryDate");

-- CreateIndex
CREATE INDEX "RawMaterialEntry_supplierId_idx" ON "public"."RawMaterialEntry"("supplierId");

-- CreateIndex
CREATE INDEX "RawMaterialEntry_rawMaterialId_idx" ON "public"."RawMaterialEntry"("rawMaterialId");

-- CreateIndex
CREATE INDEX "RawMaterialEntry_invoiceNumber_idx" ON "public"."RawMaterialEntry"("invoiceNumber");

-- CreateIndex
CREATE INDEX "RawMaterialEntry_poNumber_idx" ON "public"."RawMaterialEntry"("poNumber");

-- CreateIndex
CREATE INDEX "QualityInspection_entryId_idx" ON "public"."QualityInspection"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "RawMaterialTransaction_txnNo_key" ON "public"."RawMaterialTransaction"("txnNo");

-- CreateIndex
CREATE INDEX "RawMaterialTransaction_rawMaterialId_createdAt_idx" ON "public"."RawMaterialTransaction"("rawMaterialId", "createdAt");

-- CreateIndex
CREATE INDEX "RawMaterialTransaction_createdAt_idx" ON "public"."RawMaterialTransaction"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RawMaterialTransaction_inspectionId_type_key" ON "public"."RawMaterialTransaction"("inspectionId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ReadyProduct_productCode_key" ON "public"."ReadyProduct"("productCode");

-- CreateIndex
CREATE UNIQUE INDEX "ReadyProduct_sku_key" ON "public"."ReadyProduct"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "ReadyProduct_barcode_key" ON "public"."ReadyProduct"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "ReadyProduct_imageAttachmentId_key" ON "public"."ReadyProduct"("imageAttachmentId");

-- CreateIndex
CREATE INDEX "ReadyProduct_name_idx" ON "public"."ReadyProduct"("name");

-- CreateIndex
CREATE INDEX "ReadyProduct_categoryId_idx" ON "public"."ReadyProduct"("categoryId");

-- CreateIndex
CREATE INDEX "ProductBatch_expiryDate_idx" ON "public"."ProductBatch"("expiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "ProductBatch_productId_batchNo_key" ON "public"."ProductBatch"("productId", "batchNo");

-- CreateIndex
CREATE INDEX "StockBalance_productId_bucket_idx" ON "public"."StockBalance"("productId", "bucket");

-- CreateIndex
CREATE UNIQUE INDEX "StockBalance_batchId_bucket_key" ON "public"."StockBalance"("batchId", "bucket");

-- CreateIndex
CREATE UNIQUE INDEX "ProductTransaction_txnNo_key" ON "public"."ProductTransaction"("txnNo");

-- CreateIndex
CREATE UNIQUE INDEX "ProductTransaction_reversalOfId_key" ON "public"."ProductTransaction"("reversalOfId");

-- CreateIndex
CREATE INDEX "ProductTransaction_productId_createdAt_idx" ON "public"."ProductTransaction"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductTransaction_storeId_createdAt_idx" ON "public"."ProductTransaction"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductTransaction_type_createdAt_idx" ON "public"."ProductTransaction"("type", "createdAt");

-- CreateIndex
CREATE INDEX "ProductTransaction_createdAt_idx" ON "public"."ProductTransaction"("createdAt");

-- CreateIndex
CREATE INDEX "ProductTransaction_dispatchId_idx" ON "public"."ProductTransaction"("dispatchId");

-- CreateIndex
CREATE INDEX "ProductTransaction_returnId_idx" ON "public"."ProductTransaction"("returnId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryAdjustment_adjustmentNo_key" ON "public"."InventoryAdjustment"("adjustmentNo");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryAdjustment_idempotencyKey_key" ON "public"."InventoryAdjustment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "InventoryAdjustment_createdAt_idx" ON "public"."InventoryAdjustment"("createdAt");

-- CreateIndex
CREATE INDEX "LowStockAlert_status_idx" ON "public"."LowStockAlert"("status");

-- CreateIndex
CREATE INDEX "LowStockAlert_productId_idx" ON "public"."LowStockAlert"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Dispatch_dispatchNo_key" ON "public"."Dispatch"("dispatchNo");

-- CreateIndex
CREATE UNIQUE INDEX "Dispatch_idempotencyKey_key" ON "public"."Dispatch"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Dispatch_dispatchDate_idx" ON "public"."Dispatch"("dispatchDate");

-- CreateIndex
CREATE INDEX "Dispatch_storeId_dispatchDate_idx" ON "public"."Dispatch"("storeId", "dispatchDate");

-- CreateIndex
CREATE INDEX "Dispatch_invoiceNumber_idx" ON "public"."Dispatch"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Dispatch_orderRef_idx" ON "public"."Dispatch"("orderRef");

-- CreateIndex
CREATE INDEX "DispatchLine_productId_idx" ON "public"."DispatchLine"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "DispatchLine_dispatchId_lineNo_key" ON "public"."DispatchLine"("dispatchId", "lineNo");

-- CreateIndex
CREATE UNIQUE INDEX "DispatchAllocation_lineId_batchId_key" ON "public"."DispatchAllocation"("lineId", "batchId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductReturn_returnNo_key" ON "public"."ProductReturn"("returnNo");

-- CreateIndex
CREATE UNIQUE INDEX "ProductReturn_idempotencyKey_key" ON "public"."ProductReturn"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ProductReturn_returnDate_idx" ON "public"."ProductReturn"("returnDate");

-- CreateIndex
CREATE INDEX "ProductReturn_storeId_returnDate_idx" ON "public"."ProductReturn"("storeId", "returnDate");

-- CreateIndex
CREATE INDEX "ProductReturn_dispatchId_idx" ON "public"."ProductReturn"("dispatchId");

-- CreateIndex
CREATE INDEX "ProductReturnLine_dispatchLineId_idx" ON "public"."ProductReturnLine"("dispatchLineId");

-- CreateIndex
CREATE INDEX "ProductReturnLine_productId_idx" ON "public"."ProductReturnLine"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductReturnAllocation_returnLineId_dispatchAllocationId_key" ON "public"."ProductReturnAllocation"("returnLineId", "dispatchAllocationId");

-- CreateIndex
CREATE UNIQUE INDEX "QuarantineDisposition_dispositionNo_key" ON "public"."QuarantineDisposition"("dispositionNo");

-- CreateIndex
CREATE UNIQUE INDEX "QuarantineDisposition_idempotencyKey_key" ON "public"."QuarantineDisposition"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "StoreSale_saleNo_key" ON "public"."StoreSale"("saleNo");

-- CreateIndex
CREATE UNIQUE INDEX "StoreSale_idempotencyKey_key" ON "public"."StoreSale"("idempotencyKey");

-- CreateIndex
CREATE INDEX "StoreSale_storeId_saleDate_idx" ON "public"."StoreSale"("storeId", "saleDate");

-- CreateIndex
CREATE INDEX "StoreSale_productId_idx" ON "public"."StoreSale"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "BillAttachment_storageKey_key" ON "public"."BillAttachment"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "BillAttachment_replacesId_key" ON "public"."BillAttachment"("replacesId");

-- CreateIndex
CREATE INDEX "BillAttachment_category_uploadedAt_idx" ON "public"."BillAttachment"("category", "uploadedAt");

-- CreateIndex
CREATE INDEX "BillAttachment_rawMaterialEntryId_idx" ON "public"."BillAttachment"("rawMaterialEntryId");

-- CreateIndex
CREATE INDEX "BillAttachment_dispatchId_idx" ON "public"."BillAttachment"("dispatchId");

-- CreateIndex
CREATE INDEX "BillAttachment_returnId_idx" ON "public"."BillAttachment"("returnId");

-- CreateIndex
CREATE INDEX "BillAttachment_storeId_idx" ON "public"."BillAttachment"("storeId");

-- CreateIndex
CREATE INDEX "BillAttachment_supplierId_idx" ON "public"."BillAttachment"("supplierId");

-- CreateIndex
CREATE INDEX "BillAttachment_billNumber_idx" ON "public"."BillAttachment"("billNumber");

-- AddForeignKey
ALTER TABLE "public"."Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RawMaterial" ADD CONSTRAINT "RawMaterial_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "public"."Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RawMaterialEntry" ADD CONSTRAINT "RawMaterialEntry_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "public"."RawMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RawMaterialEntry" ADD CONSTRAINT "RawMaterialEntry_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RawMaterialEntry" ADD CONSTRAINT "RawMaterialEntry_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "public"."Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RawMaterialEntry" ADD CONSTRAINT "RawMaterialEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."QualityInspection" ADD CONSTRAINT "QualityInspection_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "public"."RawMaterialEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."QualityInspection" ADD CONSTRAINT "QualityInspection_inspectedById_fkey" FOREIGN KEY ("inspectedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."QualityInspection" ADD CONSTRAINT "QualityInspection_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RawMaterialTransaction" ADD CONSTRAINT "RawMaterialTransaction_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "public"."RawMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RawMaterialTransaction" ADD CONSTRAINT "RawMaterialTransaction_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "public"."Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RawMaterialTransaction" ADD CONSTRAINT "RawMaterialTransaction_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "public"."RawMaterialEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RawMaterialTransaction" ADD CONSTRAINT "RawMaterialTransaction_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "public"."QualityInspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RawMaterialTransaction" ADD CONSTRAINT "RawMaterialTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReadyProduct" ADD CONSTRAINT "ReadyProduct_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReadyProduct" ADD CONSTRAINT "ReadyProduct_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "public"."Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReadyProduct" ADD CONSTRAINT "ReadyProduct_imageAttachmentId_fkey" FOREIGN KEY ("imageAttachmentId") REFERENCES "public"."BillAttachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductBatch" ADD CONSTRAINT "ProductBatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."ReadyProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductBatch" ADD CONSTRAINT "ProductBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StockBalance" ADD CONSTRAINT "StockBalance_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."ReadyProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StockBalance" ADD CONSTRAINT "StockBalance_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "public"."ProductBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductTransaction" ADD CONSTRAINT "ProductTransaction_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."ReadyProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductTransaction" ADD CONSTRAINT "ProductTransaction_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "public"."ProductBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductTransaction" ADD CONSTRAINT "ProductTransaction_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "public"."Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductTransaction" ADD CONSTRAINT "ProductTransaction_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "public"."Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductTransaction" ADD CONSTRAINT "ProductTransaction_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "public"."Dispatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductTransaction" ADD CONSTRAINT "ProductTransaction_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "public"."ProductReturn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductTransaction" ADD CONSTRAINT "ProductTransaction_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "public"."InventoryAdjustment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductTransaction" ADD CONSTRAINT "ProductTransaction_dispositionId_fkey" FOREIGN KEY ("dispositionId") REFERENCES "public"."QuarantineDisposition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductTransaction" ADD CONSTRAINT "ProductTransaction_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "public"."ProductTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductTransaction" ADD CONSTRAINT "ProductTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InventoryAdjustment" ADD CONSTRAINT "InventoryAdjustment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."ReadyProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InventoryAdjustment" ADD CONSTRAINT "InventoryAdjustment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LowStockAlert" ADD CONSTRAINT "LowStockAlert_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."ReadyProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Dispatch" ADD CONSTRAINT "Dispatch_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "public"."Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Dispatch" ADD CONSTRAINT "Dispatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Dispatch" ADD CONSTRAINT "Dispatch_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DispatchLine" ADD CONSTRAINT "DispatchLine_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "public"."Dispatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DispatchLine" ADD CONSTRAINT "DispatchLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."ReadyProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DispatchAllocation" ADD CONSTRAINT "DispatchAllocation_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "public"."DispatchLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DispatchAllocation" ADD CONSTRAINT "DispatchAllocation_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "public"."ProductBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductReturn" ADD CONSTRAINT "ProductReturn_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "public"."Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductReturn" ADD CONSTRAINT "ProductReturn_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "public"."Dispatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductReturn" ADD CONSTRAINT "ProductReturn_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductReturn" ADD CONSTRAINT "ProductReturn_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductReturnLine" ADD CONSTRAINT "ProductReturnLine_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "public"."ProductReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductReturnLine" ADD CONSTRAINT "ProductReturnLine_dispatchLineId_fkey" FOREIGN KEY ("dispatchLineId") REFERENCES "public"."DispatchLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductReturnLine" ADD CONSTRAINT "ProductReturnLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."ReadyProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductReturnAllocation" ADD CONSTRAINT "ProductReturnAllocation_returnLineId_fkey" FOREIGN KEY ("returnLineId") REFERENCES "public"."ProductReturnLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductReturnAllocation" ADD CONSTRAINT "ProductReturnAllocation_dispatchAllocationId_fkey" FOREIGN KEY ("dispatchAllocationId") REFERENCES "public"."DispatchAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."QuarantineDisposition" ADD CONSTRAINT "QuarantineDisposition_returnLineId_fkey" FOREIGN KEY ("returnLineId") REFERENCES "public"."ProductReturnLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."QuarantineDisposition" ADD CONSTRAINT "QuarantineDisposition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StoreSale" ADD CONSTRAINT "StoreSale_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "public"."Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StoreSale" ADD CONSTRAINT "StoreSale_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."ReadyProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StoreSale" ADD CONSTRAINT "StoreSale_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BillAttachment" ADD CONSTRAINT "BillAttachment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BillAttachment" ADD CONSTRAINT "BillAttachment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "public"."Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BillAttachment" ADD CONSTRAINT "BillAttachment_rawMaterialEntryId_fkey" FOREIGN KEY ("rawMaterialEntryId") REFERENCES "public"."RawMaterialEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BillAttachment" ADD CONSTRAINT "BillAttachment_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "public"."Dispatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BillAttachment" ADD CONSTRAINT "BillAttachment_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "public"."ProductReturn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BillAttachment" ADD CONSTRAINT "BillAttachment_replacesId_fkey" FOREIGN KEY ("replacesId") REFERENCES "public"."BillAttachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BillAttachment" ADD CONSTRAINT "BillAttachment_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BillAttachment" ADD CONSTRAINT "BillAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
