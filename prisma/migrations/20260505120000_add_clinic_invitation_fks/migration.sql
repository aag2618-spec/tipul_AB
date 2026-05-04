-- ==================== Clinic Invitation: Foreign Keys ====================
-- מוסיף FKs ל-User על createdById, acceptedByUserId, revokedById.
-- מונע references מתים אחרי מחיקת user.
--
-- onDelete:
--   createdById: Restrict — אסור למחוק owner עם הזמנות פעילות.
--     מאלץ ניקוי מסודר: revoke כל ה-pending לפני delete.
--   acceptedByUserId: SetNull — מחיקת user שמיש לפעמים (GDPR), audit trail נשמר.
--   revokedById: SetNull — אותה הצדקה כמו accepted.
--
-- בנוסף: 2 indexes על createdById + acceptedByUserId (פוטנציאל ל-lookup).

-- FK 1: createdById → User.id (Restrict)
ALTER TABLE "ClinicInvitation"
  ADD CONSTRAINT "ClinicInvitation_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- FK 2: acceptedByUserId → User.id (SetNull)
ALTER TABLE "ClinicInvitation"
  ADD CONSTRAINT "ClinicInvitation_acceptedByUserId_fkey"
  FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- FK 3: revokedById → User.id (SetNull)
ALTER TABLE "ClinicInvitation"
  ADD CONSTRAINT "ClinicInvitation_revokedById_fkey"
  FOREIGN KEY ("revokedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes חדשים — Prisma יוצר אוטומטית מ-@@index, אבל נוסיף ידנית כי המיגרציה
-- ידנית ולא דרך migrate dev.
CREATE INDEX IF NOT EXISTS "ClinicInvitation_createdById_idx" ON "ClinicInvitation"("createdById");
CREATE INDEX IF NOT EXISTS "ClinicInvitation_acceptedByUserId_idx" ON "ClinicInvitation"("acceptedByUserId");
CREATE INDEX IF NOT EXISTS "ClinicInvitation_revokedById_idx" ON "ClinicInvitation"("revokedById");
