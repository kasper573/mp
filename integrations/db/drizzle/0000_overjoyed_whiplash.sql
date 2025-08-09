CREATE TABLE "actor_model" (
	"id" varchar(64) PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "area" (
	"id" varchar(60) PRIMARY KEY NOT NULL
);
--> statement-breakpoint
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
	"name" varchar(64) NOT NULL,
	"online" boolean DEFAULT false NOT NULL,
	"xp" real NOT NULL,
	"inventoryId" varchar(10) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"id" varchar(10) PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_instance" (
	"id" varchar(10) PRIMARY KEY NOT NULL,
	"itemId" varchar(10) NOT NULL,
	"inventoryId" varchar(10) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item" (
	"id" varchar(10) PRIMARY KEY NOT NULL,
	"name" varchar(64) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "npc_reward" (
	"id" varchar(10) PRIMARY KEY NOT NULL,
	"npcId" varchar(10) NOT NULL,
	"itemId" varchar(10),
	"xp" real
);
--> statement-breakpoint
CREATE TABLE "npc_spawn" (
	"id" varchar(10) PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"areaId" varchar(60) NOT NULL,
	"npcId" varchar(10) NOT NULL,
	"coords" "point",
	"randomRadius" integer,
	"patrol" jsonb,
	"npcType" varchar NOT NULL
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
	"npcType" varchar NOT NULL,
	"aggroRange" real NOT NULL
);
--> statement-breakpoint
ALTER TABLE "character" ADD CONSTRAINT "character_areaId_area_id_fk" FOREIGN KEY ("areaId") REFERENCES "public"."area"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character" ADD CONSTRAINT "character_modelId_actor_model_id_fk" FOREIGN KEY ("modelId") REFERENCES "public"."actor_model"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character" ADD CONSTRAINT "character_inventoryId_inventory_id_fk" FOREIGN KEY ("inventoryId") REFERENCES "public"."inventory"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_instance" ADD CONSTRAINT "item_instance_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_instance" ADD CONSTRAINT "item_instance_inventoryId_inventory_id_fk" FOREIGN KEY ("inventoryId") REFERENCES "public"."inventory"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "npc_reward" ADD CONSTRAINT "npc_reward_npcId_npc_id_fk" FOREIGN KEY ("npcId") REFERENCES "public"."npc"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "npc_reward" ADD CONSTRAINT "npc_reward_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "npc_spawn" ADD CONSTRAINT "npc_spawn_areaId_area_id_fk" FOREIGN KEY ("areaId") REFERENCES "public"."area"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "npc_spawn" ADD CONSTRAINT "npc_spawn_npcId_npc_id_fk" FOREIGN KEY ("npcId") REFERENCES "public"."npc"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "npc" ADD CONSTRAINT "npc_modelId_actor_model_id_fk" FOREIGN KEY ("modelId") REFERENCES "public"."actor_model"("id") ON DELETE no action ON UPDATE no action;