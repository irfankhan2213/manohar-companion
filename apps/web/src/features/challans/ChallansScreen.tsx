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
} from 'lucide-react';
import { formatINR } from '@saas/shared';
import { api } from '../../api/index.js';
import { useAppStore } from '../../app/store.js';
import { LargeTitleScreen } from '../../components/ui/LargeTitleScreen.js';
import { InsetGroup, Row } from '../../components/ui/InsetGroup.js';
import { SegmentedControl } from '../../components/ui/SegmentedControl.js';
import { StatusText } from '../../components/ui/StatusText.js';
import { Button } from '../../components/ui/Button.js';

type ChallanFilter = 'all' | 'sales' | 'purchase' | 'delivery';

export const ChallansScreen: React.FC = () => {
  const navigate = useNavigate();
  const { currentCompanyId } = useAppStore();
  const [filter, setFilter] = useState<ChallanFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

  const { data: stockItems = [] } = useQuery({
    queryKey: ['stock-items', currentCompanyId],
    queryFn: () => api.stock.items.list(currentCompanyId),
  });

  const { data: challans = [], isLoading } = useQuery({
    queryKey: ['challans', currentCompanyId, searchQuery, filter, selectedItemIds],
    queryFn: () => api.challans.list(currentCompanyId, searchQuery, filter, selectedItemIds),
  });

  const { data: parties = [] } = useQuery({
    queryKey: ['parties', currentCompanyId],
    queryFn: () => api.parties.list(currentCompanyId),
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', currentCompanyId],
    queryFn: () => api.tasks.list(currentCompanyId),
  });

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

  const getStatusBadge = (status: 'synced' | 'queued' | 'failed' | 'draft') => {
    switch (status) {
      case 'synced':
        return <StatusText text="Updated in Tally" variant="ok" />;
      case 'queued':
        return <StatusText text="Waiting for Tally" variant="warn" />;
      case 'failed':
        return <StatusText text="Couldn't update" variant="danger" />;
      case 'draft':
        return <StatusText text="Draft" variant="neutral" />;
    }
  };

  return (
    <LargeTitleScreen
      title="Challans"
      headerAction={
        <Button
          size="small"
          onClick={() => navigate('/challans/new')}
          className="flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4 stroke-[2.2]" />
          <span>New</span>
        </Button>
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
              {searchQuery || selectedItemIds.length > 0
                ? 'Try clearing the item filter or search query'
                : 'Create your first delivery or sales challan'}
            </span>
            {selectedItemIds.length > 0 && (
              <Button
                variant="tinted"
                size="small"
                onClick={clearItemFilter}
                className="mt-2"
              >
                Clear Item Filter
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
    </LargeTitleScreen>
  );
};
