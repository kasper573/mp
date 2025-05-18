CREATE TABLE "character" (
	"id" varchar(10) PRIMARY KEY NOT NULL,
	"coords" "point" NOT NULL,
	"areaId" varchar(60) NOT NULL,
	"speed" real NOT NULL,
	"userId" uuid NOT NULL,
	"health" real NOT NULL,
	"maxHealth" real NOT NULL,
	"attackDamage" real NOT NULL,
	"attackSpeed" real NOT NULL,
	"attackRange" real NOT NULL,
	"modelId" varchar(64) NOT NULL,
	"name" varchar(64) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "npc_spawn" (
	"id" varchar(10) PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"areaId" varchar(60) NOT NULL,
	"npcId" varchar(10) NOT NULL,
	"coords" "point",
	"randomRadius" integer,
	"aggroType" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "npc" (
	"id" varchar(10) PRIMARY KEY NOT NULL,
	"speed" integer NOT NULL,
	"maxHealth" real NOT NULL,
	"attackDamage" real NOT NULL,
	"attackSpeed" real NOT NULL,
	"attackRange" real NOT NULL,
	"modelId" varchar(64) NOT NULL,
	"name" varchar(64) NOT NULL,
	"aggroType" varchar NOT NULL,
	"aggroRange" real NOT NULL
);
--> statement-breakpoint
ALTER TABLE "npc_spawn" ADD CONSTRAINT "npc_spawn_npcId_npc_id_fk" FOREIGN KEY ("npcId") REFERENCES "public"."npc"("id") ON DELETE cascade ON UPDATE no action;