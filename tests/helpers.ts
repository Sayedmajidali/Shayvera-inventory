import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db";
import { DEFAULT_STAFF_PERMISSIONS, type Actor } from "@/server/permissions";
import { createProduct, receiveStock } from "@/server/services/products";
import { createRawMaterialEntry } from "@/server/services/raw-materials";
import { createDispatch } from "@/server/services/ecommerce";
import { todayInTz, shiftDay, toLocalDateTimeInput } from "@/lib/dates";

export const TZ = process.env.APP_TIMEZONE || "UTC";

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  // TRUNCATE bypasses the row-level immutability triggers, which only guard UPDATE/DELETE.
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

export interface Fixture {
  admin: Actor;
  staff: Actor;
  kg: { id: string };
  pieces: { id: string };
  supplierId: string;
  storeId: string;
  store2Id: string;
}

export async function seedFixture(): Promise<Fixture> {
  const [kg, pieces] = await Promise.all([
    prisma.unit.create({ data: { code: "kg", name: "Kilogram", allowsDecimal: true } }),
    prisma.unit.create({ data: { code: "pieces", name: "Pieces", allowsDecimal: false } }),
  ]);
  const adminUser = await prisma.user.create({ data: { name: "Admin", email: "admin@test.local", passwordHash: "x", role: "ADMIN" } });
  const staffUser = await prisma.user.create({
    data: { name: "Staff", email: "staff@test.local", passwordHash: "x", role: "STAFF", permissions: DEFAULT_STAFF_PERMISSIONS },
  });
  const supplier = await prisma.supplier.create({ data: { code: "SUP-T1", name: "Test Supplier" } });
  const store = await prisma.store.create({ data: { code: "AMZ", name: "Marketplace One", storeType: "Marketplace" } });
  const store2 = await prisma.store.create({ data: { code: "WEB", name: "Online Shop", storeType: "Online shop" } });
  return {
    admin: { id: adminUser.id, name: adminUser.name, role: "ADMIN", permissions: [] },
    staff: { id: staffUser.id, name: staffUser.name, role: "STAFF", permissions: staffUser.permissions },
    kg,
    pieces,
    supplierId: supplier.id,
    storeId: store.id,
    store2Id: store2.id,
  };
}

export const key = () => randomUUID();
export const today = () => todayInTz(TZ);
export const nowLocal = () => toLocalDateTimeInput(new Date(Date.now() - 60_000), TZ);
export const dayOffset = (n: number) => shiftDay(today(), n);

export async function rawEntry(f: Fixture, overrides: Record<string, unknown> = {}) {
  const { entry } = await createRawMaterialEntry(f.staff, {
    idempotencyKey: key(),
    entryDate: nowLocal(),
    materialName: "Shea Butter",
    supplierId: f.supplierId,
    quantity: "25.5",
    unitId: f.kg.id,
    invoiceNumber: "INV-100",
    ...overrides,
  });
  return entry;
}

export async function product(f: Fixture, overrides: Record<string, unknown> = {}) {
  return createProduct(f.admin, {
    name: "Rose Face Serum",
    sku: `SKU-${Math.random().toString(36).slice(2, 8)}`,
    unitId: f.pieces.id,
    lowStockThreshold: "10",
    expiryAlertDays: 30,
    tracksExpiry: true,
    ...overrides,
  });
}

export async function receive(f: Fixture, productId: string, quantity: string, expiryDate: string | null, batchNo?: string) {
  return receiveStock(f.admin, {
    idempotencyKey: key(),
    productId,
    batchNo,
    receivedDate: dayOffset(-30),
    expiryDate: expiryDate ?? undefined,
    quantity,
  });
}

export async function dispatch(
  f: Fixture,
  lines: { productId: string; quantity: string; batchId?: string }[],
  storeId = f.storeId,
  actor = f.staff,
) {
  return createDispatch(actor, { idempotencyKey: key(), dispatchDate: nowLocal(), storeId, lines });
}

export async function saleable(productId: string) {
  const rows = await prisma.stockBalance.findMany({ where: { productId, bucket: "SALEABLE" } });
  return rows.reduce((acc, r) => acc + Number(r.quantity), 0);
}

export async function bucket(productId: string, b: "SALEABLE" | "QUARANTINE" | "DAMAGED" | "EXPIRED") {
  const rows = await prisma.stockBalance.findMany({ where: { productId, bucket: b } });
  return rows.reduce((acc, r) => acc + Number(r.quantity), 0);
}

export function pdfFile(name = "bill.pdf") {
  return new File([Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF")], name, { type: "application/pdf" });
}
