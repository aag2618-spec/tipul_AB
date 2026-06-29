import { readFile, writeFile, unlink, stat, mkdir, readdir } from "fs/promises";
import { join, resolve, dirname, relative, sep } from "path";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
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

export interface StorageListItem {
  /** הנתיב היחסי (key) — זהה למה שנמסר ל-write() ולמה ששמור ב-attachmentPath/audioUrl. */
  path: string;
  size: number;
  lastModified: Date;
}

export interface StorageListPage {
  items: StorageListItem[];
  /** token לעמוד הבא (S3). undefined = אין עוד עמודים. */
  nextToken?: string;
}

export interface StorageProvider {
  read(relativePath: string): Promise<Buffer>;
  write(relativePath: string, data: Buffer, contentType?: string): Promise<void>;
  delete(relativePath: string): Promise<void>;
  exists(relativePath: string): Promise<boolean>;
  stat(relativePath: string): Promise<FileStat>;
  getSignedUrl(relativePath: string, expiresInSeconds?: number): Promise<string>;
  /**
   * מחזיר עמוד של אובייקטים שה-key שלהם מתחיל ב-prefix.
   * S3: עד maxKeys לעמוד + nextToken להמשך pagination.
   * Local (dev): כל הקבצים תחת התיקייה בעמוד אחד (ללא token).
   */
  list(
    prefix: string,
    continuationToken?: string,
    maxKeys?: number
  ): Promise<StorageListPage>;
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
    // בדיקת startsWith לבדה חשופה לדמיון-תחילית (למשל baseDir="…/uploads"
    // וספרייה אחות "…/uploads-evil"). דרישת מפריד-נתיב אחרי baseDir חוסמת זאת.
    if (full !== this.baseDir && !full.startsWith(this.baseDir + sep)) {
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

  async list(prefix: string): Promise<StorageListPage> {
    const root = this.resolvePath(prefix);
    const items: StorageListItem[] = [];

    const walk = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch (err) {
        // התיקייה לא קיימת עדיין (אין קבצים) — אין מה לסרוק.
        if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return;
        throw err;
      }
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.isFile()) {
          const s = await stat(full);
          // path יחסי ל-baseDir עם "/" — תואם בדיוק לערך השמור ב-attachmentPath.
          const rel = relative(this.baseDir, full).split(sep).join("/");
          items.push({ path: rel, size: s.size, lastModified: s.mtime });
        }
      }
    };

    await walk(root);
    // אחסון מקומי (dev בלבד) — מחזיר הכל בעמוד אחד, ללא pagination.
    return { items };
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

  async list(
    prefix: string,
    continuationToken?: string,
    maxKeys = 1000
  ): Promise<StorageListPage> {
    const resp = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: this.key(prefix),
        ContinuationToken: continuationToken,
        MaxKeys: maxKeys,
      })
    );

    const items: StorageListItem[] = [];
    for (const obj of resp.Contents ?? []) {
      if (!obj.Key) continue;
      items.push({
        path: obj.Key,
        size: obj.Size ?? 0,
        lastModified: obj.LastModified ?? new Date(),
      });
    }

    return {
      items,
      // NextContinuationToken מוגדר רק כש-IsTruncated=true.
      nextToken: resp.IsTruncated ? resp.NextContinuationToken : undefined,
    };
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
