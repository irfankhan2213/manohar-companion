import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
import { formatINR } from '@saas/shared';
import { api } from '../../api/index.js';
import { useAppStore } from '../../app/store.js';
import { InsetGroup, Row } from '../../components/ui/InsetGroup.js';

export const ProfitAndLossScreen: React.FC = () => {
  const navigate = useNavigate();
  const { currentCompanyId } = useAppStore();

  const { data: pnl, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['profit-and-loss', currentCompanyId],
    queryFn: () => (api.reports?.profitAndLoss ? api.reports.profitAndLoss(currentCompanyId) : null),
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => api.companies.list(),
  });
  const currentCompany = companies.find((c) => c.id === currentCompanyId);

  const handlePrint = () => {
    window.print();
  };

  const isNetProfitPositive = (pnl?.incomeStatement?.netProfit ?? 0) >= 0;
  const isGrossProfitPositive = (pnl?.tradingAccount?.grossProfit ?? 0) >= 0;

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
            title="Print P&L"
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
          Profit &amp; Loss Statement
        </h1>
        <div className="text-footnote text-label-3 mt-1">
          {currentCompany?.name || pnl?.companyName || 'Company'} · For period ending {pnl?.period?.toDate || new Date().toISOString().slice(0, 10)}
        </div>
      </div>

      {isLoading || !pnl ? (
        <div className="p-12 text-center text-label-2 text-subhead animate-pulse">
          Loading Profit &amp; Loss Statement...
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-surface rounded-ios-card p-4 border border-separator/40 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-caption uppercase tracking-wider text-label-3 font-semibold">
                  Gross Profit
                </span>
                <div className="text-title-2 font-bold font-mono tabular-nums text-label mt-0.5">
                  {formatINR(Math.abs(pnl.tradingAccount?.grossProfit || 0))}
                  <span className="text-caption font-medium ml-1 text-label-3">
                    {isGrossProfitPositive ? 'Profit' : 'Loss'}
                  </span>
                </div>
              </div>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isGrossProfitPositive ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'}`}>
                {isGrossProfitPositive ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
              </div>
            </div>

            <div className="bg-surface rounded-ios-card p-4 border border-separator/40 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-caption uppercase tracking-wider text-label-3 font-semibold">
                  Net Profit (Bottom Line)
                </span>
                <div className="text-title-2 font-bold font-mono tabular-nums text-label mt-0.5">
                  {formatINR(Math.abs(pnl.incomeStatement?.netProfit || 0))}
                  <span className="text-caption font-medium ml-1 text-label-3">
                    {isNetProfitPositive ? 'Net Inflow' : 'Net Deficit'}
                  </span>
                </div>
              </div>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isNetProfitPositive ? 'bg-accent/10 text-accent' : 'bg-red-500/10 text-red-600'}`}>
                {isNetProfitPositive ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
              </div>
            </div>
          </div>

          {/* Trading Account Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Debit Side: Cost of Goods Sold */}
            <div className="flex flex-col gap-3">
              <h2 className="text-subhead font-bold uppercase tracking-wider text-label-2 px-1">
                Trading Debits (Expenses &amp; Stock)
              </h2>
              <InsetGroup>
                <Row
                  title="Opening Stock"
                  trailing={<span className="font-mono tabular-nums font-semibold">{formatINR(pnl.tradingAccount?.debits?.openingStock || 0)}</span>}
                />
                <Row
                  title="Purchase Accounts"
                  trailing={<span className="font-mono tabular-nums font-semibold">{formatINR(pnl.tradingAccount?.debits?.purchases || 0)}</span>}
                />
                <Row
                  title="Direct Expenses"
                  trailing={<span className="font-mono tabular-nums font-semibold">{formatINR(pnl.tradingAccount?.debits?.directExpenses || 0)}</span>}
                />
                <Row
                  title="Gross Profit c/o"
                  trailing={<span className="font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">{formatINR(Math.max(0, pnl.tradingAccount?.grossProfit || 0))}</span>}
                />
                <Row
                  title={<span className="font-bold text-label">Total Debits</span>}
                  trailing={<span className="font-mono tabular-nums font-bold text-label">{formatINR(pnl.tradingAccount?.debits?.total || 0)}</span>}
                />
              </InsetGroup>
            </div>

            {/* Credit Side: Revenue & Closing Stock */}
            <div className="flex flex-col gap-3">
              <h2 className="text-subhead font-bold uppercase tracking-wider text-label-2 px-1">
                Trading Credits (Sales &amp; Stock)
              </h2>
              <InsetGroup>
                <Row
                  title="Sales Accounts"
                  trailing={<span className="font-mono tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">{formatINR(pnl.tradingAccount?.credits?.sales || 0)}</span>}
                />
                <Row
                  title="Closing Stock"
                  trailing={<span className="font-mono tabular-nums font-semibold">{formatINR(pnl.tradingAccount?.credits?.closingStock || 0)}</span>}
                />
                <Row
                  title="Direct Incomes"
                  trailing={<span className="font-mono tabular-nums font-semibold">{formatINR(pnl.tradingAccount?.credits?.directIncomes || 0)}</span>}
                />
                <Row
                  title="Gross Loss c/o"
                  trailing={<span className="font-mono tabular-nums font-semibold text-label-3">{formatINR(pnl.tradingAccount?.grossProfit < 0 ? Math.abs(pnl.tradingAccount.grossProfit) : 0)}</span>}
                />
                <Row
                  title={<span className="font-bold text-label">Total Credits</span>}
                  trailing={<span className="font-mono tabular-nums font-bold text-label">{formatINR(pnl.tradingAccount?.credits?.total || 0)}</span>}
                />
              </InsetGroup>
            </div>
          </div>

          {/* Operating Income Statement */}
          <div className="flex flex-col gap-3">
            <h2 className="text-subhead font-bold uppercase tracking-wider text-label-2 px-1">
              Operating / Income Statement
            </h2>
            <InsetGroup>
              <Row
                title="Gross Profit b/f"
                trailing={<span className="font-mono tabular-nums font-semibold">{formatINR(pnl.incomeStatement?.grossProfit || 0)}</span>}
              />
              <Row
                title="Indirect Incomes"
                trailing={<span className="font-mono tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">{formatINR(pnl.incomeStatement?.indirectIncomes || 0)}</span>}
              />
              <Row
                title="Indirect Expenses"
                trailing={<span className="font-mono tabular-nums font-semibold text-red-500">{formatINR(pnl.incomeStatement?.indirectExpenses || 0)}</span>}
              />
              <Row
                title={<span className="font-bold text-headline text-label">Net Profit</span>}
                trailing={
                  <span className={`font-mono text-headline font-bold tabular-nums ${isNetProfitPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                    {formatINR(pnl.incomeStatement?.netProfit || 0)}
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
