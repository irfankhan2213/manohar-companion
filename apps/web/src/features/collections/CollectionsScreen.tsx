import React, { useState } from 'react';
import clsx from 'clsx';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  Filter,
  Check,
  Send,
  AlertCircle,
  X,
  Ban,
} from 'lucide-react';
import {
  AgingBucket,
  can,
  formatINR,
  getAgingBucket,
  getDaysOverdue,
  Party,
} from '@saas/shared';
import { api } from '../../api/index.js';
import { useAppStore } from '../../app/store.js';
import { LargeTitleScreen } from '../../components/ui/LargeTitleScreen.js';
import { InsetGroup, Row } from '../../components/ui/InsetGroup.js';
import { SegmentedControl } from '../../components/ui/SegmentedControl.js';
import { Button } from '../../components/ui/Button.js';
import { Sheet } from '../../components/ui/Sheet.js';
import { StatusText } from '../../components/ui/StatusText.js';
import { useToast } from '../../components/ui/Toast.js';
import { FIXED_TODAY } from '../../mock/seed.js';

interface PartyWithAging {
  party: Party;
  isCreditor: boolean;
  totalPending: number;
  maxDaysLate: number;
  bucket: AgingBucket;
}

export const CollectionsScreen: React.FC = () => {
  const navigate = useNavigate();
  const { currentCompanyId, currentRole, currentUser } = useAppStore();
  const { showToast } = useToast();

  // View Mode: Receivables (parties) vs Bills History
  const [viewMode, setViewMode] = useState<'parties' | 'bills'>('parties');

  // Parties Receivables View State
  const [partyTypeTab, setPartyTypeTab] = useState<'debtor' | 'creditor' | 'all'>('debtor');
  const [searchQuery, setSearchQuery] = useState('');
  const [tabFilter, setTabFilter] = useState<'all' | 'late'>('all');
  const [ageBucketFilter, setAgeBucketFilter] = useState<AgingBucket | 'any'>('any');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [selectedPartyIds, setSelectedPartyIds] = useState<Set<string>>(new Set());
  const [confirmSheetOpen, setConfirmSheetOpen] = useState(false);

  // R4: Bills History View State
  const [billSearchQuery, setBillSearchQuery] = useState('');
  const [billPartyId, setBillPartyId] = useState('');
  const [billStartDate, setBillStartDate] = useState('');
  const [billEndDate, setBillEndDate] = useState('');
  const [billFilterSheetOpen, setBillFilterSheetOpen] = useState(false);

  // Fetch parties with partyType filtering
  const { data: parties = [], isLoading: partiesLoading } = useQuery({
    queryKey: ['parties', currentCompanyId, partyTypeTab],
    queryFn: () =>
      api.parties.list(
        currentCompanyId,
        undefined,
        partyTypeTab === 'all' ? undefined : partyTypeTab
      ),
  });

  // Fetch all open bills to compute amounts and aging per party
  const { data: bills = [], isLoading: billsLoading } = useQuery({
    queryKey: ['bills', currentCompanyId],
    queryFn: () => api.bills.list(currentCompanyId),
  });

  // Fetch bills for History View with party and date range filters
  const { data: historyBills = [], isLoading: historyBillsLoading } = useQuery({
    queryKey: [
      'bills-history',
      currentCompanyId,
      billSearchQuery,
      billPartyId,
      billStartDate,
      billEndDate,
    ],
    queryFn: () =>
      api.bills.list(currentCompanyId, {
        q: billSearchQuery || undefined,
        partyId: billPartyId || undefined,
        startDate: billStartDate || undefined,
        endDate: billEndDate || undefined,
      }),
    enabled: viewMode === 'bills',
  });

  const partyMap = React.useMemo(() => new Map(parties.map((p) => [p.id, p])), [parties]);

  const canSend = can(currentUser || currentRole, 'reminders.send');
  const canBatchRemind = canSend && partyTypeTab !== 'creditor';

  // Map bills by partyId
  const partyWithAgingList: PartyWithAging[] = React.useMemo(() => {
    const billMap = new Map<string, typeof bills>();
    for (const b of bills) {
      const list = billMap.get(b.partyId) ?? [];
      list.push(b);
      billMap.set(b.partyId, list);
    }

    return parties.map((p) => {
      const isCreditor =
        p.partyType === 'creditor' ||
        Boolean(p.parentGroup && p.parentGroup.toLowerCase().includes('creditor')) ||
        Boolean(p.notes && p.notes.toLowerCase().includes('creditor'));
      const pBills = billMap.get(p.id) ?? [];
      const totalPending =
        p.closingBalance !== undefined && p.closingBalance !== null && p.closingBalance !== 0
          ? (isCreditor ? Math.abs(p.closingBalance) : p.closingBalance)
          : (pBills.length > 0 ? pBills.reduce((acc, b) => acc + b.pending, 0) : 0);

      let maxDaysLate = 0;
      let worstBucket: AgingBucket = 'not_due';

      for (const b of pBills) {
        if (b.pending > 0) {
          const days = getDaysOverdue(b.dueDate, FIXED_TODAY);
          if (days > maxDaysLate) maxDaysLate = days;
          const bucket = getAgingBucket(b.dueDate, FIXED_TODAY);
          if (bucket !== 'not_due') {
            worstBucket = bucket;
          }
        }
      }

      return {
        party: p,
        isCreditor,
        totalPending,
        maxDaysLate,
        bucket: worstBucket,
      };
    });
  }, [parties, bills]);

  // Apply filters for parties view
  const filteredList = React.useMemo(() => {
    let list = partyWithAgingList;

    if (partyTypeTab === 'debtor') {
      list = list.filter((item) => !item.isCreditor);
    } else if (partyTypeTab === 'creditor') {
      list = list.filter((item) => item.isCreditor);
    }

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (item) =>
          item.party.name.toLowerCase().includes(q) ||
          item.party.city.toLowerCase().includes(q)
      );
    }

    if (tabFilter === 'late') {
      list = list.filter((item) => item.maxDaysLate > 0);
    }

    if (ageBucketFilter !== 'any') {
      list = list.filter((item) => item.bucket === ageBucketFilter);
    }

    // Sort by max days late descending
    return list.sort((a, b) => b.maxDaysLate - a.maxDaysLate);
  }, [partyWithAgingList, partyTypeTab, searchQuery, tabFilter, ageBucketFilter]);

  const toggleSelectParty = (id: string) => {
    setSelectedPartyIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleQueueBatchReminders = async () => {
    // Only queue reminders for customer debtors who owe money
    const validPartyIds = Array.from(selectedPartyIds).filter((pid) => {
      const pItem = partyWithAgingList.find((item) => item.party.id === pid);
      return pItem && !pItem.isCreditor && pItem.totalPending > 0;
    });

    if (validPartyIds.length === 0) {
      showToast({
        message: 'No eligible customer debtors selected for reminders',
        variant: 'neutral',
      });
      setIsMultiSelect(false);
      setSelectedPartyIds(new Set());
      setConfirmSheetOpen(false);
      return;
    }

    const count = validPartyIds.length;
    setConfirmSheetOpen(false);
    setIsMultiSelect(false);
    setSelectedPartyIds(new Set());
    try {
      await Promise.all(validPartyIds.map((pid) => api.reminders.send(pid)));
      showToast({
        message: `${count} payment reminders queued for sending`,
        variant: 'success',
      });
    } catch {
      showToast({
        message: 'Failed to queue reminders',
        variant: 'danger',
      });
    }
  };

  const hasBillFilters = Boolean(billPartyId) || Boolean(billStartDate) || Boolean(billEndDate);

  return (
    <LargeTitleScreen
      title="Collections"
      headerAction={
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              if (viewMode === 'bills') {
                setBillFilterSheetOpen(true);
              } else {
                setFilterSheetOpen(true);
              }
            }}
            aria-label={viewMode === 'bills' ? 'Filter Bills' : 'Filter'}
            className="w-9 h-9 rounded-full bg-surface/80 border border-separator/40 flex items-center justify-center text-label hover:bg-fill/60 active:scale-95 transition-all relative"
          >
            <Filter className="w-4 h-4 text-label-2" />
            {viewMode === 'bills' && hasBillFilters && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-accent rounded-full ring-2 ring-surface" />
            )}
          </button>

          {viewMode === 'parties' && canBatchRemind && (
            <button
              type="button"
              onClick={() => {
                setIsMultiSelect(!isMultiSelect);
                setSelectedPartyIds(new Set());
              }}
              className="text-subhead font-semibold text-accent px-2.5 py-1.5 rounded-lg hover:bg-fill/60 active:opacity-60 transition-all"
            >
              {isMultiSelect ? 'Done' : 'Select'}
            </button>
          )}
        </div>
      }
    >
      {/* Top-Level View Switcher: Receivables vs Bills History */}
      <div
        role="group"
        aria-label="Collections view"
        className="w-full bg-fill p-1 rounded-xl flex items-center select-none"
      >
        <button
          type="button"
          aria-pressed={viewMode === 'parties'}
          onClick={() => {
            setViewMode('parties');
          }}
          className={clsx(
            'flex-1 py-1.5 px-3 rounded-lg font-semibold text-subhead transition-all duration-200 text-center truncate',
            viewMode === 'parties'
              ? 'bg-surface text-label shadow-sm'
              : 'text-label-2 hover:text-label active:opacity-70'
          )}
        >
          Receivables
        </button>
        <button
          type="button"
          aria-pressed={viewMode === 'bills'}
          onClick={() => {
            setViewMode('bills');
            setIsMultiSelect(false);
          }}
          className={clsx(
            'flex-1 py-1.5 px-3 rounded-lg font-semibold text-subhead transition-all duration-200 text-center truncate',
            viewMode === 'bills'
              ? 'bg-surface text-label shadow-sm'
              : 'text-label-2 hover:text-label active:opacity-70'
          )}
        >
          Bills History
        </button>
      </div>

      {/* VIEW MODE 1: PARTIES (RECEIVABLES) */}
      {viewMode === 'parties' && (
        <>
          {/* Search Input tucked under title */}
          <div className="relative w-full">
            <Search className="w-4 h-4 text-label-3 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              aria-label="Search customer or city"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search customer or city"
              className="w-full h-11 pl-10 pr-4 bg-surface rounded-xl border border-separator/50 text-body text-label placeholder:text-label-3 outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all shadow-sm"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-label-3 hover:text-label"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* 3-Option Segmented Control: Customers (Debtors) | Suppliers (Creditors) | All */}
          <SegmentedControl
            options={[
              { value: 'debtor', label: 'Customers' },
              { value: 'creditor', label: 'Suppliers' },
              { value: 'all', label: 'All' },
            ]}
            value={partyTypeTab}
            onChange={(val) => {
              setPartyTypeTab(val as typeof partyTypeTab);
              setSelectedPartyIds(new Set());
              if (val === 'creditor') setIsMultiSelect(false);
            }}
          />

          {/* Quick Filter: All Customers | Debtors | Creditors | Overdue Only */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
            <button
              type="button"
              onClick={() => {
                setPartyTypeTab('all');
                setTabFilter('all');
                setSelectedPartyIds(new Set());
              }}
              className={clsx(
                'px-3.5 py-1.5 rounded-full text-caption font-semibold whitespace-nowrap transition-all',
                partyTypeTab === 'all' && tabFilter === 'all'
                  ? 'bg-fill text-label shadow-xs border border-separator/60 font-bold'
                  : 'text-label-2 hover:text-label hover:bg-fill/40'
              )}
            >
              All Customers
            </button>
            <button
              type="button"
              onClick={() => {
                setPartyTypeTab('debtor');
                setTabFilter('all');
                setSelectedPartyIds(new Set());
              }}
              className={clsx(
                'px-3.5 py-1.5 rounded-full text-caption font-semibold whitespace-nowrap transition-all',
                partyTypeTab === 'debtor' && tabFilter === 'all'
                  ? 'bg-fill text-label shadow-xs border border-separator/60 font-bold'
                  : 'text-label-2 hover:text-label hover:bg-fill/40'
              )}
            >
              Debtors
            </button>
            <button
              type="button"
              onClick={() => {
                setPartyTypeTab('creditor');
                setTabFilter('all');
                setSelectedPartyIds(new Set());
                setIsMultiSelect(false);
              }}
              className={clsx(
                'px-3.5 py-1.5 rounded-full text-caption font-semibold whitespace-nowrap transition-all',
                partyTypeTab === 'creditor' && tabFilter === 'all'
                  ? 'bg-fill text-label shadow-xs border border-separator/60 font-bold'
                  : 'text-label-2 hover:text-label hover:bg-fill/40'
              )}
            >
              Creditors
            </button>
            <button
              type="button"
              onClick={() => {
                setTabFilter(tabFilter === 'late' ? 'all' : 'late');
                setSelectedPartyIds(new Set());
              }}
              className={clsx(
                'px-3.5 py-1.5 rounded-full text-caption font-semibold whitespace-nowrap transition-all',
                tabFilter === 'late'
                  ? 'bg-danger/15 text-danger border border-danger/30 font-bold'
                  : 'text-label-2 hover:text-label hover:bg-fill/40'
              )}
            >
              Overdue Only
            </button>
          </div>

          {/* Parties List */}
          <InsetGroup>
            {partiesLoading || billsLoading ? (
              <div className="p-8 text-center text-label-2 animate-pulse">
                Loading receivables...
              </div>
            ) : filteredList.length === 0 ? (
              <div className="p-8 text-center text-label-2 text-subhead">
                No{' '}
                {partyTypeTab === 'creditor'
                  ? 'suppliers'
                  : partyTypeTab === 'debtor'
                  ? 'customers'
                  : 'parties'}{' '}
                match the current filter.
              </div>
            ) : (
              filteredList.map((item) => {
                const isSelected = selectedPartyIds.has(item.party.id);

                return (
                  <Row
                    key={item.party.id}
                    onClick={() => {
                      if (isMultiSelect) {
                        if (item.isCreditor) {
                          showToast({
                            message: 'Payment reminders cannot be sent to suppliers',
                            variant: 'neutral',
                          });
                          return;
                        }
                        toggleSelectParty(item.party.id);
                      } else {
                        navigate(`/collections/${item.party.id}`);
                      }
                    }}
                    leading={
                      isMultiSelect ? (
                        item.isCreditor ? (
                          <div
                            title="Reminders disabled for suppliers"
                            className="w-6 h-6 rounded-md border border-separator/40 bg-fill/30 flex items-center justify-center text-label-3 cursor-not-allowed"
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </div>
                        ) : (
                          <div
                            className={`w-6 h-6 rounded-md border flex items-center justify-center transition-all ${
                              isSelected
                                ? 'bg-accent border-accent text-white'
                                : 'border-separator/80 bg-surface'
                            }`}
                          >
                            {isSelected && <Check className="w-4 h-4 stroke-[2.5]" />}
                          </div>
                        )
                      ) : undefined
                    }
                    title={
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-label">{item.party.name}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[11px] font-semibold tracking-wide uppercase ${
                            item.isCreditor
                              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/20'
                              : 'bg-accent-soft text-accent border border-accent/20'
                          }`}
                        >
                          {item.isCreditor ? 'Supplier' : 'Customer'}
                        </span>
                      </div>
                    }
                    subtitle={`${item.party.city} · ${item.isCreditor ? 'Sundry Creditor' : `${item.party.creditDays}d terms`}`}
                    trailing={
                      <div className="flex flex-col items-end">
                        <span
                          className={`text-[11px] font-medium ${
                            item.isCreditor
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-label-2'
                          }`}
                        >
                          {item.isCreditor ? 'You owe' : 'Owes you'}
                        </span>
                        <span className="tabular-nums font-semibold text-label">
                          {formatINR(item.totalPending)}
                        </span>
                      </div>
                    }
                    trailingSubtitle={
                      item.isCreditor ? (
                        <span className="text-footnote text-label-3 font-medium">Creditor</span>
                      ) : item.maxDaysLate > 0 ? (
                        <StatusText
                          text={`${item.maxDaysLate} days late`}
                          variant={item.maxDaysLate > 30 ? 'danger' : 'warn'}
                          dot={false}
                        />
                      ) : (
                        <span className="text-label-2 font-medium">Not due</span>
                      )
                    }
                  />
                );
              })
            )}
          </InsetGroup>
        </>
      )}

      {/* VIEW MODE 2: BILLS HISTORY (R4) */}
      {viewMode === 'bills' && (
        <>
          {/* Bill Search Bar */}
          <div className="relative w-full">
            <Search className="w-4 h-4 text-label-3 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              aria-label="Search bills"
              value={billSearchQuery}
              onChange={(e) => setBillSearchQuery(e.target.value)}
              placeholder="Search bill # or party name..."
              className="w-full h-11 pl-10 pr-4 bg-surface rounded-xl border border-separator/50 text-body text-label placeholder:text-label-3 outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all shadow-sm"
            />
            {billSearchQuery && (
              <button
                type="button"
                aria-label="Clear bill search"
                onClick={() => setBillSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-label-3 hover:text-label"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Active Bill Filters Chips Bar */}
          {hasBillFilters && (
            <div className="flex items-center gap-1.5 flex-wrap px-1 text-footnote">
              <span className="text-label-2 font-medium">History Filters:</span>
              {billPartyId && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-accent-soft text-accent font-semibold text-caption">
                  <span>Party: {partyMap.get(billPartyId)?.name ?? 'Selected'}</span>
                  <button
                    type="button"
                    aria-label="Clear bill party filter"
                    onClick={() => setBillPartyId('')}
                    className="hover:opacity-75"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              )}
              {(billStartDate || billEndDate) && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-fill border border-separator/50 text-label font-medium text-caption">
                  <span>{billStartDate || 'Any'} → {billEndDate || 'Any'}</span>
                  <button
                    type="button"
                    aria-label="Clear bill date filter"
                    onClick={() => {
                      setBillStartDate('');
                      setBillEndDate('');
                    }}
                    className="hover:opacity-75"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  setBillPartyId('');
                  setBillStartDate('');
                  setBillEndDate('');
                }}
                className="text-caption font-semibold text-accent hover:underline ml-1"
              >
                Clear All
              </button>
            </div>
          )}

          {/* Bills List InsetGroup */}
          <InsetGroup>
            {historyBillsLoading ? (
              <div className="p-8 text-center text-label-2 animate-pulse">
                Loading bills history...
              </div>
            ) : historyBills.length === 0 ? (
              <div className="p-8 text-center text-label-2 text-subhead">
                No bills match the current filters.
              </div>
            ) : (
              historyBills.map((bill) => {
                const daysLate = getDaysOverdue(bill.dueDate, FIXED_TODAY);
                const p = partyMap.get(bill.partyId);
                return (
                  <Row
                    key={bill.id}
                    onClick={() => navigate(`/collections/${bill.partyId}`)}
                    title={
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-label">{bill.billNo}</span>
                        {bill.source === 'estimated' && (
                          <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-fill text-label-2 border border-separator/40">
                            Estimated
                          </span>
                        )}
                      </div>
                    }
                    subtitle={`${bill.partyName || p?.name || 'Unknown'} · Inv: ${bill.date} · Due: ${bill.dueDate}`}
                    trailing={
                      <div className="flex flex-col items-end">
                        <span className="text-[11px] font-medium text-label-2">Pending</span>
                        <span className="tabular-nums font-semibold text-label">
                          {formatINR(bill.pending)}
                        </span>
                      </div>
                    }
                    trailingSubtitle={
                      daysLate > 0 ? (
                        <StatusText
                          text={`${daysLate} days late`}
                          variant={daysLate > 30 ? 'danger' : 'warn'}
                          dot={false}
                        />
                      ) : (
                        <span className="text-ok font-medium">Within terms</span>
                      )
                    }
                    chevron
                  />
                );
              })
            )}
          </InsetGroup>
        </>
      )}

      {/* Multi-Select Floating Dispatch Button */}
      {viewMode === 'parties' && isMultiSelect && selectedPartyIds.size > 0 && (
        <div className="fixed bottom-20 md:bottom-8 inset-x-4 z-40 flex justify-center animate-in fade-in slide-in-from-bottom-3 duration-200">
          <Button
            onClick={() => setConfirmSheetOpen(true)}
            className="shadow-xl px-6 h-12 max-w-sm w-full"
          >
            <Send className="w-5 h-5 mr-2 stroke-[2.2]" />
            <span>Send reminders ({selectedPartyIds.size})</span>
          </Button>
        </div>
      )}

      {/* Filter Sheet for Receivables Aging */}
      <Sheet
        open={filterSheetOpen}
        onOpenChange={setFilterSheetOpen}
        title="Filter Receivables"
        description="Filter by overdue aging period"
      >
        <div className="flex flex-col gap-2 pt-2">
          {[
            { id: 'any', label: 'Any Aging Period' },
            { id: 'not_due', label: 'Not Due (Current)' },
            { id: 'd1_30', label: '1 to 30 Days Overdue' },
            { id: 'd31_60', label: '31 to 60 Days Overdue' },
            { id: 'd61_90', label: '61 to 90 Days Overdue' },
            { id: 'd90_plus', label: 'Over 90 Days Overdue' },
          ].map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                setAgeBucketFilter(option.id as typeof ageBucketFilter);
                setFilterSheetOpen(false);
              }}
              className="flex items-center justify-between p-3.5 rounded-xl text-left hover:bg-fill/50 active:bg-fill transition-colors"
            >
              <span className="text-headline font-medium text-label">
                {option.label}
              </span>
              {ageBucketFilter === option.id && (
                <Check className="w-5 h-5 text-accent stroke-[2.5]" />
              )}
            </button>
          ))}
        </div>
      </Sheet>

      {/* R4: Filter Sheet for Bills History (Party and Date Range) */}
      <Sheet
        open={billFilterSheetOpen}
        onOpenChange={setBillFilterSheetOpen}
        title="Filter Bills History"
        description="Filter past bills by party (person) and date range"
      >
        <div className="flex flex-col gap-4 pt-2">
          {/* Party Selector */}
          <div>
            <label htmlFor="bill-filter-party" className="text-caption font-semibold text-label-2 uppercase tracking-wide block mb-1.5">
              Party (Customer / Vendor)
            </label>
            <select
              id="bill-filter-party"
              aria-label="Filter Bills by Party"
              value={billPartyId}
              onChange={(e) => setBillPartyId(e.target.value)}
              className="w-full h-11 px-3 bg-surface rounded-xl border border-separator/60 text-body text-label focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              <option value="">All Parties</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.city})
                </option>
              ))}
            </select>
          </div>

          {/* Date Range */}
          <div>
            <label className="text-caption font-semibold text-label-2 uppercase tracking-wide block mb-1.5">
              Date Range
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="bill-from-date" className="text-[11px] text-label-3 font-medium block mb-1">
                  From Date
                </label>
                <input
                  id="bill-from-date"
                  type="date"
                  aria-label="From Date"
                  value={billStartDate}
                  onChange={(e) => setBillStartDate(e.target.value)}
                  className="w-full h-10 px-2.5 bg-surface rounded-xl border border-separator/60 text-footnote text-label focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </div>
              <div>
                <label htmlFor="bill-to-date" className="text-[11px] text-label-3 font-medium block mb-1">
                  To Date
                </label>
                <input
                  id="bill-to-date"
                  type="date"
                  aria-label="To Date"
                  value={billEndDate}
                  onChange={(e) => setBillEndDate(e.target.value)}
                  className="w-full h-10 px-2.5 bg-surface rounded-xl border border-separator/60 text-footnote text-label focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </div>
            </div>
          </div>

          {/* Quick Date Presets */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-label-3 font-medium">Quick Date Presets</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setBillStartDate('');
                  setBillEndDate('');
                }}
                className="px-2.5 py-1 rounded-lg text-caption font-semibold bg-fill/50 hover:bg-fill text-label border border-separator/40"
              >
                All Time
              </button>
              <button
                type="button"
                onClick={() => {
                  const today = new Date().toISOString().split('T')[0] ?? '';
                  setBillStartDate(today);
                  setBillEndDate(today);
                }}
                className="px-2.5 py-1 rounded-lg text-caption font-semibold bg-fill/50 hover:bg-fill text-label border border-separator/40"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0] ?? '';
                  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0] ?? '';
                  setBillStartDate(firstDay);
                  setBillEndDate(lastDay);
                }}
                className="px-2.5 py-1 rounded-lg text-caption font-semibold bg-fill/50 hover:bg-fill text-label border border-separator/40"
              >
                This Month
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  const past30 = new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0] ?? '';
                  const today = now.toISOString().split('T')[0] ?? '';
                  setBillStartDate(past30);
                  setBillEndDate(today);
                }}
                className="px-2.5 py-1 rounded-lg text-caption font-semibold bg-fill/50 hover:bg-fill text-label border border-separator/40"
              >
                Last 30 Days
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button
              variant="tinted"
              fullWidth
              onClick={() => {
                setBillPartyId('');
                setBillStartDate('');
                setBillEndDate('');
              }}
            >
              Reset
            </Button>
            <Button fullWidth onClick={() => setBillFilterSheetOpen(false)}>
              Apply Filters
            </Button>
          </div>
        </div>
      </Sheet>

      {/* Multi-Select Confirm Sheet */}
      <Sheet
        open={confirmSheetOpen}
        onOpenChange={setConfirmSheetOpen}
        title={`Queue ${selectedPartyIds.size} Reminders`}
        description="Review dispatch summary before scheduling"
      >
        <div className="flex flex-col gap-4 pt-2">
          <div className="p-3.5 bg-fill/30 border border-separator/40 rounded-xl flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-accent shrink-0 mt-0.5" />
            <div className="flex flex-col text-subhead text-label">
              <span>
                <strong>{selectedPartyIds.size}</strong> reminders will be queued via Meta Cloud API.
              </span>
              <span className="text-footnote text-label-2 mt-1">
                Any customer with reminders paused or during designated quiet hours will be held until the next available window.
              </span>
            </div>
          </div>

          <Button fullWidth onClick={handleQueueBatchReminders} className="h-[50px] mt-2">
            Confirm and Queue
          </Button>
        </div>
      </Sheet>
    </LargeTitleScreen>
  );
};
