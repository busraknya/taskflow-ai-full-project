'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { theme } from '@/lib/theme';
import { describeRisk, riskBadgeClass } from '@/lib/risk';
import type { RiskModelStatus } from '@/lib/risk';
import { X, Send, Trash2, Calendar, User, AlertCircle } from 'lucide-react';

interface Comment {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; fullName: string; avatarUrl?: string };
}

interface RiskFactor {
  explanation: string;
}

interface TaskRiskAssessment {
  riskLevel: string;
  riskScore: number | null;
  factors: RiskFactor[];
  reason?: string | null;
}

interface TaskDetails {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: number;
  dueDate: string | null;
  dueDateIsDateOnly?: boolean;
  assignee: { id: string; fullName: string; avatarUrl?: string | null } | null;
  riskAssessments: TaskRiskAssessment[];
}

interface TaskDetailModalProps {
  riskModelStatus?: RiskModelStatus | null;
  taskId: string | null;
  workspaceId: string;
  onClose: () => void;
  currentUserId: string | null;
  canAddComment: boolean;
  canManageAllComments: boolean;
}

export function TaskDetailModal({ riskModelStatus = null, taskId, workspaceId, onClose, currentUserId, canAddComment, canManageAllComments }: TaskDetailModalProps) {
  const [task, setTask] = useState<TaskDetails | null>(null);
  const [loadedTaskId, setLoadedTaskId] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const loading = Boolean(taskId) && loadedTaskId !== taskId;
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);



  useEffect(() => {
    if (!taskId || !workspaceId) return;

    let cancelled = false;

    const loadTaskDetails = async () => {
      const [taskResult, commentsResult] = await Promise.allSettled([
        api.get<TaskDetails>(`/workspaces/${workspaceId}/tasks/${taskId}`),
        api.get<Comment[]>(`/workspaces/${workspaceId}/tasks/${taskId}/comments`),
      ]);

      if (cancelled) return;

      if (taskResult.status === 'fulfilled') {
        setTask(taskResult.value.data);
        setLoadError('');
      } else {
        setTask(null);
        setLoadError(
          'Task details could not be loaded. It may have been deleted or you may no longer have access.',
        );
      }

      setComments(
        commentsResult.status === 'fulfilled' ? commentsResult.value.data : [],
      );
      setLoadedTaskId(taskId);
    };

    void loadTaskDetails();

    return () => {
      cancelled = true;
    };
  }, [taskId, workspaceId]);

  const fetchComments = async () => {
    try {
      const res = await api.get<Comment[]>(`/workspaces/${workspaceId}/tasks/${taskId}/comments`);
      setComments(res.data);
    } catch {
      console.error('Failed to load comments');
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    setSubmitting(true);

    try {
      await api.post(`/workspaces/${workspaceId}/tasks/${taskId}/comments`, {
        body: newComment,
      });
      setNewComment('');
      fetchComments();
    } catch (err) {
      alert('Failed to add comment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    const confirmed = window.confirm('Are you sure you want to delete this comment?');
    if (!confirmed) return;

    try {
      await api.delete(`/workspaces/${workspaceId}/tasks/${taskId}/comments/${commentId}`);
      fetchComments();
    } catch (err: any) {
      alert(err.response?.data?.message || 'You do not have permission to delete this comment.');
    }
  };

  if (!taskId) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-end z-50 animate-fade-in">
      <div className={`w-full max-w-xl ${theme.colors.bg.secondary} border-l ${theme.colors.border.primary} h-full p-6 flex flex-col shadow-2xl overflow-y-auto`}>
        
        {/* Header */}
        <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
          <span className="text-[10px] uppercase font-mono bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded">Task Details</span>
          <button onClick={onClose} className="text-zinc-400 hover:text-white p-1 rounded-md hover:bg-zinc-800"><X size={18} /></button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-xs text-zinc-500">Loading details...</div>
        ) : loadError || !task ? (
          <div className="flex-1 flex items-center justify-center text-xs text-zinc-500">{loadError || 'Task not found.'}</div>
        ) : (
          <div className="space-y-6 pt-6 flex-1 flex flex-col">
            
            {/* Task Title & Status */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-mono uppercase bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded">{task.status}</span>
                <span className="text-[10px] font-mono uppercase bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">Priority P{task.priority}</span>
              </div>
              <h1 className="text-base font-medium text-white">{task.title}</h1>
              <p className="text-xs text-zinc-400 leading-relaxed">{task.description || 'No description provided.'}</p>
            </div>

            {/* Risk panel: a level only from this workspace's validated model,
                otherwise an honest state (architecture §12). */}
            {(() => {
              const view = describeRisk(riskModelStatus, task.riskAssessments);
              const factors = view.level ? task.riskAssessments?.[0]?.factors ?? [] : [];
              return (
                <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg space-y-2">
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-[10px] uppercase font-mono text-zinc-400 flex items-center gap-1">
                      <AlertCircle size={12} /> Delay risk
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                        view.level ? `uppercase ${riskBadgeClass(view.level)}` : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {view.title}
                      {view.probability !== null && ` · ${Math.round(view.probability * 100)}%`}
                    </span>
                  </div>
                  {view.detail && <p className="text-[11px] text-zinc-500">{view.detail}</p>}
                  {factors.length > 0 && (
                    <ul className="text-[11px] text-zinc-400 space-y-1 pl-4 list-disc">
                      {factors.map((f, idx) => (
                        <li key={idx}>{f.explanation}</li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })()}

            {/* Meta Info (Assignee & Due Date) */}
            <div className="grid grid-cols-2 gap-4 text-xs pt-2 pb-4 border-b border-zinc-800">
              <div className="flex items-center space-x-2 text-zinc-400">
                <User size={14} />
                <span>Assignee: <strong className="text-white">{task.assignee?.fullName || 'Unassigned'}</strong></span>
              </div>
              <div className="flex items-center space-x-2 text-zinc-400">
                <Calendar size={14} />
                <span>Due: <strong className="text-white">{task.dueDate
                  ? task.dueDateIsDateOnly
                    ? // Date-only due dates are stored as UTC midnight of the calendar date.
                      new Date(task.dueDate).toLocaleDateString(undefined, { timeZone: 'UTC' })
                    : new Date(task.dueDate).toLocaleString()
                  : 'No deadline'}</strong></span>
              </div>
            </div>

            {/* Comments Section (Domain Rules §7) */}
            <div className="flex-1 flex flex-col space-y-4">
              <h3 className="text-xs font-medium text-white uppercase tracking-wider">Comments ({comments.length})</h3>

              <div className="space-y-3 overflow-y-auto flex-1 pr-1 max-h-[30vh]">
                {comments.length === 0 ? (
                  <p className="text-xs text-zinc-500 italic">No comments yet. Start the conversation!</p>
                ) : (
                  comments.map((c) => (
                    <div key={c.id} className="p-3 bg-zinc-900/50 border border-zinc-800/80 rounded-md space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-medium text-zinc-200">{c.author.fullName}</span>
                        <div className="flex items-center space-x-2">
                          <span className="text-[10px] text-zinc-500">{new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          {(canManageAllComments || c.author.id === currentUserId) && (
                            <button onClick={() => handleDeleteComment(c.id)} className="text-zinc-600 hover:text-red-400 transition-colors" aria-label="Delete comment"><Trash2 size={12} /></button>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-zinc-300 leading-relaxed">{c.body}</p>
                    </div>
                  ))
                )}
              </div>

              {/* New Comment Form */}
              {canAddComment && <form onSubmit={handleAddComment} className="flex gap-2 pt-2 border-t border-zinc-800">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Write a comment..."
                  className={`flex-1 ${theme.colors.bg.primary} border ${theme.colors.border.primary} rounded-md px-3 py-2 text-xs text-white focus:outline-none`}
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className={`${theme.colors.accent.DEFAULT} p-2 rounded-md transition-colors disabled:opacity-50`}
                >
                  <Send size={14} />
                </button>
              </form>}
            </div>

          </div>
        )}

      </div>
    </div>
  );
}