CREATE TABLE "npc_instance" (
	"id" serial PRIMARY KEY NOT NULL,
	"coords" jsonb NOT NULL,
	"area_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "characters" RENAME TO "character";--> statement-breakpoint
ALTER TABLE "npcs" RENAME TO "npc";--> statement-breakpoint
ALTER TABLE "npc" DROP COLUMN "coords";--> statement-breakpoint
ALTER TABLE "npc" DROP COLUMN "area_id";