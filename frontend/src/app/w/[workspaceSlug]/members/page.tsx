'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { theme } from '@/lib/theme';
import { MemberListTable } from '@/components/members/MemberListTable';
import { Toast } from '@/components/ui/Toast';
import { AddMemberForm } from '@/components/members/AddMemberForm';

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
  const [toastMsg, setToastMsg] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const res = await api.get('/workspaces');
        const currentWs = res.data.find((w: any) => w.slug === workspaceSlug);
        if (!currentWs) {
          setToastMsg('Workspace not found.');
          setToastType('error');
          setLoading(false);
          return;
        }
        setWorkspaceId(currentWs.id);
        fetchMembers(currentWs.id);
      } catch (err) {
        setToastMsg('Failed to load workspace.');
        setToastType('error');
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
      setToastMsg('Failed to load members.');
      setToastType('error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = async (email: string, role: string) => {
    if (!workspaceId) return;
    setAdding(true);
    setToastMsg('');

    try {
      // Backend'deki mevcut invite (direct add) ucuna istek atıyoruz
      await api.post(`/workspaces/${workspaceId}/members/invite`, { email, role });
      
      setToastMsg('Member successfully added to workspace.');
      setToastType('success');
      fetchMembers(workspaceId);
    } catch (err: any) {
      const errorData = err.response?.data;
      const errorMsg = errorData?.message || 'Failed to add member.';
      setToastMsg(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
      setToastType('error');
    } finally {
      setAdding(false);
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
        
        {/* Toast Bildirimi */}
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

        {/* Üye Ekleme Formu */}
        <AddMemberForm onAdd={handleAddMember} adding={adding} />

        {/* Üye Listesi Tablosu */}
        <MemberListTable members={members} />

      </div>
    </div>
  );
}