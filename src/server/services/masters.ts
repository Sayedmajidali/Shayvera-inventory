import { z } from "zod";
import { prisma, isUniqueViolation } from "../db";
import { audit } from "../audit";
import { NotFoundError, ValidationError } from "../errors";
import { assertCan, sanitizePermissions, type Actor } from "../permissions";
import { nextNumber } from "../sequence";
import { optionalText, parse, requiredText } from "../validation";
import { hashPassword } from "../auth-hash";
import { invalidateSettingsCache, settingsSchema } from "../settings";

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------

export const supplierSchema = z.object({
  name: requiredText(150, "Supplier name"),
  contactPerson: optionalText(100),
  phone: optionalText(40),
  email: z
    .preprocess((v) => (v === "" ? undefined : v), z.string().trim().email("Enter a valid email").optional())
    .transform((v) => v ?? null),
  address: optionalText(500),
  gstNumber: optionalText(30),
});

export async function createSupplier(actor: Actor, input: unknown) {
  assertCan(actor, "admin.masters");
  const data = parse(supplierSchema, input);
  return prisma.$transaction(async (tx) => {
    const code = await nextNumber(tx, "supplier");
    const s = await tx.supplier.create({ data: { ...data, code } });
    await audit(tx, {
      actorId: actor.id,
      action: "supplier.create",
      entityType: "Supplier",
      entityId: s.id,
      summary: `Created supplier ${s.name} (${code})`,
    });
    return s;
  });
}

export async function updateSupplier(actor: Actor, id: string, input: unknown) {
  assertCan(actor, "admin.masters");
  const data = parse(supplierSchema, input);
  return prisma.$transaction(async (tx) => {
    const before = await tx.supplier.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Supplier");
    const s = await tx.supplier.update({ where: { id }, data });
    await audit(tx, {
      actorId: actor.id,
      action: "supplier.update",
      entityType: "Supplier",
      entityId: id,
      summary: `Updated supplier ${s.name}`,
      details: { before, after: data },
    });
    return s;
  });
}

export async function setSupplierActive(actor: Actor, id: string, active: boolean) {
  assertCan(actor, "admin.masters");
  return prisma.$transaction(async (tx) => {
    const s = await tx.supplier.update({ where: { id }, data: { active } });
    await audit(tx, {
      actorId: actor.id,
      action: active ? "supplier.activate" : "supplier.deactivate",
      entityType: "Supplier",
      entityId: id,
      summary: `${active ? "Activated" : "Deactivated"} supplier ${s.name}`,
    });
    return s;
  });
}

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

export const storeSchema = z.object({
  name: requiredText(150, "Store name"),
  code: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{2,20}$/, "2–20 letters, digits, - or _")
      .optional(),
  ),
  storeType: requiredText(60, "Store type"),
  contact: optionalText(300),
  notes: optionalText(1000),
});

export async function createStore(actor: Actor, input: unknown) {
  assertCan(actor, "admin.masters");
  const data = parse(storeSchema, input);
  try {
    return await prisma.$transaction(async (tx) => {
      const code = data.code ?? (await nextNumber(tx, "store"));
      const s = await tx.store.create({ data: { ...data, code } });
      await audit(tx, {
        actorId: actor.id,
        action: "store.create",
        entityType: "Store",
        entityId: s.id,
        summary: `Created store ${s.name} (${code})`,
      });
      return s;
    });
  } catch (e) {
    if (isUniqueViolation(e, "code")) throw new ValidationError("That store code is already in use.", { code: "Already in use" });
    throw e;
  }
}

export async function updateStore(actor: Actor, id: string, input: unknown) {
  assertCan(actor, "admin.masters");
  const data = parse(storeSchema, input);
  try {
    return await prisma.$transaction(async (tx) => {
      const before = await tx.store.findUnique({ where: { id } });
      if (!before) throw new NotFoundError("Store");
      const s = await tx.store.update({ where: { id }, data: { ...data, code: data.code ?? before.code } });
      await audit(tx, {
        actorId: actor.id,
        action: "store.update",
        entityType: "Store",
        entityId: id,
        summary: `Updated store ${s.name}`,
        details: { before, after: data },
      });
      return s;
    });
  } catch (e) {
    if (isUniqueViolation(e, "code")) throw new ValidationError("That store code is already in use.", { code: "Already in use" });
    throw e;
  }
}

export async function setStoreActive(actor: Actor, id: string, active: boolean) {
  assertCan(actor, "admin.masters");
  return prisma.$transaction(async (tx) => {
    const s = await tx.store.update({ where: { id }, data: { active } });
    await audit(tx, {
      actorId: actor.id,
      action: active ? "store.activate" : "store.deactivate",
      entityType: "Store",
      entityId: id,
      summary: `${active ? "Activated" : "Deactivated"} store ${s.name}`,
    });
    return s;
  });
}

// ---------------------------------------------------------------------------
// Units and categories
// ---------------------------------------------------------------------------

const unitSchema = z.object({
  code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9 ._-]{0,19}$/, "Short code, e.g. kg, pieces, litre"),
  name: requiredText(50, "Name"),
  allowsDecimal: z.boolean(),
});

export async function createUnit(actor: Actor, input: unknown) {
  assertCan(actor, "admin.masters");
  const data = parse(unitSchema, input);
  try {
    return await prisma.$transaction(async (tx) => {
      const u = await tx.unit.create({ data });
      await audit(tx, { actorId: actor.id, action: "unit.create", entityType: "Unit", entityId: u.id, summary: `Created unit ${u.code}` });
      return u;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new ValidationError("A unit with that code already exists.", { code: "Already exists" });
    throw e;
  }
}

export async function setUnitActive(actor: Actor, id: string, active: boolean) {
  assertCan(actor, "admin.masters");
  return prisma.$transaction(async (tx) => {
    const u = await tx.unit.update({ where: { id }, data: { active } });
    await audit(tx, {
      actorId: actor.id,
      action: active ? "unit.activate" : "unit.deactivate",
      entityType: "Unit",
      entityId: id,
      summary: `${active ? "Activated" : "Deactivated"} unit ${u.code}`,
    });
    return u;
  });
}

export async function createCategory(actor: Actor, input: unknown) {
  assertCan(actor, "admin.masters");
  const { name } = parse(z.object({ name: requiredText(80, "Category name") }), input);
  try {
    return await prisma.$transaction(async (tx) => {
      const c = await tx.productCategory.create({ data: { name } });
      await audit(tx, {
        actorId: actor.id,
        action: "category.create",
        entityType: "ProductCategory",
        entityId: c.id,
        summary: `Created category ${name}`,
      });
      return c;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new ValidationError("That category already exists.", { name: "Already exists" });
    throw e;
  }
}

export async function setCategoryActive(actor: Actor, id: string, active: boolean) {
  assertCan(actor, "admin.masters");
  return prisma.$transaction(async (tx) => {
    const c = await tx.productCategory.update({ where: { id }, data: { active } });
    await audit(tx, {
      actorId: actor.id,
      action: active ? "category.activate" : "category.deactivate",
      entityType: "ProductCategory",
      entityId: id,
      summary: `${active ? "Activated" : "Deactivated"} category ${c.name}`,
    });
    return c;
  });
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

const password = z.string().min(10, "At least 10 characters").max(200);

const userCreateSchema = z.object({
  name: requiredText(100, "Name"),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  role: z.enum(["ADMIN", "STAFF"]),
  password,
  permissions: z.array(z.string()).default([]),
});

const userUpdateSchema = z.object({
  name: requiredText(100, "Name"),
  role: z.enum(["ADMIN", "STAFF"]),
  permissions: z.array(z.string()).default([]),
});

export async function createUser(actor: Actor, input: unknown) {
  assertCan(actor, "admin.users");
  const data = parse(userCreateSchema, input);
  try {
    return await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          name: data.name,
          email: data.email,
          role: data.role,
          permissions: sanitizePermissions(data.role, data.permissions),
          passwordHash: await hashPassword(data.password),
        },
      });
      await audit(tx, {
        actorId: actor.id,
        action: "user.create",
        entityType: "User",
        entityId: u.id,
        summary: `Created ${u.role.toLowerCase()} user ${u.email}`,
        details: { permissions: u.permissions },
      });
      return u;
    });
  } catch (e) {
    if (isUniqueViolation(e, "email")) throw new ValidationError("A user with that email already exists.", { email: "Already exists" });
    throw e;
  }
}

export async function updateUser(actor: Actor, id: string, input: unknown) {
  assertCan(actor, "admin.users");
  const data = parse(userUpdateSchema, input);
  return prisma.$transaction(async (tx) => {
    const before = await tx.user.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("User");
    if (before.id === actor.id && data.role !== "ADMIN") {
      throw new ValidationError("You cannot remove your own administrator role.");
    }
    if (before.role === "ADMIN" && data.role !== "ADMIN") await assertAnotherActiveAdmin(tx, id);
    const u = await tx.user.update({
      where: { id },
      data: { name: data.name, role: data.role, permissions: sanitizePermissions(data.role, data.permissions) },
    });
    // Permission changes take effect immediately: existing sessions are re-validated each request.
    await audit(tx, {
      actorId: actor.id,
      action: "user.update",
      entityType: "User",
      entityId: id,
      summary: `Updated user ${u.email}`,
      details: { before: { role: before.role, permissions: before.permissions }, after: { role: u.role, permissions: u.permissions } },
    });
    return u;
  });
}

export async function setUserActive(actor: Actor, id: string, active: boolean) {
  assertCan(actor, "admin.users");
  if (id === actor.id && !active) throw new ValidationError("You cannot deactivate your own account.");
  return prisma.$transaction(async (tx) => {
    const before = await tx.user.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("User");
    if (!active && before.role === "ADMIN") await assertAnotherActiveAdmin(tx, id);
    const u = await tx.user.update({ where: { id }, data: { active } });
    if (!active) await tx.session.deleteMany({ where: { userId: id } });
    await audit(tx, {
      actorId: actor.id,
      action: active ? "user.activate" : "user.deactivate",
      entityType: "User",
      entityId: id,
      summary: `${active ? "Activated" : "Deactivated"} user ${u.email}`,
    });
    return u;
  });
}

export async function resetUserPassword(actor: Actor, id: string, newPassword: string) {
  assertCan(actor, "admin.users");
  const pw = parse(password, newPassword);
  return prisma.$transaction(async (tx) => {
    const u = await tx.user.update({ where: { id }, data: { passwordHash: await hashPassword(pw), failedLogins: 0, lockedUntil: null } });
    await tx.session.deleteMany({ where: { userId: id } });
    await audit(tx, {
      actorId: actor.id,
      action: "user.password_reset",
      entityType: "User",
      entityId: id,
      summary: `Reset password for ${u.email}`,
    });
  });
}

export async function changeOwnPassword(
  actor: Actor,
  current: string,
  next: string,
  verify: (pw: string, hash: string) => Promise<boolean>,
) {
  const pw = parse(password, next);
  const user = await prisma.user.findUnique({ where: { id: actor.id } });
  if (!user || !(await verify(current, user.passwordHash)))
    throw new ValidationError("Your current password is incorrect.", { current: "Incorrect" });
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: actor.id }, data: { passwordHash: await hashPassword(pw) } });
    await audit(tx, {
      actorId: actor.id,
      action: "user.password_change",
      entityType: "User",
      entityId: actor.id,
      summary: `Changed own password`,
    });
  });
}

async function assertAnotherActiveAdmin(tx: import("../db").Tx, excludingId: string) {
  const others = await tx.user.count({ where: { role: "ADMIN", active: true, id: { not: excludingId } } });
  if (others === 0) throw new ValidationError("At least one active administrator is required.");
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function updateSettings(actor: Actor, input: unknown) {
  assertCan(actor, "admin.settings");
  const data = parse(settingsSchema, input);
  const saved = await prisma.$transaction(async (tx) => {
    const before = await tx.setting.findUnique({ where: { key: "business" } });
    await tx.setting.upsert({ where: { key: "business" }, create: { key: "business", value: data }, update: { value: data } });
    await audit(tx, {
      actorId: actor.id,
      action: "settings.update",
      entityType: "Setting",
      entityId: "business",
      summary: "Updated business settings",
      details: { before: before?.value ?? null, after: data },
    });
    return data;
  });
  invalidateSettingsCache(); // after commit, so no request can re-cache the old values
  return saved;
}
