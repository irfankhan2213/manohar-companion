import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, X, Layers, Plus } from 'lucide-react';
import { StockItem, can } from '@saas/shared';
import { api } from '../../api/index.js';
import { useAppStore } from '../../app/store.js';
import { LargeTitleScreen } from '../../components/ui/LargeTitleScreen.js';
import { InsetGroup, Row } from '../../components/ui/InsetGroup.js';
import { SegmentedControl } from '../../components/ui/SegmentedControl.js';
import { StatusText } from '../../components/ui/StatusText.js';
import { StockItemEditorSheet } from './StockItemEditorSheet.js';

interface StockItemWithTotal {
  item: StockItem;
  totalQty: number;
  isLow: boolean;
}

export const StockScreen: React.FC = () => {
  const navigate = useNavigate();
  const { currentCompanyId, currentRole, currentUser } = useAppStore();
  const actor = currentUser || currentRole;

  const [searchQuery, setSearchQuery] = useState('');
  const [tabFilter, setTabFilter] = useState<'all' | 'low'>('all');
  const [isCombined, setIsCombined] = useState(false);
  const [createSheetOpen, setCreateSheetOpen] = useState(false);

  const canEditStock = can(actor, 'stock.adjust') || can(actor, 'tally.write.stock');

  // Fetch stock items
  const { data: stockItems = [], isLoading: itemsLoading } = useQuery({
    queryKey: ['stock-items', currentCompanyId],
    queryFn: () => api.stock.items.list(currentCompanyId),
  });

  const stockWithTotals: StockItemWithTotal[] = React.useMemo(() => {
    const baseList = stockItems.map((item) => {
      const totalQty =
        typeof item.totalQty === 'number'
          ? item.totalQty
          : item.balances
          ? item.balances.reduce((s, b) => s + b.qty, 0)
          : 0;
      const isLow = totalQty <= item.reorderLevel;
      return {
        item,
        totalQty,
        isLow,
      };
    });

    if (!isCombined || currentCompanyId !== 'all') {
      return baseList;
    }

    // Combined Stock View: merge items with matching name/partNo across company branches
    const mergedMap = new Map<string, StockItemWithTotal>();
    for (const entry of baseList) {
      const key = (entry.item.partNo || entry.item.name).trim().toLowerCase();
      const existing = mergedMap.get(key);
      if (existing) {
        const combinedQty = existing.totalQty + entry.totalQty;
        const combinedReorder = Math.max(existing.item.reorderLevel, entry.item.reorderLevel);
        mergedMap.set(key, {
          item: existing.item,
          totalQty: combinedQty,
          isLow: combinedQty <= combinedReorder,
        });
      } else {
        mergedMap.set(key, { ...entry });
      }
    }
    return Array.from(mergedMap.values());
  }, [stockItems, isCombined, currentCompanyId]);

  const filteredItems = React.useMemo(() => {
    let list = stockWithTotals;

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (i) =>
          i.item.name.toLowerCase().includes(q) ||
          i.item.partNo?.toLowerCase().includes(q) ||
          i.item.group.toLowerCase().includes(q)
      );
    }

    if (tabFilter === 'low') {
      list = list.filter((i) => i.isLow);
    }

    return list;
  }, [stockWithTotals, searchQuery, tabFilter]);

  return (
    <LargeTitleScreen
      title="Stock"
      subtitle={
        canEditStock ? (
          <button
            type="button"
            onClick={() => setCreateSheetOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white font-semibold text-subhead rounded-xl shadow-xs hover:opacity-95 active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>New Item</span>
          </button>
        ) : undefined
      }
    >
      {/* Search Input */}
      <div className="relative w-full">
        <Search className="w-4 h-4 text-label-3 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="search"
          aria-label="Search item, part number or group"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search item, part number or group"
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

      {/* Combined Switch row if All Companies is active */}
      {currentCompanyId === 'all' && (
        <div className="flex items-center justify-between p-3.5 bg-surface border border-separator/50 rounded-ios-card shadow-sm">
          <div className="flex items-center gap-3">
            <Layers className="w-5 h-5 text-accent" />
            <div className="flex flex-col">
              <span className="text-headline font-semibold text-label">
                Combined Stock View
              </span>
              <span className="text-footnote text-label-2">
                Sum items across Manohar Traders & International
              </span>
            </div>
          </div>
          <input
            type="checkbox"
            aria-label="Combined Stock View"
            checked={isCombined}
            onChange={(e) => setIsCombined(e.target.checked)}
            className="w-6 h-6 accent-accent rounded cursor-pointer"
          />
        </div>
      )}

      {/* 2-Option Segmented Control: All | Low */}
      <SegmentedControl
        options={[
          { value: 'all', label: 'All Items' },
          { value: 'low', label: 'Low Stock' },
        ]}
        value={tabFilter}
        onChange={(val) => setTabFilter(val as typeof tabFilter)}
      />

      {/* Stock Items List */}
      <InsetGroup>
        {itemsLoading ? (
          <div className="p-8 text-center text-label-2 animate-pulse">
            Loading inventory...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-8 text-center flex flex-col items-center justify-center gap-3">
            <span className="text-subhead text-label-2">No stock items found.</span>
            {canEditStock && (
              <button
                type="button"
                onClick={() => setCreateSheetOpen(true)}
                className="text-subhead font-semibold text-accent hover:underline flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                <span>Create a new stock item</span>
              </button>
            )}
          </div>
        ) : (
          filteredItems.map(({ item, totalQty, isLow }) => (
            <Row
              key={item.id}
              onClick={() => navigate(`/stock/${item.id}`)}
              title={item.name}
              subtitle={`${item.partNo ?? 'Part'} · ${item.group}`}
              trailing={
                <span className="tabular-nums font-semibold text-label">
                  {totalQty} {item.unit}
                </span>
              }
              trailingSubtitle={
                isLow ? (
                  <StatusText text="Low Stock" variant="warn" dot={false} />
                ) : (
                  <span className="text-footnote text-label-2 font-medium">In stock</span>
                )
              }
              chevron
            />
          ))
        )}
      </InsetGroup>

      {/* Create Stock Item Sheet */}
      <StockItemEditorSheet
        open={createSheetOpen}
        onOpenChange={setCreateSheetOpen}
        initialItem={null}
        onSuccess={(created) => navigate(`/stock/${created.id}`)}
      />
    </LargeTitleScreen>
  );
};
