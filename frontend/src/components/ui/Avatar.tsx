import { cn } from '@/lib/cn';

export function initials(name?: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function Avatar({ name, size = 'md', className }: { name?: string | null; size?: 'sm' | 'md'; className?: string }) {
  return (
    <span
      aria-hidden="true"
      title={name ?? undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-subtle font-medium text-fg-muted ring-1 ring-line',
        size === 'sm' ? 'size-6 text-[10px]' : 'size-8 text-xs',
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
