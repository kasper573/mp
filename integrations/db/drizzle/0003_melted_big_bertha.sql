ALTER TABLE "npc_spawn" DROP CONSTRAINT "npc_spawn_npcId_npc_id_fk";
--> statement-breakpoint
ALTER TABLE "npc_spawn" ADD CONSTRAINT "npc_spawn_npcId_npc_id_fk" FOREIGN KEY ("npcId") REFERENCES "public"."npc"("id") ON DELETE no action ON UPDATE no action;