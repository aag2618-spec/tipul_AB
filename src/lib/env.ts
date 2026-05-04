// Environment variables configuration
// Copy these to your .env.local file:
// 
// DATABASE_URL="postgresql://username:password@localhost:5432/tipul?schema=public"
// NEXTAUTH_SECRET="your-secret-key-here"
// NEXTAUTH_URL="http://localhost:3000"
// GOOGLE_AI_API_KEY="your-google-ai-api-key"
// ANTHROPIC_API_KEY="your-anthropic-api-key"
// RESEND_API_KEY="your-resend-api-key"

// M3 — Validate critical environment variables (basic schema, ללא תלות חיצונית).
// בדיקה: קיום + אורך מינימלי לסודות. ב-production נכשל ה-startup; ב-dev
// נתעדפ אבל ממשיכים כדי שלא לחסום פיתוח לוקאלי.
function validateEnv() {
  const errors: string[] = [];
  const isProd = process.env.NODE_ENV === 'production';

  // חובה תמיד
  if (!process.env.DATABASE_URL) {
    errors.push('DATABASE_URL is required');
  }
  if (!process.env.NEXTAUTH_SECRET) {
    errors.push('NEXTAUTH_SECRET is required');
  } else if (process.env.NEXTAUTH_SECRET.length < 32) {
    errors.push('NEXTAUTH_SECRET must be at least 32 characters (use: openssl rand -base64 32)');
  }

  // חובה ב-production
  if (isProd) {
    if (!process.env.NEXTAUTH_URL) {
      errors.push('NEXTAUTH_URL is required in production');
    }
    if (!process.env.ENCRYPTION_KEY) {
      errors.push('ENCRYPTION_KEY is required in production');
    } else if (process.env.ENCRYPTION_KEY.length < 32) {
      // ה-encryption.ts מעביר את הkey ל-scryptSync, אז הוא מקבל כל פורמט.
      // 32+ תווים מבטיח אנטרופיה סבירה גם ב-base64 וגם ב-hex.
      errors.push('ENCRYPTION_KEY must be at least 32 characters (use: openssl rand -hex 32 or -base64 32)');
    }
    if (!process.env.CRON_SECRET) {
      errors.push('CRON_SECRET is required in production');
    }
    // SETUP_SECRET נדרש רק כש-SETUP_ENABLED=true (ה-route בודק את זה).
    if (process.env.SETUP_ENABLED === 'true') {
      if (!process.env.SETUP_SECRET || process.env.SETUP_SECRET.length < 32) {
        errors.push('SETUP_SECRET must be ≥32 chars when SETUP_ENABLED=true');
      }
    }
  }

  if (errors.length > 0) {
    console.error('Environment validation failed:');
    errors.forEach(err => console.error(`  - ${err}`));
    if (isProd) {
      throw new Error(`Missing/invalid environment variables: ${errors.join(', ')}`);
    }
  }
}

// Run validation
if (typeof window === 'undefined') {
  validateEnv();
}

export const env = {
  DATABASE_URL: process.env.DATABASE_URL!,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET!,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL || 'http://localhost:3000',
  GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || '',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '', // Optional - no longer used
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
} as const;













