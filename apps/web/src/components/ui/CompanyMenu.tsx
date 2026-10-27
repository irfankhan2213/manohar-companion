import React, { useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../../app/store.js';
import { api } from '../../api/index.js';

export const CompanyMenu: React.FC = () => {
  const { currentCompanyId, setCompanyId, currentUser } = useAppStore();
  const [open, setOpen] = useState(false);

  const { data: rawCompanies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => api.companies.list(),
  });

  const companies =
    currentUser && currentUser.companyIds !== 'all' && Array.isArray(currentUser.companyIds)
      ? rawCompanies.filter((c) => currentUser.companyIds.includes(c.id))
      : rawCompanies;

  const currentCompany =
    currentCompanyId === 'all'
      ? { name: 'All companies', agentStatus: companies.some((c) => c.agentStatus === 'online') ? 'online' : 'offline' }
      : companies.find((c) => c.id === currentCompanyId) ?? {
          name: companies[0]?.name || 'My Company',
          agentStatus: companies[0]?.agentStatus || 'offline',
        };

  const isOnline = currentCompany.agentStatus === 'online';
  const syncLabel = isOnline ? 'Tally Online' : 'Tally Offline';
  const dotColor = isOnline
    ? 'bg-ok shadow-[0_0_5px_rgba(46,125,79,0.8)]'
    : 'bg-label-3/60';

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Select company"
          className="flex items-center gap-2 h-10 px-2.5 -ml-1.5 rounded-xl text-left bg-surface/80 border border-separator/40 shadow-sm active:scale-[0.98] transition-all"
        >
          <div className="flex flex-col">
            <div className="flex items-center gap-1">
              <span className="text-headline text-label font-semibold leading-tight tracking-tight max-w-[170px] truncate">
                {currentCompany.name}
              </span>
              <ChevronDown className="w-4 h-4 text-label-2 shrink-0" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
              <span className="text-caption text-label-2 font-medium">
                {syncLabel}
              </span>
            </div>
          </div>
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={8}
          className="z-50 min-w-[220px] bg-surface rounded-ios-card p-1.5 shadow-[0_12px_36px_rgba(0,0,0,0.12)] border border-separator/50 divide-y divide-separator/30 animate-in fade-in-50 zoom-in-95"
        >
          <div className="py-1">
            {companies.map((company) => {
              const isSelected = currentCompanyId === company.id;
              return (
                <DropdownMenu.Item
                  key={company.id}
                  onClick={() => setCompanyId(company.id)}
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg text-subhead font-semibold text-label hover:bg-fill/60 cursor-pointer select-none outline-none"
                >
                  <div className="flex flex-col">
                    <span>{company.name}</span>
                    <span className="text-footnote font-normal text-label-2">
                      FY {company.financialYear}
                    </span>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-accent stroke-[2.5]" />}
                </DropdownMenu.Item>
              );
            })}
          </div>

          {(!currentUser || currentUser.companyIds === 'all') && (
            <div className="pt-1">
              <DropdownMenu.Item
                onClick={() => setCompanyId('all')}
                className="flex items-center justify-between px-3 py-2.5 rounded-lg text-subhead font-semibold text-label hover:bg-fill/60 cursor-pointer select-none outline-none"
              >
                <div className="flex flex-col">
                  <span>All companies</span>
                  <span className="text-footnote font-normal text-label-2">
                    Combined receivables & stock
                  </span>
                </div>
                {currentCompanyId === 'all' && (
                  <Check className="w-4 h-4 text-accent stroke-[2.5]" />
                )}
              </DropdownMenu.Item>
            </div>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};
