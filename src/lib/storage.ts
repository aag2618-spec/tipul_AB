import { readFile, writeFile, unlink, stat, mkdir } from "fs/promises";
import { join, resolve, dirname } from "path";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl as awsGetSignedUrl } from "@aws-sdk/s3-request-presigner";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface FileStat {
  size: number;
  lastModified: Date;
}

export interface StorageProvider {
  read(relativePath: string): Promise<Buffer>;
  write(relativePath: string, data: Buffer, contentType?: string): Promise<void>;
  delete(relativePath: string): Promise<void>;
  exists(relativePath: string): Promise<boolean>;
  stat(relativePath: string): Promise<FileStat>;
  getSignedUrl(relativePath: string, expiresInSeconds?: number): Promise<string>;
}

// ---------------------------------------------------------------------------
// Local filesystem implementation
// ---------------------------------------------------------------------------

export class LocalStorageProvider implements StorageProvider {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir =
      baseDir ??
      resolve(process.env.UPLOADS_DIR || join(process.cwd(), "uploads"));
  }

  private resolvePath(relativePath: string): string {
    const full = resolve(this.baseDir, relativePath);
    if (!full.startsWith(this.baseDir)) {
      throw new Error("Path traversal detected");
    }
    return full;
  }

  async read(relativePath: string): Promise<Buffer> {
    return readFile(this.resolvePath(relativePath));
  }

  async write(relativePath: string, data: Buffer): Promise<void> {
    const filePath = this.resolvePath(relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
  }

  async delete(relativePath: string): Promise<void> {
    await unlink(this.resolvePath(relativePath));
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      await stat(this.resolvePath(relativePath));
      return true;
    } catch {
      return false;
    }
  }

  async stat(relativePath: string): Promise<FileStat> {
    const s = await stat(this.resolvePath(relativePath));
    return { size: s.size, lastModified: s.mtime };
  }

  async getSignedUrl(relativePath: string): Promise<string> {
    return `/api/uploads/${relativePath}`;
  }
}

// ---------------------------------------------------------------------------
// S3-compatible implementation (AWS S3 / Cloudflare R2 / MinIO)
// ---------------------------------------------------------------------------

export class S3StorageProvider implements StorageProvider {
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.bucket = process.env.S3_BUCKET!;
    this.client = new S3Client({
      region: process.env.S3_REGION || "auto",
      ...(process.env.S3_ENDPOINT && { endpoint: process.env.S3_ENDPOINT }),
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
    });
  }

  private key(relativePath: string): string {
    const normalized = relativePath.replace(/\\/g, "/");
    if (normalized.includes("..")) throw new Error("Path traversal detected");
    return normalized;
  }

  async read(relativePath: string): Promise<Buffer> {
    const resp = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: this.key(relativePath) })
    );
    const stream = resp.Body;
    if (!stream) throw new Error("Empty response from S3");
    return Buffer.from(await stream.transformToByteArray());
  }

  async write(
    relativePath: string,
    data: Buffer,
    contentType?: string
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.key(relativePath),
        Body: data,
        ContentType: contentType || "application/octet-stream",
        ServerSideEncryption: "AES256",
      })
    );
  }

  async delete(relativePath: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: this.key(relativePath),
      })
    );
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: this.key(relativePath),
        })
      );
      return true;
    } catch {
      return false;
    }
  }

  async stat(relativePath: string): Promise<FileStat> {
    const resp = await this.client.send(
      new HeadObjectCommand({
        Bucket: this.bucket,
        Key: this.key(relativePath),
      })
    );
    return {
      size: resp.ContentLength ?? 0,
      lastModified: resp.LastModified ?? new Date(),
    };
  }

  async getSignedUrl(
    relativePath: string,
    expiresInSeconds = 900
  ): Promise<string> {
    return awsGetSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.key(relativePath),
      }),
      { expiresIn: expiresInSeconds }
    );
  }
}

// ---------------------------------------------------------------------------
// Auto-select: S3 if configured, otherwise local filesystem
// ---------------------------------------------------------------------------

function createStorage(): StorageProvider {
  if (process.env.S3_BUCKET) {
    logger.info("[storage] using S3 provider", {
      bucket: process.env.S3_BUCKET,
    });
    return new S3StorageProvider();
  }
  return new LocalStorageProvider();
}

const storage: StorageProvider = createStorage();
export default storage;
