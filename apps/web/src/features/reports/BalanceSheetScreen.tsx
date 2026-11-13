import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer, RefreshCw } from 'lucide-react';
import { formatINR } from '@saas/shared';
import { api } from '../../api/index.js';
import { useAppStore } from '../../app/store.js';
import { InsetGroup, Row } from '../../components/ui/InsetGroup.js';

export const BalanceSheetScreen: React.FC = () => {
  const navigate = useNavigate();
  const { currentCompanyId } = useAppStore();

  const { data: sheet, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['balance-sheet', currentCompanyId],
    queryFn: () => (api.reports?.balanceSheet ? api.reports.balanceSheet(currentCompanyId) : null),
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => api.companies.list(),
  });
  const currentCompany = companies.find((c) => c.id === currentCompanyId);

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
            title="Print Balance Sheet"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Screen Header */}
      <div className="mb-6">
        <div className="text-caption font-semibold uppercase tracking-wider text-accent">
          Financial Statement
        </div>
        <h1 className="text-title-1 font-bold text-label tracking-tight">
          Balance Sheet
        </h1>
        <div className="text-footnote text-label-3 mt-1">
          {currentCompany?.name || sheet?.companyName || 'Company'} · As at {sheet?.asOfDate || new Date().toISOString().slice(0, 10)}
        </div>
      </div>

      {isLoading || !sheet ? (
        <div className="p-12 text-center text-label-2 text-subhead animate-pulse">
          Loading Balance Sheet...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Column 1: Liabilities */}
          <div className="flex flex-col gap-4">
            <h2 className="text-subhead font-bold uppercase tracking-wider text-label-2 px-1">
              Liabilities
            </h2>

            <InsetGroup>
              <Row
                title="Capital Account"
                trailing={
                  <span className="font-mono tabular-nums font-semibold">
                    {formatINR(sheet.liabilities.capitalAccount || 0)}
                  </span>
                }
              />
              <Row
                title="Loans (Liability)"
                trailing={
                  <span className="font-mono tabular-nums font-semibold">
                    {formatINR(sheet.liabilities.loansLiability || 0)}
                  </span>
                }
              />
              <Row
                title={
                  <div>
                    <span className="font-semibold text-label">Current Liabilities</span>
                    <div className="text-[11px] text-label-3 mt-0.5 space-y-0.5 font-normal">
                      <div className="flex justify-between gap-4">
                        <span>Duties & Taxes:</span>
                        <span className="font-mono">{formatINR(sheet.liabilities.currentLiabilities.dutiesAndTaxes || 0)}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span>Sundry Creditors:</span>
                        <span className="font-mono font-medium text-emerald-600 dark:text-emerald-400">
                          {formatINR(sheet.liabilities.currentLiabilities.sundryCreditors || 0)} Cr
                        </span>
                      </div>
                    </div>
                  </div>
                }
                trailing={
                  <span className="font-mono tabular-nums font-semibold text-label">
                    {formatINR(sheet.liabilities.currentLiabilities.total || 0)}
                  </span>
                }
              />
              <Row
                title="Profit & Loss A/c"
                trailing={
                  <span className="font-mono tabular-nums font-semibold">
                    {formatINR(sheet.liabilities.profitAndLoss.total || 0)}
                  </span>
                }
              />
              <Row
                title={<span className="font-bold text-label">Total Liabilities</span>}
                trailing={
                  <span className="font-mono tabular-nums font-bold text-headline text-label">
                    {formatINR(sheet.liabilities.total || 0)}
                  </span>
                }
              />
            </InsetGroup>
          </div>

          {/* Column 2: Assets */}
          <div className="flex flex-col gap-4">
            <h2 className="text-subhead font-bold uppercase tracking-wider text-label-2 px-1">
              Assets
            </h2>

            <InsetGroup>
              {sheet.assets.fixedAssets > 0 && (
                <Row
                  title="Fixed Assets"
                  trailing={
                    <span className="font-mono tabular-nums font-semibold">
                      {formatINR(sheet.assets.fixedAssets)}
                    </span>
                  }
                />
              )}
              <Row
                title={
                  <div>
                    <span className="font-semibold text-label">Current Assets</span>
                    <div className="text-[11px] text-label-3 mt-0.5 space-y-0.5 font-normal">
                      <div className="flex justify-between gap-4">
                        <span>Closing Stock:</span>
                        <span className="font-mono">{formatINR(sheet.assets.currentAssets.closingStock || 0)}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span>Sundry Debtors:</span>
                        <span className="font-mono font-semibold text-label">
                          {formatINR(sheet.assets.currentAssets.sundryDebtors || 0)} Dr
                        </span>
                      </div>
                      {sheet.assets.currentAssets.cashInHand !== 0 && (
                        <div className="flex justify-between gap-4">
                          <span>Cash-in-Hand:</span>
                          <span className="font-mono">{formatINR(sheet.assets.currentAssets.cashInHand)}</span>
                        </div>
                      )}
                      {sheet.assets.currentAssets.bankAccounts !== 0 && (
                        <div className="flex justify-between gap-4">
                          <span>Bank Accounts:</span>
                          <span className="font-mono">{formatINR(sheet.assets.currentAssets.bankAccounts)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                }
                trailing={
                  <span className="font-mono tabular-nums font-semibold text-label">
                    {formatINR(sheet.assets.currentAssets.total || 0)}
                  </span>
                }
              />
              <Row
                title={<span className="font-bold text-label">Total Assets</span>}
                trailing={
                  <span className="font-mono tabular-nums font-bold text-headline text-label">
                    {formatINR(sheet.assets.total || 0)}
                  </span>
                }
              />
            </InsetGroup>
          </div>
        </div>
      )}
    </div>
  );
};
