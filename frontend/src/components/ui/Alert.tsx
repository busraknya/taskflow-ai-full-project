import { theme } from '@/lib/theme';

interface AlertProps {
  message: string;
  type?: 'error' | 'success';
}

export function Alert({ message, type = 'error' }: AlertProps) {
  if (!message) return null;

  const style = type === 'error' ? theme.colors.accent.danger : 'bg-emerald-950/50 border-emerald-900/50 text-emerald-400';

  return (
    <div className={`p-3 text-xs border rounded-md transition-all ${style}`}>
      {message}
    </div>
  );
}