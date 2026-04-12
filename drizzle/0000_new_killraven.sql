CREATE TYPE "public"."rule_type" AS ENUM('rule', 'structure', 'collocation');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('active', 'completed');--> statement-breakpoint
CREATE TYPE "public"."task_type" AS ENUM('mcq', 'fill_blank', 'transform', 'open_write', 'vocabulary', 'error_find', 'translate');--> statement-breakpoint
CREATE TABLE "languages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"flag_emoji" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rule_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"ema_score" real DEFAULT 0.5 NOT NULL,
	"attempts_total" integer DEFAULT 0 NOT NULL,
	"weak_flag" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rule_stats_rule_id_unique" UNIQUE("rule_id")
);
--> statement-breakpoint
CREATE TABLE "rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"language_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"formula" text,
	"type" "rule_type" DEFAULT 'rule' NOT NULL,
	"ai_context" text,
	"difficulty" integer DEFAULT 3 NOT NULL,
	"examples" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"language_id" uuid NOT NULL,
	"rule_ids" uuid[] DEFAULT '{}' NOT NULL,
	"status" "session_status" DEFAULT 'active' NOT NULL,
	"total_tasks" integer DEFAULT 0 NOT NULL,
	"completed" integer DEFAULT 0 NOT NULL,
	"avg_score" real,
	"settings" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"rule_id" uuid,
	"type" "task_type" NOT NULL,
	"prompt" text NOT NULL,
	"options" jsonb,
	"correct_answer" text,
	"ai_check_context" text,
	"user_answer" text,
	"score" integer,
	"feedback" text,
	"is_correct" boolean,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vocabulary" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"language_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"word" text NOT NULL,
	"translation" text NOT NULL,
	"context" text,
	"ease_factor" real DEFAULT 2.5 NOT NULL,
	"interval" integer DEFAULT 1 NOT NULL,
	"repetitions" integer DEFAULT 0 NOT NULL,
	"next_review" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
