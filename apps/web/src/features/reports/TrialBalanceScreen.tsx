import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { formatINR } from '@saas/shared';
import { api } from '../../api/index.js';
import { useAppStore } from '../../app/store.js';

export const TrialBalanceScreen: React.FC = () => {
  const navigate = useNavigate();
  const { currentCompanyId } = useAppStore();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const { data: tb, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['trial-balance', currentCompanyId],
    queryFn: () => (api.reports?.trialBalance ? api.reports.trialBalance(currentCompanyId) : null),
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => api.companies.list(),
  });
  const currentCompany = companies.find((c) => c.id === currentCompanyId);

  const toggleGroup = (groupName: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupName]: !prev[groupName],
    }));
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Top Navigation */}
      <div className="flex items-center justify-between mb-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-label-2 hover:text-label font-medium text-subhead transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="w-9 h-9 rounded-full bg-surface border border-separator/40 flex items-center justify-center text-label-2 hover:text-label transition-all"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="w-9 h-9 rounded-full bg-surface border border-separator/40 flex items-center justify-center text-label-2 hover:text-label transition-all"
            title="Print Trial Balance"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Screen Header */}
      <div className="mb-6">
        <div className="text-caption font-semibold uppercase tracking-wider text-accent">
          Accounting Statement
        </div>
        <h1 className="text-title-1 font-bold text-label tracking-tight">
          Trial Balance
        </h1>
        <div className="text-footnote text-label-3 mt-1">
          {currentCompany?.name || tb?.companyName || 'Company'} · As at {tb?.asOfDate || new Date().toISOString().slice(0, 10)}
        </div>
      </div>

      {isLoading || !tb ? (
        <div className="p-12 text-center text-label-2 text-subhead animate-pulse">
          Loading Trial Balance...
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Header Balancing Banner */}
          <div className="bg-surface rounded-ios-card p-4 border border-separator/40 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-caption uppercase tracking-wider text-label-3 font-semibold">
                Debit Total
              </span>
              <div className="text-title-2 font-bold font-mono tabular-nums text-label mt-0.5">
                {formatINR(tb.grandTotalDebit || 0)} Dr
              </div>
            </div>
            <div className="text-right">
              <span className="text-caption uppercase tracking-wider text-label-3 font-semibold">
                Credit Total
              </span>
              <div className="text-title-2 font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5">
                {formatINR(tb.grandTotalCredit || 0)} Cr
              </div>
            </div>
          </div>

          {/* Group Hierarchy Tree */}
          <div className="flex flex-col gap-3">
            <h2 className="text-subhead font-bold uppercase tracking-wider text-label-2 px-1">
              Groups &amp; Ledgers
            </h2>

            <div className="flex flex-col gap-3">
              {(tb.groups || []).map((grp: any) => {
                const isExpanded = expandedGroups[grp.groupName] ?? false;
                return (
                  <div key={grp.groupName} className="bg-surface rounded-ios-card border border-separator/40 overflow-hidden shadow-sm">
                    {/* Group Header Row */}
                    <button
                      type="button"
                      onClick={() => toggleGroup(grp.groupName)}
                      className="w-full flex items-center justify-between p-3.5 hover:bg-fill/40 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-label-3" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-label-3" />
                        )}
                        <span className="font-semibold text-label">{grp.groupName}</span>
                        <span className="text-caption text-label-3">({grp.ledgers?.length || 0})</span>
                      </div>
                      <div className="flex items-center gap-4 font-mono text-footnote tabular-nums">
                        <span className="font-semibold text-label">
                          {grp.totalDebit > 0 ? `${formatINR(grp.totalDebit)} Dr` : '—'}
                        </span>
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          {grp.totalCredit > 0 ? `${formatINR(grp.totalCredit)} Cr` : '—'}
                        </span>
                      </div>
                    </button>

                    {/* Expanded Ledgers List */}
                    {isExpanded && (
                      <div className="border-t border-separator/30 bg-fill/20 px-4 py-2 flex flex-col divide-y divide-separator/20">
                        {grp.ledgers?.map((led: any) => (
                          <div key={led.id} className="py-2 flex items-center justify-between text-footnote">
                            <span className="text-label-2 font-medium">{led.name}</span>
                            <div className="flex items-center gap-4 font-mono tabular-nums">
                              <span className="text-label">
                                {led.debit > 0 ? `${formatINR(led.debit)} Dr` : '—'}
                              </span>
                              <span className="text-emerald-600 dark:text-emerald-400">
                                {led.credit > 0 ? `${formatINR(led.credit)} Cr` : '—'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
