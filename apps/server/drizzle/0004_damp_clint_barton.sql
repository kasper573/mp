ALTER TABLE "character" ALTER COLUMN "id" SET DATA TYPE varchar(10);--> statement-breakpoint
ALTER TABLE "character" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "npc_spawn" ALTER COLUMN "id" SET DATA TYPE varchar(10);--> statement-breakpoint
ALTER TABLE "npc_spawn" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "npc_spawn" ALTER COLUMN "npcId" SET DATA TYPE varchar(10);--> statement-breakpoint
ALTER TABLE "npc" ALTER COLUMN "id" SET DATA TYPE varchar(10);--> statement-breakpoint
ALTER TABLE "npc" ALTER COLUMN "id" DROP DEFAULT;