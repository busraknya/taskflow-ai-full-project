'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { getErrorMessage, type ApiErrorBody } from '@/lib/errors';
import { postLoginPath } from '@/lib/invitations';
import { useAuthStore } from '@/store/useAuthStore';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      setAuth(res.data.user, res.data.accessToken);
      // Returns to a pending invitation or a safe ?next= path.
      router.push(postLoginPath(window.location.search));
    } catch (err) {
      setError(getErrorMessage((err as { response?: { data?: ApiErrorBody } }).response?.data));
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Sign in"
      description="Welcome back. Sign in to your workspaces."
      footer={
        <>
          New to TaskFlow?{' '}
          <Link href="/register" className="font-medium text-accent hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Alert message={error} />
        <Field label="Email">
          {(props) => <Input {...props} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label="Password">
          {(props) => <Input {...props} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Button type="submit" variant="primary" loading={loading} className="mt-2 w-full">
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
