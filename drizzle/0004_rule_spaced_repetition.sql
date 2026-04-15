-- SM-2 fields for rule_stats
ALTER TABLE "rule_stats"
  ADD COLUMN IF NOT EXISTS "interval"     integer   NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "repetitions"  integer   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "ease_factor"  real      NOT NULL DEFAULT 2.5,
  ADD COLUMN IF NOT EXISTS "next_review"  timestamp NOT NULL DEFAULT now();

-- Minimum interval between rule reviews per language (days)
ALTER TABLE "languages"
  ADD COLUMN IF NOT EXISTS "min_rule_interval" integer NOT NULL DEFAULT 1;