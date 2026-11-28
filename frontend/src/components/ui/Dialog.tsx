'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './Button';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  /** Buttons shown at the bottom right. */
  footer?: ReactNode;
  /** `sheet` slides in from the right for detail views. */
  variant?: 'dialog' | 'sheet';
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-xl' };

/**
 * Modal surface: closes on Escape and backdrop click, keeps focus inside and
 * returns it to the element that opened it.
 */
export function Dialog({ open, onClose, title, description, children, footer, variant = 'dialog', size = 'md' }: DialogProps) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    const first = focusables().find((el) => el.dataset.autofocus !== undefined) ?? focusables()[1] ?? focusables()[0];
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      } else if (e.key === 'Tab') {
        const items = focusables();
        if (items.length === 0) return;
        const [head, tail] = [items[0], items[items.length - 1]];
        if (e.shiftKey && document.activeElement === head) {
          e.preventDefault();
          tail.focus();
        } else if (!e.shiftKey && document.activeElement === tail) {
          e.preventDefault();
          head.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const sheet = variant === 'sheet';
  return createPortal(
    <div className={cn('fixed inset-0 z-50 flex bg-overlay', sheet ? 'justify-end' : 'items-center justify-center p-4')} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          'flex flex-col bg-surface shadow-pop',
          sheet
            ? 'h-full w-full max-w-xl border-l border-line animate-[slide-in_180ms_ease-out]'
            : cn('max-h-[calc(100vh-2rem)] w-full rounded-card border border-line animate-[pop-in_140ms_ease-out]', SIZES[size]),
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0 space-y-0.5">
            <h2 id={titleId} className="text-base font-semibold text-fg">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="text-[13px] text-fg-muted">
                {description}
              </p>
            )}
          </div>
          <Button variant="ghost" size="sm" icon aria-label="Close" onClick={onClose} className="-mr-1.5 -mt-1">
            <X size={16} />
          </Button>
        </div>
        {children != null && <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>}
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
