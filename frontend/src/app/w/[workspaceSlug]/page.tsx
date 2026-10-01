'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { theme } from '@/lib/theme';
import { Alert } from '@/components/ui/Alert';
import { KanbanColumn } from '@/components/kanban/KanbanColumn';
import { TaskModal } from '@/components/kanban/TaskModal';
import { SettingsModal } from '@/components/settings/SettingsModal';
import { TaskDetailModal } from '@/components/kanban/TaskDetailModal';
import { Navbar } from '@/components/layout/Navbar';
import { CreateProjectModal } from '@/components/projects/CreateProjectModal';

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
  
  // Rol ve Modaller
  const [currentUserRole, setCurrentUserRole] = useState<string>('MEMBER');
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

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
        setCurrentUserRole(currentWs.role); // <-- Kullanıcının bu workspace'teki rolü set ediliyor
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

  const handleCreateProject = async (name: string, description: string) => {
    if (!workspaceId) return;
    try {
      const res = await api.post(`/workspaces/${workspaceId}/projects`, { name, description });
      fetchProjects(workspaceId);
      setSelectedProject(res.data);
      fetchTasks(workspaceId, res.data.id);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create project.');
    }
  };

  const isOwnerOrAdmin = currentUserRole === 'OWNER' || currentUserRole === 'ADMIN';

  if (loading) return <div className={`min-h-screen ${theme.colors.bg.primary} flex items-center justify-center text-sm text-zinc-500`}>Loading dashboard...</div>;

  return (
    <div className={`min-h-screen ${theme.colors.bg.primary} ${theme.colors.text.primary} font-sans flex flex-col`}>
      
      {/* Kurumsal Ortak Navbar (Rol korumalı) */}
      <Navbar
        workspaceSlug={workspaceSlug}
        projects={projects}
        selectedProjectId={selectedProject?.id}
        isOwnerOrAdmin={isOwnerOrAdmin}
        onProjectChange={(projId) => {
          const proj = projects.find(p => p.id === projId);
          if (proj && workspaceId) {
            setSelectedProject(proj);
            fetchTasks(workspaceId, proj.id);
          }
        }}
        onNewTaskClick={() => setShowTaskModal(true)}
        onNewProjectClick={() => setShowProjectModal(true)}
        onSettingsClick={() => setShowSettingsModal(true)}
      />

      <div className="max-w-7xl mx-auto w-full p-6 space-y-6 flex-1 flex flex-col">
        
        <Alert message={error} type="error" />

        {!selectedProject ? (
          <div className="text-center py-16 border border-dashed border-zinc-800 rounded-lg space-y-3">
            <p className={`text-xs ${theme.colors.text.secondary}`}>No projects found in this workspace.</p>
            {isOwnerOrAdmin && (
              <button
                onClick={() => setShowProjectModal(true)}
                className={`${theme.colors.accent.DEFAULT} text-xs font-medium px-4 py-2 rounded-md`}
              >
                Create First Project
              </button>
            )}
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
                onTaskClick={(taskId) => setActiveTaskId(taskId)}
              />
            ))}
          </div>
        )}

        {/* Modaller */}
        <TaskModal
          isOpen={showTaskModal}
          onClose={() => setShowTaskModal(false)}
          onSubmit={handleCreateTask}
          members={members}
        />

        <CreateProjectModal
          isOpen={showProjectModal}
          onClose={() => setShowProjectModal(false)}
          onSubmit={handleCreateProject}
        />

        <SettingsModal
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
        />

        <TaskDetailModal
          taskId={activeTaskId}
          workspaceId={workspaceId || ''}
          onClose={() => setActiveTaskId(null)}
          onTaskUpdated={() => {
            if (workspaceId && selectedProject) {
              fetchTasks(workspaceId, selectedProject.id);
            }
          }}
        />

      </div>
    </div>
  );
}