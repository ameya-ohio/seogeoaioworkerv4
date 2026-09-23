import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Binary artifact storage (header PNGs etc.) — decision D3. Two drivers:
 *  - local: files under a directory (dev default)
 *  - s3:    any S3-compatible bucket (Railway buckets are S3-compatible)
 * Selected via STORAGE_DRIVER; see storageFromEnv().
 */
export interface StoredObject {
  key: string;
  url?: string;
}

export interface Storage {
  driver: "local" | "s3";
  put(key: string, body: Buffer, contentType: string): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
}

export class LocalStorage implements Storage {
  readonly driver = "local" as const;
  constructor(private baseDir: string) {}

  async put(key: string, body: Buffer): Promise<StoredObject> {
    const path = join(this.baseDir, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
    return { key, url: `file://${path}` };
  }

  async get(key: string): Promise<Buffer> {
    return readFile(join(this.baseDir, key));
  }
}

export interface S3Options {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** If set, put() returns `${publicBaseUrl}/${key}` as the object URL. */
  publicBaseUrl?: string;
}

export class S3Storage implements Storage {
  readonly driver = "s3" as const;
  private clientPromise: Promise<import("@aws-sdk/client-s3").S3Client> | null = null;

  constructor(private opts: S3Options) {}

  private async client() {
    if (!this.clientPromise) {
      this.clientPromise = import("@aws-sdk/client-s3").then(
        (m) =>
          new m.S3Client({
            region: this.opts.region,
            ...(this.opts.endpoint ? { endpoint: this.opts.endpoint, forcePathStyle: true } : {}),
            credentials: {
              accessKeyId: this.opts.accessKeyId,
              secretAccessKey: this.opts.secretAccessKey,
            },
          }),
      );
    }
    return this.clientPromise;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<StoredObject> {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.client();
    await client.send(
      new PutObjectCommand({ Bucket: this.opts.bucket, Key: key, Body: body, ContentType: contentType }),
    );
    const url = this.opts.publicBaseUrl
      ? `${this.opts.publicBaseUrl.replace(/\/$/, "")}/${key}`
      : undefined;
    return url ? { key, url } : { key };
  }

  async get(key: string): Promise<Buffer> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.client();
    const res = await client.send(new GetObjectCommand({ Bucket: this.opts.bucket, Key: key }));
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) throw new Error(`Empty S3 object: ${key}`);
    return Buffer.from(bytes);
  }
}

/**
 * Build a Storage from env.
 *   STORAGE_DRIVER=local (default) → LocalStorage at STORAGE_DIR
 *     (default <repoRoot>/outputs/storage)
 *   STORAGE_DRIVER=s3 → S3Storage from S3_ENDPOINT / S3_REGION / S3_BUCKET /
 *     S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY / S3_PUBLIC_BASE_URL
 */
export function storageFromEnv(repoRoot: string, env: NodeJS.ProcessEnv = process.env): Storage {
  const driver = (env["STORAGE_DRIVER"] ?? "local").toLowerCase();
  if (driver === "s3") {
    const need = ["S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const;
    for (const k of need) {
      if (!env[k]) throw new Error(`STORAGE_DRIVER=s3 but ${k} is not set`);
    }
    return new S3Storage({
      region: env["S3_REGION"] as string,
      bucket: env["S3_BUCKET"] as string,
      accessKeyId: env["S3_ACCESS_KEY_ID"] as string,
      secretAccessKey: env["S3_SECRET_ACCESS_KEY"] as string,
      ...(env["S3_ENDPOINT"] ? { endpoint: env["S3_ENDPOINT"] } : {}),
      ...(env["S3_PUBLIC_BASE_URL"] ? { publicBaseUrl: env["S3_PUBLIC_BASE_URL"] } : {}),
    });
  }
  return new LocalStorage(env["STORAGE_DIR"] ?? join(repoRoot, "outputs", "storage"));
}
