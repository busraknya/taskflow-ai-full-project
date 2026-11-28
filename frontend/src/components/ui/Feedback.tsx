'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './Button';
import { Dialog } from './Dialog';

type ToastTone = 'success' | 'error';
interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel: string;
  /** Destructive actions get the danger button. */
  destructive?: boolean;
}

interface FeedbackApi {
  toast: (message: string, tone?: ToastTone) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackApi | null>(null);

export function useFeedback(): FeedbackApi {
  const api = useContext(FeedbackContext);
  if (!api) throw new Error('useFeedback must be used inside <FeedbackProvider>');
  return api;
}

/** In-app toasts and confirmation dialogs (replaces window.alert/confirm). */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const toast = useCallback((message: string, tone: ToastTone = 'success') => {
    const id = ++nextId.current;
    setToasts((all) => [...all.slice(-2), { id, message, tone }]);
  }, []);
  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...options, resolve })),
    [],
  );
  const settle = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((t) => (
          <Toast key={t.id} item={t} onDismiss={dismiss} />
        ))}
      </div>
      <Dialog
        open={pending !== null}
        onClose={() => settle(false)}
        title={pending?.title ?? ''}
        description={pending?.description}
        size="sm"
        footer={
          <>
            <Button onClick={() => settle(false)}>Cancel</Button>
            <Button data-autofocus variant={pending?.destructive ? 'danger' : 'primary'} onClick={() => settle(true)}>
              {pending?.confirmLabel}
            </Button>
          </>
        }
      />
    </FeedbackContext.Provider>
  );
}

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(item.id), item.tone === 'error' ? 6000 : 3500);
    return () => clearTimeout(timer);
  }, [item, onDismiss]);
  const Icon = item.tone === 'error' ? AlertCircle : CheckCircle2;
  return (
    <div
      role={item.tone === 'error' ? 'alert' : 'status'}
      className="pointer-events-auto flex items-start gap-2.5 rounded-card border border-line bg-surface px-3.5 py-3 text-[13px] text-fg shadow-pop animate-[pop-in_160ms_ease-out]"
    >
      <Icon size={16} aria-hidden="true" className={cn('mt-px shrink-0', item.tone === 'error' ? 'text-danger' : 'text-success')} />
      <span className="flex-1">{item.message}</span>
      <button onClick={() => onDismiss(item.id)} aria-label="Dismiss" className="text-fg-subtle hover:text-fg">
        <X size={14} />
      </button>
    </div>
  );
}
