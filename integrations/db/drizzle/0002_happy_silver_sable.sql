CREATE TABLE "npc_reward" (
	"id" varchar(10) PRIMARY KEY NOT NULL,
	"npcId" varchar(10) NOT NULL,
	"itemId" varchar(10) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "npc_reward" ADD CONSTRAINT "npc_reward_npcId_npc_id_fk" FOREIGN KEY ("npcId") REFERENCES "public"."npc"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "npc_reward" ADD CONSTRAINT "npc_reward_itemId_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;