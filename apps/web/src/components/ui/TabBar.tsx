import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  Home,
  Wallet,
  FileSpreadsheet,
  CheckSquare,
  MoreHorizontal,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';

export const TabBar: React.FC = () => {
  const { t } = useTranslation();

  const tabs = [
    { to: '/', label: t('nav.home', 'Home'), icon: Home, end: true },
    { to: '/challans', label: t('nav.challans', 'Challans'), icon: FileSpreadsheet },
    { to: '/tasks', label: t('nav.tasks', 'Tasks'), icon: CheckSquare },
    { to: '/collections', label: t('nav.collections', 'Collections'), icon: Wallet },
    { to: '/more', label: t('nav.more', 'More'), icon: MoreHorizontal },
  ];

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 md:hidden ios-tab-blur pb-safe">
      <div className="h-[56px] max-w-md mx-auto px-2 flex items-center justify-around">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                clsx(
                  'flex flex-col items-center justify-center flex-1 h-full py-1 transition-colors select-none active:scale-95',
                  isActive ? 'text-accent font-semibold' : 'text-label-3 hover:text-label-2'
                )
              }
            >
              <Icon className="w-5 h-5 stroke-[1.8]" />
              <span className="text-caption mt-1 leading-none">
                {tab.label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};
