-- M2: Data Access Audit Log — tamper-proof תיעוד קריאות לנתונים רגישים.
-- חיוני להתאמה לתקנות הגנת הפרטיות (2017) על מידע רפואי-נפשי.
--
-- Tamper-proof:
--   • אין UPDATE על השורות (rules ב-API + הרחקת PATCH endpoints).
--   • DELETE רק דרך cron retention אחרי 12 חודשים.

CREATE TABLE "DataAccessAuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userEmail" TEXT,
    "userName" TEXT,
    "recordType" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "clientId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "meta" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataAccessAuditLog_pkey" PRIMARY KEY ("id")
);

-- אינדקסים לשליפת audit:
CREATE INDEX "DataAccessAuditLog_userId_createdAt_idx" ON "DataAccessAuditLog"("userId", "createdAt");
CREATE INDEX "DataAccessAuditLog_recordType_recordId_idx" ON "DataAccessAuditLog"("recordType", "recordId");
CREATE INDEX "DataAccessAuditLog_clientId_createdAt_idx" ON "DataAccessAuditLog"("clientId", "createdAt");
CREATE INDEX "DataAccessAuditLog_createdAt_idx" ON "DataAccessAuditLog"("createdAt");
CREATE INDEX "DataAccessAuditLog_action_createdAt_idx" ON "DataAccessAuditLog"("action", "createdAt");

-- FK: SetNull במחיקת user — שומר את ה-audit log עם snapshot של email/name.
ALTER TABLE "DataAccessAuditLog" ADD CONSTRAINT "DataAccessAuditLog_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
