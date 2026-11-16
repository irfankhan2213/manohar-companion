import React from 'react';
import clsx from 'clsx';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'muted';
  size?: 'default' | 'sm';
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  variant = 'default',
  size = 'default',
  children,
  ...props
}) => {
  const baseClasses =
    'inline-flex items-center justify-center font-medium rounded-full transition-colors select-none shrink-0';

  const sizeClasses =
    size === 'sm'
      ? 'px-1.5 py-0.5 text-[10px] leading-tight font-semibold'
      : 'px-2.5 py-0.5 text-caption font-semibold';

  const variantClasses = {
    default: 'bg-accent text-white shadow-xs',
    secondary: 'bg-accent-soft text-accent border border-accent/20',
    destructive: 'bg-danger/10 text-danger border border-danger/20',
    outline: 'bg-surface text-label border border-separator/60',
    success: 'bg-ok/10 text-ok border border-ok/20',
    warning: 'bg-warn/10 text-warn border border-warn/20',
    muted: 'bg-fill text-label-2 border border-separator/40',
  }[variant];

  return (
    <span
      className={clsx(baseClasses, sizeClasses, variantClasses, className)}
      {...props}
    >
      {children}
    </span>
  );
};
