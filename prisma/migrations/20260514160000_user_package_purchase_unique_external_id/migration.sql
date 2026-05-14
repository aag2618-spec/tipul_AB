-- Stage 5 — race condition guard ל-PACKAGE_PURCHASE webhook.
-- בלי unique constraint, 2 webhook workers מקבילים יכולים שניהם לקרוא
-- findFirst({externalId, source, reverted}) ולא למצוא רשומה, ושניהם
-- ליצור UserPackagePurchase → credits כפולים למשתמש.
--
-- PostgreSQL מתייחס ל-null כשונה מ-null באינדקס standard, אז רשומות עם
-- source=ADMIN/PROMO + externalId=null לא מתנגשות. רק (source=CARDCOM,
-- externalId=cuid) נאכף.

CREATE UNIQUE INDEX "UserPackagePurchase_externalId_source_key"
  ON "UserPackagePurchase"("externalId", "source");
