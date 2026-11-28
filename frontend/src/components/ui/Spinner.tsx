import { cn } from '@/lib/cn';

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent', className)}
    />
  );
}

/** Full-area loading state with a short, specific label. */
export function PageLoader({ label }: { label: string }) {
  return (
    <div className="flex flex-1 items-center justify-center gap-2 py-24 text-sm text-fg-muted" role="status">
      <Spinner className="size-4 text-fg-subtle" />
      {label}
    </div>
  );
}
