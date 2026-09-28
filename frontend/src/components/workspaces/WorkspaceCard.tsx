import { theme } from '@/lib/theme';

interface WorkspaceCardProps {
  name: string;
  slug: string;
  role: string;
  onClick: () => void;
}

export function WorkspaceCard({ name, slug, role, onClick }: WorkspaceCardProps) {
  return (
    <div
      onClick={onClick}
      className={`group p-4 ${theme.colors.bg.secondary} border ${theme.colors.border.primary} rounded-lg hover:border-zinc-600 cursor-pointer transition-all flex justify-between items-center`}
    >
      <div className="space-y-1">
        <h2 className="text-sm font-medium text-white group-hover:text-zinc-200">{name}</h2>
        <p className={`text-xs ${theme.colors.text.secondary}`}>slug: {slug}</p>
      </div>
      <div className="flex items-center space-x-3">
        <span className="text-[10px] uppercase font-mono bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded">
          {role}
        </span>
        <span className="text-xs text-zinc-500 group-hover:text-white transition-colors">→</span>
      </div>
    </div>
  );
}