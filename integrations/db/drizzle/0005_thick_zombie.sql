ALTER TABLE "npc_reward" ALTER COLUMN "itemId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "npc_reward" ADD COLUMN "xpAmount" real;