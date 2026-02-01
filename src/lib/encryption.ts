// lib/encryption.ts
// פונקציות הצפנה ופענוח של API Keys

import crypto from 'crypto';

// הסוד להצפנה - צריך להיות ב-ENV!
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-key-change-in-production-must-be-32-chars!!';
const ALGORITHM = 'aes-256-gcm';

/**
 * מצפין טקסט (לשמירת API Keys)
 */
export function encrypt(text: string): string {
  try {
    // יצירת IV רנדומלי
    const iv = crypto.randomBytes(16);
    
    // יצירת key מה-encryption key
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    
    // יצירת cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    // הצפנה
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // קבלת auth tag
    const authTag = cipher.getAuthTag();
    
    // החזרת המידע המוצפן עם IV ו-AuthTag
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * מפענח טקסט מוצפן
 */
export function decrypt(encryptedText: string): string {
  try {
    // פירוק המידע המוצפן
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted format');
    }
    
    const [ivHex, authTagHex, encrypted] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    // יצירת key
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    
    // יצירת decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    // פענוח
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * בודק אם string הוא מוצפן (לפי הפורמט)
 */
export function isEncrypted(text: string): boolean {
  const parts = text.split(':');
  return parts.length === 3 && parts[0].length === 32 && parts[1].length === 32;
}

/**
 * מחשב hash של API Key (לשמירה בלוגים בלי לחשוף)
 */
export function hashApiKey(apiKey: string): string {
  return crypto
    .createHash('sha256')
    .update(apiKey)
    .digest('hex')
    .substring(0, 16); // רק 16 תווים ראשונים
}
