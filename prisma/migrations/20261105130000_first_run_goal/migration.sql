-- First-run goal, saved per shop so a reload resumes at the result.
ALTER TABLE "GrowthState" ADD COLUMN "firstRunGoal" TEXT;
