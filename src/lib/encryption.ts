import crypto from 'crypto';

const ENCRYPTION_KEY = (() => {
  const key = process.env.ENCRYPTION_KEY;
  if (!key && process.env.NODE_ENV === "production") {
    throw new Error("ENCRYPTION_KEY must be set in production environment");
  }
  return key || "default-key-for-development-only-32chars!!";
})();
const ALGORITHM = 'aes-256-gcm';

const LEGACY_SALT = 'salt';

function deriveKey(salt: string | Buffer): Buffer {
  return crypto.scryptSync(ENCRYPTION_KEY, salt, 32);
}

/**
 * New format: salt:iv:authTag:encrypted  (4 parts — random salt)
 * Legacy:    iv:authTag:encrypted        (3 parts — fixed salt)
 */
export function encrypt(text: string): string {
  try {
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(16);
    const key = deriveKey(salt);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    return `${salt.toString('hex')}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

export function decrypt(encryptedText: string): string {
  try {
    const parts = encryptedText.split(':');

    let salt: string | Buffer;
    let ivHex: string;
    let authTagHex: string;
    let encrypted: string;

    if (parts.length === 4) {
      [, ivHex, authTagHex, encrypted] = parts;
      salt = Buffer.from(parts[0], 'hex');
    } else if (parts.length === 3) {
      [ivHex, authTagHex, encrypted] = parts;
      salt = LEGACY_SALT;
    } else {
      throw new Error('Invalid encrypted format');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const key = deriveKey(salt);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
}

export function isEncrypted(text: string): boolean {
  const parts = text.split(':');
  if (parts.length === 4 && parts[0].length === 32 && parts[1].length === 32 && parts[2].length === 32) {
    return true;
  }
  return parts.length === 3 && parts[0].length === 32 && parts[1].length === 32;
}

export function hashApiKey(apiKey: string): string {
  return crypto
    .createHash('sha256')
    .update(apiKey)
    .digest('hex')
    .substring(0, 16);
}
