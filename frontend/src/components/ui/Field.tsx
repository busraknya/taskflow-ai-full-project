import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

const CONTROL =
  'w-full rounded-control border border-line bg-surface text-sm text-fg placeholder:text-fg-subtle transition-colors ' +
  'hover:border-line-strong focus:border-accent focus:outline-none focus-visible:outline-none focus:ring-3 focus:ring-accent-soft ' +
  'disabled:opacity-60 aria-invalid:border-danger';

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  /** Renders the label for screen readers only. */
  hideLabel?: boolean;
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode;
}

/** Label, control and help text wired together for assistive technology. */
export function Field({ label, hint, error, hideLabel, children }: FieldProps) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error || hint;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={cn('text-[13px] font-medium text-fg', hideLabel && 'sr-only')}>
        {label}
      </label>
      {children({ id, 'aria-describedby': note ? noteId : undefined, 'aria-invalid': error ? true : undefined })}
      {note && (
        <p id={noteId} className={cn('text-xs', error ? 'text-danger' : 'text-fg-muted')}>
          {note}
        </p>
      )}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(CONTROL, 'h-9 px-3', className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, rows = 3, ...props },
  ref,
) {
  return <textarea ref={ref} rows={rows} className={cn(CONTROL, 'resize-y px-3 py-2 leading-relaxed', className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <div className="relative">
      <select ref={ref} className={cn(CONTROL, 'h-9 appearance-none pr-8 pl-3', className)} {...props}>
        {children}
      </select>
      <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-fg-subtle" />
    </div>
  );
});
