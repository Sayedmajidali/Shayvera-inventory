/**
 * Seed: units (kg, pieces), the first administrator, and optional demo data.
 *
 *   SEED_ADMIN_EMAIL, SEED_ADMIN_NAME, SEED_ADMIN_PASSWORD  -> first admin
 *   SEED_DEMO=true                                           -> sample suppliers, stores, products and movements
 *
 * Demo data is posted through the same services the app uses, so every stock
 * balance is backed by ledger transactions. Never enable SEED_DEMO in production.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/server/auth-hash";

const prisma = new PrismaClient();

async function main() {
  for (const u of [
    { code: "kg", name: "Kilogram", allowsDecimal: true },
    { code: "pieces", name: "Pieces", allowsDecimal: false },
  ]) {
    await prisma.unit.upsert({ where: { code: u.code }, update: {}, create: u });
  }

  const email = (process.env.SEED_ADMIN_EMAIL || "admin@shayvera.local").toLowerCase();
  let admin = await prisma.user.findUnique({ where: { email } });
  if (!admin && !process.env.SEED_ADMIN_PASSWORD && (process.env.CI || process.env.NETLIFY)) {
    // Never print a generated password into hosted build logs.
    console.log("No administrator created: set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD for the build to create one.");
  } else if (!admin) {
    const generated = !process.env.SEED_ADMIN_PASSWORD;
    const password = process.env.SEED_ADMIN_PASSWORD || randomBytes(12).toString("base64url");
    if (password.length < 10) throw new Error("SEED_ADMIN_PASSWORD must be at least 10 characters.");
    admin = await prisma.user.create({
      data: { email, name: process.env.SEED_ADMIN_NAME || "Shayvera Admin", role: "ADMIN", passwordHash: await hashPassword(password) },
    });
    console.log(`\nCreated administrator ${email}`);
    if (generated) console.log(`Temporary password (shown once — change it after signing in): ${password}\n`);
  } else {
    console.log(`Administrator ${email} already exists — left unchanged.`);
  }

  if (process.env.SEED_DEMO === "true" && admin) await demo(admin.id);
}

async function demo(adminId: string) {
  if (await prisma.readyProduct.count()) {
    console.log("Demo data skipped: products already exist.");
    return;
  }
  const { createSupplier, createStore, createCategory } = await import("../src/server/services/masters");
  const { createProduct, receiveStock } = await import("../src/server/services/products");
  const { createRawMaterialEntry, approveEntry, rejectEntry } = await import("../src/server/services/raw-materials");
  const { createDispatch, createReturn } = await import("../src/server/services/ecommerce");
  const { readSettings } = await import("../src/server/settings");
  const { todayInTz, shiftDay, toLocalDateTimeInput } = await import("../src/lib/dates");

  const actor = { id: adminId, name: "Seed", role: "ADMIN" as const, permissions: [] };
  const tz = (await readSettings()).timezone;
  const today = todayInTz(tz);
  const at = (daysAgo: number, hour = 11) =>
    toLocalDateTimeInput(new Date(Date.now() - daysAgo * 86_400_000 - (12 - hour) * 3_600_000), tz);
  const kg = await prisma.unit.findUniqueOrThrow({ where: { code: "kg" } });
  const pcs = await prisma.unit.findUniqueOrThrow({ where: { code: "pieces" } });

  const s1 = await createSupplier(actor, { name: "Nature's Basket Oils", contactPerson: "R. Mehta", phone: "+91 98200 00001" });
  const s2 = await createSupplier(actor, { name: "PackRight Containers", contactPerson: "A. Khan" });
  const s3 = await createSupplier(actor, { name: "Himalayan Botanicals" });
  const skin = await createCategory(actor, { name: "Skin care" });
  const hair = await createCategory(actor, { name: "Hair care" });
  const st1 = await createStore(actor, { name: "Marketplace One", code: "MKT1", storeType: "Marketplace" });
  const st2 = await createStore(actor, { name: "Shayvera Online", code: "WEB", storeType: "Online shop" });
  const st3 = await createStore(actor, { name: "Partner Warehouse", code: "WH-N", storeType: "External warehouse" });

  const entries = [
    { m: "Cold-pressed almond oil", s: s1.id, q: "40.5", u: kg.id, inv: "NB-2291", d: 20 },
    { m: "Shea butter", s: s3.id, q: "25", u: kg.id, inv: "HB-118", d: 15 },
    { m: "Amber glass bottle 30ml", s: s2.id, q: "1200", u: pcs.id, po: "PO-0042", d: 12 },
    { m: "Pump dispenser", s: s2.id, q: "1200", u: pcs.id, po: "PO-0042", d: 12 },
    { m: "Rosehip oil", s: s1.id, q: "8.25", u: kg.id, inv: "NB-2310", d: 4 },
    { m: "Shea butter", s: s3.id, q: "10", u: kg.id, inv: "HB-131", d: 1 },
  ];
  const created = [];
  for (const e of entries) {
    created.push(
      (
        await createRawMaterialEntry(actor, {
          idempotencyKey: randomUUID(),
          entryDate: at(e.d),
          materialName: e.m,
          supplierId: e.s,
          quantity: e.q,
          unitId: e.u,
          invoiceNumber: e.inv,
          poNumber: e.po,
        })
      ).entry,
    );
  }
  for (const e of created.slice(0, 4)) await approveEntry(actor, { entryId: e.id, notes: "Seed: passed visual and odour check" });
  await rejectEntry(actor, { entryId: created[4].id, rejectionReason: "Seed: rancid odour, failed QC" });

  const products = [
    {
      name: "Rose Glow Face Serum 30ml",
      sku: "SV-SER-ROSE-30",
      cat: skin.id,
      th: "20",
      days: 30,
      batches: [
        ["RS-2407", 60, 210],
        ["RS-2409", 80, 330],
      ],
    },
    {
      name: "Almond Night Cream 50g",
      sku: "SV-CRM-ALM-50",
      cat: skin.id,
      th: "50",
      days: 15,
      batches: [
        ["AC-2405", 30, 9],
        ["AC-2408", 70, 150],
      ],
    },
    {
      name: "Hibiscus Hair Oil 100ml",
      sku: "SV-OIL-HIB-100",
      cat: hair.id,
      th: "25",
      days: 45,
      batches: [
        ["HO-2403", 12, -3],
        ["HO-2408", 90, 280],
      ],
    },
    { name: "Shea Body Butter 200g", sku: "SV-BTR-SHEA-200", cat: skin.id, th: "15", days: 30, batches: [["SB-2408", 40, 400]] },
  ] as const;
  const ids: string[] = [];
  for (const p of products) {
    const prod = await createProduct(actor, {
      name: p.name,
      sku: p.sku,
      categoryId: p.cat,
      unitId: pcs.id,
      lowStockThreshold: p.th,
      expiryAlertDays: p.days,
      tracksExpiry: true,
    });
    ids.push(prod.id);
    for (const [batchNo, qty, expiresIn] of p.batches) {
      await receiveStock(actor, {
        idempotencyKey: randomUUID(),
        productId: prod.id,
        batchNo,
        receivedDate: shiftDay(today, -40),
        expiryDate: shiftDay(today, expiresIn),
        quantity: String(qty),
      });
    }
  }

  const d1 = await createDispatch(actor, {
    idempotencyKey: randomUUID(),
    dispatchDate: at(10),
    storeId: st1.id,
    orderRef: "MKT1-SHIP-7781",
    invoiceNumber: "SV/24/0101",
    lines: [
      { productId: ids[0], quantity: "40" },
      { productId: ids[1], quantity: "25" },
    ],
  });
  await createDispatch(actor, {
    idempotencyKey: randomUUID(),
    dispatchDate: at(8),
    storeId: st2.id,
    orderRef: "WEB-BATCH-12",
    lines: [
      { productId: ids[0], quantity: "15" },
      { productId: ids[2], quantity: "30" },
      { productId: ids[3], quantity: "10" },
    ],
  });
  await createDispatch(actor, {
    idempotencyKey: randomUUID(),
    dispatchDate: at(5),
    storeId: st3.id,
    invoiceNumber: "SV/24/0109",
    lines: [
      { productId: ids[1], quantity: "40" },
      { productId: ids[3], quantity: "20" },
    ],
  });
  await createDispatch(actor, {
    idempotencyKey: randomUUID(),
    dispatchDate: at(2),
    storeId: st1.id,
    orderRef: "MKT1-SHIP-7802",
    lines: [{ productId: ids[2], quantity: "20" }],
  });

  const lines = await prisma.dispatchLine.findMany({ where: { dispatchId: d1.dispatch.id }, orderBy: { lineNo: "asc" } });
  await createReturn(actor, {
    idempotencyKey: randomUUID(),
    returnDate: at(3),
    dispatchId: d1.dispatch.id,
    reason: "Customer return",
    lines: [
      { dispatchLineId: lines[0].id, quantity: "4", condition: "SALEABLE" },
      { dispatchLineId: lines[0].id, quantity: "2", condition: "DAMAGED" },
    ],
  });
  await createReturn(actor, {
    idempotencyKey: randomUUID(),
    returnDate: at(1),
    dispatchId: d1.dispatch.id,
    reason: "Unsold stock recalled",
    lines: [{ dispatchLineId: lines[1].id, quantity: "3", condition: "PENDING_INSPECTION" }],
  });
  console.log("Demo data created.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
