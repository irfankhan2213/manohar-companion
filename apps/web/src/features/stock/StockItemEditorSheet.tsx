import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Trash2,
  RotateCw,
  Tag,
  Warehouse,
  Layers,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { StockItem, StockBalance, paiseToRupees, rupeesToPaise } from '@saas/shared';
import { api } from '../../api/index.js';
import { useAppStore } from '../../app/store.js';
import { Sheet } from '../../components/ui/Sheet.js';
import { Button } from '../../components/ui/Button.js';
import { useToast } from '../../components/ui/Toast.js';

interface CustomFieldRow {
  id: string;
  key: string;
  value: string;
}

const COMMON_UNITS = [
  { value: 'pcs', label: 'Pieces (pcs)' },
  { value: 'nos', label: 'Numbers (nos)' },
  { value: 'set', label: 'Sets (set)' },
  { value: 'box', label: 'Boxes (box)' },
  { value: 'mtr', label: 'Meters (mtr)' },
  { value: 'kgs', label: 'Kilograms (kgs)' },
  { value: 'roll', label: 'Rolls (roll)' },
  { value: 'doz', label: 'Dozens (doz)' },
  { value: 'pkt', label: 'Packets (pkt)' },
  { value: 'bag', label: 'Bags (bag)' },
];

const COMMON_GROUPS = [
  'Motors',
  'Sewing Machines',
  'Hooks & Shuttles',
  'Plates & Dogs',
  'Bobbin Cases',
  'Needles & Thread',
  'Spare Parts',
  'General',
];

const PRESET_CUSTOM_KEYS = [
  'Brand',
  'Rack Location',
  'Color',
  'Model / Series',
  'Size / Dimension',
  'Warranty',
  'Supplier',
];

const EMPTY_BALANCES: StockBalance[] = [];

interface StockItemEditorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialItem?: StockItem | null;
  initialBalances?: StockBalance[];
  onSuccess?: (item: StockItem) => void;
  onDeleted?: (itemId: string) => void;
}

export const StockItemEditorSheet: React.FC<StockItemEditorSheetProps> = ({
  open,
  onOpenChange,
  initialItem,
  initialBalances = EMPTY_BALANCES,
  onSuccess,
  onDeleted,
}) => {
  const queryClient = useQueryClient();
  const { currentCompanyId } = useAppStore();
  const { showToast } = useToast();

  const isEditMode = Boolean(initialItem?.id);

  // Form states
  const [name, setName] = useState('');
  const [partNo, setPartNo] = useState('');
  const [alias, setAlias] = useState('');
  const [group, setGroup] = useState('General');
  const [unit, setUnit] = useState('pcs');
  const [customUnit, setCustomUnit] = useState('');
  const [isCustomUnit, setIsCustomUnit] = useState(false);

  const [sellingRateRs, setSellingRateRs] = useState('');
  const [purchaseRateRs, setPurchaseRateRs] = useState('');
  const [reorderLevel, setReorderLevel] = useState('10');
  const [hsnCode, setHsnCode] = useState('');
  const [gstRate, setGstRate] = useState('18');
  const [description, setDescription] = useState('');

  const [customFields, setCustomFields] = useState<CustomFieldRow[]>([]);
  const [godownQuantities, setGodownQuantities] = useState<Record<string, number>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Fetch godowns
  const { data: godowns = [] } = useQuery({
    queryKey: ['godowns', currentCompanyId],
    queryFn: () => api.godowns.list(currentCompanyId),
    enabled: open,
  });

  // Populate form on open or initialItem change
  useEffect(() => {
    if (open) {
      if (initialItem) {
        setName(initialItem.name || '');
        setPartNo(initialItem.partNo || '');
        setAlias(initialItem.alias || '');
        setGroup(initialItem.group || 'General');

        const isStandard = COMMON_UNITS.some((u) => u.value === initialItem.unit);
        if (isStandard) {
          setUnit(initialItem.unit);
          setIsCustomUnit(false);
          setCustomUnit('');
        } else {
          setUnit('custom');
          setIsCustomUnit(true);
          setCustomUnit(initialItem.unit || '');
        }

        setSellingRateRs(
          initialItem.rate ? String(paiseToRupees(initialItem.rate)) : ''
        );
        setPurchaseRateRs(
          initialItem.purchaseRate ? String(paiseToRupees(initialItem.purchaseRate)) : ''
        );
        setReorderLevel(
          initialItem.reorderLevel !== undefined ? String(initialItem.reorderLevel) : '10'
        );
        setHsnCode(initialItem.hsnCode || '');
        setGstRate(initialItem.gstRate !== undefined ? String(initialItem.gstRate) : '18');
        setDescription(initialItem.description || '');

        // Map custom values
        if (initialItem.customValues && typeof initialItem.customValues === 'object') {
          const rows: CustomFieldRow[] = Object.entries(initialItem.customValues).map(
            ([k, v], idx) => ({
              id: `cf-${idx}-${k}`,
              key: k,
              value: String(v),
            })
          );
          setCustomFields(rows);
        } else {
          setCustomFields([]);
        }

        // Map balances
        const bMap: Record<string, number> = {};
        for (const b of initialBalances) {
          bMap[b.godownId] = b.qty;
        }
        setGodownQuantities(bMap);
      } else {
        // Reset for new item
        setName('');
        setPartNo('');
        setAlias('');
        setGroup('General');
        setUnit('pcs');
        setIsCustomUnit(false);
        setCustomUnit('');
        setSellingRateRs('');
        setPurchaseRateRs('');
        setReorderLevel('10');
        setHsnCode('8452');
        setGstRate('18');
        setDescription('');
        setCustomFields([
          { id: 'cf-brand', key: 'Brand', value: '' },
          { id: 'cf-rack', key: 'Rack Location', value: '' },
        ]);
        setGodownQuantities({});
      }
      setShowDeleteConfirm(false);
    }
  }, [open, initialItem?.id]);

  // Add custom field
  const handleAddCustomField = (presetKey?: string) => {
    const keyToUse = presetKey || '';
    // Avoid exact duplicate keys
    if (presetKey && customFields.some((f) => f.key.toLowerCase() === presetKey.toLowerCase())) {
      showToast({ message: `Field "${presetKey}" already added`, variant: 'neutral' });
      return;
    }
    const newField: CustomFieldRow = {
      id: `cf-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      key: keyToUse,
      value: '',
    };
    setCustomFields((prev) => [...prev, newField]);
  };

  const handleUpdateCustomField = (id: string, field: 'key' | 'value', val: string) => {
    setCustomFields((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: val } : row))
    );
  };

  const handleRemoveCustomField = (id: string) => {
    setCustomFields((prev) => prev.filter((row) => row.id !== id));
  };

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) {
        throw new Error('Item name is required');
      }

      const effectiveUnit = isCustomUnit ? customUnit.trim() || 'pcs' : unit;
      const ratePaise = sellingRateRs ? rupeesToPaise(parseFloat(sellingRateRs) || 0) : 0;
      const purchaseRatePaise = purchaseRateRs
        ? rupeesToPaise(parseFloat(purchaseRateRs) || 0)
        : undefined;
      const reorder = parseFloat(reorderLevel) || 0;
      const gst = parseFloat(gstRate) || 0;

      // Pack custom values
      const customValuesObj: Record<string, string> = {};
      for (const row of customFields) {
        if (row.key.trim() && row.value.trim()) {
          customValuesObj[row.key.trim()] = row.value.trim();
        }
      }

      // Pack godown balances
      const balancesList: Array<{ godownId: string; qty: number }> = Object.entries(
        godownQuantities
      ).map(([gId, qty]) => ({ godownId: gId, qty: Number(qty) || 0 }));

      const resolvedCompanyId =
        initialItem?.companyId ||
        (currentCompanyId !== 'all'
          ? currentCompanyId
          : godowns[0]?.companyId || 'c1');

      const payload = {
        name: name.trim(),
        partNo: partNo.trim() || undefined,
        alias: alias.trim() || undefined,
        group: group.trim() || 'General',
        unit: effectiveUnit,
        rate: ratePaise,
        purchaseRate: purchaseRatePaise,
        reorderLevel: reorder,
        hsnCode: hsnCode.trim() || undefined,
        gstRate: gst,
        description: description.trim() || undefined,
        customValues: customValuesObj,
        balances: balancesList,
        companyId: resolvedCompanyId,
      };

      if (isEditMode && initialItem?.id) {
        return await api.stock.items.update(initialItem.id, payload);
      } else {
        return await api.stock.items.create(payload);
      }
    },
    onSuccess: (savedItem) => {
      queryClient.invalidateQueries({ queryKey: ['stock-items'] });
      queryClient.invalidateQueries({ queryKey: ['stock-balances'] });
      if (initialItem?.id) {
        queryClient.invalidateQueries({ queryKey: ['stock-item', initialItem.id] });
      }
      showToast({
        message: isEditMode
          ? `Stock item "${savedItem.name}" updated`
          : `Created stock item "${savedItem.name}"`,
        variant: 'success',
      });
      onSuccess?.(savedItem);
      onOpenChange(false);
    },
    onError: (err: any) => {
      showToast({ message: err.message || 'Failed to save stock item' });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!initialItem?.id) return;
      return await api.stock.items.delete(initialItem.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-items'] });
      queryClient.invalidateQueries({ queryKey: ['stock-balances'] });
      showToast({ message: `Item deleted successfully`, variant: 'neutral' });
      onDeleted?.(initialItem!.id);
      onOpenChange(false);
    },
    onError: (err: any) => {
      showToast({ message: err.message || 'Failed to delete item' });
    },
  });

  if (!open) return null;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={isEditMode ? 'Edit Stock Item' : 'New Stock Item'}
      description={
        isEditMode
          ? 'Update Tally masters, rates, and custom specifications'
          : 'Create a new stock master for Tally & Cloud'
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveMutation.mutate();
        }}
        className="flex flex-col gap-6 pt-1 pb-6"
      >
        {/* SECTION 1: Master Identity */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-1.5 text-footnote font-bold uppercase tracking-wider text-label-2">
            <Layers className="w-4 h-4 text-accent" />
            <span>Tally Master Details</span>
          </div>

          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-caption font-semibold text-label-2">
              Item Name <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Servo Motor 550W (Direct Drive)"
              className="w-full h-11 px-3.5 bg-surface border border-separator/60 rounded-xl text-subhead text-label placeholder:text-label-3 outline-none focus:border-accent"
            />
          </div>

          {/* Part No & Alias Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-caption font-semibold text-label-2">
                Part No / Code
              </label>
              <input
                type="text"
                value={partNo}
                onChange={(e) => setPartNo(e.target.value)}
                placeholder="e.g. SM-550D"
                className="w-full h-11 px-3 bg-surface border border-separator/60 rounded-xl text-subhead text-label placeholder:text-label-3 outline-none focus:border-accent font-mono"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-caption font-semibold text-label-2">
                Alias / Barcode
              </label>
              <input
                type="text"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder="e.g. SM550"
                className="w-full h-11 px-3 bg-surface border border-separator/60 rounded-xl text-subhead text-label placeholder:text-label-3 outline-none focus:border-accent font-mono"
              />
            </div>
          </div>

          {/* Stock Group with Quick Chips */}
          <div className="flex flex-col gap-1.5">
            <label className="text-caption font-semibold text-label-2">
              Stock Group (Under Category)
            </label>
            <input
              type="text"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              placeholder="e.g. Motors, Spare Parts"
              className="w-full h-11 px-3.5 bg-surface border border-separator/60 rounded-xl text-subhead text-label placeholder:text-label-3 outline-none focus:border-accent"
            />
            <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none">
              {COMMON_GROUPS.map((grp) => (
                <button
                  key={grp}
                  type="button"
                  onClick={() => setGroup(grp)}
                  className={`px-2.5 py-1 rounded-lg text-caption font-medium whitespace-nowrap transition-colors ${
                    group === grp
                      ? 'bg-accent text-white shadow-xs'
                      : 'bg-fill/60 text-label-2 hover:bg-fill'
                  }`}
                >
                  {grp}
                </button>
              ))}
            </div>
          </div>

          {/* Unit of Measurement (UOM) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-caption font-semibold text-label-2">
              Base Unit of Measure (UOM)
            </label>
            <div className="grid grid-cols-2 gap-3">
              <select
                value={isCustomUnit ? 'custom' : unit}
                onChange={(e) => {
                  if (e.target.value === 'custom') {
                    setIsCustomUnit(true);
                  } else {
                    setIsCustomUnit(false);
                    setUnit(e.target.value);
                  }
                }}
                className="w-full h-11 px-3 bg-surface border border-separator/60 rounded-xl text-subhead text-label outline-none focus:border-accent"
              >
                {COMMON_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
                <option value="custom">+ Other / Custom Unit...</option>
              </select>

              {isCustomUnit && (
                <input
                  type="text"
                  required
                  value={customUnit}
                  onChange={(e) => setCustomUnit(e.target.value)}
                  placeholder="e.g. pairs, meter, bundle"
                  className="w-full h-11 px-3 bg-surface border border-accent rounded-xl text-subhead text-label placeholder:text-label-3 outline-none"
                />
              )}
            </div>
          </div>
        </div>

        {/* SECTION 2: Rates & Tax */}
        <div className="flex flex-col gap-3 pt-3 border-t border-separator/50">
          <div className="flex items-center gap-1.5 text-footnote font-bold uppercase tracking-wider text-label-2">
            <Tag className="w-4 h-4 text-accent" />
            <span>Pricing & GST Rates</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-caption font-semibold text-label-2">
                Standard Selling Rate (₹)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-subhead font-bold text-label-3">
                  ₹
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={sellingRateRs}
                  onChange={(e) => setSellingRateRs(e.target.value)}
                  placeholder="0.00"
                  className="w-full h-11 pl-7 pr-3 bg-surface border border-separator/60 rounded-xl text-subhead text-label font-medium outline-none focus:border-accent"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-caption font-semibold text-label-2">
                Standard Purchase Rate (₹)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-subhead font-bold text-label-3">
                  ₹
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={purchaseRateRs}
                  onChange={(e) => setPurchaseRateRs(e.target.value)}
                  placeholder="0.00"
                  className="w-full h-11 pl-7 pr-3 bg-surface border border-separator/60 rounded-xl text-subhead text-label font-medium outline-none focus:border-accent"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-caption font-semibold text-label-2">
                Reorder Level
              </label>
              <input
                type="number"
                min="0"
                value={reorderLevel}
                onChange={(e) => setReorderLevel(e.target.value)}
                placeholder="10"
                className="w-full h-11 px-3 bg-surface border border-separator/60 rounded-xl text-subhead text-label outline-none focus:border-accent font-mono"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-caption font-semibold text-label-2">
                HSN / SAC
              </label>
              <input
                type="text"
                value={hsnCode}
                onChange={(e) => setHsnCode(e.target.value)}
                placeholder="8452"
                className="w-full h-11 px-3 bg-surface border border-separator/60 rounded-xl text-subhead text-label outline-none focus:border-accent font-mono"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-caption font-semibold text-label-2">
                GST Rate (%)
              </label>
              <select
                value={gstRate}
                onChange={(e) => setGstRate(e.target.value)}
                className="w-full h-11 px-2.5 bg-surface border border-separator/60 rounded-xl text-subhead text-label outline-none focus:border-accent font-mono"
              >
                <option value="0">0% (Nil)</option>
                <option value="5">5%</option>
                <option value="12">12%</option>
                <option value="18">18%</option>
                <option value="28">28%</option>
              </select>
            </div>
          </div>
        </div>

        {/* SECTION 3: Custom Values / Dynamic Fields */}
        <div className="flex flex-col gap-3 pt-3 border-t border-separator/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-footnote font-bold uppercase tracking-wider text-label-2">
              <Sparkles className="w-4 h-4 text-accent" />
              <span>Custom Values & Specifications</span>
            </div>
            <button
              type="button"
              onClick={() => handleAddCustomField()}
              className="text-caption font-semibold text-accent hover:underline flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Field</span>
            </button>
          </div>

          {/* Quick Preset Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none">
            {PRESET_CUSTOM_KEYS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => handleAddCustomField(k)}
                className="px-2.5 py-1 rounded-lg text-caption font-medium whitespace-nowrap bg-accent/10 text-accent hover:bg-accent/20 transition-colors flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                <span>{k}</span>
              </button>
            ))}
          </div>

          {/* Custom Fields List */}
          {customFields.length === 0 ? (
            <div className="p-4 rounded-xl border border-dashed border-separator text-center text-caption text-label-3">
              No custom values added. Click a preset above (e.g. "+ Brand", "+ Rack Location") to add specifications.
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {customFields.map((field) => (
                <div
                  key={field.id}
                  className="flex items-center gap-2 p-2 bg-fill/30 border border-separator/50 rounded-xl"
                >
                  <input
                    type="text"
                    value={field.key}
                    onChange={(e) => handleUpdateCustomField(field.id, 'key', e.target.value)}
                    placeholder="Attribute name (e.g. Brand)"
                    className="flex-1 h-9 px-2.5 bg-surface border border-separator/60 rounded-lg text-subhead text-label font-medium placeholder:text-label-3 outline-none focus:border-accent"
                  />
                  <input
                    type="text"
                    value={field.value}
                    onChange={(e) => handleUpdateCustomField(field.id, 'value', e.target.value)}
                    placeholder="Value (e.g. Jack / Juki)"
                    className="flex-1 h-9 px-2.5 bg-surface border border-separator/60 rounded-lg text-subhead text-label placeholder:text-label-3 outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveCustomField(field.id)}
                    className="w-8 h-8 rounded-lg text-danger hover:bg-danger/10 flex items-center justify-center shrink-0 transition-colors"
                    title="Remove field"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SECTION 4: Godown Balances */}
        {godowns.length > 0 && (
          <div className="flex flex-col gap-3 pt-3 border-t border-separator/50">
            <div className="flex items-center gap-1.5 text-footnote font-bold uppercase tracking-wider text-label-2">
              <Warehouse className="w-4 h-4 text-accent" />
              <span>Godown Quantities ({isCustomUnit ? customUnit || 'pcs' : unit})</span>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {godowns.map((g) => {
                const currentQty = godownQuantities[g.id] ?? 0;
                return (
                  <div
                    key={g.id}
                    className="flex items-center justify-between p-3 bg-surface border border-separator/50 rounded-xl"
                  >
                    <span className="text-subhead font-semibold text-label">{g.name}</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        value={currentQty}
                        onChange={(e) =>
                          setGodownQuantities((prev) => ({
                            ...prev,
                            [g.id]: parseFloat(e.target.value) || 0,
                          }))
                        }
                        className="w-24 h-9 px-2.5 bg-fill/30 border border-separator/60 rounded-lg text-subhead text-label font-semibold text-right outline-none focus:border-accent font-mono"
                      />
                      <span className="text-caption text-label-2 font-medium w-8">
                        {isCustomUnit ? customUnit || 'pcs' : unit}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SECTION 5: Description & Notes */}
        <div className="flex flex-col gap-1.5 pt-3 border-t border-separator/50">
          <label className="text-caption font-semibold text-label-2">
            Description & Technical Notes
          </label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Copper winding, compatible with lockstitch industrial sewing machines."
            className="w-full p-3 bg-surface border border-separator/60 rounded-xl text-subhead text-label placeholder:text-label-3 outline-none focus:border-accent resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3 pt-2">
          <Button
            type="submit"
            fullWidth
            disabled={saveMutation.isPending}
            className="h-12 text-subhead font-semibold"
          >
            {saveMutation.isPending ? (
              <>
                <RotateCw className="w-4 h-4 animate-spin mr-2" />
                <span>Saving Stock Master...</span>
              </>
            ) : (
              <span>{isEditMode ? 'Save & Sync Changes' : 'Create Stock Item'}</span>
            )}
          </Button>

          {isEditMode && (
            <div>
              {!showDeleteConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="w-full text-center py-2 text-footnote text-danger font-medium hover:underline"
                >
                  Delete this stock item
                </button>
              ) : (
                <div className="p-3 bg-danger/10 border border-danger/30 rounded-xl flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-danger text-caption font-medium">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>Are you sure you want to delete this item?</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-2.5 py-1 text-caption font-semibold text-label-2 hover:bg-surface rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteMutation.mutate()}
                      disabled={deleteMutation.isPending}
                      className="px-2.5 py-1 text-caption font-semibold bg-danger text-white rounded-lg shadow-xs"
                    >
                      {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </form>
    </Sheet>
  );
};
