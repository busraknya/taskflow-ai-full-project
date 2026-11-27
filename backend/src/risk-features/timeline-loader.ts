import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { RecordedTaskEvent } from '../task-events/task-history';
import type { TimelineTask } from './timeline';

const EVENT_QUERY_CHUNK = 1_000;

export const TIMELINE_TASK_SELECT = {
  id: true,
  projectId: true,
  assigneeId: true,
  deletedAt: true,
  project: { select: { deletedAt: true } },
} satisfies Prisma.TaskSelect;

export type TimelineTaskRow = Prisma.TaskGetPayload<{
  select: typeof TIMELINE_TASK_SELECT;
}>;

/**
 * Loads the TaskEvent history of the given tasks. Every query is scoped to
 * `workspaceId`, so events of another workspace can never be included.
 */
export async function loadTimelines(
  prisma: PrismaService,
  workspaceId: string,
  tasks: TimelineTaskRow[],
): Promise<Map<string, TimelineTask>> {
  const eventsByTask = new Map<string, RecordedTaskEvent[]>(
    tasks.map((task) => [task.id, []]),
  );
  const ids = [...eventsByTask.keys()];
  for (let i = 0; i < ids.length; i += EVENT_QUERY_CHUNK) {
    const events = await prisma.taskEvent.findMany({
      where: {
        workspaceId,
        taskId: { in: ids.slice(i, i + EVENT_QUERY_CHUNK) },
      },
      orderBy: { seq: 'asc' },
      select: {
        taskId: true,
        type: true,
        oldValue: true,
        newValue: true,
        occurredAt: true,
        seq: true,
      },
    });
    for (const event of events) eventsByTask.get(event.taskId)!.push(event);
  }
  return new Map(
    tasks.map((task) => [
      task.id,
      {
        id: task.id,
        projectId: task.projectId,
        removedAt: task.deletedAt ?? task.project.deletedAt ?? null,
        events: eventsByTask.get(task.id)!,
      },
    ]),
  );
}
