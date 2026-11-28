-- SEC-01: session security hardening.
-- Additive only: new nullable columns and one index. No data is deleted.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "disabledAt" TIMESTAMP(3),
ADD COLUMN "passwordChangedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN "familyId" TEXT,
ADD COLUMN "replacedByTokenId" TEXT;

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- Existing rows hold bcrypt hashes of JWT refresh tokens. They can never match
-- the new SHA-256 lookup, so mark them revoked to make the transition explicit.
-- Affected users simply sign in again; rows are kept for audit purposes.
UPDATE "RefreshToken" SET "revokedAt" = CURRENT_TIMESTAMP WHERE "revokedAt" IS NULL;
