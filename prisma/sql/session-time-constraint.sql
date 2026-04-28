-- Idempotent constraint addition for TherapySession time integrity.
--
-- Why: A bug in older form code allowed sessions to be saved with
-- endTime <= startTime (e.g. 21:00 → 01:00 same-day, no day-rollover).
-- Such "zombie" sessions block every overlap check and prevent the
-- therapist from booking ANY new slot.
--
-- This script:
-- 1. Repairs existing bad rows (idempotent — UPDATE only matches violators)
-- 2. Adds a CHECK constraint at the DB level (skipped if already present)
--
-- Safe to run repeatedly. Designed to be invoked from start:prod on each
-- Render deploy/restart, so the protection self-heals after any rollback.

DO $$
BEGIN
  -- Step 1: Repair zombie rows (always safe — only touches violators).
  UPDATE "TherapySession"
  SET "endTime" = "startTime" + INTERVAL '50 minutes'
  WHERE "endTime" <= "startTime";

  -- Step 2: Add the CHECK constraint only if missing.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'TherapySession_endTime_after_startTime'
  ) THEN
    ALTER TABLE "TherapySession"
    ADD CONSTRAINT "TherapySession_endTime_after_startTime"
    CHECK ("endTime" > "startTime");
  END IF;
END $$;
