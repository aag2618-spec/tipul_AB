import crypto from 'crypto';
import { logger } from './logger';

const ALGORITHM = 'aes-256-gcm';

const LEGACY_SALT = 'salt';

// ── Key versioning / rotation (חלק ב', סבב אבטחה 2026-06-29) ──
// מטרה: לאפשר החלפת מפתח הצפנה בלי לאבד PHI היסטורי. ה-ciphertext החדש נושא
// מזהה-מפתח (key-id) בתחילתו, כך שכמה מפתחות יכולים להתקיים יחד:
//   • הצפנה — תמיד עם המפתח ה"נוכחי".
//   • פענוח — בוחר מפתח לפי ה-key-id שברשומה.
//
// פורמטים נתמכים:
//   v<id>:salt:iv:authTag:encrypted   (5 חלקים — מגורסה, חדש)
//   salt:iv:authTag:encrypted         (4 חלקים — לא-מגורסה, מפתח default)
//   iv:authTag:encrypted              (3 חלקים — legacy, salt קבוע, מפתח default)
//
// env vars:
//   ENCRYPTION_KEY          — מפתח default/legacy. מפענח כל רשומה בלי key-id.
//   ENCRYPTION_KEY_V<n>     — מפתחות ממוספרים נוספים (נוספים בזמן rotation).
//   ENCRYPTION_KEY_CURRENT  — איזה key-id (כמו "v2") לכתיבות חדשות.
//                             ריק = מצב "אינרטי": כותבים 4 חלקים כמו קודם.
//
// המנגנון אינרטי כברירת מחדל — בלי ENCRYPTION_KEY_CURRENT ההתנהגות זהה לחלוטין
// לקוד הקודם, כך שעצם פריסת הקוד לא משנה כלום בכתיבה. רק *מוסיף* יכולת לפענח
// רשומות מגורסה ולסובב מפתח כשמגדירים זאת במפורש.
const KEY_ID_RE = /^v[0-9]+$/;

function envVarForKeyId(keyId: string): string {
  return `ENCRYPTION_KEY_${keyId.toUpperCase()}`; // v2 → ENCRYPTION_KEY_V2
}

// M11.L2: בעבר dev mode יצר random key בכל restart → encrypted data ב-DB
// לא היה ניתן לפענוח אחרי restart. עכשיו: בdev — key דטרמיניסטי שמחושב
// מ-DATABASE_URL (כך שלא נכתב לקובץ ולא משתנה בין restarts, אבל גם לא
// מוסתר ב-git). זו פשרה — לdev בלבד; ב-prod חייב env var ENCRYPTION_KEY.
//
// קוראים את ה-env per-call (לא module const) כדי לתמוך ב-rotation בזמן ריצה
// וכדי שהבדיקות יוכלו להחליף מפתחות. עלות זניחה מול scryptSync.
let _devWarned = false;
function getDefaultSecret(): string {
  const fromEnv = process.env.ENCRYPTION_KEY;
  if (fromEnv) return fromEnv;
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
  if (!_devWarned) {
    logger.warn(
      "ENCRYPTION_KEY not set — using deterministic dev key (DEV ONLY). " +
      "Production REQUIRES ENCRYPTION_KEY env var."
    );
    _devWarned = true;
  }
  return devKey;
}

// בונה מפת key-id → secret מכל משתני ENCRYPTION_KEY_V<n>.
function getKeyRegistry(): Map<string, string> {
  const map = new Map<string, string>();
  for (const [name, value] of Object.entries(process.env)) {
    const m = /^ENCRYPTION_KEY_V([0-9]+)$/.exec(name);
    if (m && value) map.set(`v${m[1]}`, value);
  }
  return map;
}

function getCurrentKeyId(): string | null {
  const id = process.env.ENCRYPTION_KEY_CURRENT?.trim();
  if (!id) return null;
  if (!KEY_ID_RE.test(id)) {
    throw new Error(`Invalid ENCRYPTION_KEY_CURRENT "${id}" — expected form like "v2"`);
  }
  return id;
}

// המפתח (וה-key-id לחותמת) שאיתם מצפינים כתיבה חדשה. keyId=null → לא-מגורסה.
function resolveEncryptionSecret(): { keyId: string | null; secret: string } {
  const currentId = getCurrentKeyId();
  if (!currentId) return { keyId: null, secret: getDefaultSecret() };
  const secret = getKeyRegistry().get(currentId);
  if (!secret) {
    // FAIL-FAST: המצביע מפנה למפתח שלא הוגדר — אסור ליפול בשקט ל-default
    // (זה היה כותב את הנתון עם מפתח שונה מהמתועד → אובדן בעת migration).
    throw new Error(
      `ENCRYPTION_KEY_CURRENT=${currentId} but ${envVarForKeyId(currentId)} is not set`,
    );
  }
  return { keyId: currentId, secret };
}

// המפתח שאיתו מפענחים רשומה לפי ה-key-id שלה. null → מפתח default.
function resolveDecryptionSecret(keyId: string | null): string {
  if (!keyId) return getDefaultSecret();
  const secret = getKeyRegistry().get(keyId);
  if (!secret) {
    // מפתח לא-מוכר — נכשל בטוח (ה-caller יהפוך לזריקה→marker בקריאה).
    // לעולם לא להחזיר plaintext/לנחש מפתח אחר.
    throw new Error(
      `Unknown encryption key id "${keyId}" — ${envVarForKeyId(keyId)} not configured`,
    );
  }
  return secret;
}

function deriveKey(secret: string, salt: string | Buffer): Buffer {
  return crypto.scryptSync(secret, salt, 32);
}

// ── אימות תצורת rotation בעת טעינת המודול ──
// נכשל-מהר ב-production אם ENCRYPTION_KEY_CURRENT מוגדר אך המפתח חסר/לא-חוקי,
// כדי שלא נגלה את התקלה רק בכתיבה הראשונה. ב-dev/test — אזהרה בלבד.
(function validateRotationConfigAtStartup() {
  try {
    const currentId = getCurrentKeyId(); // זורק על פורמט לא-חוקי
    if (currentId && !getKeyRegistry().get(currentId)) {
      throw new Error(
        `ENCRYPTION_KEY_CURRENT=${currentId} but ${envVarForKeyId(currentId)} is not set`,
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (process.env.NODE_ENV === "production") {
      throw new Error(`[encryption] invalid key rotation config: ${message}`);
    }
    logger.warn(`[encryption] key rotation config issue (dev): ${message}`);
  }
})();

/**
 * פורמטים:
 *   v<id>:salt:iv:authTag:encrypted  (5 חלקים — מגורסה)
 *   salt:iv:authTag:encrypted        (4 חלקים — salt אקראי, מפתח default)
 *   iv:authTag:encrypted             (3 חלקים — legacy, salt קבוע, מפתח default)
 */
export function encrypt(text: string): string {
  try {
    const { keyId, secret } = resolveEncryptionSecret();
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(16);
    const key = deriveKey(secret, salt);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    const body = `${salt.toString('hex')}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    // key-id מתווסף רק במצב מגורסה — אחרת פורמט 4-חלקים זהה לקוד הקודם.
    return keyId ? `${keyId}:${body}` : body;
  } catch (error) {
    logger.error('Encryption error', { errorMessage: error instanceof Error ? error.message : String(error) });
    throw new Error('Failed to encrypt data');
  }
}

export function decrypt(encryptedText: string): string {
  try {
    const parts = encryptedText.split(':');

    let keyId: string | null = null;
    let salt: string | Buffer;
    let ivHex: string;
    let authTagHex: string;
    let encrypted: string;

    if (parts.length === 5 && KEY_ID_RE.test(parts[0])) {
      // מגורסה: v<id>:salt:iv:authTag:encrypted
      keyId = parts[0];
      salt = Buffer.from(parts[1], 'hex');
      ivHex = parts[2];
      authTagHex = parts[3];
      encrypted = parts[4];
    } else if (parts.length === 4) {
      [, ivHex, authTagHex, encrypted] = parts;
      salt = Buffer.from(parts[0], 'hex');
    } else if (parts.length === 3) {
      [ivHex, authTagHex, encrypted] = parts;
      salt = LEGACY_SALT;
    } else {
      throw new Error('Invalid encrypted format');
    }

    const secret = resolveDecryptionSecret(keyId);
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const key = deriveKey(secret, salt);

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
  // 5 חלקים מגורסה: v<id>:salt:iv:authTag:ciphertext. ה-key-id חייב להיות
  // ב-pattern v<num> כדי שלא נבלבל תוכן משתמש אקראי עם פורמט מוצפן.
  if (parts.length === 5) {
    return (
      KEY_ID_RE.test(parts[0]) &&
      HEX32.test(parts[1]) &&
      HEX32.test(parts[2]) &&
      HEX32.test(parts[3]) &&
      HEX_MIN2.test(parts[4])
    );
  }
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

let _apiKeyHmacSecret: string | null = null;
function getApiKeyHmacSecret(): string {
  if (_apiKeyHmacSecret) return _apiKeyHmacSecret;
  const fromEnv = process.env.API_KEY_HMAC_SECRET;
  if (fromEnv) {
    _apiKeyHmacSecret = fromEnv;
    return _apiKeyHmacSecret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("API_KEY_HMAC_SECRET must be set in production");
  }
  const devSeed = process.env.DATABASE_URL || "tipul-dev-api-key-seed";
  logger.warn(
    "API_KEY_HMAC_SECRET not set — using deterministic dev key (DEV ONLY). " +
    "Production REQUIRES API_KEY_HMAC_SECRET env var."
  );
  _apiKeyHmacSecret = crypto.createHash("sha256").update(devSeed).digest("hex");
  return _apiKeyHmacSecret;
}

export function hashApiKey(apiKey: string): string {
  return crypto
    .createHmac('sha256', getApiKeyHmacSecret())
    .update(apiKey)
    .digest('hex')
    .substring(0, 16);
}
