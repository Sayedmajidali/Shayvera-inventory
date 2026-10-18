import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { can, sanitizePermissions } from "@/server/permissions";
import { createUser, setUserActive, updateSettings, updateUser } from "@/server/services/masters";
import { importCsv } from "@/server/services/importer";
import { getDashboard } from "@/server/services/dashboard";
import { canViewReport, getReport } from "@/server/reports";
import { csvCell, toCsv } from "@/lib/csv";
import { dayRange } from "@/lib/dates";
import { dayOffset, dispatch, product, rawEntry, receive, resetDb, seedFixture, today, TZ, type Fixture } from "./helpers";

let f: Fixture;
beforeEach(async () => {
  await resetDb();
  f = await seedFixture();
});

describe("authorization", () => {
  it("never lets staff hold admin-only permissions", () => {
    expect(sanitizePermissions("STAFF", ["admin.users", "inventory.adjust", "rm.view", "bogus"])).toEqual(["rm.view"]);
    expect(can({ role: "STAFF", permissions: ["admin.users"] }, "admin.users")).toBe(false);
    expect(can({ role: "ADMIN", permissions: [] }, "admin.users")).toBe(true);
  });

  it("staff cannot manage users or change permissions", async () => {
    await expect(createUser(f.staff, { name: "X", email: "x@test.local", role: "ADMIN", password: "0123456789ab" })).rejects.toThrow(
      /permission/,
    );
    await expect(updateUser(f.staff, f.staff.id, { name: "Staff", role: "ADMIN", permissions: [] })).rejects.toThrow(/permission/);
    await expect(updateSettings(f.staff, {})).rejects.toThrow(/permission/);
    const me = await prisma.user.findUniqueOrThrow({ where: { id: f.staff.id } });
    expect(me.role).toBe("STAFF");
  });

  it("admin-granted permissions are stripped of admin-only keys on save", async () => {
    const u = await createUser(f.admin, {
      name: "New",
      email: "new@test.local",
      role: "STAFF",
      password: "0123456789ab",
      permissions: ["rm.view", "admin.users"],
    });
    expect(u.permissions).toEqual(["rm.view"]);
  });

  it("keeps at least one active administrator", async () => {
    await expect(setUserActive(f.admin, f.admin.id, false)).rejects.toThrow(/own account/);
    await expect(updateUser(f.admin, f.admin.id, { name: "Admin", role: "STAFF", permissions: [] })).rejects.toThrow(
      /own administrator role/,
    );
  });

  it("deactivating a user ends their sessions", async () => {
    await prisma.session.create({ data: { tokenHash: "h1", userId: f.staff.id, expiresAt: new Date(Date.now() + 60_000) } });
    await setUserActive(f.admin, f.staff.id, false);
    expect(await prisma.session.count({ where: { userId: f.staff.id } })).toBe(0);
  });

  it("report access follows permissions", () => {
    expect(canViewReport(f.staff, getReport("ec-reconciliation")!)).toBe(false);
    expect(canViewReport(f.staff, getReport("ec-dispatch-register")!)).toBe(true);
    expect(canViewReport(f.staff, getReport("rm-bills")!)).toBe(true);
    expect(canViewReport({ ...f.staff, permissions: ["ecom.view"] }, getReport("rm-bills")!)).toBe(false);
  });
});

describe("CSV export", () => {
  it("neutralises spreadsheet formulas and quotes special characters", () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-2")).toBe("-2");
    expect(csvCell("-SUM(A1)")).toBe("'-SUM(A1)");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(toCsv([["a", null]]).startsWith("﻿a,")).toBe(true);
  });
});

describe("dates", () => {
  it("treats report ranges as inclusive calendar days in the business timezone", () => {
    const r = dayRange("2026-03-01", "2026-03-01", "Asia/Kolkata");
    expect(r.gte!.toISOString()).toBe("2026-02-28T18:30:00.000Z");
    expect(r.lt!.toISOString()).toBe("2026-03-01T18:30:00.000Z");
  });
});

describe("CSV import", () => {
  it("imports nothing if any row is invalid and never posts opening stock twice", async () => {
    const bad = "name,sku,unit,lowStockThreshold,openingQty,openingExpiryDate\nGood,SKU-A,pieces,5,10,2030-01-01\nBad,SKU-B,litres,5,,\n";
    const res = await importCsv(f.admin, "products", bad, false);
    expect(res.imported).toBe(0);
    expect(res.errors[0]).toMatchObject({ row: 3 });
    expect(await prisma.readyProduct.count()).toBe(0);

    const good = "name,sku,unit,lowStockThreshold,openingQty,openingExpiryDate\nGood,SKU-A,pieces,5,10,2030-01-01\n";
    expect((await importCsv(f.admin, "products", good, false)).imported).toBe(1);
    const again = await importCsv(f.admin, "products", good, false);
    expect(again.imported).toBe(0);
    expect(again.errors[0].message).toMatch(/already exists/);
    expect(await prisma.productTransaction.count({ where: { type: "OPENING" } })).toBe(1);
  });

  it("is admin only", async () => {
    await expect(importCsv(f.staff, "suppliers", "name\nX\n", true)).rejects.toThrow(/permission/);
  });
});

describe("dashboard", () => {
  it("totals reconcile with the database", async () => {
    const p = await product(f, { lowStockThreshold: "50" });
    await receive(f, p.id, "40", dayOffset(5));
    await receive(f, p.id, "10", dayOffset(-1));
    await dispatch(f, [{ productId: p.id, quantity: "15" }]);
    await rawEntry(f);

    const d = await getDashboard({ from: dayOffset(-7), to: today(), tz: TZ, today: today(), dateFormat: "dd MMM yyyy" });
    expect(d.snapshot.activeProducts).toBe(1);
    expect(d.snapshot.availableByUnit).toEqual([{ unit: "pieces", qty: "25" }]);
    expect(d.snapshot.pendingInspection).toBe(1);
    expect(d.snapshot.lowStock).toBe(1);
    expect(d.snapshot.expiredBatches).toBe(1);
    expect(d.snapshot.nearExpiryBatches).toBe(1);
    expect(d.period.dispatchDocs).toBe(1);
    expect(d.dailyChart.reduce((a, r) => a + r.dispatched, 0)).toBe(15);
    expect(d.storeChart).toEqual([{ store: "Marketplace One", dispatched: 15, returned: 0 }]);
  });
});
