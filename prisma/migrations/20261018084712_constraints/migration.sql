-- Integrity rules the ORM cannot express. These are the last line of defence:
-- the service layer validates first, but the database refuses invalid states.

-- Quantities
ALTER TABLE "RawMaterialEntry"   ADD CONSTRAINT "raw_entry_qty_positive"     CHECK ("quantity" > 0);
ALTER TABLE "RawMaterial"        ADD CONSTRAINT "raw_balance_non_negative"   CHECK ("currentBalance" >= 0);
ALTER TABLE "RawMaterialTransaction" ADD CONSTRAINT "raw_txn_qty_nonzero"    CHECK ("quantity" <> 0);
ALTER TABLE "RawMaterialTransaction" ADD CONSTRAINT "raw_txn_balance_non_negative" CHECK ("balanceAfter" >= 0);

ALTER TABLE "StockBalance"       ADD CONSTRAINT "stock_balance_non_negative" CHECK ("quantity" >= 0);
ALTER TABLE "ProductTransaction" ADD CONSTRAINT "product_txn_qty_nonzero"    CHECK ("quantity" <> 0);
ALTER TABLE "ProductBatch"       ADD CONSTRAINT "batch_initial_non_negative" CHECK ("initialQty" >= 0);
ALTER TABLE "ReadyProduct"       ADD CONSTRAINT "product_threshold_non_negative" CHECK ("lowStockThreshold" >= 0);
ALTER TABLE "ReadyProduct"       ADD CONSTRAINT "product_alert_days_non_negative" CHECK ("expiryAlertDays" >= 0);
ALTER TABLE "InventoryAdjustment" ADD CONSTRAINT "adjustment_nonzero"        CHECK ("quantityDelta" <> 0);

ALTER TABLE "DispatchLine"       ADD CONSTRAINT "dispatch_line_qty_positive" CHECK ("quantity" > 0);
ALTER TABLE "DispatchLine"       ADD CONSTRAINT "dispatch_line_returned_bounds" CHECK ("returnedQty" >= 0 AND "returnedQty" <= "quantity");
ALTER TABLE "DispatchAllocation" ADD CONSTRAINT "allocation_qty_positive"    CHECK ("quantity" > 0);
ALTER TABLE "DispatchAllocation" ADD CONSTRAINT "allocation_returned_bounds" CHECK ("returnedQty" >= 0 AND "returnedQty" <= "quantity");
ALTER TABLE "ProductReturnLine"  ADD CONSTRAINT "return_line_qty_positive"   CHECK ("quantity" > 0);
ALTER TABLE "ProductReturnAllocation" ADD CONSTRAINT "return_alloc_qty_positive" CHECK ("quantity" > 0);
ALTER TABLE "QuarantineDisposition" ADD CONSTRAINT "disposition_qty_positive" CHECK ("quantity" > 0);
ALTER TABLE "StoreSale"          ADD CONSTRAINT "store_sale_qty_positive"    CHECK ("quantity" > 0);
ALTER TABLE "BillAttachment"     ADD CONSTRAINT "attachment_size_positive"   CHECK ("sizeBytes" > 0);

-- Only one live (non-reversed) inspection decision per raw material entry.
CREATE UNIQUE INDEX "inspection_one_active_per_entry"
  ON "QualityInspection" ("entryId") WHERE "reversedAt" IS NULL;

-- Only one open low-stock alert per product.
CREATE UNIQUE INDEX "low_stock_one_open_per_product"
  ON "LowStockAlert" ("productId") WHERE "status" = 'OPEN';

-- Inspection decisions must be internally consistent.
ALTER TABLE "QualityInspection" ADD CONSTRAINT "inspection_rejection_reason"
  CHECK ("decision" <> 'REJECTED' OR ("rejectionReason" IS NOT NULL AND length(trim("rejectionReason")) > 0));
ALTER TABLE "QualityInspection" ADD CONSTRAINT "inspection_reversal_complete"
  CHECK (("reversedAt" IS NULL AND "reversedById" IS NULL) OR ("reversedAt" IS NOT NULL AND "reversedById" IS NOT NULL AND "reversalReason" IS NOT NULL));

-- Posted ledger rows are append-only: block UPDATE and DELETE.
CREATE OR REPLACE FUNCTION shayvera_ledger_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Posted inventory transactions are immutable (table %). Use a reversal entry.', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER raw_txn_immutable BEFORE UPDATE OR DELETE ON "RawMaterialTransaction"
  FOR EACH ROW EXECUTE FUNCTION shayvera_ledger_immutable();
CREATE TRIGGER product_txn_immutable BEFORE UPDATE OR DELETE ON "ProductTransaction"
  FOR EACH ROW EXECUTE FUNCTION shayvera_ledger_immutable();
CREATE TRIGGER audit_log_immutable BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION shayvera_ledger_immutable();
