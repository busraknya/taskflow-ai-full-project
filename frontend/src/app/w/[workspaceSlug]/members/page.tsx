'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { theme } from '@/lib/theme';
import { AddMemberForm } from '@/components/members/AddMemberForm';
import { MemberListTable } from '@/components/members/MemberListTable';
import { Toast } from '@/components/ui/Toast';
import { PendingInvitations, type PendingInvitation } from '@/components/members/PendingInvitations';
import { InviteLinkNotice } from '@/components/members/InviteLinkNotice';

interface Member {
  id: string;
  role: string;
  status: string;
  user: { id: string; fullName: string; email: string; };
}

/** The API error message, if any. */
function apiMessage(err: unknown): string | null {
  const message = (err as { response?: { data?: { message?: unknown } } }).response?.data?.message;
  return typeof message === 'string' ? message : null;
}

export default function MembersPage() {
  const params = useParams();
  const workspaceSlug = params.workspaceSlug as string;
  const router = useRouter();

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [toastMsg, setToastMsg] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [adding, setAdding] = useState(false);
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [issuedLink, setIssuedLink] = useState<{
    email: string;
    acceptUrl: string;
    emailDelivery: 'queued' | 'disabled';
  } | null>(null);

  const fetchInvitations = useCallback(async (wsId: string) => {
    try {
      const res = await api.get<PendingInvitation[]>(`/workspaces/${wsId}/invitations`);
      setInvitations(res.data);
    } catch {
      setInvitations([]); // members (non-admins) cannot see invitations
    }
  }, []);

  const fetchMembers = useCallback(async (wsId: string) => {
    try {
      const res = await api.get(`/workspaces/${wsId}/members`);
      setMembers(res.data);
    } catch (err) {
      setToastMsg('Failed to load members.');
      setToastType('error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        // Önce kullanıcı bilgilerini al (Kim giriş yapmış?)
        // Veya token'dan / me endpoint'inden ID alabiliriz. Şimdilik workspaces'ten çözelim:
        const wsRes = await api.get('/workspaces');
        const currentWs = wsRes.data.find((w: any) => w.slug === workspaceSlug);
        
        if (!currentWs) {
          setToastMsg('Workspace not found.');
          setToastType('error');
          setLoading(false);
          return;
        }
        
        setWorkspaceId(currentWs.id);
        setCurrentUserRole(currentWs.role); // Workspace listesinden kullanıcının rolünü alıyoruz

        fetchMembers(currentWs.id);
        if (currentWs.role === 'OWNER' || currentWs.role === 'ADMIN') {
          fetchInvitations(currentWs.id);
        }
      } catch (err) {
        setToastMsg('Failed to initialize workspace.');
        setToastType('error');
        setLoading(false);
      }
    };
    init();
  }, [workspaceSlug, fetchMembers, fetchInvitations]);



  const handleAddMember = async (email: string, role: string) => {
    if (!workspaceId) return;
    setAdding(true);
    setToastMsg('');

    try {
      const res = await api.post(`/workspaces/${workspaceId}/members/invite`, { email, role });
      setIssuedLink({
        email: res.data.email,
        acceptUrl: res.data.acceptUrl,
        emailDelivery: res.data.emailDelivery,
      });
      fetchInvitations(workspaceId);
    } catch (err: any) {
      const errorData = err.response?.data;
      const errorMsg = errorData?.message || 'Failed to add member.';
      setToastMsg(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
      setToastType('error');
    } finally {
      setAdding(false);
    }
  };

  const handleResendInvitation = async (invitationId: string) => {
    if (!workspaceId) return;
    try {
      const res = await api.post(`/workspaces/${workspaceId}/invitations/${invitationId}/resend`);
      const invitation = invitations.find((i) => i.id === invitationId);
      setIssuedLink({
        email: invitation?.email ?? '',
        acceptUrl: res.data.acceptUrl,
        emailDelivery: res.data.emailDelivery,
      });
      fetchInvitations(workspaceId);
    } catch (err: unknown) {
      setToastMsg(apiMessage(err) || 'Failed to resend the invitation.');
      setToastType('error');
    }
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    if (!workspaceId) return;
    if (!window.confirm('Revoke this invitation? Its link will stop working.')) return;
    try {
      await api.delete(`/workspaces/${workspaceId}/invitations/${invitationId}`);
      setToastMsg('Invitation revoked.');
      setToastType('success');
      fetchInvitations(workspaceId);
    } catch (err: unknown) {
      setToastMsg(apiMessage(err) || 'Failed to revoke the invitation.');
      setToastType('error');
    }
  };

  const handleRoleChange = async (membershipId: string, newRole: string) => {
    if (!workspaceId) return;
    const confirmed = window.confirm(`Are you sure you want to change this member's role to ${newRole}?`);
    if (!confirmed) return;

    setToastMsg('');
    try {
      await api.patch(`/workspaces/${workspaceId}/members/${membershipId}`, { role: newRole });
      setToastMsg('Member role successfully updated.');
      setToastType('success');
      fetchMembers(workspaceId);
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || 'Failed to update role.';
      setToastMsg(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
      setToastType('error');
    }
  };

  const handleRemoveMember = async (membershipId: string) => {
    if (!workspaceId) return;
    const confirmed = window.confirm('Are you sure you want to remove this member from the workspace?');
    if (!confirmed) return;

    setToastMsg('');
    try {
      await api.delete(`/workspaces/${workspaceId}/members/${membershipId}`);
      setToastMsg('Member successfully removed from workspace.');
      setToastType('success');
      fetchMembers(workspaceId);
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || 'Failed to remove member.';
      setToastMsg(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
      setToastType('error');
    }
  };

  const isOwnerOrAdmin = currentUserRole === 'OWNER' || currentUserRole === 'ADMIN';

  if (loading) {
    return (
      <div className={`min-h-screen ${theme.colors.bg.primary} flex items-center justify-center text-sm text-zinc-500`}>
        Loading members...
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${theme.colors.bg.primary} ${theme.colors.text.primary} p-8 font-sans`}>
      <div className="max-w-4xl mx-auto space-y-6">
        
        <Toast 
          message={toastMsg} 
          type={toastType} 
          onClose={() => setToastMsg('')} 
        />

        {/* Header */}
        <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
          <div>
            <h1 className="text-lg font-medium text-white tracking-tight">Workspace Members</h1>
            <p className={`text-xs ${theme.colors.text.secondary}`}>Manage your team and permissions for {workspaceSlug}.</p>
          </div>
          <button
            onClick={() => router.push(`/w/${workspaceSlug}`)}
            className="text-xs text-zinc-400 hover:text-white transition-colors"
          >
            ← Back to Board
          </button>
        </div>

        {/* Sadece Owner veya Admin ise Üye Ekleme Formunu Göster */}
        {isOwnerOrAdmin && (
          <AddMemberForm onAdd={handleAddMember} adding={adding} />
        )}

        {issuedLink && (
          <InviteLinkNotice {...issuedLink} onClose={() => setIssuedLink(null)} />
        )}

        {isOwnerOrAdmin && (
          <PendingInvitations
            invitations={invitations}
            onResend={handleResendInvitation}
            onRevoke={handleRevokeInvitation}
          />
        )}

        {/* Üye Listesi Tablosu (Rol ve Silme yetkileri ile) */}
        <MemberListTable 
          members={members} 
          onRoleChange={handleRoleChange} 
          onRemove={handleRemoveMember} 
          isOwnerOrAdmin={isOwnerOrAdmin}
          canChangeRoles={currentUserRole === 'OWNER'} 
        />

      </div>
    </div>
  );
}