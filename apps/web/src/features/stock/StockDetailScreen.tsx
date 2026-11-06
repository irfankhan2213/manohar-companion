import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Minus,
  Warehouse,
  RotateCw,
  Edit3,
  Tag,
  Sparkles,
} from 'lucide-react';
import { can, formatINR } from '@saas/shared';
import { api } from '../../api/index.js';
import { useAppStore } from '../../app/store.js';
import { LargeTitleScreen } from '../../components/ui/LargeTitleScreen.js';
import { InsetGroup, Row } from '../../components/ui/InsetGroup.js';
import { Button } from '../../components/ui/Button.js';
import { Sheet } from '../../components/ui/Sheet.js';
import { StatusText } from '../../components/ui/StatusText.js';
import { useToast } from '../../components/ui/Toast.js';
import { StockItemEditorSheet } from './StockItemEditorSheet.js';

export const StockDetailScreen: React.FC = () => {
  const { itemId = '' } = useParams<{ itemId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentCompanyId, currentRole, currentUser } = useAppStore();
  const { showToast } = useToast();

  const [adjustSheetOpen, setAdjustSheetOpen] = useState(false);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [selectedGodownId, setSelectedGodownId] = useState<string>('g1');
  const [deltaQty, setDeltaQty] = useState<number>(1);
  const [reason, setReason] = useState<string>('Count correction');
  const [note, setNote] = useState<string>('');

  // Fetch stock item and balances
  const { data: stockData, isLoading } = useQuery({
    queryKey: ['stock-item', itemId],
    queryFn: () => api.stock.items.get(itemId),
  });

  // Fetch godowns scoped to the stock item's company
  const targetCompanyId = stockData?.item?.companyId || currentCompanyId;
  const { data: godowns = [] } = useQuery({
    queryKey: ['godowns', targetCompanyId],
    queryFn: () => api.godowns.list(targetCompanyId),
  });

  React.useEffect(() => {
    if (godowns.length > 0 && !godowns.some((g) => g.id === selectedGodownId)) {
      setSelectedGodownId(godowns[0]!.id);
    }
  }, [godowns, selectedGodownId]);

  // Fetch outbox updates
  const { data: outboxItems = [] } = useQuery({
    queryKey: ['outbox', currentCompanyId],
    queryFn: () => api.outbox.list(currentCompanyId),
    refetchInterval: 2000,
  });

  const recentOutbox = outboxItems.filter(
    (o) => o.kind === 'stock_journal' && o.refId === itemId
  );

  const canAdjust = can(currentUser || currentRole, 'stock.adjust');

  const adjustMutation = useMutation({
    mutationFn: () =>
      api.stock.adjust(itemId, selectedGodownId, deltaQty, note ? `${reason}: ${note}` : reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-item', itemId] });
      queryClient.invalidateQueries({ queryKey: ['stock-items'] });
      queryClient.invalidateQueries({ queryKey: ['outbox'] });
      setAdjustSheetOpen(false);
      showToast({
        message: `Stock adjustment of ${deltaQty > 0 ? `+${deltaQty}` : deltaQty} queued for Tally`,
        variant: 'success',
      });
    },
  });

  if (isLoading || !stockData) {
    return (
      <LargeTitleScreen title="Stock Item" showBack>
        <div className="p-8 text-center text-label-2 animate-pulse">
          Loading stock details...
        </div>
      </LargeTitleScreen>
    );
  }

  const { item, balances } = stockData;
  const totalQty = balances.reduce((sum, b) => sum + b.qty, 0);
  const isLow = totalQty <= item.reorderLevel;

  return (
    <LargeTitleScreen
      title={item.name}
      subtitle={
        <span className="text-subhead text-label-2 font-medium">
          {item.partNo ?? item.group}
        </span>
      }
      showBack
    >
      {/* Hero Quantity Card */}
      <div className="bg-surface rounded-ios-card p-5 border border-separator/40 shadow-[0_2px_8px_rgba(0,0,0,0.03)] flex flex-col gap-3">
        <div className="flex flex-col">
          <span className="text-subhead text-label-2 font-medium">
            Available stock
          </span>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-hero-num text-label font-semibold tracking-tight tabular-nums">
              {totalQty}
            </span>
            <span className="text-title text-label-2 font-medium">
              {item.unit}
            </span>
          </div>

          <div className="flex items-center gap-2 mt-1">
            <span className="text-footnote text-label-2 font-medium">
              Reorder level: {item.reorderLevel} {item.unit}
            </span>
            {isLow && (
              <span className="text-footnote font-semibold text-warn">
                · Low Stock
              </span>
            )}
          </div>
        </div>

        {canAdjust && (
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button
              variant="tinted"
              onClick={() => setEditSheetOpen(true)}
              className="flex items-center justify-center gap-1.5"
            >
              <Edit3 className="w-4 h-4" />
              <span>Edit Details</span>
            </Button>
            <Button
              onClick={() => setAdjustSheetOpen(true)}
              className="flex items-center justify-center gap-1.5"
            >
              <span>Adjust Stock</span>
            </Button>
          </div>
        )}
      </div>

      {/* Pricing & GST Master */}
      <InsetGroup title="Pricing & Tax Master">
        <Row
          leading={<Tag className="w-4 h-4 text-accent" />}
          title="Selling Rate"
          trailing={
            <span className="font-semibold text-label">
              {item.rate ? `${formatINR(item.rate)} / ${item.unit}` : 'Not set'}
            </span>
          }
        />
        {item.purchaseRate ? (
          <Row
            leading={<Tag className="w-4 h-4 text-label-3" />}
            title="Purchase Rate"
            trailing={
              <span className="font-medium text-label-2">
                {formatINR(item.purchaseRate)} / {item.unit}
              </span>
            }
          />
        ) : null}
        <Row
          title="Stock Group"
          trailing={<span className="font-medium text-label">{item.group}</span>}
        />
        {item.partNo ? (
          <Row
            title="Part No / Code"
            trailing={<span className="font-mono text-label">{item.partNo}</span>}
          />
        ) : null}
        {item.alias ? (
          <Row
            title="Alias / Barcode"
            trailing={<span className="font-mono text-label">{item.alias}</span>}
          />
        ) : null}
        {item.hsnCode ? (
          <Row
            title="HSN / SAC Code"
            trailing={<span className="font-mono font-medium text-label">{item.hsnCode}</span>}
          />
        ) : null}
        {item.gstRate !== undefined ? (
          <Row
            title="GST Rate"
            trailing={<span className="font-medium text-label">{item.gstRate}%</span>}
          />
        ) : null}
      </InsetGroup>

      {/* Custom Attributes & Values */}
      <InsetGroup
        title="Custom Attributes & Specifications"
        actionText={canAdjust ? 'Edit' : undefined}
        onActionClick={canAdjust ? () => setEditSheetOpen(true) : undefined}
      >
        {item.customValues && Object.keys(item.customValues).length > 0 ? (
          Object.entries(item.customValues).map(([key, val]) => (
            <Row
              key={key}
              leading={<Sparkles className="w-4 h-4 text-accent/80" />}
              title={key}
              trailing={<span className="font-semibold text-label">{val}</span>}
            />
          ))
        ) : (
          <div className="p-4 bg-surface text-center flex flex-col items-center justify-center gap-2">
            <span className="text-footnote text-label-3">
              No custom values added (e.g. Brand, Rack Location, Color).
            </span>
            {canAdjust && (
              <button
                type="button"
                onClick={() => setEditSheetOpen(true)}
                className="text-caption font-semibold text-accent hover:underline"
              >
                + Add Custom Attributes
              </button>
            )}
          </div>
        )}
      </InsetGroup>

      {/* Description & Notes */}
      {item.description ? (
        <InsetGroup title="Description & Specifications">
          <div className="p-4 bg-surface text-subhead text-label-2 whitespace-pre-wrap leading-relaxed">
            {item.description}
          </div>
        </InsetGroup>
      ) : null}

      {/* Godown Breakdown */}
      <InsetGroup title="Godown Quantities">
        {godowns.map((g) => {
          const balance = balances.find((b) => b.godownId === g.id);
          const qty = balance?.qty ?? 0;

          return (
            <Row
              key={g.id}
              leading={
                <div className="w-8 h-8 rounded-lg bg-fill/50 flex items-center justify-center text-label-2">
                  <Warehouse className="w-4 h-4" />
                </div>
              }
              title={g.name}
              trailing={
                <span className="tabular-nums">
                  {qty} {item.unit}
                </span>
              }
            />
          );
        })}
      </InsetGroup>

      {/* Outbox Activity sent to Tally */}
      {recentOutbox.length > 0 && (
        <InsetGroup title="Updates sent to Tally">
          {recentOutbox.map((outbox) => (
            <Row
              key={outbox.id}
              title="Stock Journal Adjustment"
              subtitle={`Ref: ${outbox.id}`}
              trailing={
                outbox.status === 'queued' ? (
                  <StatusText text="Waiting for Tally" variant="warn" />
                ) : outbox.status === 'synced' ? (
                  <StatusText text="Updated" variant="ok" />
                ) : (
                  <StatusText text="Couldn't update. Try again" variant="danger" />
                )
              }
            />
          ))}
        </InsetGroup>
      )}

      {/* Adjust Stock Sheet */}
      <Sheet
        open={adjustSheetOpen}
        onOpenChange={setAdjustSheetOpen}
        title="Adjust Stock"
        description="Creates a stock journal entry for Tally sync"
      >
        <div className="flex flex-col gap-5 pt-2">
          {/* Godown Selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-footnote font-semibold uppercase tracking-wider text-label-2">
              Select Godown
            </label>
            <select
              value={selectedGodownId}
              onChange={(e) => setSelectedGodownId(e.target.value)}
              className="w-full h-12 px-3.5 bg-surface border border-separator/60 rounded-xl text-headline text-label font-medium outline-none focus:border-accent"
            >
              {godowns.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          {/* Stepper Quantity Delta */}
          <div className="flex flex-col gap-1.5">
            <label className="text-footnote font-semibold uppercase tracking-wider text-label-2">
              Quantity Adjustment ({item.unit})
            </label>
            <div className="flex items-center justify-between p-3 bg-fill/30 border border-separator/40 rounded-xl">
              <button
                type="button"
                onClick={() => setDeltaQty((q) => q - 1)}
                className="w-10 h-10 rounded-xl bg-surface border border-separator/50 flex items-center justify-center text-label active:scale-95 transition-all shadow-sm"
              >
                <Minus className="w-5 h-5 stroke-[2.2]" />
              </button>

              <div className="flex items-center gap-1">
                <span className="text-title font-bold text-label tabular-nums">
                  {deltaQty > 0 ? `+${deltaQty}` : deltaQty}
                </span>
                <span className="text-subhead text-label-2">{item.unit}</span>
              </div>

              <button
                type="button"
                onClick={() => setDeltaQty((q) => q + 1)}
                className="w-10 h-10 rounded-xl bg-surface border border-separator/50 flex items-center justify-center text-label active:scale-95 transition-all shadow-sm"
              >
                <Plus className="w-5 h-5 stroke-[2.2]" />
              </button>
            </div>
          </div>

          {/* Reason Selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-footnote font-semibold uppercase tracking-wider text-label-2">
              Reason
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full h-12 px-3.5 bg-surface border border-separator/60 rounded-xl text-headline text-label font-medium outline-none focus:border-accent"
            >
              <option value="Count correction">Count correction</option>
              <option value="Damage">Damaged / Defective piece</option>
              <option value="Opening stock">Opening stock adjustment</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Optional Note */}
          <div className="flex flex-col gap-1.5">
            <label className="text-footnote font-semibold uppercase tracking-wider text-label-2">
              Note (Optional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Physical stock verification Ludhiana"
              className="w-full h-11 px-3.5 bg-surface border border-separator/50 rounded-xl text-subhead text-label placeholder:text-label-3 outline-none focus:border-accent"
            />
          </div>

          <Button
            fullWidth
            onClick={() => adjustMutation.mutate()}
            disabled={adjustMutation.isPending || deltaQty === 0}
            className="h-[50px] mt-2"
          >
            {adjustMutation.isPending ? (
              <>
                <RotateCw className="w-5 h-5 animate-spin mr-2" />
                <span>Saving to queue...</span>
              </>
            ) : (
              <span>Save & Sync to Tally</span>
            )}
          </Button>
        </div>
      </Sheet>

      {/* Edit Stock Item Sheet */}
      <StockItemEditorSheet
        open={editSheetOpen}
        onOpenChange={setEditSheetOpen}
        initialItem={item}
        initialBalances={balances}
        onDeleted={() => navigate('/stock')}
      />
    </LargeTitleScreen>
  );
};
