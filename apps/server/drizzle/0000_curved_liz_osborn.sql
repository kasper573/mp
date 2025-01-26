CREATE TABLE "character" (
	"id" serial PRIMARY KEY NOT NULL,
	"coords" "point" NOT NULL,
	"areaId" varchar(60) NOT NULL,
	"speed" integer NOT NULL,
	"userId" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "npc_spawn" (
	"id" serial PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"areaId" varchar(60) NOT NULL,
	"npcId" integer NOT NULL,
	"coords" "point",
	"randomRadius" integer
);
--> statement-breakpoint
CREATE TABLE "npc" (
	"id" serial PRIMARY KEY NOT NULL,
	"speed" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "npc_spawn" ADD CONSTRAINT "npc_spawn_npcId_npc_id_fk" FOREIGN KEY ("npcId") REFERENCES "public"."npc"("id") ON DELETE cascade ON UPDATE no action;