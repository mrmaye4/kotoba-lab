CREATE TABLE "daily_practice_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"language_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"date" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rule_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"language_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"interface_language" text DEFAULT 'en' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rule_stats" ADD COLUMN "interval" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "rule_stats" ADD COLUMN "repetitions" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rule_stats" ADD COLUMN "ease_factor" real DEFAULT 2.5 NOT NULL;--> statement-breakpoint
ALTER TABLE "rule_stats" ADD COLUMN "next_review" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "rules" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "mode" text DEFAULT 'practice' NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "theme" text;