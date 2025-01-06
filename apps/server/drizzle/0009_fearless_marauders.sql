ALTER TABLE "characters" DROP CONSTRAINT "characters_pkey";
ALTER TABLE "characters" ALTER COLUMN "id" SET DATA TYPE serial;