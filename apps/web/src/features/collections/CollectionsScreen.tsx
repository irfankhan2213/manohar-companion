import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  Filter,
  Check,
  Send,
  AlertCircle,
  X,
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
  totalPending: number;
  maxDaysLate: number;
  bucket: AgingBucket;
}

export const CollectionsScreen: React.FC = () => {
  const navigate = useNavigate();
  const { currentCompanyId, currentRole } = useAppStore();
  const { showToast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [tabFilter, setTabFilter] = useState<'all' | 'late'>('all');
  const [ageBucketFilter, setAgeBucketFilter] = useState<AgingBucket | 'any'>('any');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [selectedPartyIds, setSelectedPartyIds] = useState<Set<string>>(new Set());
  const [confirmSheetOpen, setConfirmSheetOpen] = useState(false);

  // Fetch parties
  const { data: parties = [], isLoading: partiesLoading } = useQuery({
    queryKey: ['parties', currentCompanyId],
    queryFn: () => api.parties.list(currentCompanyId),
  });

  // Fetch all open bills to compute amounts and aging per party
  const { data: bills = [], isLoading: billsLoading } = useQuery({
    queryKey: ['bills', currentCompanyId],
    queryFn: () => api.bills.list(currentCompanyId),
  });

  const canSend = can(currentRole, 'reminders.send');

  // Map bills by partyId
  const partyWithAgingList: PartyWithAging[] = React.useMemo(() => {
    const billMap = new Map<string, typeof bills>();
    for (const b of bills) {
      const list = billMap.get(b.partyId) ?? [];
      list.push(b);
      billMap.set(b.partyId, list);
    }

    return parties.map((p) => {
      const pBills = billMap.get(p.id) ?? [];
      const totalPending = pBills.reduce((acc, b) => acc + b.pending, 0);

      let maxDaysLate = 0;
      let worstBucket: AgingBucket = 'not_due';

      for (const b of pBills) {
        const days = getDaysOverdue(b.dueDate, FIXED_TODAY);
        if (days > maxDaysLate) maxDaysLate = days;
        const bucket = getAgingBucket(b.dueDate, FIXED_TODAY);
        if (bucket !== 'not_due') {
          worstBucket = bucket;
        }
      }

      return {
        party: p,
        totalPending,
        maxDaysLate,
        bucket: worstBucket,
      };
    });
  }, [parties, bills]);

  // Apply filters
  const filteredList = React.useMemo(() => {
    let list = partyWithAgingList;

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
  }, [partyWithAgingList, searchQuery, tabFilter, ageBucketFilter]);

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

  const handleQueueBatchReminders = () => {
    const count = selectedPartyIds.size;
    setConfirmSheetOpen(false);
    setIsMultiSelect(false);
    setSelectedPartyIds(new Set());
    showToast({
      message: `${count} payment reminders queued for sending`,
      variant: 'success',
    });
  };

  return (
    <LargeTitleScreen
      title="Collections"
      headerAction={
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilterSheetOpen(true)}
            aria-label="Filter"
            className="w-9 h-9 rounded-full bg-surface/80 border border-separator/40 flex items-center justify-center text-label hover:bg-fill/60 active:scale-95 transition-all"
          >
            <Filter className="w-4 h-4 text-label-2" />
          </button>

          {canSend && (
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
      {/* Search Input tucked under title */}
      <div className="relative w-full">
        <Search className="w-4 h-4 text-label-3 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search customer or city"
          className="w-full h-11 pl-10 pr-4 bg-surface rounded-xl border border-separator/50 text-body text-label placeholder:text-label-3 outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all shadow-sm"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-label-3 hover:text-label"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 2-Option Segmented Control: All | Late */}
      <SegmentedControl
        options={[
          { value: 'all', label: 'All Customers' },
          { value: 'late', label: 'Overdue Only' },
        ]}
        value={tabFilter}
        onChange={(val) => setTabFilter(val as typeof tabFilter)}
      />

      {/* List */}
      <InsetGroup>
        {partiesLoading || billsLoading ? (
          <div className="p-8 text-center text-label-2 animate-pulse">
            Loading receivables...
          </div>
        ) : filteredList.length === 0 ? (
          <div className="p-8 text-center text-label-2 text-subhead">
            No customers match the current filter.
          </div>
        ) : (
          filteredList.map((item) => {
            const isSelected = selectedPartyIds.has(item.party.id);

            return (
              <Row
                key={item.party.id}
                onClick={() => {
                  if (isMultiSelect) {
                    toggleSelectParty(item.party.id);
                  } else {
                    navigate(`/collections/${item.party.id}`);
                  }
                }}
                leading={
                  isMultiSelect ? (
                    <div
                      className={`w-6 h-6 rounded-md border flex items-center justify-center transition-all ${
                        isSelected
                          ? 'bg-accent border-accent text-white'
                          : 'border-separator/80 bg-surface'
                      }`}
                    >
                      {isSelected && <Check className="w-4 h-4 stroke-[2.5]" />}
                    </div>
                  ) : undefined
                }
                title={item.party.name}
                subtitle={`${item.party.city} · ${item.party.creditDays}d terms`}
                trailing={
                  <span className="tabular-nums">
                    {formatINR(item.totalPending)}
                  </span>
                }
                trailingSubtitle={
                  item.maxDaysLate > 0 ? (
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

      {/* Multi-Select Floating Dispatch Button */}
      {isMultiSelect && selectedPartyIds.size > 0 && (
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

      {/* Filter Sheet */}
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
