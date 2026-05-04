-- ==================== Add CardcomTransaction.paymentPageUrl ====================
-- שדה חדש לאחסון URL של דף התשלום שמייצר Cardcom (LowProfile/Create response).
-- משמש ב-/p/pay/[lpId] gateway: כשלקוח לוחץ קישור, אנחנו מציגים דף ביניים שלנו
-- שיודע לחסום בשבת/יו״ט לפני שמפנים ל-Cardcom.
--
-- nullable + בלי default — תאימות לאחור מלאה. transactions קיימים (לפני ההוספה)
-- ימשיכו לעבוד דרך ה-fallback ב-send-cardcom-link (URL ישיר של Cardcom).

ALTER TABLE "CardcomTransaction" ADD COLUMN IF NOT EXISTS "paymentPageUrl" TEXT;
