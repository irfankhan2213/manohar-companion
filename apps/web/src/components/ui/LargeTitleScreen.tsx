import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { CompanyMenu } from './CompanyMenu.js';
import { NotificationBell } from './NotificationBell.js';
import { UserAuthMenu } from './UserAuthMenu.js';

interface LargeTitleScreenProps {
  title: string;
  subtitle?: React.ReactNode;
  showBack?: boolean;
  onBack?: () => void;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

export const LargeTitleScreen: React.FC<LargeTitleScreenProps> = ({
  title,
  subtitle,
  showBack = false,
  onBack,
  headerAction,
  children,
  className,
  contentClassName,
}) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  return (
    <div className={clsx('flex flex-col w-full min-h-screen bg-bg', className)}>
      {/* Top Floating App Bar */}
      <header className="sticky top-0 z-40 w-full ios-nav-blur pt-safe">
        <div className="h-14 px-5 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {showBack && (
              <button
                type="button"
                onClick={handleBack}
                aria-label="Back"
                className="flex items-center gap-1 text-accent font-semibold text-headline -ml-2.5 px-2 py-1 rounded-lg active:opacity-60 transition-opacity"
              >
                <ChevronLeft className="w-6 h-6 stroke-[2.2]" />
                <span className="hidden sm:inline">Back</span>
              </button>
            )}
            <CompanyMenu />
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <NotificationBell />
            <UserAuthMenu />
            {headerAction}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className={clsx('flex-1 w-full mx-auto px-5 pt-3 pb-32', contentClassName ?? 'max-w-xl')}>
        {/* Large Title Area */}
        <div className="flex flex-col mb-4">
          <div className="flex items-center justify-between">
            <h1 className="text-large-title tracking-tight text-label font-bold">
              {title}
            </h1>
            {subtitle && (
              <div className="shrink-0">{subtitle}</div>
            )}
          </div>
        </div>

        {/* Child Views */}
        <div className="flex flex-col gap-6">{children}</div>
      </main>
    </div>
  );
};
