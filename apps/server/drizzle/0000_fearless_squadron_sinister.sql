CREATE TABLE "character" (
	"id" serial PRIMARY KEY NOT NULL,
	"coords" "point" NOT NULL,
	"area_id" text NOT NULL,
	"speed" integer NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "npc_spawn" (
	"id" serial PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"area_id" text NOT NULL,
	"npc_id" integer NOT NULL,
	"coords" "point",
	"random_radius" integer
);
--> statement-breakpoint
CREATE TABLE "npc" (
	"id" serial PRIMARY KEY NOT NULL,
	"speed" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "npc_spawn" ADD CONSTRAINT "npc_spawn_npc_id_npc_id_fk" FOREIGN KEY ("npc_id") REFERENCES "public"."npc"("id") ON DELETE cascade ON UPDATE no action;