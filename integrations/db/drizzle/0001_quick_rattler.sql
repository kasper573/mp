CREATE TABLE "item_container" (
	"id" varchar(10) PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_instance" (
	"id" varchar(10) PRIMARY KEY NOT NULL,
	"itemId" varchar(10) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_instance_to_item_container" (
	"instanceId" varchar(10),
	"containerId" varchar(10)
);
--> statement-breakpoint
CREATE TABLE "item" (
	"id" varchar(10) PRIMARY KEY NOT NULL,
	"name" varchar(64) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "character" ADD COLUMN "inventoryId" varchar(10) NOT NULL;--> statement-breakpoint
ALTER TABLE "item_instance" ADD CONSTRAINT "item_instance_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_instance_to_item_container" ADD CONSTRAINT "item_instance_to_item_container_instanceId_item_instance_id_fk" FOREIGN KEY ("instanceId") REFERENCES "public"."item_instance"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_instance_to_item_container" ADD CONSTRAINT "item_instance_to_item_container_containerId_item_container_id_fk" FOREIGN KEY ("containerId") REFERENCES "public"."item_container"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character" ADD CONSTRAINT "character_inventoryId_item_container_id_fk" FOREIGN KEY ("inventoryId") REFERENCES "public"."item_container"("id") ON DELETE no action ON UPDATE no action;