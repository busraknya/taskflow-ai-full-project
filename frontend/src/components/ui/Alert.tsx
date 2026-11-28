import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/cn';

interface AlertProps {
  message: string;
  type?: 'error' | 'success';
}

/** Inline message for a page or form; renders nothing when empty. */
export function Alert({ message, type = 'error' }: AlertProps) {
  if (!message) return null;
  const Icon = type === 'error' ? AlertCircle : CheckCircle2;
  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-control px-3 py-2.5 text-[13px]',
        type === 'error' ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success',
      )}
    >
      <Icon size={16} className="mt-px shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
