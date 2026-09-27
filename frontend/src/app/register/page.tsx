'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { theme } from '@/lib/theme';
import { getErrorMessage } from '@/lib/errors';
import { Alert } from '@/components/ui/Alert';
import Link from 'next/link';

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.post('/auth/register', { fullName, email, password });
      // Kayıt başarılı -> Kullanıcıyı login sayfasına yönlendir
      router.push('/login');
    } catch (err: any) {
      const errorCode = err.response?.data?.code || err.response?.data?.message;
      setError(getErrorMessage(errorCode));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`min-h-screen ${theme.colors.bg.primary} ${theme.colors.text.primary} flex flex-col justify-center items-center px-4 font-sans`}>
      <div className="w-full max-w-sm space-y-6">
        
        {/* Minimalist Header */}
        <div className="space-y-1">
          <h1 className="text-lg font-medium tracking-tight text-white">Create an account</h1>
          <p className={`text-xs ${theme.colors.text.secondary}`}>Get started with TaskFlow AI.</p>
        </div>

        {/* Centralized Alert Component */}
        <Alert message={error} type="error" />

        {/* Form */}
        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className={`block text-xs font-medium ${theme.colors.text.secondary} mb-1.5`}>Full name</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={`w-full ${theme.colors.bg.secondary} border ${theme.colors.border.primary} rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:${theme.colors.border.focus} transition-colors`}
              placeholder="John Doe"
            />
          </div>

          <div>
            <label className={`block text-xs font-medium ${theme.colors.text.secondary} mb-1.5`}>Email address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`w-full ${theme.colors.bg.secondary} border ${theme.colors.border.primary} rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:${theme.colors.border.focus} transition-colors`}
              placeholder="name@company.com"
            />
          </div>

          <div>
            <label className={`block text-xs font-medium ${theme.colors.text.secondary} mb-1.5`}>Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`w-full ${theme.colors.bg.secondary} border ${theme.colors.border.primary} rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:${theme.colors.border.focus} transition-colors`}
              placeholder="••••••••"
            />
            <p className="text-[10px] text-zinc-500 mt-1">Must be at least 8 characters with 1 number.</p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full ${theme.colors.accent.DEFAULT} font-medium py-2 rounded-md text-sm transition-colors disabled:opacity-50`}
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <div className={`text-center text-xs ${theme.colors.text.secondary}`}>
          Already have an account?{' '}
          <Link href="/login" className="text-white hover:underline">
            Sign in
          </Link>
        </div>

      </div>
    </div>
  );
}