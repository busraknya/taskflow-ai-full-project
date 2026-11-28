ALTER TABLE "WorkspaceMembership"
ADD COLUMN "invitationExpiresAt" TIMESTAMP(3);

UPDATE "WorkspaceMembership"
SET "invitationExpiresAt" = "invitedAt" + INTERVAL '7 days'
WHERE "status" = 'PENDING';

CREATE INDEX "WorkspaceMembership_invitedById_idx"
ON "WorkspaceMembership"("invitedById");

ALTER TABLE "WorkspaceMembership"
ADD CONSTRAINT "WorkspaceMembership_invitedById_fkey"
FOREIGN KEY ("invitedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "WorkspaceMembership_userId_status_invitationExpiresAt_idx"
ON "WorkspaceMembership"("userId", "status", "invitationExpiresAt");

CREATE INDEX "WorkspaceMembership_workspaceId_status_invitationExpiresAt_idx"
ON "WorkspaceMembership"("workspaceId", "status", "invitationExpiresAt");
