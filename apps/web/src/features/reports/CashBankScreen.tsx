import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, RefreshCw, Printer, Landmark, Wallet } from 'lucide-react';
import { formatINR } from '@saas/shared';
import { api } from '../../api/index.js';
import { useAppStore } from '../../app/store.js';
import { InsetGroup, Row } from '../../components/ui/InsetGroup.js';

export const CashBankScreen: React.FC = () => {
  const navigate = useNavigate();
  const { currentCompanyId } = useAppStore();

  const { data: cb, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['cash-bank', currentCompanyId],
    queryFn: () => (api.reports?.cashBank ? api.reports.cashBank(currentCompanyId) : null),
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => api.companies.list(),
  });
  const currentCompany = companies.find((c) => c.id === currentCompanyId);

  const handlePrint = () => {
    window.print();
  };

  const cashAccounts = (cb?.accounts || []).filter((a: any) => a.type === 'cash');
  const bankAccounts = (cb?.accounts || []).filter((a: any) => a.type === 'bank');

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Top Navigation */}
      <div className="flex items-center justify-between mb-4">
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
            title="Print Summary"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Screen Title */}
      <div className="mb-6">
        <div className="text-caption font-semibold uppercase tracking-wider text-accent">
          Liquidity &amp; Treasury
        </div>
        <h1 className="text-title-1 font-bold text-label tracking-tight">
          Cash &amp; Bank Summary
        </h1>
        <div className="text-footnote text-label-3 mt-0.5">
          {currentCompany?.name || 'Company'} · Real-time ledger balances as at {cb?.asOfDate || new Date().toISOString().slice(0, 10)}
        </div>
      </div>

      {/* Key Balances Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-surface rounded-ios-card p-4 border border-separator/40 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-caption uppercase tracking-wider text-label-3 font-semibold">
              Cash-in-Hand Total
            </span>
            <div className="text-title-2 font-bold font-mono tabular-nums text-label mt-0.5">
              {formatINR(cb?.totalCash || 0)}
            </div>
          </div>
          <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center">
            <Wallet className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-surface rounded-ios-card p-4 border border-separator/40 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-caption uppercase tracking-wider text-label-3 font-semibold">
              Bank Accounts Total
            </span>
            <div className="text-title-2 font-bold font-mono tabular-nums text-label mt-0.5">
              {formatINR(cb?.totalBank || 0)}
            </div>
          </div>
          <div className="w-10 h-10 rounded-full bg-accent/10 text-accent flex items-center justify-center">
            <Landmark className="w-5 h-5" />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-label-2 text-subhead animate-pulse">
          Loading Cash &amp; Bank accounts...
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Bank Accounts Section */}
          <div className="flex flex-col gap-3">
            <h2 className="text-subhead font-bold uppercase tracking-wider text-label-2 px-1">
              Bank Accounts ({bankAccounts.length})
            </h2>
            {bankAccounts.length === 0 ? (
              <div className="p-6 text-center bg-surface rounded-ios-card border border-separator/40 text-label-3 text-footnote">
                No bank ledgers synchronized.
              </div>
            ) : (
              <InsetGroup>
                {bankAccounts.map((a: any) => (
                  <Row
                    key={a.id}
                    title={<span className="font-semibold text-label">{a.name}</span>}
                    subtitle={a.group}
                    trailing={
                      <span className={`font-mono tabular-nums font-bold ${a.closingBalance >= 0 ? 'text-label' : 'text-red-500'}`}>
                        {formatINR(a.closingBalance)}
                      </span>
                    }
                  />
                ))}
              </InsetGroup>
            )}
          </div>

          {/* Cash Accounts Section */}
          <div className="flex flex-col gap-3">
            <h2 className="text-subhead font-bold uppercase tracking-wider text-label-2 px-1">
              Cash Ledgers ({cashAccounts.length})
            </h2>
            {cashAccounts.length === 0 ? (
              <div className="p-6 text-center bg-surface rounded-ios-card border border-separator/40 text-label-3 text-footnote">
                No cash ledgers synchronized.
              </div>
            ) : (
              <InsetGroup>
                {cashAccounts.map((a: any) => (
                  <Row
                    key={a.id}
                    title={<span className="font-semibold text-label">{a.name}</span>}
                    subtitle={a.group}
                    trailing={
                      <span className={`font-mono tabular-nums font-bold ${a.closingBalance >= 0 ? 'text-label' : 'text-red-500'}`}>
                        {formatINR(a.closingBalance)}
                      </span>
                    }
                  />
                ))}
              </InsetGroup>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
