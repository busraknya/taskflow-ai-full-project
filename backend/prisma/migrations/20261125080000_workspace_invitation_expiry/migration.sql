ALTER TABLE "WorkspaceMembership"
ADD COLUMN "invitationExpiresAt" TIMESTAMP(3);

CREATE INDEX "WorkspaceMembership_invitedById_idx"
ON "WorkspaceMembership"("invitedById");

ALTER TABLE "WorkspaceMembership"
ADD CONSTRAINT "WorkspaceMembership_invitedById_fkey"
FOREIGN KEY ("invitedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
