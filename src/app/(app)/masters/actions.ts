"use server";

import { act, formObject } from "@/server/action";
import { createRawMaterial, setRawMaterialActive, updateRawMaterial } from "@/server/services/raw-materials";

const PATHS = ["/masters", "/raw-materials"];

export async function saveRawMaterialAction(fd: FormData) {
  return act(
    async (actor) => {
      const o = formObject(fd);
      if (o.id) await updateRawMaterial(actor, o.id, o);
      else await createRawMaterial(actor, o);
    },
    { revalidate: PATHS, message: "Raw material saved" },
  );
}

export async function setRawMaterialActiveAction(fd: FormData) {
  return act((actor) => setRawMaterialActive(actor, String(fd.get("id")), fd.get("active") === "true").then(() => undefined), {
    revalidate: PATHS,
    message: "Raw material status updated",
  });
}
