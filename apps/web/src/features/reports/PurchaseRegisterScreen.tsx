import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, RefreshCw, Printer, TrendingDown } from 'lucide-react';
import { formatINR } from '@saas/shared';
import { api } from '../../api/index.js';
import { useAppStore } from '../../app/store.js';
import { InsetGroup, Row } from '../../components/ui/InsetGroup.js';

export const PurchaseRegisterScreen: React.FC = () => {
  const navigate = useNavigate();
  const { currentCompanyId } = useAppStore();
  const [year] = useState('2026');

  const { data: reg, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['purchase-register', currentCompanyId, year],
    queryFn: () => (api.reports?.purchaseRegister ? api.reports.purchaseRegister(currentCompanyId, year) : null),
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
            title="Print Register"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Screen Title */}
      <div className="mb-6">
        <div className="text-caption font-semibold uppercase tracking-wider text-accent">
          Procurement Register
        </div>
        <h1 className="text-title-1 font-bold text-label tracking-tight">
          Purchase Register
        </h1>
        <div className="text-footnote text-label-3 mt-0.5">
          {currentCompany?.name || 'Company'} · Monthly procurement volume for FY {reg?.financialYear || `${year}-${Number(year) + 1}`}
        </div>
      </div>

      {/* Annual Summary Card */}
      <div className="bg-surface rounded-ios-card p-5 border border-separator/40 shadow-sm mb-6 flex items-center justify-between">
        <div>
          <span className="text-caption uppercase tracking-wider text-label-3 font-semibold">
            Total Annual Purchases
          </span>
          <div className="text-title-1 font-bold font-mono tabular-nums text-label mt-0.5">
            {formatINR(reg?.grandTotal || 0)}
          </div>
        </div>
        <div className="w-12 h-12 rounded-full bg-accent/10 text-accent flex items-center justify-center">
          <TrendingDown className="w-6 h-6" />
        </div>
      </div>

      {/* Monthly Breakdown List */}
      {isLoading ? (
        <div className="p-12 text-center text-label-2 text-subhead animate-pulse">
          Loading Purchase Register...
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <h2 className="text-subhead font-bold uppercase tracking-wider text-label-2 px-1">
            Monthly Breakdown
          </h2>
          <InsetGroup>
            {(reg?.months || []).map((m: any) => (
              <Row
                key={m.key}
                title={
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-label">{m.label}</span>
                    {m.count > 0 && (
                      <span className="text-[11px] text-label-3">({m.count} vouchers)</span>
                    )}
                  </div>
                }
                trailing={
                  <span className={`font-mono tabular-nums font-semibold ${m.total > 0 ? 'text-label font-bold' : 'text-label-3'}`}>
                    {m.total > 0 ? formatINR(m.total) : '—'}
                  </span>
                }
              />
            ))}
          </InsetGroup>
        </div>
      )}
    </div>
  );
};
