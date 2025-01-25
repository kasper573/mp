ALTER TABLE "npc_spawn" DROP CONSTRAINT "npc_spawn_npc_id_npc_id_fk";
--> statement-breakpoint
ALTER TABLE "npc_spawn" ADD CONSTRAINT "npc_spawn_npc_id_npc_id_fk" FOREIGN KEY ("npc_id") REFERENCES "public"."npc"("id") ON DELETE cascade ON UPDATE no action;