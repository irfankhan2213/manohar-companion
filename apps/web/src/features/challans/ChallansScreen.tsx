import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Plus,
  Search,
  Truck,
  ShoppingBag,
  ArrowDownLeft,
  FileSpreadsheet,
  Check,
  X,
  Camera,
  Layers,
  Filter,
} from 'lucide-react';
import { formatINR, ChallanStatus } from '@saas/shared';
import { api } from '../../api/index.js';
import { useAppStore } from '../../app/store.js';
import { LargeTitleScreen } from '../../components/ui/LargeTitleScreen.js';
import { InsetGroup, Row } from '../../components/ui/InsetGroup.js';
import { SegmentedControl } from '../../components/ui/SegmentedControl.js';
import { StatusText } from '../../components/ui/StatusText.js';
import { Button } from '../../components/ui/Button.js';
import { Sheet } from '../../components/ui/Sheet.js';

type ChallanFilter = 'all' | 'sales' | 'purchase' | 'delivery';

export const ChallansScreen: React.FC = () => {
  const navigate = useNavigate();
  const { currentCompanyId, currentUser } = useAppStore();
  const [filter, setFilter] = useState<ChallanFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

  // R4: Party and Date Range History Filtering
  const [selectedPartyId, setSelectedPartyId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  const { data: stockItems = [] } = useQuery({
    queryKey: ['stock-items', currentCompanyId],
    queryFn: () => api.stock.items.list(currentCompanyId),
  });

  const { data: challans = [], isLoading } = useQuery({
    queryKey: [
      'challans',
      currentCompanyId,
      searchQuery,
      filter,
      selectedItemIds,
      selectedPartyId,
      startDate,
      endDate,
    ],
    queryFn: () =>
      api.challans.list(
        currentCompanyId,
        searchQuery,
        filter,
        selectedItemIds,
        {
          partyId: selectedPartyId || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        }
      ),
  });

  const { data: parties = [] } = useQuery({
    queryKey: ['parties', currentCompanyId],
    queryFn: () => api.parties.list(currentCompanyId),
  });

  const { data: rawTasks = [] } = useQuery({
    queryKey: ['tasks', currentCompanyId, currentUser?.id],
    queryFn: () =>
      api.tasks.list(
        currentCompanyId,
        currentUser?.id ? { assignedToUserId: currentUser.id } : undefined
      ),
  });

  const tasks = React.useMemo(
    () =>
      currentUser?.id
        ? rawTasks.filter((t) => t.assignedToUserId === currentUser.id)
        : rawTasks,
    [rawTasks, currentUser?.id]
  );

  const partyMap = new Map(parties.map((p) => [p.id, p]));

  // Find popular machine items for quick filter chips
  const machineItems = stockItems.filter(
    (item) =>
      item.name.toUpperCase().includes('MACHINE') ||
      item.group.toLowerCase().includes('machine')
  );

  const toggleItemFilter = (itemId: string) => {
    setSelectedItemIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  };

  const clearItemFilter = () => {
    setSelectedItemIds([]);
  };

  const clearAllFilters = () => {
    setSelectedPartyId('');
    setStartDate('');
    setEndDate('');
    setSelectedItemIds([]);
    setSearchQuery('');
  };

  const hasHistoryFilters = Boolean(selectedPartyId) || Boolean(startDate) || Boolean(endDate);

  const getTypeIcon = (type: 'sales' | 'purchase' | 'delivery') => {
    switch (type) {
      case 'sales':
        return <ShoppingBag className="w-5 h-5 text-accent" />;
      case 'purchase':
        return <ArrowDownLeft className="w-5 h-5 text-label-2" />;
      case 'delivery':
        return <Truck className="w-5 h-5 text-accent" />;
    }
  };

  const getStatusBadge = (status: ChallanStatus) => {
    switch (status) {
      case 'synced':
        return <StatusText text="Updated in Tally" variant="ok" />;
      case 'queued':
        return <StatusText text="Waiting for Tally" variant="warn" />;
      case 'failed':
        return <StatusText text="Couldn't update" variant="danger" />;
      case 'draft':
        return <StatusText text="Draft" variant="neutral" />;
      case 'cancelled':
        return <StatusText text="Cancelled" variant="neutral" />;
    }
  };

  return (
    <LargeTitleScreen
      title="Challans"
      headerAction={
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilterSheetOpen(true)}
            aria-label="Filter Challans"
            className="w-9 h-9 rounded-full bg-surface/80 border border-separator/40 flex items-center justify-center text-label hover:bg-fill/60 active:scale-95 transition-all relative"
          >
            <Filter className="w-4 h-4 text-label-2" />
            {hasHistoryFilters && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-accent rounded-full ring-2 ring-surface" />
            )}
          </button>
          <Button
            size="small"
            onClick={() => navigate('/challans/new')}
            className="flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4 stroke-[2.2]" />
            <span>New</span>
          </Button>
        </div>
      }
    >
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-label-2" />
        <input
          type="text"
          placeholder="Search voucher #, party, vehicle..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full h-11 pl-10 pr-4 bg-surface rounded-xl border border-separator/60 text-body text-label placeholder:text-label-3 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
        />
      </div>

      {/* Segmented Control for Types */}
      <SegmentedControl
        options={[
          { value: 'all', label: 'All' },
          { value: 'sales', label: 'Sales' },
          { value: 'purchase', label: 'Purchase' },
          { value: 'delivery', label: 'Delivery' },
        ]}
        value={filter}
        onChange={(val) => setFilter(val as ChallanFilter)}
      />

      {/* Active History Filters Chips Bar */}
      {hasHistoryFilters && (
        <div className="flex items-center gap-1.5 flex-wrap px-1 text-footnote">
          <span className="text-label-2 font-medium">History Filters:</span>
          {selectedPartyId && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-accent-soft text-accent font-semibold text-caption">
              <span>Party: {partyMap.get(selectedPartyId)?.name ?? 'Selected'}</span>
              <button
                type="button"
                aria-label="Clear party filter"
                onClick={() => setSelectedPartyId('')}
                className="hover:opacity-75"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          )}
          {(startDate || endDate) && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-fill border border-separator/50 text-label font-medium text-caption">
              <span>{startDate || 'Any'} → {endDate || 'Any'}</span>
              <button
                type="button"
                aria-label="Clear date filter"
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
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
              setSelectedPartyId('');
              setStartDate('');
              setEndDate('');
            }}
            className="text-caption font-semibold text-accent hover:underline ml-1"
          >
            Clear All
          </button>
        </div>
      )}

      {/* Item-Specific Filter Chips (TAI MACHINE, SV MACHINE, 130K MACHINE, etc.) */}
      <div className="flex flex-col gap-2 bg-surface/60 p-3 rounded-2xl border border-separator/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-footnote font-semibold text-label">
            <Layers className="w-3.5 h-3.5 text-accent" />
            <span>Filter by Particular Machine / Items</span>
          </div>
          {selectedItemIds.length > 0 && (
            <button
              type="button"
              onClick={clearItemFilter}
              className="text-caption font-semibold text-accent hover:underline flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              <span>Clear ({selectedItemIds.length})</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {machineItems.map((item) => {
            const isSelected = selectedItemIds.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggleItemFilter(item.id)}
                className={`px-2.5 py-1.5 rounded-lg text-footnote font-semibold transition-all flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-accent text-white shadow-sm'
                    : 'bg-fill/40 text-label hover:bg-fill/70 border border-separator/40'
                }`}
              >
                {isSelected && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                <span>{item.name}</span>
              </button>
            );
          })}
        </div>

        {selectedItemIds.length > 0 && (
          <span className="text-caption text-label-2 italic">
            Showing challans containing any of the {selectedItemIds.length} selected items
          </span>
        )}
      </div>

      {/* Challan List */}
      <InsetGroup>
        {isLoading ? (
          <div className="p-8 text-center text-label-2 text-subhead">
            Loading challans...
          </div>
        ) : challans.length === 0 ? (
          <div className="p-10 text-center flex flex-col items-center justify-center gap-2">
            <FileSpreadsheet className="w-8 h-8 text-label-3" />
            <span className="text-subhead font-semibold text-label">
              No challans found
            </span>
            <span className="text-footnote text-label-2">
              {searchQuery || selectedItemIds.length > 0 || hasHistoryFilters
                ? 'Try clearing active filters or search query'
                : 'Create your first delivery or sales challan'}
            </span>
            {(selectedItemIds.length > 0 || hasHistoryFilters) && (
              <Button
                variant="tinted"
                size="small"
                onClick={clearAllFilters}
                className="mt-2"
              >
                Clear All Filters
              </Button>
            )}
          </div>
        ) : (
          challans.map((challan) => {
            const party = partyMap.get(challan.partyId);
            const totalPaise = challan.lines.reduce(
              (acc, line) => acc + line.amount,
              0
            );
            const totalQty = challan.lines.reduce(
              (acc, line) => acc + line.qty,
              0
            );
            const challanTasks = tasks.filter((t) => t.challanId === challan.id);
            const hasPhotoTask = challanTasks.some((t) => !!t.photoUrl);

            return (
              <Row
                key={challan.id}
                leading={getTypeIcon(challan.type)}
                title={
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-label">{challan.number}</span>
                    {challanTasks.length > 0 && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-accent-soft text-accent text-[11px] font-semibold">
                        {hasPhotoTask ? (
                          <Camera className="w-3 h-3" />
                        ) : null}
                        <span>{challanTasks.length} {challanTasks.length === 1 ? 'task' : 'tasks'}</span>
                      </span>
                    )}
                  </div>
                }
                subtitle={
                  <span className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-label">
                      {party?.name ?? 'Unknown Party'}
                    </span>
                    <span className="text-label-3">·</span>
                    <span className="text-label-2">{challan.date}</span>
                    <span className="text-label-3">·</span>
                    <span className="text-label-2">
                      {challan.lines.map((l) => l.description).join(', ')}
                    </span>
                    <span className="text-label-3">·</span>
                    <span className="text-label-2">
                      ({totalQty} {totalQty === 1 ? 'unit' : 'units'})
                    </span>
                    {challan.vehicleNo && (
                      <>
                        <span className="text-label-3">·</span>
                        <span className="text-label-2 font-mono text-caption">
                          {challan.vehicleNo}
                        </span>
                      </>
                    )}
                  </span>
                }
                trailing={
                  <span className="tabular-nums font-semibold text-label">
                    {formatINR(totalPaise)}
                  </span>
                }
                trailingSubtitle={getStatusBadge(challan.status)}
                chevron
                onClick={() => navigate(`/challans/${challan.id}`)}
              />
            );
          })
        )}
      </InsetGroup>

      {/* Filter Sheet for Party and Date Range */}
      <Sheet
        open={filterSheetOpen}
        onOpenChange={setFilterSheetOpen}
        title="Filter Challans"
        description="Filter past challans by party (person) and date range"
      >
        <div className="flex flex-col gap-4 pt-2">
          {/* Party (Person) Selector */}
          <div>
            <label htmlFor="challan-filter-party" className="text-caption font-semibold text-label-2 uppercase tracking-wide block mb-1.5">
              Party (Customer / Vendor)
            </label>
            <select
              id="challan-filter-party"
              aria-label="Filter by Party"
              value={selectedPartyId}
              onChange={(e) => setSelectedPartyId(e.target.value)}
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

          {/* Date Range Inputs */}
          <div>
            <label className="text-caption font-semibold text-label-2 uppercase tracking-wide block mb-1.5">
              Date Range
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="challan-from-date" className="text-[11px] text-label-3 font-medium block mb-1">
                  From Date
                </label>
                <input
                  id="challan-from-date"
                  type="date"
                  aria-label="From Date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full h-10 px-2.5 bg-surface rounded-xl border border-separator/60 text-footnote text-label focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </div>
              <div>
                <label htmlFor="challan-to-date" className="text-[11px] text-label-3 font-medium block mb-1">
                  To Date
                </label>
                <input
                  id="challan-to-date"
                  type="date"
                  aria-label="To Date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
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
                  setStartDate('');
                  setEndDate('');
                }}
                className="px-2.5 py-1 rounded-lg text-caption font-semibold bg-fill/50 hover:bg-fill text-label border border-separator/40"
              >
                All Time
              </button>
              <button
                type="button"
                onClick={() => {
                  const today = new Date().toISOString().split('T')[0] ?? '';
                  setStartDate(today);
                  setEndDate(today);
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
                  setStartDate(firstDay);
                  setEndDate(lastDay);
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
                  setStartDate(past30);
                  setEndDate(today);
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
                setSelectedPartyId('');
                setStartDate('');
                setEndDate('');
              }}
            >
              Reset
            </Button>
            <Button fullWidth onClick={() => setFilterSheetOpen(false)}>
              Apply Filters
            </Button>
          </div>
        </div>
      </Sheet>
    </LargeTitleScreen>
  );
};
