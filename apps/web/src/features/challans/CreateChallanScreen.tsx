import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Plus,
  Trash2,
  Truck,
  UserCheck,
  Search,
} from 'lucide-react';
import { ChallanLine, formatINR, paiseToRupees, rupeesToPaise } from '@saas/shared';
import { api } from '../../api/index.js';
import { useAppStore } from '../../app/store.js';
import { LargeTitleScreen } from '../../components/ui/LargeTitleScreen.js';
import { InsetGroup, Row } from '../../components/ui/InsetGroup.js';
import { SegmentedControl } from '../../components/ui/SegmentedControl.js';
import { Button } from '../../components/ui/Button.js';
import { useToast } from '../../components/ui/Toast.js';

export const CreateChallanScreen: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentCompanyId } = useAppStore();
  const { showToast } = useToast();

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Details
  const [challanType, setChallanType] = useState<'sales' | 'purchase' | 'delivery'>('delivery');
  const [date, setDate] = useState('2026-10-17');
  const [selectedGodownId, setSelectedGodownId] = useState('g1');
  const [selectedPartyId, setSelectedPartyId] = useState('');
  const [partySearch, setPartySearch] = useState('');

  // Step 2: Items
  const [lines, setLines] = useState<ChallanLine[]>([]);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [itemQty, setItemQty] = useState(1);
  const [itemRateRupees, setItemRateRupees] = useState(0);

  // Step 3: Transport & Review
  const [vehicleNo, setVehicleNo] = useState('');
  const [lrNo, setLrNo] = useState('');
  const [transporter, setTransporter] = useState('');
  const [narration, setNarration] = useState('');

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

  const selectedParty = parties.find((p) => p.id === selectedPartyId);

  // When stock item is selected in Step 2, update rate
  const handleSelectItem = (id: string) => {
    setSelectedItemId(id);
    const item = stockItems.find((s) => s.id === id);
    if (item) {
      setItemRateRupees(paiseToRupees(item.rate));
    }
  };

  const handleAddLine = () => {
    const item = stockItems.find((s) => s.id === selectedItemId);
    if (!item) return;

    const ratePaise = rupeesToPaise(itemRateRupees);
    const amountPaise = ratePaise * itemQty;

    setLines((prev) => [
      ...prev,
      {
        itemId: item.id,
        description: item.name,
        qty: itemQty,
        unit: item.unit,
        rate: ratePaise,
        amount: amountPaise,
      },
    ]);

    // Reset item selector
    setSelectedItemId('');
    setItemQty(1);
    setItemRateRupees(0);
  };

  const handleRemoveLine = (idx: number) => {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const subtotalPaise = lines.reduce((acc, l) => acc + l.amount, 0);
  const gstPaise = Math.round(subtotalPaise * 0.18); // 18% GST standard
  const grandTotalPaise = subtotalPaise + gstPaise;

  const createMutation = useMutation({
    mutationFn: async (status: 'draft' | 'queued') => {
      return api.challans.create({
        companyId: currentCompanyId === 'all' ? 'c1' : currentCompanyId,
        type: challanType,
        number: '',
        date,
        partyId: selectedPartyId,
        godownId: selectedGodownId,
        lines,
        vehicleNo: vehicleNo.trim() ? vehicleNo.trim().toUpperCase() : undefined,
        lrNo: lrNo.trim() ? lrNo.trim() : undefined,
        transporter: transporter.trim() ? transporter.trim() : undefined,
        narration: narration.trim() ? narration.trim() : undefined,
        status,
        createdBy: 'u-owner',
      });
    },
    onSuccess: (newChallan) => {
      queryClient.invalidateQueries({ queryKey: ['challans'] });
      queryClient.invalidateQueries({ queryKey: ['outbox'] });

      if (newChallan.status === 'queued') {
        showToast({ message: 'Challan queued for Tally sync' });
        navigate(`/challans/${newChallan.id}`);
      } else {
        showToast({ message: 'Challan saved as draft' });
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
      title="New Challan"
      headerAction={
        <button
          type="button"
          onClick={() => navigate('/challans')}
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
                        {p.city} · {p.phones[0]}
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
          {/* Quick Machinery Shortcuts */}
          <div className="bg-surface/60 p-3 rounded-2xl border border-separator/40 flex flex-col gap-2">
            <span className="text-footnote font-semibold text-label">
              Quick Add Machinery:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {stockItems
                .filter(
                  (item) =>
                    item.name.toUpperCase().includes('MACHINE') ||
                    item.group.toLowerCase().includes('machine')
                )
                .map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setLines((prev) => [
                        ...prev,
                        {
                          itemId: item.id,
                          description: item.name,
                          qty: 1,
                          unit: item.unit,
                          rate: item.rate,
                          amount: item.rate * 1,
                        },
                      ]);
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-surface border border-separator/60 text-footnote font-semibold text-label hover:border-accent hover:text-accent active:bg-fill/50 transition-colors flex items-center gap-1.5 shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5 text-accent stroke-[2.5]" />
                    <span>{item.name}</span>
                    <span className="text-caption text-label-3">
                      ({formatINR(item.rate)})
                    </span>
                  </button>
                ))}
            </div>
          </div>

          <InsetGroup title="Add Stock Item">
            <div className="p-4 flex flex-col gap-3">
              <div>
                <label className="text-caption font-semibold uppercase text-label-2 mb-1 block">
                  Select Item
                </label>
                <select
                  value={selectedItemId}
                  onChange={(e) => handleSelectItem(e.target.value)}
                  className="w-full h-11 px-3 bg-surface border border-separator/60 rounded-xl text-subhead text-label focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                >
                  <option value="">-- Choose Stock Item --</option>
                  {stockItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.unit}) · ₹{paiseToRupees(item.rate)}
                    </option>
                  ))}
                </select>
              </div>

              {selectedItemId && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-caption font-semibold uppercase text-label-2 mb-1 block">
                      Quantity
                    </label>
                    <div className="flex items-center h-11 bg-surface border border-separator/60 rounded-xl px-2 gap-2">
                      <input
                        type="number"
                        min="1"
                        value={itemQty}
                        onChange={(e) => setItemQty(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full bg-transparent text-label font-semibold text-subhead focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-caption font-semibold uppercase text-label-2 mb-1 block">
                      Rate (₹)
                    </label>
                    <div className="flex items-center h-11 bg-surface border border-separator/60 rounded-xl px-3">
                      <input
                        type="number"
                        min="0"
                        value={itemRateRupees}
                        onChange={(e) => setItemRateRupees(parseFloat(e.target.value) || 0)}
                        className="w-full bg-transparent text-label font-semibold text-subhead focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {selectedItemId && (
                <div className="flex items-center justify-between pt-2 border-t border-separator/40">
                  <span className="text-subhead text-label-2">Line Total:</span>
                  <span className="text-headline font-bold text-label tabular-nums">
                    ₹{(itemQty * itemRateRupees).toLocaleString('en-IN')}
                  </span>
                </div>
              )}

              <Button
                variant="tinted"
                fullWidth
                disabled={!selectedItemId}
                onClick={handleAddLine}
                className="mt-1"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                <span>Add Item to Challan</span>
              </Button>
            </div>
          </InsetGroup>

          {/* Current Lines Added */}
          <InsetGroup title={`Items Added (${lines.length})`}>
            {lines.length === 0 ? (
              <div className="p-8 text-center text-label-2 text-subhead">
                No items added yet. Select an item above.
              </div>
            ) : (
              lines.map((line, idx) => (
                <div
                  key={idx}
                  className="p-3.5 flex items-center justify-between border-b last:border-b-0 border-separator/30"
                >
                  <div className="flex flex-col min-w-0 pr-3">
                    <span className="text-subhead font-semibold text-label truncate">
                      {line.description}
                    </span>
                    <span className="text-caption text-label-2 tabular-nums">
                      {line.qty} {line.unit} × {formatINR(line.rate)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-subhead font-bold text-label tabular-nums">
                      {formatINR(line.amount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveLine(idx)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-label-3 hover:text-danger hover:bg-danger/10 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
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
                  placeholder="Optional note"
                  value={narration}
                  onChange={(e) => setNarration(e.target.value)}
                  className="bg-transparent text-label text-subhead text-right focus:outline-none placeholder:text-label-3"
                />
              }
            />
          </InsetGroup>

          <InsetGroup title="Challan Summary">
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
              title="Estimated GST (18%)"
              trailing={<span className="tabular-nums text-label-2">{formatINR(gstPaise)}</span>}
            />
            <Row
              title="Grand Total"
              trailing={
                <span className="tabular-nums text-headline font-bold text-accent">
                  {formatINR(grandTotalPaise)}
                </span>
              }
            />
          </InsetGroup>

          <div className="flex flex-col gap-2.5 mt-2">
            <Button
              fullWidth
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate('queued')}
              className="h-12 flex items-center justify-center gap-2"
            >
              <Truck className="w-5 h-5 stroke-[2.2]" />
              <span>Send to Tally (Queue Sync)</span>
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
                disabled={createMutation.isPending}
                onClick={() => createMutation.mutate('draft')}
                className="flex-1 h-11"
              >
                Save as Draft
              </Button>
            </div>
          </div>
        </div>
      )}
    </LargeTitleScreen>
  );
};
