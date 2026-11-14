-- AlterTable
ALTER TABLE "Exercise" ADD COLUMN     "cues" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "cuesReviewed" BOOLEAN NOT NULL DEFAULT false;
