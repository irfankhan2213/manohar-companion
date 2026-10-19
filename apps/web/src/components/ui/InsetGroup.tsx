import React from 'react';
import clsx from 'clsx';
import { ChevronRight } from 'lucide-react';

export interface InsetGroupProps {
  title?: string;
  actionText?: string;
  onActionClick?: () => void;
  children: React.ReactNode;
  className?: string;
}

export const InsetGroup: React.FC<InsetGroupProps> = ({
  title,
  actionText,
  onActionClick,
  children,
  className,
}) => {
  return (
    <div className={clsx('flex flex-col w-full', className)}>
      {(title || actionText) && (
        <div className="flex items-center justify-between px-1 mb-2">
          {title && (
            <span className="text-footnote font-semibold uppercase tracking-wider text-label-2">
              {title}
            </span>
          )}
          {actionText && (
            <button
              type="button"
              onClick={onActionClick}
              className="text-subhead font-semibold text-accent hover:opacity-80 active:opacity-60 transition-opacity"
            >
              {actionText}
            </button>
          )}
        </div>
      )}
      <div className="bg-surface rounded-ios-card shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden divide-y divide-separator/40">
        {children}
      </div>
    </div>
  );
};

export interface RowProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  trailingSubtitle?: React.ReactNode;
  chevron?: boolean;
  onClick?: () => void;
  className?: string;
}

export const Row: React.FC<RowProps> = ({
  title,
  subtitle,
  leading,
  trailing,
  trailingSubtitle,
  chevron = false,
  onClick,
  className,
}) => {
  const isClickable = Boolean(onClick);

  return (
    <div
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={clsx(
        'w-full min-h-[58px] px-3.5 py-3 flex items-center justify-between text-left transition-colors duration-150 select-none gap-2',
        isClickable && 'hover:bg-fill/40 active:bg-fill cursor-pointer',
        className
      )}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {leading && <div className="shrink-0">{leading}</div>}
        <div className="flex flex-col min-w-0 flex-1">
          <div className="text-headline text-label font-semibold leading-snug break-words">
            {title}
          </div>
          {subtitle && (
            <div className="text-subhead text-label-2 leading-tight mt-0.5 break-words">
              {subtitle}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0 ml-1">
        {(trailing || trailingSubtitle) && (
          <div className="flex flex-col items-end text-right">
            {trailing && (
              <div className="text-headline font-semibold text-label">
                {trailing}
              </div>
            )}
            {trailingSubtitle && (
              <div className="text-footnote mt-0.5">
                {trailingSubtitle}
              </div>
            )}
          </div>
        )}
        {chevron && (
          <ChevronRight className="w-4 h-4 text-label-3 shrink-0" />
        )}
      </div>
    </div>
  );
};
