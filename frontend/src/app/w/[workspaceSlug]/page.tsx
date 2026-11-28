'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FolderPlus, Plus, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { getErrorMessage, type ApiErrorBody } from '@/lib/errors';
import { STATUS_LABEL, TASK_STATUSES, type TaskStatus } from '@/lib/labels';
import type { RiskModelStatus } from '@/lib/risk';
import type { BoardTask, ColumnPage, Member, Project } from '@/lib/tasks';
import { useWorkspace } from '@/lib/workspace';
import { useAuthStore } from '@/store/useAuthStore';
import { PageHeader } from '@/components/layout/AppShell';
import { KanbanColumn } from '@/components/kanban/KanbanColumn';
import { TaskModal, type NewTask } from '@/components/kanban/TaskModal';
import { TaskDetailModal } from '@/components/kanban/TaskDetailModal';
import { CreateProjectModal } from '@/components/projects/CreateProjectModal';
import { RiskModelModal } from '@/components/workspaces/RiskModelModal';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Field';
import { useFeedback } from '@/components/ui/Feedback';
import { PageLoader } from '@/components/ui/Spinner';

type Board = Record<TaskStatus, ColumnPage>;
const EMPTY_PAGE: ColumnPage = { items: [], nextCursor: null };
const EMPTY_BOARD: Board = { TODO: EMPTY_PAGE, IN_PROGRESS: EMPTY_PAGE, IN_REVIEW: EMPTY_PAGE, DONE: EMPTY_PAGE };

const errorBody = (err: unknown) => (err as { response?: { data?: ApiErrorBody } }).response?.data;

export default function BoardPage() {
  const { workspace, canManage, canEdit } = useWorkspace();
  const currentUserId = useAuthStore((state) => state.user?.id ?? null);
  const { toast } = useFeedback();

  const [projects, setProjects] = useState<Project[] | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [board, setBoard] = useState<Board>(EMPTY_BOARD);
  const [boardLoading, setBoardLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState<TaskStatus | null>(null);
  const [error, setError] = useState('');
  const [riskModelStatus, setRiskModelStatus] = useState<RiskModelStatus | null>(null);

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [riskModalOpen, setRiskModalOpen] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  // Ignores responses for a project the user has already switched away from.
  const boardRequest = useRef(0);

  const fetchColumn = useCallback(
    (project: string, status: TaskStatus, cursor?: string) =>
      api
        .get<ColumnPage>(`/workspaces/${workspace.id}/tasks`, { params: { projectId: project, status, cursor } })
        .then((res) => res.data),
    [workspace.id],
  );

  /** Loads the first page of every column; later pages load on demand. */
  const loadBoard = useCallback(
    async (project: string) => {
      const request = ++boardRequest.current;
      setBoardLoading(true);
      try {
        const pages = await Promise.all(TASK_STATUSES.map((status) => fetchColumn(project, status)));
        if (request !== boardRequest.current) return;
        setBoard(Object.fromEntries(TASK_STATUSES.map((status, i) => [status, pages[i]])) as Board);
        setError('');
      } catch {
        if (request === boardRequest.current) setError('Tasks could not be loaded. Check your connection and try again.');
      } finally {
        if (request === boardRequest.current) setBoardLoading(false);
      }
    },
    [fetchColumn],
  );

  const loadProjects = useCallback(
    (select?: string) =>
      api.get<Project[]>(`/workspaces/${workspace.id}/projects`).then(
        (res) => {
          setProjects(res.data);
          const next = select ?? res.data[0]?.id ?? null;
          setProjectId(next);
          if (next) void loadBoard(next);
        },
        () => {
          setProjects((current) => current ?? []);
          setError('Projects could not be loaded. Check your connection and try again.');
        },
      ),
    [workspace.id, loadBoard],
  );

  useEffect(() => {
    void loadProjects();
    api
      .get<Member[]>(`/workspaces/${workspace.id}/members`)
      .then((res) => setMembers(res.data))
      .catch(() => setMembers([]));
    api
      .get<RiskModelStatus>(`/workspaces/${workspace.id}/risk-model`)
      .then((res) => setRiskModelStatus(res.data))
      .catch(() => setRiskModelStatus(null));
  }, [workspace.id, loadProjects]);

  const loadMore = async (status: TaskStatus) => {
    const cursor = board[status].nextCursor;
    if (!projectId || !cursor) return;
    setLoadingMore(status);
    try {
      const page = await fetchColumn(projectId, status, cursor);
      setBoard((prev) => {
        // A task whose position changed meanwhile can reappear; keep one copy.
        const loaded = new Set(prev[status].items.map((t) => t.id));
        const items = [...prev[status].items, ...page.items.filter((t) => !loaded.has(t.id))];
        return { ...prev, [status]: { items, nextCursor: page.nextCursor } };
      });
    } catch {
      toast('More tasks could not be loaded. Try again.', 'error');
    } finally {
      setLoadingMore(null);
    }
  };

  const moveTask = async (task: BoardTask, next: TaskStatus) => {
    try {
      await api.patch(`/workspaces/${workspace.id}/tasks/${task.id}`, { status: next, version: task.version });
      toast(`Moved “${task.title}” to ${STATUS_LABEL[next]}.`);
    } catch (err) {
      toast(getErrorMessage(errorBody(err)), 'error');
    }
    if (projectId) void loadBoard(projectId);
  };

  const createTask = async (task: NewTask) => {
    if (!projectId) return;
    await api.post(`/workspaces/${workspace.id}/tasks`, {
      title: task.title,
      description: task.description || undefined,
      projectId,
      priority: task.priority,
      assigneeId: task.assigneeId || undefined,
      // A calendar date (YYYY-MM-DD): stored as a date-only due date ending
      // in the workspace time zone.
      dueDate: task.dueDate || undefined,
    });
    toast('Task created.');
    void loadBoard(projectId);
  };

  const createProject = async (name: string, description: string) => {
    const res = await api.post<Project>(`/workspaces/${workspace.id}/projects`, { name, description: description || undefined });
    toast(`Project “${res.data.name}” created.`);
    await loadProjects(res.data.id);
  };

  if (projects === null) return <PageLoader label="Loading board…" />;

  const project = projects.find((p) => p.id === projectId) ?? null;

  return (
    <>
      <PageHeader
        title={project?.name ?? 'Board'}
        description={workspace.name}
        actions={
          <>
            {projects.length > 1 && (
              <div className="w-48">
                <label htmlFor="project-switcher" className="sr-only">
                  Project
                </label>
                <Select
                  id="project-switcher"
                  value={projectId ?? ''}
                  onChange={(e) => {
                    setProjectId(e.target.value);
                    void loadBoard(e.target.value);
                  }}
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <Button variant="ghost" onClick={() => setRiskModalOpen(true)} aria-label="Delay-risk model" title="Delay-risk model">
              <Sparkles size={16} aria-hidden="true" />
              <span className="hidden lg:inline">Delay-risk model</span>
            </Button>
            {canManage && (
              <Button onClick={() => setProjectModalOpen(true)} aria-label="New project" title="New project">
                <FolderPlus size={16} aria-hidden="true" />
                <span className="hidden lg:inline">New project</span>
              </Button>
            )}
            {canEdit && project && (
              <Button variant="primary" onClick={() => setTaskModalOpen(true)}>
                <Plus size={16} aria-hidden="true" />
                New task
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-1 flex-col gap-4 px-4 py-5 sm:px-6">
        <Alert message={error} />

        {!project ? (
          <EmptyState
            title="No projects yet"
            description={
              canManage
                ? 'Projects group related tasks on their own board. Create one to start adding tasks.'
                : 'An owner or admin needs to create a project before tasks can be added.'
            }
            action={
              canManage && (
                <Button variant="primary" onClick={() => setProjectModalOpen(true)}>
                  Create a project
                </Button>
              )
            }
          />
        ) : (
          <div className={`-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 transition-opacity ${boardLoading ? 'opacity-60' : ''}`} aria-busy={boardLoading}>
            {TASK_STATUSES.map((status) => (
              <KanbanColumn
                key={status}
                status={status}
                tasks={board[status].items}
                hasMore={board[status].nextCursor !== null}
                loadingMore={loadingMore === status}
                canEdit={canEdit}
                onLoadMore={() => loadMore(status)}
                onOpen={setActiveTaskId}
                onMove={moveTask}
              />
            ))}
          </div>
        )}
      </div>

      <TaskModal open={taskModalOpen} onClose={() => setTaskModalOpen(false)} onSubmit={createTask} members={members} />
      <CreateProjectModal open={projectModalOpen} onClose={() => setProjectModalOpen(false)} onSubmit={createProject} />
      <RiskModelModal
        isOpen={riskModalOpen}
        onClose={() => setRiskModalOpen(false)}
        workspaceId={workspace.id}
        canManage={canManage}
        onStatusChange={setRiskModelStatus}
      />
      <TaskDetailModal
        taskId={activeTaskId}
        workspaceId={workspace.id}
        riskModelStatus={riskModelStatus}
        currentUserId={currentUserId}
        canEdit={canEdit}
        canManageAllComments={canManage}
        onClose={() => setActiveTaskId(null)}
        onChanged={() => projectId && loadBoard(projectId)}
      />
    </>
  );
}
