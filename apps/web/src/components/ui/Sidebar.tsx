import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  Home,
  Wallet,
  Package,
  BookOpen,
  FileSpreadsheet,
  BellRing,
  Activity,
  Settings,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { PRODUCT_CONFIG } from '../../config/product.js';

export const Sidebar: React.FC = () => {
  const { t } = useTranslation();

  const links = [
    { to: '/', label: t('nav.home', 'Home'), icon: Home, end: true },
    { to: '/collections', label: t('nav.collections', 'Collections'), icon: Wallet },
    { to: '/stock', label: t('nav.stock', 'Stock'), icon: Package },
    { to: '/challans', label: t('nav.challans', 'Challans'), icon: FileSpreadsheet },
    { to: '/notebook', label: t('nav.notebook', 'Notebook'), icon: BookOpen },
    { to: '/reminders', label: t('nav.reminders', 'Reminders'), icon: BellRing },
    { to: '/activity', label: t('nav.activity', 'Activity'), icon: Activity },
    { to: '/settings', label: t('nav.settings', 'Settings'), icon: Settings },
  ];

  return (
    <aside className="hidden md:flex flex-col w-60 border-r border-separator bg-surface h-screen sticky top-0 shrink-0 select-none">
      <div className="h-16 px-5 flex items-center border-b border-separator/40 gap-3">
        <div className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center font-bold text-headline shadow-sm">
          M
        </div>
        <div className="flex flex-col">
          <span className="text-headline font-bold text-label leading-tight">
            {PRODUCT_CONFIG.shortName}
          </span>
          <span className="text-caption text-label-2">Tally Companion</span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 flex flex-col gap-1 overflow-y-auto">
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-subhead font-semibold transition-colors',
                  isActive
                    ? 'bg-accent-soft text-accent'
                    : 'text-label-2 hover:bg-fill/50 hover:text-label'
                )
              }
            >
              <Icon className="w-5 h-5 stroke-[1.8]" />
              <span>{link.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="p-4 border-t border-separator/40 flex items-center justify-between text-footnote text-label-2">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-ok" />
          <span>Office PC Online</span>
        </div>
        <span>v1.4.2</span>
      </div>
    </aside>
  );
};
