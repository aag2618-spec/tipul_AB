-- H18: Recovery codes ל-2FA
-- מערך JSON של bcrypt hashes (10 קודים חד-פעמיים).
-- שדה Text כדי לתמוך במערכים גדולים יחסית (~80 chars per hash * 10 = ~800 chars).
ALTER TABLE "User" ADD COLUMN "twoFactorRecoveryCodes" TEXT;
