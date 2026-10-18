"use server";

import { act, formBool, formObject } from "@/server/action";
import {
  createCategory,
  createSupplier,
  createUnit,
  createUser,
  resetUserPassword,
  setCategoryActive,
  setSupplierActive,
  setUnitActive,
  setUserActive,
  updateSettings,
  updateSupplier,
  updateUser,
} from "@/server/services/masters";
import { importCsv } from "@/server/services/importer";

export async function saveUserAction(fd: FormData) {
  return act(
    async (actor) => {
      const o = formObject(fd);
      const permissions = fd.getAll("permissions").map(String);
      if (o.id) await updateUser(actor, o.id, { ...o, permissions });
      else await createUser(actor, { ...o, permissions });
    },
    { revalidate: ["/admin"], message: "User saved" },
  );
}

export async function setUserActiveAction(fd: FormData) {
  return act((actor) => setUserActive(actor, String(fd.get("id")), fd.get("active") === "true").then(() => undefined), {
    revalidate: ["/admin"],
    message: "User status updated",
  });
}

export async function resetPasswordAction(fd: FormData) {
  return act((actor) => resetUserPassword(actor, String(fd.get("id")), String(fd.get("password") ?? "")), {
    revalidate: ["/admin"],
    message: "Password reset. The user's sessions were signed out.",
  });
}

export async function saveSupplierAction(fd: FormData) {
  return act(
    async (actor) => {
      const o = formObject(fd);
      if (o.id) await updateSupplier(actor, o.id, o);
      else await createSupplier(actor, o);
    },
    { revalidate: ["/masters", "/raw-materials"], message: "Supplier saved" },
  );
}

export async function setSupplierActiveAction(fd: FormData) {
  return act((actor) => setSupplierActive(actor, String(fd.get("id")), fd.get("active") === "true").then(() => undefined), {
    revalidate: ["/masters"],
    message: "Supplier status updated",
  });
}

export async function saveSettingsAction(fd: FormData) {
  return act(
    async (actor) => {
      await updateSettings(actor, {
        ...formObject(fd),
        allowedFileTypes: fd.getAll("allowedFileTypes").map(String),
        allowExpiredDispatchByAdmin: formBool(fd, "allowExpiredDispatchByAdmin"),
      });
    },
    { revalidate: ["/"], message: "Settings saved" },
  );
}

export async function createUnitAction(fd: FormData) {
  return act((actor) => createUnit(actor, { ...formObject(fd), allowsDecimal: formBool(fd, "allowsDecimal") }).then(() => undefined), {
    revalidate: ["/masters", "/admin"],
    message: "Unit added",
  });
}

export async function setUnitActiveAction(fd: FormData) {
  return act((actor) => setUnitActive(actor, String(fd.get("id")), fd.get("active") === "true").then(() => undefined), {
    revalidate: ["/masters", "/admin"],
    message: "Unit updated",
  });
}

export async function createCategoryAction(fd: FormData) {
  return act((actor) => createCategory(actor, formObject(fd)).then(() => undefined), {
    revalidate: ["/masters", "/products"],
    message: "Category added",
  });
}

export async function setCategoryActiveAction(fd: FormData) {
  return act((actor) => setCategoryActive(actor, String(fd.get("id")), fd.get("active") === "true").then(() => undefined), {
    revalidate: ["/masters", "/products"],
    message: "Category updated",
  });
}

export async function importCsvAction(fd: FormData) {
  return act(
    async (actor) => {
      const file = fd.get("file");
      const text = file instanceof File ? await file.text() : "";
      return importCsv(actor, String(fd.get("kind")), text, fd.get("dryRun") === "true");
    },
    { revalidate: ["/masters", "/admin", "/products", "/ecommerce"] },
  );
}
