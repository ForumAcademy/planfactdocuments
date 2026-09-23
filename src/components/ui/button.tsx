import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md pb-0.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-brand text-white hover:bg-brand-dark',
        outline: 'border border-line bg-white text-ink hover:bg-surface',
        ghost: 'text-ink hover:bg-surface',
        danger: 'bg-status-red text-white hover:bg-red-700',
        link: 'text-brand underline-offset-4 hover:underline',
        dark: 'bg-brand-dark text-white hover:bg-black',
      },
      size: {
        default: 'h-9 px-3.5',
        // Все кнопки с текстом — одного размера (36 px); sm и lg оставлены для совместимости
        sm: 'h-9 px-3.5',
        lg: 'h-9 px-3.5',
        icon: 'h-9 w-9 pb-0',
        iconSm: 'h-7 w-7 pb-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
