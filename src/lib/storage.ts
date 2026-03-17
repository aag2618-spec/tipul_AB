/**
 * Storage abstraction layer.
 *
 * Provides a StorageProvider interface so the application can swap between
 * local filesystem storage and cloud storage (e.g. S3, GCS) without
 * changing the consuming code.
 *
 * Currently exports a LocalStorageProvider that mirrors the existing
 * fs-based upload handling in the codebase.
 */

import { readFile, writeFile, unlink, stat, mkdir } from 'fs/promises';
import { join, resolve, dirname } from 'path';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface StorageProvider {
  /** Read a file and return its contents as a Buffer. */
  read(relativePath: string): Promise<Buffer>;

  /** Write content to a file. Creates parent directories as needed. */
  write(relativePath: string, data: Buffer): Promise<void>;

  /** Delete a file. Throws if the file does not exist. */
  delete(relativePath: string): Promise<void>;

  /** Check whether a file exists at the given path. */
  exists(relativePath: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Local filesystem implementation
// ---------------------------------------------------------------------------

export class LocalStorageProvider implements StorageProvider {
  private baseDir: string;

  /**
   * @param baseDir  Absolute path to the root storage directory.
   *                 Defaults to `UPLOADS_DIR` env var or `<cwd>/uploads`.
   */
  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? resolve(process.env.UPLOADS_DIR || join(process.cwd(), 'uploads'));
  }

  private resolvePath(relativePath: string): string {
    const full = resolve(this.baseDir, relativePath);
    // Prevent path traversal
    if (!full.startsWith(this.baseDir)) {
      throw new Error('Path traversal detected');
    }
    return full;
  }

  async read(relativePath: string): Promise<Buffer> {
    const filePath = this.resolvePath(relativePath);
    return readFile(filePath);
  }

  async write(relativePath: string, data: Buffer): Promise<void> {
    const filePath = this.resolvePath(relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
  }

  async delete(relativePath: string): Promise<void> {
    const filePath = this.resolvePath(relativePath);
    await unlink(filePath);
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      const filePath = this.resolvePath(relativePath);
      await stat(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Default export — ready-to-use local provider
// ---------------------------------------------------------------------------

const storage: StorageProvider = new LocalStorageProvider();
export default storage;
