CREATE TABLE IF NOT EXISTS "characters" (
	"id" text PRIMARY KEY NOT NULL,
	"connected" boolean NOT NULL,
	"coords" jsonb NOT NULL,
	"destination" jsonb,
	"area_id" text NOT NULL,
	"speed" integer NOT NULL
);
