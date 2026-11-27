-- CreateEnum
CREATE TYPE "TaskEventType" AS ENUM ('CREATED', 'SNAPSHOT', 'STATUS_CHANGED', 'DUE_DATE_CHANGED', 'ASSIGNEE_CHANGED', 'PRIORITY_CHANGED', 'COMMENT_ADDED', 'COMMENT_DELETED');

-- CreateEnum
CREATE TYPE "TaskEventSource" AS ENUM ('API', 'OFFLINE_SYNC', 'BACKFILL');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "dueDateIsDateOnly" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'UTC';

-- CreateTable
CREATE TABLE "TaskEvent" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "type" "TaskEventType" NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "clientOccurredAt" TIMESTAMP(3),
    "actorId" TEXT,
    "source" "TaskEventSource" NOT NULL DEFAULT 'API',

    CONSTRAINT "TaskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskEvent_seq_key" ON "TaskEvent"("seq");

-- CreateIndex
CREATE INDEX "TaskEvent_workspaceId_taskId_occurredAt_idx" ON "TaskEvent"("workspaceId", "taskId", "occurredAt");

-- CreateIndex
CREATE INDEX "TaskEvent_workspaceId_occurredAt_idx" ON "TaskEvent"("workspaceId", "occurredAt");

-- AddForeignKey
ALTER TABLE "TaskEvent" ADD CONSTRAINT "TaskEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskEvent" ADD CONSTRAINT "TaskEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Backfill for existing data. Additive only; no existing data is changed
-- except the two new Task columns. Reconstructed history is marked BACKFILL.
-- ---------------------------------------------------------------------------

-- The web form only offered a date picker, and Android never set due dates,
-- so every existing due date is a calendar date stored as UTC midnight.
UPDATE "Task" SET "dueDateIsDateOnly" = true WHERE "dueDate" IS NOT NULL;

-- Status history recorded by the audit log (status after each create/update).
CREATE TEMP TABLE task_status_history AS
SELECT
  a."workspaceId"                    AS workspace_id,
  a."entityId"                       AS task_id,
  a."actorId"                        AS actor_id,
  a."createdAt"                      AS changed_at,
  a."id"                             AS audit_id,
  a."metadata"->>'status'            AS status,
  lag(a."metadata"->>'status') OVER (
    PARTITION BY a."entityId" ORDER BY a."createdAt", a."id"
  )                                  AS prev_status
FROM "AuditLogEntry" a
JOIN "Task" t ON t."id" = a."entityId" AND t."workspaceId" = a."workspaceId"
WHERE a."entityType" = 'TASK'
  AND a."action" IN ('TASK_CREATED', 'TASK_UPDATED')
  AND a."metadata"->>'status' IS NOT NULL;

-- completedAt: start of the final run of DONE entries; falls back to the
-- task's last update when the audit log has no usable entry.
UPDATE "Task" t
SET "completedAt" = COALESCE(
  (
    SELECT max(h.changed_at)
    FROM task_status_history h
    WHERE h.task_id = t."id"
      AND h.status = 'DONE'
      AND h.prev_status IS DISTINCT FROM 'DONE'
  ),
  t."updatedAt"
)
WHERE t."status" = 'DONE';

-- Status transitions reconstructed from the audit log.
INSERT INTO "TaskEvent" ("id", "workspaceId", "taskId", "type", "oldValue", "newValue", "occurredAt", "actorId", "source")
SELECT
  gen_random_uuid()::text,
  h.workspace_id,
  h.task_id,
  'STATUS_CHANGED'::"TaskEventType",
  CASE WHEN h.prev_status IS NULL THEN NULL ELSE jsonb_build_object('status', h.prev_status) END,
  jsonb_build_object('status', h.status),
  h.changed_at,
  h.actor_id,
  'BACKFILL'::"TaskEventSource"
FROM task_status_history h
WHERE h.prev_status IS NULL OR h.status IS DISTINCT FROM h.prev_status
ORDER BY h.changed_at, h.audit_id;

-- One snapshot per task with its state at migration time. History before the
-- snapshot is incomplete (due date, assignee and priority changes were never
-- recorded) and must not be treated as a full event history.
INSERT INTO "TaskEvent" ("id", "workspaceId", "taskId", "type", "oldValue", "newValue", "occurredAt", "actorId", "source")
SELECT
  gen_random_uuid()::text,
  t."workspaceId",
  t."id",
  'SNAPSHOT'::"TaskEventType",
  NULL,
  jsonb_build_object(
    'status', t."status"::text,
    'priority', t."priority",
    'assigneeId', t."assigneeId",
    'dueDate', CASE WHEN t."dueDate" IS NULL THEN NULL
                    ELSE to_char(t."dueDate", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,
    'dueDateIsDateOnly', t."dueDateIsDateOnly",
    'completedAt', CASE WHEN t."completedAt" IS NULL THEN NULL
                        ELSE to_char(t."completedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,
    'commentCount', (
      SELECT count(*)::int FROM "Comment" c
      WHERE c."taskId" = t."id" AND c."deletedAt" IS NULL
    )
  ),
  (now() AT TIME ZONE 'UTC'),
  NULL,
  'BACKFILL'::"TaskEventSource"
FROM "Task" t
ORDER BY t."createdAt", t."id";

DROP TABLE task_status_history;
