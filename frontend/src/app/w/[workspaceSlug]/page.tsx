'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { theme } from '@/lib/theme';
import { Alert } from '@/components/ui/Alert';
import { Plus, CheckCircle2, Clock, AlertTriangle, ArrowRight } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  description: string;
}

interface Task {
  id: string;
  title: string;
  description: string;
  status: 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
  priority: number;
  version: number;
  assignee?: { fullName: string };
}

const COLUMNS = [
  { id: 'TODO', title: 'To Do' },
  { id: 'IN_PROGRESS', title: 'In Progress' },
  { id: 'IN_REVIEW', title: 'In Review' },
  { id: 'DONE', title: 'Done' },
];

export default function WorkspaceDashboard() {
  const params = useParams();
  const workspaceSlug = params.workspaceSlug as string;

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Yeni Task Modal State
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');

  // 1. Önce Slug'dan Workspace ID'yi bulmak için kullanıcının workspace'lerini çekelim
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
      } catch (err: any) {
        setError('Failed to initialize workspace.');
        setLoading(false);
      }
    };
    initWorkspace();
  }, [workspaceSlug]);

  // 2. Projeleri Çek
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

  // 3. Task'ları Çek
  const fetchTasks = async (wsId: string, projId: string) => {
    try {
      const res = await api.get(`/workspaces/${wsId}/tasks?projectId=${projId}`);
      setTasks(res.data);
    } catch (err) {
      setError('Failed to load tasks.');
    } finally {
      setLoading(false);
    }
  };

  // 4. Task Durumunu Güncelle (Kanban Taşıma Simülasyonu)
  const handleStatusChange = async (taskId: string, currentVersion: number, currentStatus: string, nextStatus: string) => {
    if (!workspaceId) return;

    // UX Güvenliği: Yanlışlıkla tıklamalara karşı onay mekanizması
    const readableStatus = nextStatus.replace('_', ' ').toLowerCase();
    const confirmed = window.confirm(`Are you sure you want to move this task to "${readableStatus}"?`);
    if (!confirmed) return;

    try {
      await api.patch(`/workspaces/${workspaceId}/tasks/${taskId}`, {
        status: nextStatus,
        version: currentVersion,
      });
      fetchTasks(workspaceId, selectedProject!.id);
    } catch (err: any) {
      alert(err.response?.data?.message?.message || 'Conflict occurred. Please refresh.');
    }
  };

  // 5. Yeni Task Oluştur
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceId || !selectedProject) return;

    try {
      await api.post(`/workspaces/${workspaceId}/tasks`, {
        title: taskTitle,
        description: taskDesc,
        projectId: selectedProject.id,
      });
      setTaskTitle('');
      setTaskDesc('');
      setShowTaskModal(false);
      fetchTasks(workspaceId, selectedProject.id);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create task.');
    }
  };

  if (loading) {
    return <div className={`min-h-screen ${theme.colors.bg.primary} flex items-center justify-center text-sm text-zinc-500`}>Loading dashboard...</div>;
  }

  return (
    <div className={`min-h-screen ${theme.colors.bg.primary} ${theme.colors.text.primary} p-6 font-sans flex flex-col`}>
      <div className="max-w-7xl mx-auto w-full space-y-6 flex-1 flex flex-col">
        
        {/* Top Navigation / Workspace Header */}
        <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
          <div className="flex items-center space-x-3">
            <span className="text-xs uppercase font-mono bg-zinc-800 text-zinc-300 px-2.5 py-1 rounded">Workspace</span>
            <h1 className="text-base font-medium text-white tracking-tight">{workspaceSlug}</h1>
          </div>
          
          {/* Proje Seçici */}
          <div className="flex items-center space-x-2">
            <select
              className={`${theme.colors.bg.secondary} border ${theme.colors.border.primary} rounded-md px-3 py-1.5 text-xs text-white focus:outline-none`}
              value={selectedProject?.id || ''}
              onChange={(e) => {
                const proj = projects.find(p => p.id === e.target.value);
                if (proj && workspaceId) {
                  setSelectedProject(proj);
                  fetchTasks(workspaceId, proj.id);
                }
              }}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            <button
              onClick={() => setShowTaskModal(true)}
              disabled={!selectedProject}
              className={`${theme.colors.accent.DEFAULT} text-xs font-medium px-3 py-1.5 rounded-md transition-colors flex items-center space-x-1`}
            >
              <Plus size={14} />
              <span>New Task</span>
            </button>
          </div>
        </div>

        <Alert message={error} type="error" />

        {/* Kanban Board */}
        {!selectedProject ? (
          <div className="text-center py-16 border border-dashed border-zinc-800 rounded-lg">
            <p className={`text-xs ${theme.colors.text.secondary}`}>Please create a project first to view the Kanban board.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 flex-1 items-start">
            {COLUMNS.map((col) => {
              const colTasks = tasks.filter((t) => t.status === col.id);
              return (
                <div key={col.id} className={`${theme.colors.bg.secondary} border ${theme.colors.border.primary} rounded-lg p-3 space-y-3 flex flex-col max-h-[75vh]`}>
                  <div className="flex justify-between items-center px-1">
                    <span className="text-xs font-medium text-zinc-300">{col.title}</span>
                    <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">{colTasks.length}</span>
                  </div>

                  <div className="space-y-2 overflow-y-auto flex-1 pr-1">
                    {colTasks.map((task) => (
                      <div
                        key={task.id}
                        className={`p-3 ${theme.colors.bg.primary} border ${theme.colors.border.primary} rounded-md space-y-2 hover:border-zinc-700 transition-all`}
                      >
                        <h3 className="text-xs font-medium text-white">{task.title}</h3>
                        {task.description && <p className="text-[11px] text-zinc-400 line-clamp-2">{task.description}</p>}
                        
                        <div className="flex justify-between items-center pt-2 border-t border-zinc-900">
                          <span className="text-[10px] text-zinc-500 font-mono">P{task.priority}</span>
                          
                          {/* Durum Değiştirme Butonları (Kanban Akışı) */}
                          <div className="flex space-x-1">
                            {col.id !== 'DONE' && (
                              <button
                                onClick={() => {
                                  const nextStatus = col.id === 'TODO' ? 'IN_PROGRESS' : col.id === 'IN_PROGRESS' ? 'IN_REVIEW' : 'DONE';
                                  handleStatusChange(task.id, task.version, col.id, nextStatus);
                                }}
                                title="Move forward"
                                className="text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-1.5 py-0.5 rounded transition-colors"
                              >
                                →
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Yeni Task Modal */}
        {showTaskModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className={`w-full max-w-md ${theme.colors.bg.secondary} border ${theme.colors.border.primary} rounded-xl p-6 space-y-4 shadow-2xl`}>
              <div className="flex justify-between items-center">
                <h2 className="text-sm font-medium text-white">Create New Task</h2>
                <button onClick={() => setShowTaskModal(false)} className="text-zinc-400 hover:text-white text-xs">✕</button>
              </div>

              <form onSubmit={handleCreateTask} className="space-y-4">
                <div>
                  <label className={`block text-xs font-medium ${theme.colors.text.secondary} mb-1.5`}>Task Title</label>
                  <input
                    type="text"
                    required
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    className={`w-full ${theme.colors.bg.primary} border ${theme.colors.border.primary} rounded-md px-3 py-2 text-sm text-white focus:outline-none`}
                    placeholder="Fix authentication bug..."
                  />
                </div>

                <div>
                  <label className={`block text-xs font-medium ${theme.colors.text.secondary} mb-1.5`}>Description</label>
                  <textarea
                    value={taskDesc}
                    onChange={(e) => setTaskDesc(e.target.value)}
                    className={`w-full ${theme.colors.bg.primary} border ${theme.colors.border.primary} rounded-md px-3 py-2 text-sm text-white focus:outline-none`}
                    placeholder="Optional details..."
                    rows={3}
                  />
                </div>

                <div className="flex justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowTaskModal(false)}
                    className="px-3 py-1.5 rounded-md text-xs text-zinc-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={`${theme.colors.accent.DEFAULT} text-xs font-medium px-4 py-1.5 rounded-md`}
                  >
                    Create Task
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}