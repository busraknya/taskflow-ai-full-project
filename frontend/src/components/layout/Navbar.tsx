'use client';

import { useRouter } from 'next/navigation';
import { theme } from '@/lib/theme';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import { Settings, LogOut, Users, Plus, FolderKanban, Activity } from 'lucide-react';

interface NavbarProps {
  workspaceSlug?: string;
  projects?: Array<{ id: string; name: string }>;
  selectedProjectId?: string;
  isOwnerOrAdmin?: boolean; // <-- Yeni eklenen yetki prop'u
  onProjectChange?: (projectId: string) => void;
  onNewTaskClick?: () => void;
  onNewProjectClick?: () => void;
  onSettingsClick?: () => void;
}

export function Navbar({
  workspaceSlug,
  projects = [],
  selectedProjectId,
  isOwnerOrAdmin = false,
  onProjectChange,
  onNewTaskClick,
  onNewProjectClick,
  onSettingsClick,
}: NavbarProps) {
  const router = useRouter();
  const { clearAuth } = useAuthStore();

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (e) {}
    clearAuth();
    router.push('/login');
  };

  return (
    <header className={`border-b ${theme.colors.border.primary} ${theme.colors.bg.secondary} px-6 py-3 flex justify-between items-center select-none`}>
      
      {/* Sol Taraf: Logo ve /workspaces ekranına dönüş */}
      <div className="flex items-center space-x-4">
        <button
          onClick={() => router.push('/workspaces')}
          className="flex items-center space-x-2 text-white font-medium tracking-tight hover:opacity-80 transition-opacity"
          title="Switch Workspace"
        >
          <span className="w-6 h-6 bg-white text-zinc-950 rounded flex items-center justify-center font-bold text-xs">T</span>
          <span className="text-sm">TaskFlow AI</span>
        </button>

        {workspaceSlug && (
          <>
            <span className="text-zinc-600">/</span>
            <span className="text-xs font-mono uppercase bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded">
              {workspaceSlug}
            </span>
          </>
        )}
      </div>

      {/* Orta Taraf: Proje Seçici ve (Sadece yetkiliyse) Yeni Proje Butonu */}
      {workspaceSlug && (
        <div className="flex items-center space-x-2">
          <select
            className={`${theme.colors.bg.primary} border ${theme.colors.border.primary} rounded-md px-3 py-1.5 text-xs text-white focus:outline-none`}
            value={selectedProjectId || ''}
            onChange={(e) => onProjectChange && onProjectChange(e.target.value)}
          >
            {projects.length === 0 ? (
              <option value="">No projects available</option>
            ) : (
              projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))
            )}
          </select>

          {isOwnerOrAdmin && (
            <button
              onClick={onNewProjectClick}
              className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors"
              title="Create New Project"
            >
              <FolderKanban size={15} />
            </button>
          )}
        </div>
      )}

      {/* Sağ Taraf: Aksiyonlar */}
      <div className="flex items-center space-x-2">
        {workspaceSlug && (
          <>
            <button
              onClick={() => router.push(`/w/${workspaceSlug}/members`)}
              className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-md transition-colors flex items-center space-x-1.5"
            >
              <Users size={14} />
              <span>Members</span>
            </button>
            <button
              onClick={() => router.push(`/w/${workspaceSlug}/activity`)}
              className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-md transition-colors flex items-center space-x-1.5"
            >
              <Activity size={14} />
              <span>Activity</span>
            </button>
            <button
              onClick={onNewTaskClick}
              disabled={!selectedProjectId}
              className={`${theme.colors.accent.DEFAULT} text-xs font-medium px-3 py-1.5 rounded-md transition-colors flex items-center space-x-1 disabled:opacity-50`}
            >
              <Plus size={14} />
              <span>New Task</span>
            </button>
          </>
        )}

        {workspaceSlug && <div className="h-4 w-[1px] bg-zinc-800 mx-1" />}

        <button
          onClick={onSettingsClick}
          className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors"
          title="Account Settings"
        >
          <Settings size={15} />
        </button>

        <button
          onClick={handleLogout}
          className="p-1.5 bg-red-950/40 hover:bg-red-900/50 text-red-400 rounded-md transition-colors border border-red-900/30"
          title="Sign Out"
        >
          <LogOut size={15} />
        </button>
      </div>

    </header>
  );
}