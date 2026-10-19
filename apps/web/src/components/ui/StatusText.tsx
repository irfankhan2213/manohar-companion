import React from 'react';
import clsx from 'clsx';

export type StatusVariant = 'danger' | 'warn' | 'ok' | 'neutral';

interface StatusTextProps {
  text: string;
  variant?: StatusVariant;
  dot?: boolean;
  className?: string;
}

export const StatusText: React.FC<StatusTextProps> = ({
  text,
  variant = 'neutral',
  dot = true,
  className,
}) => {
  const colorMap = {
    danger: {
      text: 'text-danger',
      dot: 'bg-danger',
    },
    warn: {
      text: 'text-warn',
      dot: 'bg-warn',
    },
    ok: {
      text: 'text-ok',
      dot: 'bg-ok',
    },
    neutral: {
      text: 'text-label-2',
      dot: 'bg-label-3',
    },
  }[variant];

  return (
    <span className={clsx('inline-flex items-center gap-1.5 text-footnote font-medium', colorMap.text, className)}>
      {dot && <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', colorMap.dot)} />}
      <span>{text}</span>
    </span>
  );
};
