-- H6 (סבב אבטחה 14): User.sessionVersion — לבטל JWTs ישנים אחרי שינוי 2FA/password/block.
-- Postgres 11+ מבצע ADD COLUMN עם default ב-O(1) (לא rewrite של הטבלה).
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
