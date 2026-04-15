CREATE TABLE IF NOT EXISTS "user_settings" (
  "user_id"            uuid PRIMARY KEY,
  "interface_language" text NOT NULL DEFAULT 'en',
  "updated_at"         timestamp NOT NULL DEFAULT now()
);