-- מחיקת תשתית ה-AI מ-DB (2026-06-11, commit הסרת-AI).
--
-- רץ ב-startCommand (render.yaml) *לפני* `prisma db push`, כדי שה-push לא יזהה
-- drift על הטבלאות/עמודות שהוסרו מהסכמה — וכך אין צורך ב-`--accept-data-loss`
-- (הדגל הוסר בכוונה מסיבת אבטחה; ראה הערה ב-render.yaml). idempotent לחלוטין:
-- IF EXISTS + CASCADE, ולכן בטוח לרוץ שוב ושוב (no-op אחרי המחיקה הראשונה).
--
-- מוחק אך ורק את ה-AI. לא נוגע ב-AITier/מנויים/TierLimits/MonthlyUsage,
-- ב-Client.consentToAI/therapeuticApproaches/approachNotes/culturalContext,
-- או בכל טבלה אחרת.

-- ── טבלאות AI (CASCADE מטפל ב-FK בשרשרת Recording→Transcription→Analysis) ──
DROP TABLE IF EXISTS "AIInsight" CASCADE;
DROP TABLE IF EXISTS "SessionAnalysis" CASCADE;
DROP TABLE IF EXISTS "QuestionnaireAnalysis" CASCADE;
DROP TABLE IF EXISTS "SessionPrep" CASCADE;
DROP TABLE IF EXISTS "AIUsageStats" CASCADE;
DROP TABLE IF EXISTS "EmotionLog" CASCADE;
DROP TABLE IF EXISTS "TherapeuticGoal" CASCADE;
DROP TABLE IF EXISTS "Analysis" CASCADE;
DROP TABLE IF EXISTS "Transcription" CASCADE;
DROP TABLE IF EXISTS "Recording" CASCADE;
DROP TABLE IF EXISTS "global_ai_settings" CASCADE;

-- ── עמודות AI בטבלאות שנשארות ──
ALTER TABLE "User" DROP COLUMN IF EXISTS "approachDescription";
ALTER TABLE "User" DROP COLUMN IF EXISTS "analysisStyle";
ALTER TABLE "User" DROP COLUMN IF EXISTS "aiTone";
ALTER TABLE "User" DROP COLUMN IF EXISTS "customAIInstructions";
ALTER TABLE "Client" DROP COLUMN IF EXISTS "comprehensiveAnalysis";
ALTER TABLE "Client" DROP COLUMN IF EXISTS "comprehensiveAnalysisAt";
ALTER TABLE "SessionNote" DROP COLUMN IF EXISTS "aiAnalysis";
ALTER TABLE "QuestionnaireResponse" DROP COLUMN IF EXISTS "aiAnalysis";

-- ── enums (אחרי שאף טבלה/עמודה כבר לא משתמשת בהם) ──
DROP TYPE IF EXISTS "InsightType";
DROP TYPE IF EXISTS "GoalStatus";
DROP TYPE IF EXISTS "QuestionnaireAnalysisType";
DROP TYPE IF EXISTS "AnalysisType";
DROP TYPE IF EXISTS "RecordingType";
DROP TYPE IF EXISTS "RecordingStatus";
