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
	"userId" uuid NOT NULL,
	"areaId" varchar(60) NOT NULL,
	"name" varchar(64) NOT NULL,
	"modelId" varchar(64) NOT NULL,
	CONSTRAINT "character_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "consumable_definition" (
	"id" varchar(10) PRIMARY KEY NOT NULL,
	"name" varchar(64) NOT NULL,
	"maxStackSize" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipment_definition" (
	"id" varchar(10) PRIMARY KEY NOT NULL,
	"name" varchar(64) NOT NULL,
	"maxDurability" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "character" ADD CONSTRAINT "character_areaId_area_id_fk" FOREIGN KEY ("areaId") REFERENCES "public"."area"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character" ADD CONSTRAINT "character_modelId_actor_model_id_fk" FOREIGN KEY ("modelId") REFERENCES "public"."actor_model"("id") ON DELETE no action ON UPDATE no action;