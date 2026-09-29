'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { theme } from '@/lib/theme';
import { InviteMemberForm } from '@/components/members/InviteMemberForm';
import { MemberListTable } from '@/components/members/MemberListTable';
import { Toast } from '@/components/ui/Toast'; // <-- Toast bileşeni eklendi

interface Member {
  id: string;
  role: string;
  status: string;
  user: { id: string; fullName: string; email: string; };
}

export default function MembersPage() {
  const params = useParams();
  const workspaceSlug = params.workspaceSlug as string;
  const router = useRouter();

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const res = await api.get('/workspaces');
        const currentWs = res.data.find((w: any) => w.slug === workspaceSlug);
        if (!currentWs) {
          setError('Workspace not found.');
          setLoading(false);
          return;
        }
        setWorkspaceId(currentWs.id);
        fetchMembers(currentWs.id);
      } catch (err) {
        setError('Failed to load workspace.');
        setLoading(false);
      }
    };
    init();
  }, [workspaceSlug]);

  const fetchMembers = async (wsId: string) => {
    try {
      const res = await api.get(`/workspaces/${wsId}/members`);
      setMembers(res.data);
    } catch (err) {
      setError('Failed to load members.');
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (email: string, role: string) => {
    if (!workspaceId) return;
    setInviting(true);
    setError('');
    setSuccessMsg('');

    try {
      console.log('🚀 İstek atılıyor:', `/workspaces/${workspaceId}/members/invite`, { email, role });
      const res = await api.post(`/workspaces/${workspaceId}/members/invite`, { email, role });
      console.log('✅ Başarılı:', res.data);
      
      setSuccessMsg('Member successfully invited and added!');
      fetchMembers(workspaceId);
    } catch (err: any) {
      console.error('❌ AXIOS HATASI YAKALANDI:', err);
      console.error('❌ Hata Detayı (Response):', err.response?.data);
      console.error('❌ Hata Status Kodu:', err.response?.status);

      const errorData = err.response?.data;
      const errorMsg = errorData?.message || err.message || 'Failed to invite member.';
      setError(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
    } finally {
      setInviting(false);
    }
  };

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
        
        {/* Sağ Üst Köşe Akıllı Toast Bildirimi */}
        <Toast 
          message={error || successMsg} 
          type={error ? 'error' : 'success'} 
          onClose={() => { setError(''); setSuccessMsg(''); }} 
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

        {/* Form Bileşeni */}
        <InviteMemberForm onInvite={handleInvite} inviting={inviting} />

        {/* Tablo Bileşeni */}
        <MemberListTable members={members} />

      </div>
    </div>
  );
}