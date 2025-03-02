ALTER TABLE "character" RENAME COLUMN "attack" TO "attackDamage";--> statement-breakpoint
ALTER TABLE "character" ALTER COLUMN "speed" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "character" ALTER COLUMN "health" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "character" ALTER COLUMN "maxHealth" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "character" ALTER COLUMN "attackSpeed" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "character" ADD COLUMN "attackRange" real NOT NULL;