-- DropIndex
DROP INDEX "AuditLogEntry_workspaceId_idx";

-- DropIndex
DROP INDEX "Task_projectId_idx";

-- CreateIndex
CREATE INDEX "AuditLogEntry_workspaceId_createdAt_id_idx" ON "AuditLogEntry"("workspaceId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Task_projectId_status_position_id_idx" ON "Task"("projectId", "status", "position", "id");
