import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, RefreshCw, Search, X } from 'lucide-react';
import { formatINR } from '@saas/shared';
import { api } from '../../api/index.js';
import { useAppStore } from '../../app/store.js';

export const DaybookScreen: React.FC = () => {
  const navigate = useNavigate();
  const { currentCompanyId } = useAppStore();

  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedVoucherId, setSelectedVoucherId] = useState<string | null>(null);

  const { data: daybook, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['daybook', currentCompanyId, selectedDate, selectedType, search],
    queryFn: () =>
      api.reports?.daybook
        ? api.reports.daybook({
            companyId: currentCompanyId,
            date: selectedDate || undefined,
            voucherType: selectedType !== 'all' ? selectedType : undefined,
            q: search || undefined,
          })
        : null,
  });

  const { data: voucherDetail, isLoading: isLoadingDetail } = useQuery({
    queryKey: ['daybook-detail', selectedVoucherId],
    queryFn: () => (selectedVoucherId && api.reports?.daybookDetail ? api.reports.daybookDetail(selectedVoucherId) : null),
    enabled: Boolean(selectedVoucherId),
  });

  const voucherTypes = ['all', 'Sales', 'Purchase', 'Payment', 'Receipt', 'Journal', 'Delivery Note', 'Receipt Note'];

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

        <button
          type="button"
          onClick={() => refetch()}
          disabled={isRefetching}
          className="w-9 h-9 rounded-full bg-surface border border-separator/40 flex items-center justify-center text-label-2 hover:text-label transition-all"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Screen Title */}
      <div className="mb-5">
        <div className="text-caption font-semibold uppercase tracking-wider text-accent">
          Transaction Register
        </div>
        <h1 className="text-title-1 font-bold text-label tracking-tight">
          Daybook
        </h1>
        <div className="text-footnote text-label-3 mt-0.5">
          Chronological audit log of all financial vouchers and deliveries
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-label-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search party, voucher no, narration..."
            className="w-full pl-10 pr-4 py-2 bg-surface rounded-xl border border-separator/40 text-footnote text-label focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>

        <div className="relative">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3.5 py-2 bg-surface rounded-xl border border-separator/40 text-footnote text-label focus:outline-none focus:ring-2 focus:ring-accent/40 font-mono"
          />
        </div>
      </div>

      {/* Voucher Type Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-4 scrollbar-none">
        {voucherTypes.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setSelectedType(t)}
            className={`px-3 py-1.5 rounded-full text-caption font-semibold whitespace-nowrap transition-all ${
              selectedType === t
                ? 'bg-accent text-white shadow-sm'
                : 'bg-surface border border-separator/40 text-label-2 hover:bg-fill/40'
            }`}
          >
            {t === 'all' ? 'All Types' : t}
          </button>
        ))}
      </div>

      {/* Voucher Transactions List */}
      {isLoading ? (
        <div className="p-12 text-center text-label-2 text-subhead animate-pulse">
          Loading Daybook transactions...
        </div>
      ) : !daybook?.vouchers || daybook.vouchers.length === 0 ? (
        <div className="p-12 text-center bg-surface rounded-ios-card border border-separator/40 text-label-3">
          No vouchers found for the selected criteria.
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {daybook.vouchers.map((v: any) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setSelectedVoucherId(v.id)}
              className="w-full bg-surface rounded-ios-card p-4 border border-separator/40 shadow-sm hover:border-accent/40 transition-all text-left flex items-center justify-between"
            >
              <div className="flex flex-col gap-1 min-w-0 pr-4">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-fill text-label-2">
                    {v.voucherType}
                  </span>
                  <span className="text-footnote font-mono text-label-3">
                    #{v.voucherNumber}
                  </span>
                  <span className="text-footnote text-label-3 font-mono">
                    · {v.date}
                  </span>
                </div>
                <div className="font-semibold text-label text-subhead truncate">
                  {v.partyName || 'Ledger Transaction'}
                </div>
                {v.narration && (
                  <div className="text-caption text-label-3 truncate">
                    {v.narration}
                  </div>
                )}
              </div>

              <div className="flex flex-col items-end shrink-0">
                <span className="font-mono text-subhead font-bold text-label tabular-nums">
                  {formatINR(v.amount || 0)}
                </span>
                {v.itemCount > 0 && (
                  <span className="text-[11px] text-label-3 mt-0.5">
                    {v.itemCount} items
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Voucher Detail Modal */}
      {selectedVoucherId && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl border border-separator/40 shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-4 border-b border-separator/40 flex items-center justify-between">
              <div>
                <span className="text-caption uppercase tracking-wider text-accent font-semibold">
                  {voucherDetail?.voucherType || 'Voucher'}
                </span>
                <h3 className="text-headline font-bold text-label font-mono">
                  #{voucherDetail?.voucherNumber || '—'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedVoucherId(null)}
                className="w-8 h-8 rounded-full bg-fill flex items-center justify-center text-label-2 hover:text-label"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto flex flex-col gap-4 text-footnote">
              {isLoadingDetail || !voucherDetail ? (
                <div className="p-8 text-center text-label-3 animate-pulse">Loading voucher detail...</div>
              ) : (
                <>
                  <div className="flex justify-between py-1 border-b border-separator/20">
                    <span className="text-label-3">Date:</span>
                    <span className="font-mono font-medium text-label">{voucherDetail.date}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-separator/20">
                    <span className="text-label-3">Party:</span>
                    <span className="font-semibold text-label">{voucherDetail.partyName || '—'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-separator/20">
                    <span className="text-label-3">Amount:</span>
                    <span className="font-mono font-bold text-label text-subhead">{formatINR(voucherDetail.amount || 0)}</span>
                  </div>

                  {voucherDetail.narration && (
                    <div className="p-3 bg-fill/40 rounded-xl text-caption text-label-2">
                      <span className="font-semibold text-label-3 block mb-0.5">Narration:</span>
                      {voucherDetail.narration}
                    </div>
                  )}

                  {/* Inventory Line Items */}
                  {voucherDetail.inventoryEntries?.length > 0 && (
                    <div className="mt-2">
                      <span className="font-semibold text-label-2 block mb-2 text-caption uppercase tracking-wider">
                        Inventory Items
                      </span>
                      <div className="flex flex-col divide-y divide-separator/20 bg-fill/20 rounded-xl p-3">
                        {voucherDetail.inventoryEntries.map((item: any, i: number) => (
                          <div key={i} className="py-2 flex justify-between items-center text-caption">
                            <div>
                              <span className="font-medium text-label block">{item.item}</span>
                              <span className="text-label-3 font-mono">{item.qty} {item.unit || 'pcs'} @ {formatINR(item.rate || 0)}</span>
                            </div>
                            <span className="font-mono font-semibold text-label">{formatINR(item.amount || 0)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Ledger Breakdown */}
                  {voucherDetail.ledgerEntries?.length > 0 && (
                    <div className="mt-2">
                      <span className="font-semibold text-label-2 block mb-2 text-caption uppercase tracking-wider">
                        Ledger Accounting Allocations
                      </span>
                      <div className="flex flex-col divide-y divide-separator/20 bg-fill/20 rounded-xl p-3">
                        {voucherDetail.ledgerEntries.map((led: any, i: number) => (
                          <div key={i} className="py-2 flex justify-between items-center text-caption">
                            <span className="font-medium text-label">{led.ledger}</span>
                            <span className={`font-mono font-semibold ${led.isDebit ? 'text-label' : 'text-emerald-600 dark:text-emerald-400'}`}>
                              {formatINR(led.amount)} {led.isDebit ? 'Dr' : 'Cr'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
