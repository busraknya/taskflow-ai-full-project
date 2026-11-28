'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { getErrorMessage, type ApiErrorBody } from '@/lib/errors';
import { safeNextPath } from '@/lib/invitations';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [fullName, setFullName] = useState('');
  // Prefilled from an invitation link (?email=).
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/register', { fullName, email, password });
      const next = safeNextPath(searchParams.get('next'));
      router.push(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
    } catch (err) {
      setError(getErrorMessage((err as { response?: { data?: ApiErrorBody } }).response?.data));
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      description="You can create a workspace or accept an invitation next."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-accent hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Alert message={error} />
        <Field label="Full name">
          {(props) => <Input {...props} autoComplete="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />}
        </Field>
        <Field label="Email">
          {(props) => <Input {...props} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label="Password" hint="At least 8 characters, including a number.">
          {(props) => (
            <Input {...props} type="password" autoComplete="new-password" required minLength={8} pattern=".*\d.*" value={password} onChange={(e) => setPassword(e.target.value)} />
          )}
        </Field>
        <Button type="submit" variant="primary" loading={loading} className="mt-2 w-full">
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
