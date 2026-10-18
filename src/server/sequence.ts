import type { Tx } from "./db";

export const SEQUENCES = {
  rawEntry: { key: "raw_entry", prefix: "RM", pad: 6 },
  rawTxn: { key: "raw_txn", prefix: "RMT", pad: 7 },
  product: { key: "product", prefix: "PRD", pad: 5 },
  productTxn: { key: "product_txn", prefix: "PT", pad: 7 },
  batch: { key: "batch", prefix: "B", pad: 6 },
  adjustment: { key: "adjustment", prefix: "ADJ", pad: 6 },
  dispatch: { key: "dispatch", prefix: "DSP", pad: 6 },
  return: { key: "return", prefix: "RET", pad: 6 },
  disposition: { key: "disposition", prefix: "DSN", pad: 6 },
  sale: { key: "sale", prefix: "SAL", pad: 6 },
  supplier: { key: "supplier", prefix: "SUP", pad: 4 },
  store: { key: "store", prefix: "STR", pad: 4 },
} as const;

export type SequenceName = keyof typeof SEQUENCES;

/** Atomically allocate the next document number inside the current transaction. */
export async function nextNumber(tx: Tx, name: SequenceName): Promise<string> {
  const seq = SEQUENCES[name];
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "DocumentSequence" ("key", "value") VALUES (${seq.key}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "DocumentSequence"."value" + 1
    RETURNING "value"`;
  return `${seq.prefix}-${String(rows[0].value).padStart(seq.pad, "0")}`;
}
