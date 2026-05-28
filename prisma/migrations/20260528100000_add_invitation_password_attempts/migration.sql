-- M11.A6: per-invitation password attempt counter.
-- שדה ל-tracking של ניסיונות סיסמה כושלים על accept של clinic invitation.
-- אחרי INVITATION_PASSWORD_MAX_ATTEMPTS כשלים — ההזמנה תסומן REVOKED.
-- idempotent (IF NOT EXISTS) — בטוח לכשל פריסה חוזרת.
ALTER TABLE "ClinicInvitation" ADD COLUMN IF NOT EXISTS "passwordAttempts" INTEGER NOT NULL DEFAULT 0;
