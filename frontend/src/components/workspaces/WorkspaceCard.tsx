import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { ROLE_LABEL } from '@/lib/labels';
import { Badge } from '@/components/ui/Badge';

export function WorkspaceCard({ name, slug, role }: { name: string; slug: string; role: string }) {
  return (
    <Link
      href={`/w/${slug}`}
      className="group flex items-center gap-4 rounded-card border border-line bg-surface px-4 py-3.5 transition-colors hover:border-line-strong"
    >
      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-control bg-accent-soft text-sm font-semibold text-accent">
        {name.trim().charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-fg">{name}</span>
        <span className="block truncate font-mono text-xs text-fg-subtle">/{slug}</span>
      </span>
      <Badge>{ROLE_LABEL[role] ?? role}</Badge>
      <ChevronRight size={16} aria-hidden="true" className="text-fg-subtle transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
