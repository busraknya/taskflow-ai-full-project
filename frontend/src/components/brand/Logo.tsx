import { cn } from '@/lib/cn';

/** TaskFlow mark: a task list that narrows as work flows through it. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn('size-6 shrink-0', className)}>
      <rect width="24" height="24" rx="6" className="fill-accent" />
      <path d="M7 8h10M7 12h7M7 16h4" strokeWidth="2" strokeLinecap="round" className="stroke-accent-fg" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight text-fg', className)}>
      <LogoMark />
      TaskFlow AI
    </span>
  );
}
