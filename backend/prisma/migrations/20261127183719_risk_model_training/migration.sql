-- CreateEnum
CREATE TYPE "RiskTrainingStatus" AS ENUM ('QUEUED', 'RUNNING', 'PROMOTED', 'REJECTED', 'NOT_READY', 'FAILED');

-- CreateEnum
CREATE TYPE "RiskTrainingTrigger" AS ENUM ('SCHEDULED', 'MANUAL');

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "riskReadiness" JSONB,
ADD COLUMN     "riskReadinessAt" TIMESTAMP(3),
ADD COLUMN     "riskTrainingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "riskTrainingEnabledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "RiskModelTraining" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "trigger" "RiskTrainingTrigger" NOT NULL,
    "status" "RiskTrainingStatus" NOT NULL DEFAULT 'QUEUED',
    "requestedById" TEXT,
    "labelableTasks" INTEGER,
    "readiness" JSONB,
    "report" JSONB,
    "modelVersion" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "RiskModelTraining_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RiskModelTraining_workspaceId_createdAt_idx" ON "RiskModelTraining"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "RiskModelTraining" ADD CONSTRAINT "RiskModelTraining_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
