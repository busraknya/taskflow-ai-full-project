'use client';

import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { NEXT_STATUS, PRIORITY_LABEL, STATUS_DOT, STATUS_LABEL, type TaskStatus } from '@/lib/labels';
import { currentRiskLevel, RISK_TONE } from '@/lib/risk';
import type { BoardTask } from '@/lib/tasks';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, StatusDot } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

interface KanbanColumnProps {
  status: TaskStatus;
  tasks: BoardTask[];
  hasMore: boolean;
  loadingMore: boolean;
  canEdit: boolean;
  onLoadMore: () => void;
  onOpen: (taskId: string) => void;
  onMove: (task: BoardTask, next: TaskStatus) => void;
}

export function KanbanColumn({ status, tasks, hasMore, loadingMore, canEdit, onLoadMore, onOpen, onMove }: KanbanColumnProps) {
  const next = NEXT_STATUS[status];
  return (
    <section aria-label={STATUS_LABEL[status]} className="flex w-72 shrink-0 flex-col rounded-card bg-subtle/70 lg:w-auto lg:min-w-0 lg:flex-1">
      <header className="flex items-center justify-between px-3 pt-3 pb-2">
        <StatusDot dotClass={STATUS_DOT[status]}>
          <span className="font-medium text-fg">{STATUS_LABEL[status]}</span>
        </StatusDot>
        <span className="text-xs text-fg-subtle tabular-nums">
          {tasks.length}
          {hasMore ? '+' : ''}
        </span>
      </header>

      <ul className="flex flex-col gap-2 px-2 pb-2">
        {tasks.map((task) => (
          <li key={task.id}>
            <TaskCard task={task} next={canEdit ? next : undefined} onOpen={onOpen} onMove={onMove} />
          </li>
        ))}
        {tasks.length === 0 && !hasMore && <li className="px-2 py-6 text-center text-[13px] text-fg-subtle">No tasks</li>}
      </ul>

      {hasMore && (
        <div className="px-2 pb-2">
          <Button variant="ghost" size="sm" className="w-full" loading={loadingMore} onClick={onLoadMore}>
            Load more
          </Button>
        </div>
      )}
    </section>
  );
}

function TaskCard({
  task,
  next,
  onOpen,
  onMove,
}: {
  task: BoardTask;
  next?: TaskStatus;
  onOpen: (taskId: string) => void;
  onMove: (task: BoardTask, next: TaskStatus) => void;
}) {
  const risk = currentRiskLevel(task.riskAssessments);
  return (
    <article className="group relative rounded-card border border-line bg-surface p-3 transition-colors hover:border-line-strong">
      <h3 className="pr-7 text-sm leading-snug font-medium text-fg">
        {/* The whole card opens the task; the title is the accessible control. */}
        <button onClick={() => onOpen(task.id)} className="text-left after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-accent">
          {task.title}
        </button>
      </h3>
      {task.description && <p className="mt-1 line-clamp-2 text-[13px] text-fg-muted">{task.description}</p>}

      <div className="mt-3 flex items-center gap-1.5">
        <Badge tone={task.priority === 3 ? 'danger' : 'neutral'}>{PRIORITY_LABEL[task.priority] ?? `P${task.priority}`}</Badge>
        {risk && <Badge tone={RISK_TONE[risk]}>{risk === 'LOW' ? 'Low' : risk === 'MEDIUM' ? 'Medium' : 'High'} risk</Badge>}
        <span className="ml-auto">{task.assignee && <Avatar name={task.assignee.fullName} size="sm" />}</span>
      </div>

      {next && (
        <Button
          variant="ghost"
          size="sm"
          icon
          aria-label={`Move to ${STATUS_LABEL[next]}`}
          title={`Move to ${STATUS_LABEL[next]}`}
          onClick={() => onMove(task, next)}
          className={cn('absolute top-2 right-2 z-10 size-7 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100')}
        >
          <ArrowRight size={14} />
        </Button>
      )}
    </article>
  );
}
