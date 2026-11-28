'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getErrorMessage, type ApiErrorBody } from '@/lib/errors';
import { ROLE_LABEL } from '@/lib/labels';
import type { Member } from '@/lib/tasks';
import { useWorkspace } from '@/lib/workspace';
import { useAuthStore } from '@/store/useAuthStore';
import { PageHeader } from '@/components/layout/AppShell';
import { AddMemberForm } from '@/components/members/AddMemberForm';
import { InviteLinkNotice } from '@/components/members/InviteLinkNotice';
import { MemberListTable } from '@/components/members/MemberListTable';
import { PendingInvitations, type PendingInvitation } from '@/components/members/PendingInvitations';
import { Alert } from '@/components/ui/Alert';
import { useFeedback } from '@/components/ui/Feedback';
import { PageLoader } from '@/components/ui/Spinner';

interface IssuedLink {
  email: string;
  acceptUrl: string;
  emailDelivery: 'queued' | 'disabled';
}

const errorBody = (err: unknown) => (err as { response?: { data?: ApiErrorBody } }).response?.data;
const memberName = (m: Member) => m.user.fullName ?? m.user.email;

export default function MembersPage() {
  const { workspace, canManage } = useWorkspace();
  const currentUserId = useAuthStore((state) => state.user?.id ?? null);
  const { toast, confirm } = useFeedback();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [issuedLink, setIssuedLink] = useState<IssuedLink | null>(null);
  const [error, setError] = useState('');
  const base = `/workspaces/${workspace.id}`;

  const loadMembers = useCallback(
    () =>
      api.get<Member[]>(`${base}/members`).then(
        (res) => setMembers(res.data),
        () => {
          setMembers((current) => current ?? []);
          setError('Members could not be loaded. Check your connection and reload the page.');
        },
      ),
    [base],
  );

  const loadInvitations = useCallback(
    () =>
      api.get<PendingInvitation[]>(`${base}/invitations`).then(
        (res) => setInvitations(res.data),
        () => setInvitations([]),
      ),
    [base],
  );

  useEffect(() => {
    void loadMembers();
    if (canManage) void loadInvitations();
  }, [loadMembers, loadInvitations, canManage]);

  const invite = async (email: string, role: string) => {
    try {
      const res = await api.post<IssuedLink>(`${base}/members/invite`, { email, role });
      setIssuedLink({ email: res.data.email, acceptUrl: res.data.acceptUrl, emailDelivery: res.data.emailDelivery });
      void loadInvitations();
      return true;
    } catch (err) {
      toast(getErrorMessage(errorBody(err)), 'error');
      return false;
    }
  };

  const resend = async (invitationId: string) => {
    try {
      const res = await api.post<IssuedLink>(`${base}/invitations/${invitationId}/resend`);
      const invitation = invitations.find((i) => i.id === invitationId);
      setIssuedLink({ email: invitation?.email ?? '', acceptUrl: res.data.acceptUrl, emailDelivery: res.data.emailDelivery });
      void loadInvitations();
    } catch (err) {
      toast(getErrorMessage(errorBody(err)), 'error');
    }
  };

  const revoke = async (invitationId: string) => {
    const ok = await confirm({ title: 'Revoke this invitation?', description: 'Its link stops working immediately.', confirmLabel: 'Revoke invitation', destructive: true });
    if (!ok) return;
    try {
      await api.delete(`${base}/invitations/${invitationId}`);
      toast('Invitation revoked.');
      void loadInvitations();
    } catch (err) {
      toast(getErrorMessage(errorBody(err)), 'error');
    }
  };

  const changeRole = async (member: Member, role: string) => {
    const ok = await confirm({
      title: `Make ${memberName(member)} ${ROLE_LABEL[role] === 'Admin' ? 'an admin' : `a ${ROLE_LABEL[role]?.toLowerCase()}`}?`,
      description: role === 'ADMIN' ? 'Admins can invite and remove members and manage projects.' : role === 'VIEWER' ? 'Viewers can read tasks but not change them.' : 'Members can create and update tasks and comments.',
      confirmLabel: 'Change role',
    });
    if (!ok) return;
    try {
      await api.patch(`${base}/members/${member.id}`, { role });
      toast('Role updated.');
      void loadMembers();
    } catch (err) {
      toast(getErrorMessage(errorBody(err)), 'error');
    }
  };

  const remove = async (member: Member) => {
    const ok = await confirm({
      title: `Remove ${memberName(member)}?`,
      description: 'They lose access to this workspace. Their tasks and comments stay.',
      confirmLabel: 'Remove member',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`${base}/members/${member.id}`);
      toast(`${memberName(member)} was removed.`);
      void loadMembers();
    } catch (err) {
      toast(getErrorMessage(errorBody(err)), 'error');
    }
  };

  return (
    <>
      <PageHeader title="Members" description={`People in ${workspace.name} and what they can do.`} />
      <div className="flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6">
        <Alert message={error} />
        {canManage && <AddMemberForm onAdd={invite} />}
        {issuedLink && <InviteLinkNotice {...issuedLink} onClose={() => setIssuedLink(null)} />}
        {canManage && <PendingInvitations invitations={invitations} onResend={resend} onRevoke={revoke} />}
        {members === null ? (
          <PageLoader label="Loading members…" />
        ) : (
          <MemberListTable
            members={members}
            currentUserId={currentUserId}
            canChangeRoles={workspace.role === 'OWNER'}
            currentRole={workspace.role}
            onRoleChange={changeRole}
            onRemove={remove}
          />
        )}
      </div>
    </>
  );
}
