import crypto from 'crypto';
import { logger } from './logger';

// M11.L2: בעבר dev mode יצר random key בכל restart → encrypted data ב-DB
// לא היה ניתן לפענוח אחרי restart. עכשיו: בdev — key דטרמיניסטי שמחושב
// מ-DATABASE_URL (כך שלא נכתב לקובץ ולא משתנה בין restarts, אבל גם לא
// מוסתר ב-git). זו פשרה — לdev בלבד; ב-prod חייב env var ENCRYPTION_KEY.
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || (() => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("ENCRYPTION_KEY must be set in production");
  }
  // מבסס על DATABASE_URL (שיש לכל מפתח dev) כדי שיהיה דטרמיניסטי
  // וכך data תפוענח אחרי restart. ב-CI ללא DATABASE_URL — fallback ל-random.
  // **חשוב:** הslice(0, 42) שמור בכוונה — שינויו ישבור פענוח records
  // ישנים בdev DB (סוכן ביקורת 16-fix1 זיהה). scryptSync תמיד מפיק 32-byte
  // key, אבל ה-input משפיע על ה-derivation. שמירה על 42 chars שומרת תאימות
  // לאחור עם records קיימים. דרושה migration נפרדת אם רוצים לחזק.
  const devSeed = process.env.DATABASE_URL || "tipul-dev-fallback-seed";
  const devKey = crypto.createHash("sha256").update(devSeed).digest("hex").slice(0, 42);
  logger.warn(
    "ENCRYPTION_KEY not set — using deterministic dev key (DEV ONLY). " +
    "Production REQUIRES ENCRYPTION_KEY env var."
  );
  return devKey;
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
    logger.error('Encryption error', { errorMessage: error instanceof Error ? error.message : String(error) });
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
    logger.error('Decryption error', { errorMessage: error instanceof Error ? error.message : String(error) });
    throw new Error('Failed to decrypt data');
  }
}

// Tighter detection: each chunk must be valid hex (not just any 32-char string).
// Prevents false-positive on user content that happens to contain ":" with
// 32-char segments. New 4-part format starts with salt (32 hex), iv (32 hex),
// authTag (32 hex), then ciphertext (≥2 hex chars).
const HEX32 = /^[0-9a-f]{32}$/i;
const HEX_MIN2 = /^[0-9a-f]{2,}$/i;

export function isEncrypted(text: string): boolean {
  const parts = text.split(':');
  if (parts.length === 4) {
    return (
      HEX32.test(parts[0]) &&
      HEX32.test(parts[1]) &&
      HEX32.test(parts[2]) &&
      HEX_MIN2.test(parts[3])
    );
  }
  if (parts.length === 3) {
    return (
      HEX32.test(parts[0]) &&
      HEX32.test(parts[1]) &&
      HEX_MIN2.test(parts[2])
    );
  }
  return false;
}

const API_KEY_HMAC_SECRET = process.env.API_KEY_HMAC_SECRET || (() => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("API_KEY_HMAC_SECRET must be set in production");
  }
  const devSeed = process.env.DATABASE_URL || "tipul-dev-api-key-seed";
  logger.warn(
    "API_KEY_HMAC_SECRET not set — using deterministic dev key (DEV ONLY). " +
    "Production REQUIRES API_KEY_HMAC_SECRET env var."
  );
  return crypto.createHash("sha256").update(devSeed).digest("hex");
})();

export function hashApiKey(apiKey: string): string {
  return crypto
    .createHmac('sha256', API_KEY_HMAC_SECRET)
    .update(apiKey)
    .digest('hex')
    .substring(0, 16);
}
