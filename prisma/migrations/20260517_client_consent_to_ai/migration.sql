-- M1 (2026-05-17): הסכמת מטופל לעיבוד נתוניו ב-AI חיצוני (Gemini).
-- ברירת מחדל true — אחרת תיחסם כל עבודת AI על מטופלים קיימים.
-- routes של AI חוסמים 403 רק כשהשדה false במפורש.
-- UI עתידי יאפשר למטופל לבחור opt-out (הצבעה ל-false).

ALTER TABLE "Client"
  ADD COLUMN "consentToAI" BOOLEAN DEFAULT true,
  ADD COLUMN "consentToAIAt" TIMESTAMP(3);
