import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Private file storage. Files are never served from a public URL: every read
 * goes through /api/files/[id], which checks the session and permissions.
 *
 * STORAGE_DRIVER=local  -> files under STORAGE_LOCAL_DIR (outside /public)
 * STORAGE_DRIVER=s3     -> private bucket on any S3-compatible service
 */
export interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
}

class LocalStorage implements StorageDriver {
  constructor(private readonly root: string) {}

  private resolve(key: string) {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error("Invalid storage key");
    return full;
  }

  async put(key: string, body: Buffer) {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body, { flag: "wx" }); // never overwrite an existing document
  }

  async get(key: string) {
    return readFile(this.resolve(key));
  }
}

class S3Storage implements StorageDriver {
  private clientPromise: Promise<import("@aws-sdk/client-s3").S3Client>;
  constructor(private readonly bucket: string) {
    this.clientPromise = import("@aws-sdk/client-s3").then(
      ({ S3Client }) =>
        new S3Client({
          region: process.env.S3_REGION || "auto",
          endpoint: process.env.S3_ENDPOINT || undefined,
          forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
          credentials: {
            accessKeyId: required("S3_ACCESS_KEY_ID"),
            secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
          },
        }),
    );
  }

  async put(key: string, body: Buffer, contentType: string) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.clientPromise;
    await client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType, IfNoneMatch: "*" }),
    );
  }

  async get(key: string) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.clientPromise;
    const res = await client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const bytes = await res.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required when STORAGE_DRIVER=s3`);
  return v;
}

let driver: StorageDriver | null = null;

export function storage(): StorageDriver {
  if (driver) return driver;
  const kind = process.env.STORAGE_DRIVER || "local";
  if (kind === "s3") driver = new S3Storage(required("S3_BUCKET"));
  else driver = new LocalStorage(path.resolve(process.env.STORAGE_LOCAL_DIR || "./storage/private"));
  return driver;
}
