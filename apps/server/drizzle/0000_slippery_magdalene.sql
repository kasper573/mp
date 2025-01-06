CREATE TABLE "characters" (
	"id" serial PRIMARY KEY NOT NULL,
	"coords" jsonb NOT NULL,
	"area_id" text NOT NULL,
	"speed" integer NOT NULL,
	"user_id" text NOT NULL
);
