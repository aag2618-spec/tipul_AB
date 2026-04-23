-- הוספת שדה attachments (JSONB) לפניות תמיכה ולתגובות — מבנה:
-- [{id, filename, contentType, size, fileUrl, uploadedAt}]
-- שדה nullable כדי לשמור על תאימות לאחור עם פניות/תגובות קיימות.

ALTER TABLE "SupportTicket" ADD COLUMN IF NOT EXISTS "attachments" JSONB;
ALTER TABLE "SupportResponse" ADD COLUMN IF NOT EXISTS "attachments" JSONB;
