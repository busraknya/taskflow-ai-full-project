'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { theme } from '@/lib/theme';
import { Alert } from '@/components/ui/Alert';
import { Plus } from 'lucide-react';
import { KanbanColumn } from '@/components/kanban/KanbanColumn';
import { TaskModal } from '@/components/kanban/TaskModal';
import { useRouter } from 'next/navigation';

interface Project { id: string; name: string; }
interface Member { user: { id: string; fullName: string; email: string; }; }
interface Task { id: string; title: string; description: string; status: 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE'; priority: number; version: number; assignee?: { id: string; fullName: string }; riskAssessments?: Array<{ riskLevel: string }>; }

const COLUMNS = [
  { id: 'TODO', title: 'To Do' },
  { id: 'IN_PROGRESS', title: 'In Progress' },
  { id: 'IN_REVIEW', title: 'In Review' },
  { id: 'DONE', title: 'Done' },
];

export default function WorkspaceDashboard() {
  const router = useRouter();
  const params = useParams();
  const workspaceSlug = params.workspaceSlug as string;

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showTaskModal, setShowTaskModal] = useState(false);

  useEffect(() => {
    const initWorkspace = async () => {
      try {
        const res = await api.get('/workspaces');
        const currentWs = res.data.find((w: any) => w.slug === workspaceSlug);
        if (!currentWs) {
          setError('Workspace not found or unauthorized.');
          setLoading(false);
          return;
        }
        setWorkspaceId(currentWs.id);
        fetchProjects(currentWs.id);
        fetchMembers(currentWs.id);
      } catch (err: any) {
        setError('Failed to initialize workspace.');
        setLoading(false);
      }
    };
    initWorkspace();
  }, [workspaceSlug]);

  const fetchProjects = async (wsId: string) => {
    try {
      const res = await api.get(`/workspaces/${wsId}/projects`);
      setProjects(res.data);
      if (res.data.length > 0) {
        setSelectedProject(res.data[0]);
        fetchTasks(wsId, res.data[0].id);
      } else {
        setLoading(false);
      }
    } catch (err) {
      setError('Failed to load projects.');
      setLoading(false);
    }
  };

  const fetchMembers = async (wsId: string) => {
    try {
      const res = await api.get(`/workspaces/${wsId}/members`);
      setMembers(res.data);
    } catch (err) { console.error(err); }
  };

  const fetchTasks = async (wsId: string, projId: string) => {
    try {
      const res = await api.get(`/workspaces/${wsId}/tasks?projectId=${projId}`);
      setTasks(res.data);
    } catch (err) { setError('Failed to load tasks.'); }
    finally { setLoading(false); }
  };

  const handleStatusChange = async (taskId: string, currentVersion: number, nextStatus: string) => {
    if (!workspaceId) return;
    const confirmed = window.confirm(`Move task to ${nextStatus.replace('_', ' ').toLowerCase()}?`);
    if (!confirmed) return;

    try {
      await api.patch(`/workspaces/${workspaceId}/tasks/${taskId}`, { status: nextStatus, version: currentVersion });
      fetchTasks(workspaceId, selectedProject!.id);
    } catch (err: any) { alert(err.response?.data?.message || 'Conflict occurred.'); }
  };

  const handleCreateTask = async (taskData: { title: string; description: string; priority: number; assigneeId: string; dueDate: string }) => {
    if (!workspaceId || !selectedProject) return;
    try {
      await api.post(`/workspaces/${workspaceId}/tasks`, {
        title: taskData.title,
        description: taskData.description,
        projectId: selectedProject.id,
        priority: taskData.priority,
        assigneeId: taskData.assigneeId || undefined,
        dueDate: taskData.dueDate ? new Date(taskData.dueDate).toISOString() : undefined,
      });
      setShowTaskModal(false);
      fetchTasks(workspaceId, selectedProject.id);
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to create task.'); }
  };

  if (loading) return <div className={`min-h-screen ${theme.colors.bg.primary} flex items-center justify-center text-sm text-zinc-500`}>Loading dashboard...</div>;

  return (
    <div className={`min-h-screen ${theme.colors.bg.primary} ${theme.colors.text.primary} p-6 font-sans flex flex-col`}>
      <div className="max-w-7xl mx-auto w-full space-y-6 flex-1 flex flex-col">
        
        <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
          <div className="flex items-center space-x-3">
            <span className="text-xs uppercase font-mono bg-zinc-800 text-zinc-300 px-2.5 py-1 rounded">Workspace</span>
            <h1 className="text-base font-medium text-white tracking-tight">{workspaceSlug}</h1>
          </div>
          
          <div className="flex items-center space-x-2">
            <select
              className={`${theme.colors.bg.secondary} border ${theme.colors.border.primary} rounded-md px-3 py-1.5 text-xs text-white focus:outline-none`}
              value={selectedProject?.id || ''}
              onChange={(e) => {
                const proj = projects.find(p => p.id === e.target.value);
                if (proj && workspaceId) { setSelectedProject(proj); fetchTasks(workspaceId, proj.id); }
              }}
            >
              {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
            </select>

            <button
              onClick={() => setShowTaskModal(true)}
              disabled={!selectedProject}
              className={`${theme.colors.accent.DEFAULT} text-xs font-medium px-3 py-1.5 rounded-md transition-colors flex items-center space-x-1`}
            >
              <Plus size={14} />
              <span>New Task</span>
            </button>

            <button
            onClick={() => router.push(`/w/${workspaceSlug}/members`)}
            className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-md transition-colors"
            >
                Members
            </button>
          </div>
        </div>

        <Alert message={error} type="error" />

        {!selectedProject ? (
          <div className="text-center py-16 border border-dashed border-zinc-800 rounded-lg">
            <p className={`text-xs ${theme.colors.text.secondary}`}>Please create a project first.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 flex-1 items-start">
            {COLUMNS.map((col) => (
              <KanbanColumn
                key={col.id}
                columnId={col.id}
                title={col.title}
                tasks={tasks.filter((t) => t.status === col.id)}
                onMoveForward={handleStatusChange}
              />
            ))}
          </div>
        )}

        <TaskModal
          isOpen={showTaskModal}
          onClose={() => setShowTaskModal(false)}
          onSubmit={handleCreateTask}
          members={members}
        />

      </div>
    </div>
  );
}