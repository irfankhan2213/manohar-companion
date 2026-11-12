import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Plus,
  Trash2,
  Truck,
  UserCheck,
  Search,
  X,
  Package,
} from 'lucide-react';
import {
  ChallanLine,
  formatINR,
  paiseToRupees,
  rupeesToPaise,
  calculateRoundOff,
  StockItem,
} from '@saas/shared';
import { api } from '../../api/index.js';
import { useAppStore } from '../../app/store.js';
import { LargeTitleScreen } from '../../components/ui/LargeTitleScreen.js';
import { InsetGroup, Row } from '../../components/ui/InsetGroup.js';
import { SegmentedControl } from '../../components/ui/SegmentedControl.js';
import { Button } from '../../components/ui/Button.js';
import { useToast } from '../../components/ui/Toast.js';

export const CreateChallanScreen: React.FC = () => {
  const { id: editChallanId } = useParams<{ id?: string }>();
  const isEditMode = Boolean(editChallanId);

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentCompanyId, currentUser } = useAppStore();
  const { showToast } = useToast();

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Details
  const [challanType, setChallanType] = useState<'sales' | 'purchase' | 'delivery'>('delivery');
  const [date, setDate] = useState<string>(() => new Date().toISOString().split('T')[0] ?? '');
  const [selectedGodownId, setSelectedGodownId] = useState('');
  const [selectedPartyId, setSelectedPartyId] = useState('');
  const [partySearch, setPartySearch] = useState('');

  // Step 2: Items & Searchable Typeahead
  const [lines, setLines] = useState<ChallanLine[]>([]);
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [isItemDropdownOpen, setIsItemDropdownOpen] = useState(false);

  // Step 3: Transport & Review & Round-Off
  const [vehicleNo, setVehicleNo] = useState('');
  const [lrNo, setLrNo] = useState('');
  const [transporter, setTransporter] = useState('');
  const [narration, setNarration] = useState('');
  const [roundOffMode, setRoundOffMode] = useState<'auto' | 'manual'>('auto');
  const [manualRoundOffRupees, setManualRoundOffRupees] = useState<number>(0);

  // Fetch companies
  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => api.companies.list(),
  });

  // Fetch parties
  const { data: parties = [] } = useQuery({
    queryKey: ['parties', currentCompanyId],
    queryFn: () => api.parties.list(currentCompanyId),
  });

  // Fetch stock items
  const { data: stockItems = [] } = useQuery({
    queryKey: ['stock-items', currentCompanyId],
    queryFn: () => api.stock.items.list(currentCompanyId),
  });

  // Fetch godowns
  const { data: godowns = [] } = useQuery({
    queryKey: ['godowns', currentCompanyId],
    queryFn: () => api.godowns.list(currentCompanyId),
  });

  // Fetch existing challan if editing
  const { data: existingChallan } = useQuery({
    queryKey: ['challan', editChallanId],
    queryFn: () => (editChallanId ? api.challans.get(editChallanId) : null),
    enabled: isEditMode,
  });

  // Prepopulate form if in edit mode
  React.useEffect(() => {
    if (existingChallan) {
      setChallanType(existingChallan.type);
      setDate(existingChallan.date);
      if (existingChallan.godownId) {
        setSelectedGodownId(existingChallan.godownId);
      }
      setSelectedPartyId(existingChallan.partyId);
      setLines(existingChallan.lines || []);
      setVehicleNo(existingChallan.vehicleNo || '');
      setLrNo(existingChallan.lrNo || '');
      setTransporter(existingChallan.transporter || '');
      setNarration(existingChallan.narration || '');
      if (typeof existingChallan.roundOff === 'number' && existingChallan.roundOff !== 0) {
        setRoundOffMode('manual');
        setManualRoundOffRupees(paiseToRupees(existingChallan.roundOff));
      }
    }
  }, [existingChallan]);

  React.useEffect(() => {
    if (!selectedGodownId && godowns.length > 0 && godowns[0]) {
      setSelectedGodownId(godowns[0].id);
    }
  }, [godowns, selectedGodownId]);

  const selectedParty = parties.find((p) => p.id === selectedPartyId);

  const stockMap = React.useMemo(
    () => new Map(stockItems.map((s) => [s.id, s])),
    [stockItems]
  );

  // Filter stock items for searchable typeahead combobox
  const filteredStockItems = React.useMemo(() => {
    if (!itemSearchQuery.trim()) return stockItems;
    const q = itemSearchQuery.toLowerCase();
    return stockItems.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.partNo?.toLowerCase().includes(q) ?? false) ||
        (item.alias?.toLowerCase().includes(q) ?? false) ||
        (item.group?.toLowerCase().includes(q) ?? false) ||
        (item.hsnCode?.toLowerCase().includes(q) ?? false)
    );
  }, [stockItems, itemSearchQuery]);

  // Auto-Add line item when selected from searchable combobox
  const handleAutoAddStockItem = (item: StockItem) => {
    // When challanType === 'purchase', default to purchaseRate (falling back to rate)
    const defaultRate =
      challanType === 'purchase' && typeof item.purchaseRate === 'number'
        ? item.purchaseRate
        : item.rate;

    const newLine: ChallanLine = {
      itemId: item.id,
      description: item.name,
      itemDescription: '',
      qty: 1,
      unit: item.unit || 'pcs',
      rate: defaultRate,
      amount: defaultRate * 1,
      hsnCode: item.hsnCode || '8452',
      gstRate: item.gstRate ?? 18,
    };

    setLines((prev) => [...prev, newLine]);
    setItemSearchQuery('');
    setIsItemDropdownOpen(false);
    showToast({ message: `Added ${item.name}`, variant: 'success' });
  };

  // Add custom blank row
  const handleAddBlankRow = () => {
    const newLine: ChallanLine = {
      itemId: '',
      description: 'Custom Item',
      itemDescription: '',
      qty: 1,
      unit: 'pcs',
      rate: 0,
      amount: 0,
      hsnCode: '8452',
      gstRate: 18,
    };
    setLines((prev) => [...prev, newLine]);
  };

  // Update specific line field
  const handleUpdateLine = (idx: number, updates: Partial<ChallanLine>) => {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l;
        const updated = { ...l, ...updates };
        if (updates.qty !== undefined || updates.rate !== undefined) {
          const qty = updated.qty ?? 0;
          const rate = updated.rate ?? 0;
          updated.amount = Math.round(qty * rate);
        }
        return updated;
      })
    );
  };

  const handleRemoveLine = (idx: number) => {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  // Financial calculations including Round-Off
  const subtotalPaise = lines.reduce((acc, l) => acc + l.amount, 0);
  const gstPaise = lines.reduce((acc, l) => {
    const itemGstRate = l.gstRate ?? stockMap.get(l.itemId)?.gstRate ?? 18;
    return acc + Math.round(l.amount * (itemGstRate / 100));
  }, 0);
  const rawTotalPaise = subtotalPaise + gstPaise;
  const autoRoundOffResult = calculateRoundOff(subtotalPaise, gstPaise);
  const effectiveRoundOffPaise =
    roundOffMode === 'auto'
      ? autoRoundOffResult.roundOffPaise
      : rupeesToPaise(manualRoundOffRupees);
  const grandTotalPaise = rawTotalPaise + effectiveRoundOffPaise;

  const saveMutation = useMutation({
    mutationFn: async (status: 'draft' | 'queued') => {
      const targetCompanyId =
        currentCompanyId && currentCompanyId !== 'all'
          ? currentCompanyId
          : selectedParty?.companyId || companies[0]?.id || 'c1';

      const payload = {
        companyId: targetCompanyId,
        type: challanType,
        number: existingChallan?.number || '',
        date,
        partyId: selectedPartyId,
        godownId: selectedGodownId,
        lines,
        roundOff: effectiveRoundOffPaise,
        vehicleNo: vehicleNo.trim() ? vehicleNo.trim().toUpperCase() : undefined,
        lrNo: lrNo.trim() ? lrNo.trim() : undefined,
        transporter: transporter.trim() ? transporter.trim() : undefined,
        narration: narration.trim() ? narration.trim() : undefined,
        status,
        createdBy: currentUser?.id || 'staff',
      };

      if (isEditMode && editChallanId && api.challans.update) {
        return api.challans.update(editChallanId, payload);
      } else {
        return api.challans.create(payload);
      }
    },
    onSuccess: (savedChallan) => {
      queryClient.invalidateQueries({ queryKey: ['challans'] });
      queryClient.invalidateQueries({ queryKey: ['challan', savedChallan.id] });
      queryClient.invalidateQueries({ queryKey: ['outbox'] });
      queryClient.invalidateQueries({ queryKey: ['stock-items'] });
      queryClient.invalidateQueries({ queryKey: ['stock-item'] });

      if (isEditMode) {
        showToast({ message: 'Challan updated successfully', variant: 'success' });
        navigate(`/challans/${savedChallan.id}`);
      } else if (savedChallan.status === 'queued') {
        showToast({ message: 'Challan queued for Tally sync', variant: 'success' });
        navigate(`/challans/${savedChallan.id}`);
      } else {
        showToast({ message: 'Challan saved as draft', variant: 'neutral' });
        navigate('/challans');
      }
    },
  });

  const filteredParties = parties.filter((p) =>
    p.name.toLowerCase().includes(partySearch.toLowerCase()) ||
    p.city.toLowerCase().includes(partySearch.toLowerCase())
  );

  return (
    <LargeTitleScreen
      title={isEditMode ? 'Edit Challan' : 'New Challan'}
      headerAction={
        <button
          type="button"
          onClick={() => navigate(isEditMode && editChallanId ? `/challans/${editChallanId}` : '/challans')}
          className="text-subhead font-semibold text-accent hover:opacity-80"
        >
          Cancel
        </button>
      }
    >
      {/* 3-Step Progress Indicator */}
      <div className="flex items-center justify-between px-2 py-1 mb-2">
        <div className="flex items-center gap-2">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-footnote font-bold ${
              step >= 1 ? 'bg-accent text-white' : 'bg-fill text-label-3'
            }`}
          >
            1
          </div>
          <span
            className={`text-footnote font-semibold ${
              step === 1 ? 'text-label' : 'text-label-2'
            }`}
          >
            Party & Type
          </span>
        </div>
        <div className="h-0.5 w-6 bg-separator" />
        <div className="flex items-center gap-2">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-footnote font-bold ${
              step >= 2 ? 'bg-accent text-white' : 'bg-fill text-label-3'
            }`}
          >
            2
          </div>
          <span
            className={`text-footnote font-semibold ${
              step === 2 ? 'text-label' : 'text-label-2'
            }`}
          >
            Items
          </span>
        </div>
        <div className="h-0.5 w-6 bg-separator" />
        <div className="flex items-center gap-2">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-footnote font-bold ${
              step >= 3 ? 'bg-accent text-white' : 'bg-fill text-label-3'
            }`}
          >
            3
          </div>
          <span
            className={`text-footnote font-semibold ${
              step === 3 ? 'text-label' : 'text-label-2'
            }`}
          >
            Review
          </span>
        </div>
      </div>

      {/* STEP 1: PARTY & TYPE */}
      {step === 1 && (
        <div className="flex flex-col gap-4 pb-12">
          <InsetGroup title="Challan Classification">
            <div className="p-3">
              <SegmentedControl
                options={[
                  { value: 'delivery', label: 'Delivery' },
                  { value: 'sales', label: 'Sales' },
                  { value: 'purchase', label: 'Purchase' },
                ]}
                value={challanType}
                onChange={(val) => setChallanType(val as typeof challanType)}
              />
            </div>
          </InsetGroup>

          <InsetGroup title="Date & Source Godown">
            <Row
              title="Challan Date"
              trailing={
                <input
                  type="date"
                  aria-label="Challan Date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="bg-transparent text-label font-semibold text-subhead text-right focus:outline-none"
                />
              }
            />
            <Row
              title="Godown"
              trailing={
                <select
                  aria-label="Godown"
                  value={selectedGodownId}
                  onChange={(e) => setSelectedGodownId(e.target.value)}
                  className="bg-transparent text-label font-semibold text-subhead text-right focus:outline-none cursor-pointer"
                >
                  {godowns.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              }
            />
          </InsetGroup>

          <InsetGroup title="Select Customer / Vendor">
            <div className="p-3 border-b border-separator/40">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-label-2" />
                <input
                  type="text"
                  aria-label="Search party by name or city"
                  placeholder="Search party by name or city..."
                  value={partySearch}
                  onChange={(e) => setPartySearch(e.target.value)}
                  className="w-full h-10 pl-9 pr-3 bg-fill/40 rounded-xl text-subhead text-label placeholder:text-label-3 focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>

            <div className="max-h-60 overflow-y-auto divide-y divide-separator/30">
              {filteredParties.map((p) => {
                const isSelected = selectedPartyId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPartyId(p.id)}
                    className="w-full flex items-center justify-between p-3.5 text-left hover:bg-fill/30 active:bg-fill/50 transition-colors"
                  >
                    <div className="flex flex-col">
                      <span className="text-subhead font-semibold text-label">
                        {p.name}
                      </span>
                      <span className="text-caption text-label-2">
                        {p.city ? `${p.city} · ` : ''}{p.phones?.[0] || 'No phone'}
                      </span>
                    </div>
                    {isSelected && (
                      <Check className="w-5 h-5 text-accent stroke-[2.5]" />
                    )}
                  </button>
                );
              })}
            </div>
          </InsetGroup>

          {selectedParty && (
            <div className="p-3.5 bg-accent-soft/40 border border-accent/20 rounded-xl flex items-center gap-3">
              <UserCheck className="w-5 h-5 text-accent shrink-0" />
              <div className="flex flex-col">
                <span className="text-subhead font-semibold text-label">
                  Selected: {selectedParty.name}
                </span>
                <span className="text-caption text-label-2">
                  Credit Terms: {selectedParty.creditDays} days
                </span>
              </div>
            </div>
          )}

          <Button
            fullWidth
            disabled={!selectedPartyId}
            onClick={() => setStep(2)}
            className="h-12 mt-2"
          >
            Continue to Items
          </Button>
        </div>
      )}

      {/* STEP 2: ITEMS */}
      {step === 2 && (
        <div className="flex flex-col gap-4 pb-12">
          <div className="p-3 bg-fill/40 border border-separator/40 rounded-xl flex items-center justify-between text-footnote">
            <span className="font-semibold text-label capitalize">
              {challanType} Challan
            </span>
            <span className="text-label-2">
              {challanType === 'sales'
                ? 'Deducts stock items from selected godown'
                : 'Does not deduct godown stock'}
            </span>
          </div>

          {/* Searchable Stock Item Selector / Typeahead Combobox */}
          <InsetGroup title="Search & Add Inventory Items">
            <div className="p-3 flex flex-col gap-2.5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-label-2" />
                <input
                  type="text"
                  aria-label="Search stock item"
                  placeholder="Search item by name, part #, alias, or HSN..."
                  value={itemSearchQuery}
                  onChange={(e) => {
                    setItemSearchQuery(e.target.value);
                    setIsItemDropdownOpen(true);
                  }}
                  onFocus={() => setIsItemDropdownOpen(true)}
                  className="w-full h-11 pl-9 pr-9 bg-surface border border-separator/60 rounded-xl text-subhead text-label placeholder:text-label-3 focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
                {itemSearchQuery && (
                  <button
                    type="button"
                    aria-label="Clear item search"
                    onClick={() => {
                      setItemSearchQuery('');
                      setIsItemDropdownOpen(false);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-label-3 hover:text-label"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Typeahead Suggestions Menu */}
              {isItemDropdownOpen && (
                <div className="max-h-64 overflow-y-auto divide-y divide-separator/30 bg-surface rounded-xl border border-separator/50 shadow-md">
                  {filteredStockItems.length === 0 ? (
                    <div className="p-4 text-center text-footnote text-label-2">
                      No stock items found matching &quot;{itemSearchQuery}&quot;
                    </div>
                  ) : (
                    filteredStockItems.map((item) => {
                      const displayRate =
                        challanType === 'purchase' && typeof item.purchaseRate === 'number'
                          ? item.purchaseRate
                          : item.rate;

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleAutoAddStockItem(item)}
                          className="w-full flex items-center justify-between p-3 text-left hover:bg-fill/40 active:bg-fill/60 transition-colors"
                        >
                          <div className="flex flex-col min-w-0 pr-2">
                            <span className="text-subhead font-semibold text-label truncate">
                              {item.name}
                            </span>
                            <span className="text-caption text-label-2">
                              {item.group} {item.partNo ? `· Part: ${item.partNo}` : ''} · HSN {item.hsnCode || '8452'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-footnote font-mono font-semibold text-accent">
                              ₹{paiseToRupees(displayRate)} / {item.unit}
                            </span>
                            <span className="text-caption bg-accent-soft text-accent px-2 py-0.5 rounded-md font-semibold">
                              + Add
                            </span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <span className="text-caption text-label-3">
                  Click any item to auto-add as a line item
                </span>
                <Button
                  variant="plain"
                  size="small"
                  onClick={handleAddBlankRow}
                  className="text-caption font-semibold text-accent hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Add Blank Row</span>
                </Button>
              </div>
            </div>
          </InsetGroup>

          {/* Current Lines Added with Editable Qty, Rate, and itemDescription */}
          <InsetGroup title={`Lines Added (${lines.length})`}>
            {lines.length === 0 ? (
              <div className="p-8 text-center text-label-2 text-subhead flex flex-col items-center gap-2">
                <Package className="w-8 h-8 text-label-3" />
                <span>No items added yet. Search and select an item above.</span>
              </div>
            ) : (
              lines.map((line, idx) => (
                <div
                  key={idx}
                  className="p-3.5 border-b last:border-b-0 border-separator/30 flex flex-col gap-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col min-w-0 pr-2">
                      <input
                        type="text"
                        aria-label="Item name"
                        value={line.description}
                        onChange={(e) => handleUpdateLine(idx, { description: e.target.value })}
                        className="text-subhead font-semibold text-label bg-transparent focus:outline-none focus:underline"
                        placeholder="Item Description"
                      />
                      <span className="text-caption text-label-2">
                        HSN: {line.hsnCode || '8452'} · GST: {line.gstRate ?? 18}%
                      </span>
                    </div>
                    <button
                      type="button"
                      aria-label="Remove line"
                      onClick={() => handleRemoveLine(idx)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-label-3 hover:text-danger hover:bg-danger/10 transition-colors"
                      title="Remove line"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Line Item Notes / Description input */}
                  <input
                    type="text"
                    aria-label="Line item description"
                    placeholder="Line description / notes (optional, e.g. serial #, batch, grade)"
                    value={line.itemDescription || ''}
                    onChange={(e) => handleUpdateLine(idx, { itemDescription: e.target.value })}
                    className="w-full h-8 px-2.5 bg-fill/40 rounded-lg text-footnote text-label placeholder:text-label-3 focus:outline-none focus:ring-1 focus:ring-accent"
                  />

                  {/* Inline Qty & Rate & Line Total */}
                  <div className="grid grid-cols-3 gap-2 items-center pt-1">
                    <div>
                      <label className="text-[11px] font-semibold text-label-2 block mb-0.5">
                        Qty ({line.unit || 'pcs'})
                      </label>
                      <input
                        type="number"
                        min="1"
                        aria-label="Quantity"
                        value={line.qty}
                        onChange={(e) =>
                          handleUpdateLine(idx, { qty: Math.max(1, parseInt(e.target.value) || 1) })
                        }
                        className="w-full h-9 px-2 bg-surface border border-separator/60 rounded-lg text-subhead font-semibold text-label focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-label-2 block mb-0.5">
                        Rate (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        aria-label="Rate"
                        value={paiseToRupees(line.rate)}
                        onChange={(e) =>
                          handleUpdateLine(idx, { rate: rupeesToPaise(parseFloat(e.target.value) || 0) })
                        }
                        className="w-full h-9 px-2 bg-surface border border-separator/60 rounded-lg text-subhead font-semibold text-label focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </div>
                    <div className="text-right">
                      <label className="text-[11px] font-semibold text-label-2 block mb-0.5">
                        Line Total
                      </label>
                      <span className="text-subhead font-bold text-label tabular-nums">
                        {formatINR(line.amount)}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </InsetGroup>

          {lines.length > 0 && (
            <div className="p-4 bg-surface rounded-xl border border-separator/50 flex items-center justify-between">
              <span className="text-subhead font-semibold text-label">
                Subtotal ({lines.reduce((a, b) => a + b.qty, 0)} items)
              </span>
              <span className="text-headline font-bold text-label tabular-nums">
                {formatINR(subtotalPaise)}
              </span>
            </div>
          )}

          <div className="flex gap-3 mt-2">
            <Button
              variant="tinted"
              onClick={() => setStep(1)}
              className="flex-1 h-12"
            >
              Back
            </Button>
            <Button
              disabled={lines.length === 0}
              onClick={() => setStep(3)}
              className="flex-1 h-12"
            >
              Continue to Review
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3: TRANSPORT & REVIEW */}
      {step === 3 && (
        <div className="flex flex-col gap-4 pb-12">
          <InsetGroup title="Transport & Dispatch Details">
            <Row
              title="Vehicle Number"
              trailing={
                <input
                  type="text"
                  aria-label="Vehicle Number"
                  placeholder="e.g. PB-10-CZ-8821"
                  value={vehicleNo}
                  onChange={(e) => setVehicleNo(e.target.value)}
                  className="bg-transparent text-label font-semibold text-subhead text-right uppercase focus:outline-none placeholder:normal-case placeholder:text-label-3"
                />
              }
            />
            <Row
              title="LR / Bilty Number"
              trailing={
                <input
                  type="text"
                  aria-label="LR or Bilty Number"
                  placeholder="e.g. LR-99214"
                  value={lrNo}
                  onChange={(e) => setLrNo(e.target.value)}
                  className="bg-transparent text-label font-semibold text-subhead text-right focus:outline-none placeholder:text-label-3"
                />
              }
            />
            <Row
              title="Transporter Name"
              trailing={
                <input
                  type="text"
                  aria-label="Transporter Name"
                  placeholder="e.g. Golden Goods"
                  value={transporter}
                  onChange={(e) => setTransporter(e.target.value)}
                  className="bg-transparent text-label font-semibold text-subhead text-right focus:outline-none placeholder:text-label-3"
                />
              }
            />
            <Row
              title="Remarks / Narration"
              trailing={
                <input
                  type="text"
                  aria-label="Remarks or Narration"
                  placeholder="Optional note"
                  value={narration}
                  onChange={(e) => setNarration(e.target.value)}
                  className="bg-transparent text-label text-subhead text-right focus:outline-none placeholder:text-label-3"
                />
              }
            />
          </InsetGroup>

          <InsetGroup title="Challan Summary & Financials">
            <Row
              title="Party"
              trailing={<span className="font-semibold text-label">{selectedParty?.name}</span>}
              subtitle={selectedParty?.city}
            />
            <Row
              title="Challan Type"
              trailing={<span className="font-semibold capitalize text-accent">{challanType} Challan</span>}
            />
            <Row
              title="Items Count"
              trailing={<span className="tabular-nums font-semibold text-label">{lines.length} lines</span>}
            />
            <Row
              title="Taxable Subtotal"
              trailing={<span className="tabular-nums font-mono font-semibold text-label">{formatINR(subtotalPaise)}</span>}
            />
            <Row
              title="Calculated GST"
              trailing={<span className="tabular-nums font-mono font-semibold text-label-2">{formatINR(gstPaise)}</span>}
            />

            {/* Round-Off Adjustment Controls */}
            <div className="p-3.5 border-b border-separator/30 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-subhead font-semibold text-label">Round-Off Adjustment</span>
                  <span className="text-caption text-label-2">
                    {roundOffMode === 'auto'
                      ? 'Automatic nearest-rupee rounding'
                      : 'Manual rupee adjustment'}
                  </span>
                </div>
                <SegmentedControl
                  options={[
                    { value: 'auto', label: 'Auto' },
                    { value: 'manual', label: 'Manual' },
                  ]}
                  value={roundOffMode}
                  onChange={(val) => {
                    setRoundOffMode(val as 'auto' | 'manual');
                    if (val === 'manual') {
                      setManualRoundOffRupees(paiseToRupees(autoRoundOffResult.roundOffPaise));
                    }
                  }}
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                {roundOffMode === 'manual' ? (
                  <div className="flex items-center gap-2">
                    <span className="text-footnote text-label-2">Adjust ₹:</span>
                    <input
                      type="number"
                      step="0.01"
                      aria-label="Manual round-off adjustment"
                      value={manualRoundOffRupees}
                      onChange={(e) => setManualRoundOffRupees(parseFloat(e.target.value) || 0)}
                      className="w-24 h-8 px-2 bg-surface border border-separator/60 rounded-lg text-subhead font-mono text-right focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>
                ) : (
                  <span className="text-footnote text-label-3">Nearest Rupee Rounding</span>
                )}
                <span className="font-mono font-bold text-subhead text-label tabular-nums">
                  {effectiveRoundOffPaise > 0 ? '+' : ''}{formatINR(effectiveRoundOffPaise, { showDecimals: true })}
                </span>
              </div>
            </div>

            <Row
              title="Grand Total"
              trailing={
                <span className="tabular-nums text-headline font-bold text-accent font-mono">
                  {formatINR(grandTotalPaise)}
                </span>
              }
            />
          </InsetGroup>

          <div className="flex flex-col gap-2.5 mt-2">
            <Button
              fullWidth
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate('queued')}
              className="h-12 flex items-center justify-center gap-2"
            >
              <Truck className="w-5 h-5 stroke-[2.2]" />
              <span>
                {isEditMode
                  ? 'Update & Queue for Tally Sync'
                  : 'Send to Tally (Queue Sync)'}
              </span>
            </Button>

            <div className="flex gap-3">
              <Button
                variant="tinted"
                onClick={() => setStep(2)}
                className="flex-1 h-11"
              >
                Back to Items
              </Button>
              <Button
                variant="tinted"
                disabled={saveMutation.isPending}
                onClick={() => saveMutation.mutate('draft')}
                className="flex-1 h-11"
              >
                {isEditMode ? 'Save Changes as Draft' : 'Save as Draft'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </LargeTitleScreen>
  );
};
