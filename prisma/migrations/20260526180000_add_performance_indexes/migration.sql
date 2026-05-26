-- Performance indexes — מאיץ שאילתות חמות במערכת
-- 26 אינדקסים חדשים על 11 טבלאות.
-- כל האינדקסים משתמשים ב-IF NOT EXISTS לבטיחות (idempotent).
-- כשהמערכת תעלה לייצור עם משתמשים פעילים, מומלץ להחליף ל-CREATE INDEX CONCURRENTLY
-- כדי לא לנעול טבלאות בכתיבה. כרגע (לפני go-live) אין סיכון.

-- ==================== Client (4) ====================
CREATE INDEX IF NOT EXISTS "Client_therapistId_idx"
    ON "Client"("therapistId");

CREATE INDEX IF NOT EXISTS "Client_therapistId_status_isQuickClient_idx"
    ON "Client"("therapistId", "status", "isQuickClient");

CREATE INDEX IF NOT EXISTS "Client_organizationId_status_isQuickClient_idx"
    ON "Client"("organizationId", "status", "isQuickClient");

CREATE INDEX IF NOT EXISTS "Client_organizationId_updatedAt_idx"
    ON "Client"("organizationId", "updatedAt" DESC);

-- ==================== TherapySession (4) ====================
CREATE INDEX IF NOT EXISTS "TherapySession_therapistId_startTime_idx"
    ON "TherapySession"("therapistId", "startTime");

CREATE INDEX IF NOT EXISTS "TherapySession_therapistId_status_startTime_idx"
    ON "TherapySession"("therapistId", "status", "startTime");

CREATE INDEX IF NOT EXISTS "TherapySession_clientId_startTime_idx"
    ON "TherapySession"("clientId", "startTime" DESC);

CREATE INDEX IF NOT EXISTS "TherapySession_organizationId_status_startTime_idx"
    ON "TherapySession"("organizationId", "status", "startTime");

-- ==================== Payment (3) ====================
CREATE INDEX IF NOT EXISTS "Payment_organizationId_status_parentPaymentId_paidAt_idx"
    ON "Payment"("organizationId", "status", "parentPaymentId", "paidAt" DESC);

CREATE INDEX IF NOT EXISTS "Payment_organizationId_status_parentPaymentId_createdAt_idx"
    ON "Payment"("organizationId", "status", "parentPaymentId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "Payment_clientId_status_parentPaymentId_idx"
    ON "Payment"("clientId", "status", "parentPaymentId");

-- ==================== Notification (1) ====================
CREATE INDEX IF NOT EXISTS "Notification_type_status_createdAt_idx"
    ON "Notification"("type", "status", "createdAt");

-- ==================== Task (3) — מודל ללא אינדקסים עד עכשיו! ====================
CREATE INDEX IF NOT EXISTS "Task_userId_status_type_idx"
    ON "Task"("userId", "status", "type");

CREATE INDEX IF NOT EXISTS "Task_userId_relatedEntityId_type_status_idx"
    ON "Task"("userId", "relatedEntityId", "type", "status");

CREATE INDEX IF NOT EXISTS "Task_userId_dueDate_idx"
    ON "Task"("userId", "dueDate");

-- ==================== CommunicationLog (5) — היה רק organizationId ====================
CREATE INDEX IF NOT EXISTS "CommunicationLog_sessionId_type_channel_status_idx"
    ON "CommunicationLog"("sessionId", "type", "channel", "status");

CREATE INDEX IF NOT EXISTS "CommunicationLog_userId_createdAt_idx"
    ON "CommunicationLog"("userId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "CommunicationLog_userId_clientId_type_channel_status_createdAt_idx"
    ON "CommunicationLog"("userId", "clientId", "type", "channel", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "CommunicationLog_createdAt_type_idx"
    ON "CommunicationLog"("createdAt", "type");

CREATE INDEX IF NOT EXISTS "CommunicationLog_messageId_idx"
    ON "CommunicationLog"("messageId");

-- ==================== SubscriptionPayment (2) — חסר userId לחלוטין! ====================
CREATE INDEX IF NOT EXISTS "SubscriptionPayment_userId_createdAt_idx"
    ON "SubscriptionPayment"("userId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "SubscriptionPayment_status_createdAt_idx"
    ON "SubscriptionPayment"("status", "createdAt");

-- ==================== CardcomTransaction (1) ====================
CREATE INDEX IF NOT EXISTS "CardcomTransaction_status_lowProfileId_createdAt_idx"
    ON "CardcomTransaction"("status", "lowProfileId", "createdAt");

-- ==================== AdminAlert (1) ====================
CREATE INDEX IF NOT EXISTS "AdminAlert_type_userId_status_idx"
    ON "AdminAlert"("type", "userId", "status");

-- ==================== ConsentForm (1) ====================
CREATE INDEX IF NOT EXISTS "ConsentForm_organizationId_isTemplate_createdAt_idx"
    ON "ConsentForm"("organizationId", "isTemplate", "createdAt" DESC);

-- ==================== CardcomInvoice (1) ====================
CREATE INDEX IF NOT EXISTS "CardcomInvoice_paymentId_idx"
    ON "CardcomInvoice"("paymentId");
