import { theme } from '@/lib/theme';

interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: number;
  version: number;
  assignee?: { id: string; fullName: string };
  riskAssessments?: Array<{ riskLevel: string }>;
}

interface KanbanColumnProps {
  columnId: string;
  title: string;
  tasks: Task[];
  onMoveForward: (taskId: string, version: number, nextStatus: string) => void;
}

export function KanbanColumn({ columnId, title, tasks, onMoveForward }: KanbanColumnProps) {
  return (
    <div className={`${theme.colors.bg.secondary} border ${theme.colors.border.primary} rounded-lg p-3 space-y-3 flex flex-col max-h-[75vh]`}>
      <div className="flex justify-between items-center px-1">
        <span className="text-xs font-medium text-zinc-300">{title}</span>
        <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">{tasks.length}</span>
      </div>

      <div className="space-y-2 overflow-y-auto flex-1 pr-1">
        {tasks.map((task) => {
          const risk = task.riskAssessments?.[0];
          return (
            <div
              key={task.id}
              className={`p-3 ${theme.colors.bg.primary} border ${theme.colors.border.primary} rounded-md space-y-2 hover:border-zinc-700 transition-all`}
            >
              <div className="flex justify-between items-start">
                <h3 className="text-xs font-medium text-white">{task.title}</h3>
                {risk && (
                  <span className={`text-[9px] uppercase px-1.5 py-0.5 rounded font-mono ${
                    risk.riskLevel === 'HIGH' ? 'bg-red-950 text-red-400 border border-red-900' :
                    risk.riskLevel === 'MEDIUM' ? 'bg-amber-950 text-amber-400 border border-amber-900' :
                    'bg-zinc-800 text-zinc-400'
                  }`}>
                    {risk.riskLevel}
                  </span>
                )}
              </div>

              {task.description && <p className="text-[11px] text-zinc-400 line-clamp-2">{task.description}</p>}
              
              <div className="flex justify-between items-center pt-2 border-t border-zinc-900 text-[10px] text-zinc-500">
                <span>P{task.priority} {task.assignee ? `• ${task.assignee.fullName}` : ''}</span>
                
                <div className="flex space-x-1">
                  {columnId !== 'DONE' && (
                    <button
                      onClick={() => {
                        const nextStatus = columnId === 'TODO' ? 'IN_PROGRESS' : columnId === 'IN_PROGRESS' ? 'IN_REVIEW' : 'DONE';
                        onMoveForward(task.id, task.version, nextStatus);
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
          );
        })}
      </div>
    </div>
  );
}