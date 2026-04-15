ALTER TABLE "sessions"
  ADD COLUMN IF NOT EXISTS "mode"  text NOT NULL DEFAULT 'practice',
  ADD COLUMN IF NOT EXISTS "theme" text;