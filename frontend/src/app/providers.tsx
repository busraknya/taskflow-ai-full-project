'use client';

import type { ReactNode } from 'react';
import { FeedbackProvider } from '@/components/ui/Feedback';

export function Providers({ children }: { children: ReactNode }) {
  return <FeedbackProvider>{children}</FeedbackProvider>;
}
