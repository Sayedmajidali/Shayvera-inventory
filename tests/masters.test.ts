import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createRawMaterial, setRawMaterialActive, updateRawMaterial } from "@/server/services/raw-materials";
import { rawEntry, resetDb, seedFixture, type Fixture } from "./helpers";

let f: Fixture;
beforeEach(async () => {
  await resetDb();
  f = await seedFixture();
});

describe("raw material master", () => {
  it("adds materials, unique per unit regardless of case and spacing", async () => {
    const m = await createRawMaterial(f.admin, { name: "  Turmeric   Powder ", unitId: f.kg.id });
    expect(m.name).toBe("Turmeric Powder");
    await expect(createRawMaterial(f.admin, { name: "turmeric powder", unitId: f.kg.id })).rejects.toThrow(/already exists/);
    await createRawMaterial(f.admin, { name: "Turmeric Powder", unitId: f.pieces.id }); // different unit is a different material
    expect(await prisma.rawMaterial.count()).toBe(2);
  });

  it("is admin-only", async () => {
    await expect(createRawMaterial(f.staff, { name: "Cumin", unitId: f.kg.id })).rejects.toThrow(/permission/);
  });

  it("an entry for a pre-defined material uses the master record", async () => {
    const m = await createRawMaterial(f.admin, { name: "Shea Butter", unitId: f.kg.id });
    const entry = await rawEntry(f, { materialName: "shea butter" });
    expect(entry.rawMaterialId).toBe(m.id);
  });

  it("renames with an audited change and locks the unit once entries exist", async () => {
    const m = await createRawMaterial(f.admin, { name: "Cumin seed", unitId: f.kg.id });
    await updateRawMaterial(f.admin, m.id, { name: "Cumin seeds", unitId: f.kg.id });
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "raw_material.update", entityId: m.id } });
    expect((log.details as { changes: { from: string; to: string }[] }).changes[0]).toMatchObject({
      from: "Cumin seed",
      to: "Cumin seeds",
    });

    await rawEntry(f, { materialName: "Cumin seeds" });
    await expect(updateRawMaterial(f.admin, m.id, { name: "Cumin seeds", unitId: f.pieces.id })).rejects.toThrow(/unit can't change/);
  });

  it("a deactivated material can't be used for new entries until reactivated", async () => {
    const m = await createRawMaterial(f.admin, { name: "Saffron", unitId: f.kg.id });
    await setRawMaterialActive(f.admin, m.id, false);
    await expect(rawEntry(f, { materialName: "Saffron" })).rejects.toThrow(/deactivated/);
    await setRawMaterialActive(f.admin, m.id, true);
    await rawEntry(f, { materialName: "Saffron" });
  });
});
