import React from 'react';
import { formatINR, Paise } from '@saas/shared';
import clsx from 'clsx';

interface MoneyProps {
  paise: Paise;
  size?: 'hero' | 'large' | 'regular' | 'small';
  showDecimals?: boolean;
  drCr?: boolean;
  className?: string;
}

export const Money: React.FC<MoneyProps> = ({
  paise,
  size = 'regular',
  showDecimals = false,
  drCr = false,
  className,
}) => {
  const formatted = formatINR(paise, { showDecimals, drCr, symbol: true });

  const sizeClasses = {
    hero: 'text-hero-num tracking-tight font-semibold',
    large: 'text-title font-semibold',
    regular: 'text-headline font-semibold',
    small: 'text-footnote font-medium',
  }[size];

  return (
    <span className={clsx('tabular-nums inline-flex items-baseline', sizeClasses, className)}>
      {formatted}
    </span>
  );
};
