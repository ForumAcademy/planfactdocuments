import * as React from 'react';
import { cn } from '@/lib/utils';

export const inputClass =
  'h-9 w-full rounded-md border border-line bg-white px-3 text-sm text-ink placeholder:text-status-gray focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:bg-surface disabled:opacity-70';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(inputClass, className)} {...props} />
));
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(inputClass, 'h-auto min-h-[72px] py-2', className)}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

// Своя стрелка вместо стандартной — отступ 12 px от правого края (класс в globals.css)
const selectClass = 'select-chevron cursor-pointer appearance-none pr-10';

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn(inputClass, selectClass, className)} {...props} />
));
Select.displayName = 'Select';

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn('mb-1 block text-xs font-medium text-ink/80', className)} {...props} />
  );
}

export function Field({
  label,
  error,
  hint,
  children,
  htmlFor,
  className,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-status-gray">{hint}</p>}
      {error && <p className="mt-1 text-xs text-status-red">{error}</p>}
    </div>
  );
}
