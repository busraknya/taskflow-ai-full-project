'use client';

import { ROLE_LABEL } from '@/lib/labels';
import type { Member } from '@/lib/tasks';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';

interface MemberListProps {
  members: Member[];
  currentUserId: string | null;
  /** Only owners change roles. */
  canChangeRoles: boolean;
  /** Owners and admins remove members; admins cannot remove owners. */
  currentRole: string;
  onRoleChange: (member: Member, role: string) => void;
  onRemove: (member: Member) => void;
}

export function MemberListTable({ members, currentUserId, canChangeRoles, currentRole, onRoleChange, onRemove }: MemberListProps) {
  const canRemove = (m: Member) => (currentRole === 'OWNER' || (currentRole === 'ADMIN' && m.role !== 'OWNER')) && m.user.id !== currentUserId;

  return (
    <section aria-labelledby="members-heading" className="flex flex-col gap-3">
      <h2 id="members-heading" className="text-[13px] font-semibold text-fg">
        Members <span className="font-normal text-fg-subtle tabular-nums">{members.length}</span>
      </h2>
      <ul className="divide-y divide-line rounded-card border border-line bg-surface">
        {members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Avatar name={m.user.fullName ?? m.user.email} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-fg">
                {m.user.fullName ?? <span className="font-normal text-fg-muted italic">Invitation pending</span>}
                {m.user.id === currentUserId && <span className="font-normal text-fg-subtle"> (you)</span>}
              </p>
              <p className="truncate text-[13px] text-fg-muted">{m.user.email}</p>
            </div>
            {m.status !== 'ACTIVE' && <Badge tone="warning">{m.status === 'PENDING' ? 'Pending' : m.status.toLowerCase()}</Badge>}
            {canChangeRoles && m.role !== 'OWNER' ? (
              <div className="w-32">
                <label htmlFor={`role-${m.id}`} className="sr-only">
                  Role for {m.user.fullName ?? m.user.email}
                </label>
                <Select id={`role-${m.id}`} value={m.role} onChange={(e) => onRoleChange(m, e.target.value)} className="h-8 text-[13px]">
                  {['ADMIN', 'MEMBER', 'VIEWER'].map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </Select>
              </div>
            ) : (
              <Badge tone={m.role === 'OWNER' ? 'accent' : 'neutral'}>{ROLE_LABEL[m.role] ?? m.role}</Badge>
            )}
            {canRemove(m) && (
              <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => onRemove(m)}>
                Remove
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
