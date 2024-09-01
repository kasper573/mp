CREATE TABLE IF NOT EXISTS "characters" (
	"id" serial PRIMARY KEY NOT NULL,
	"connected" boolean NOT NULL,
	"coords" jsonb NOT NULL,
	"destination" jsonb,
	"name" varchar(256) NOT NULL,
	"area_id" text NOT NULL,
	"speed" integer NOT NULL
);
