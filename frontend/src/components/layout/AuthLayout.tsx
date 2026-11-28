import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/Logo';

/** Centered single-task layout for sign-in, sign-up and invitations. */
export function AuthLayout({ title, description, children, footer }: { title: string; description?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-12 sm:justify-center">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <Logo />
        <div className="flex flex-col gap-6 rounded-card border border-line bg-surface p-6 sm:p-8">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight text-fg">{title}</h1>
            {description && <p className="text-sm text-fg-muted">{description}</p>}
          </div>
          {children}
        </div>
        {footer && <div className="text-center text-sm text-fg-muted">{footer}</div>}
      </div>
    </div>
  );
}
