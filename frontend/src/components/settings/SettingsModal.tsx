'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { theme } from '@/lib/theme';
import { Toast } from '@/components/ui/Toast';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'password' | 'notifications'>('password');
  
  // Şifre State'leri
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loadingPw, setLoadingPw] = useState(false);

  // Bildirim Tercihleri State'leri
  const [emailEnabled, setEmailEnabled] = useState(true);

  // Toast Bildirim State'leri (Başarılı / Başarısız renk destekli)
  const [toastMsg, setToastMsg] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  useEffect(() => {
    if (isOpen) {
      fetchPreferences();
    } else {
      // UX Detayı: Modal kapandığında form alanlarını ve mesajları sıfırla!
      setCurrentPassword('');
      setNewPassword('');
      setToastMsg('');
      setActiveTab('password');
    }
  }, [isOpen]);

  const fetchPreferences = async () => {
    try {
      const res = await api.get('/users/me/notification-preferences');
      const taskAssignedPref = res.data.find((p: any) => p.category === 'task.assigned');
      if (taskAssignedPref) {
        setEmailEnabled(taskAssignedPref.emailEnabled);
      }
    } catch (err) {
      console.error('Failed to load preferences');
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    const confirmed = window.confirm('Are you sure you want to change your password?');
    if (!confirmed) return;

    setLoadingPw(true);
    setToastMsg('');

    try {
      await api.patch('/users/me/password', { currentPassword, newPassword });
      setToastMsg('Password successfully updated.');
      setToastType('success');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
        const errorData = err.response?.data;
        let errorMsg = 'Failed to update password.';

        // 1. Önce özel backend hata kodlarını kontrol et (örn: mevcut şifre yanlış)
        if (errorData?.code === 'INVALID_CURRENT_PASSWORD') {
          errorMsg = errorData.message || 'Current password is incorrect.';
        } 
        // 2. Eğer DTO validasyon hatası (fields) varsa onları göster
        else if (errorData?.details?.fields && Array.isArray(errorData.details.fields)) {
          errorMsg = errorData.details.fields.join(' ');
        } 
        // 3. Diğer durumlarda genel mesajı al
        else if (errorData?.message) {
          errorMsg = Array.isArray(errorData.message) ? errorData.message.join(' ') : errorData.message;
        }

        setToastMsg(errorMsg);
        setToastType('error');
    } finally {
      setLoadingPw(false);
    }
  };

  const handleNotificationToggle = async (enabled: boolean) => {
    const confirmed = window.confirm(`Are you sure you want to ${enabled ? 'enable' : 'disable'} task assignment notifications?`);
    if (!confirmed) return;

    setEmailEnabled(enabled);

    try {
      await api.patch('/users/me/notification-preferences', {
        category: 'task.assigned',
        emailEnabled: enabled,
      });
      setToastMsg('Notification preferences saved.');
      setToastType('success');
    } catch (err) {
      setEmailEnabled(!enabled); // Hata olursa eski haline getir
      setToastMsg('Failed to save preferences.');
      setToastType('error');
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Sağ Üst Köşe Akıllı Toast Bildirimi (Başarılı: Yeşil, Başarısız: Kırmızı) */}
      <Toast 
        message={toastMsg} 
        type={toastType} 
        onClose={() => setToastMsg('')} 
      />

      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className={`w-full max-w-lg ${theme.colors.bg.secondary} border ${theme.colors.border.primary} rounded-xl p-6 space-y-6 shadow-2xl`}>
          
          {/* Toast burada, modalın içinde en üstte ve z-index ile garanti altında */}
            <div className="absolute -top-12 right-0">
                <Toast 
                    message={toastMsg} 
                    type={toastType} 
                    onClose={() => setToastMsg('')} 
                />
            </div>

          {/* Modal Header */}
          <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
            <h2 className="text-sm font-medium text-white tracking-tight">Account Settings</h2>
            <button onClick={onClose} className="text-zinc-400 hover:text-white text-xs">✕</button>
          </div>

          {/* Tabs */}
          <div className="flex space-x-2 border-b border-zinc-800 pb-3 text-xs">
            <button
              onClick={() => setActiveTab('password')}
              className={`px-3 py-1.5 rounded-md transition-colors ${activeTab === 'password' ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              Security & Password
            </button>
            <button
              onClick={() => setActiveTab('notifications')}
              className={`px-3 py-1.5 rounded-md transition-colors ${activeTab === 'notifications' ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              Notifications
            </button>
          </div>

          {/* Tab 1: Password Change */}
          {activeTab === 'password' && (
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div>
                <label className={`block text-xs font-medium ${theme.colors.text.secondary} mb-1.5`}>Current Password</label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className={`w-full ${theme.colors.bg.primary} border ${theme.colors.border.primary} rounded-md px-3 py-2 text-sm text-white focus:outline-none`}
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label className={`block text-xs font-medium ${theme.colors.text.secondary} mb-1.5`}>New Password</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={`w-full ${theme.colors.bg.primary} border ${theme.colors.border.primary} rounded-md px-3 py-2 text-sm text-white focus:outline-none`}
                  placeholder="••••••••"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={loadingPw}
                  className={`${theme.colors.accent.DEFAULT} text-xs font-medium px-4 py-2 rounded-md transition-colors disabled:opacity-50`}
                >
                  {loadingPw ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          )}

          {/* Tab 2: Notifications */}
          {activeTab === 'notifications' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center py-3 border-b border-zinc-800">
                <div>
                  <p className="text-xs font-medium text-white">Task Assignment Emails</p>
                  <p className={`text-[11px] ${theme.colors.text.secondary}`}>Receive an email when you are assigned to a task.</p>
                </div>
                <input
                  type="checkbox"
                  checked={emailEnabled}
                  onChange={(e) => handleNotificationToggle(e.target.checked)}
                  className="w-4 h-4 accent-white bg-zinc-900 border-zinc-700 rounded cursor-pointer"
                />
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}