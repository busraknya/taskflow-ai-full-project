-- AlterTable
ALTER TABLE "RiskAssessment" ADD COLUMN     "featureSnapshot" JSONB,
ADD COLUMN     "featureSpecVersion" TEXT,
ADD COLUMN     "reason" TEXT;
