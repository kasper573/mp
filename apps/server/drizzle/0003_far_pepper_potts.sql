CREATE TABLE "npc_spawn" (
	"id" serial PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"area_id" text NOT NULL,
	"coords" jsonb,
	"random_radius" integer
);
