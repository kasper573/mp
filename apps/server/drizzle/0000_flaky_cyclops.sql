CREATE TABLE "character" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coords" "point" NOT NULL,
	"areaId" varchar(60) NOT NULL,
	"speed" integer NOT NULL,
	"userId" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "npc_spawn" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"count" integer NOT NULL,
	"areaId" varchar(60) NOT NULL,
	"npcId" uuid NOT NULL,
	"coords" "point",
	"randomRadius" integer
);
--> statement-breakpoint
CREATE TABLE "npc" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"speed" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "npc_spawn" ADD CONSTRAINT "npc_spawn_npcId_npc_id_fk" FOREIGN KEY ("npcId") REFERENCES "public"."npc"("id") ON DELETE cascade ON UPDATE no action;