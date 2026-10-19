import React from 'react';
import clsx from 'clsx';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'tinted' | 'plain';
  fullWidth?: boolean;
  size?: 'default' | 'small';
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  fullWidth = false,
  size = 'default',
  className,
  disabled,
  ...props
}) => {
  const baseClasses =
    'inline-flex items-center justify-center font-headline rounded-ios-card transition-all duration-200 select-none active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none';

  const sizeClasses =
    size === 'default'
      ? 'h-[50px] px-5 text-headline'
      : 'h-[38px] px-3.5 text-footnote font-semibold';

  const variantClasses = {
    primary:
      'bg-accent text-white shadow-sm hover:brightness-105 active:brightness-95',
    tinted:
      'bg-accent-soft text-accent hover:bg-opacity-80 active:bg-opacity-90',
    plain:
      'bg-transparent text-accent hover:opacity-80 active:opacity-60 px-2 h-auto',
  }[variant];

  return (
    <button
      className={clsx(
        baseClasses,
        sizeClasses,
        variantClasses,
        fullWidth && 'w-full',
        className
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
};
