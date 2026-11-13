import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Send,
  Info,
  Phone,
  PhoneCall,
  Calendar,
  PauseCircle,
  ExternalLink,
  MessageSquare,
  Check,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { can, formatINR, getDaysOverdue, Party } from '@saas/shared';
import { api } from '../../api/index.js';
import { useAppStore } from '../../app/store.js';
import { LargeTitleScreen } from '../../components/ui/LargeTitleScreen.js';
import { InsetGroup, Row } from '../../components/ui/InsetGroup.js';
import { Button } from '../../components/ui/Button.js';
import { SegmentedControl } from '../../components/ui/SegmentedControl.js';
import { Sheet } from '../../components/ui/Sheet.js';
import { StatusText } from '../../components/ui/StatusText.js';
import { useToast } from '../../components/ui/Toast.js';
import { FIXED_TODAY } from '../../mock/seed.js';
import { openWhatsAppReminderUrl } from '../reminders/whatsapp.js';

function cleanPhoneForWhatsApp(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length === 10) {
    return `91${digits}`;
  }
  return digits;
}

function cleanPhoneForTel(phone: string): string {
  return phone.replace(/\s+/g, '');
}

export const PartyDetailScreen: React.FC = () => {
  const { partyId = '' } = useParams<{ partyId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentCompanyId, currentRole, currentUser } = useAppStore();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'bills' | 'challans' | 'statement' | 'history'>('bills');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [reminderSheetOpen, setReminderSheetOpen] = useState(false);
  const [estimatedInfoOpen, setEstimatedInfoOpen] = useState(false);
  const [selectedPhone, setSelectedPhone] = useState<string>('');
  const [reminderDueDays, setReminderDueDays] = useState<number>(30);
  const [newPhoneInput, setNewPhoneInput] = useState('');
  const [addingPhone, setAddingPhone] = useState(false);

  // R4: Bills date range filter state
  const [billStartDate, setBillStartDate] = useState('');
  const [billEndDate, setBillEndDate] = useState('');
  const [billStatusFilter, setBillStatusFilter] = useState<'all' | 'pending' | 'settled'>('all');

  // Challans date range filter state
  const [challanStartDate, setChallanStartDate] = useState('');
  const [challanEndDate, setChallanEndDate] = useState('');

  // Fetch party data
  const { data: party, isLoading: partyLoading } = useQuery({
    queryKey: ['party', partyId],
    queryFn: () => api.parties.get(partyId),
  });

  // Fetch party bills with date range filters
  const { data: bills = [] } = useQuery({
    queryKey: ['party-bills', currentCompanyId, partyId, billStartDate, billEndDate],
    queryFn: () =>
      api.bills.list(currentCompanyId, partyId, {
        startDate: billStartDate || undefined,
        endDate: billEndDate || undefined,
      }),
  });

  // Fetch party delivery and purchase challans with date range filters
  const { data: partyChallans = [] } = useQuery({
    queryKey: ['party-challans', currentCompanyId, partyId, challanStartDate, challanEndDate],
    queryFn: () =>
      api.challans.list(currentCompanyId, undefined, 'all', undefined, {
        partyId,
        startDate: challanStartDate || undefined,
        endDate: challanEndDate || undefined,
      }),
  });

  // Fetch ledger statement
  const { data: ledger = [] } = useQuery({
    queryKey: ['party-ledger', partyId],
    queryFn: () => api.ledger.get(partyId),
  });

  // Fetch reminder thread & history
  const { data: threads = [] } = useQuery({
    queryKey: ['party-threads', currentCompanyId],
    queryFn: () => api.reminders.replies.list(currentCompanyId),
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => api.companies.list(),
  });
  const activeCompany = companies.find((c) => c.id === currentCompanyId);

  const partyThread = threads.find((t) => t.partyId === partyId);

  // Update party mutation (e.g. toggle pause reminders, update phones)
  const updatePartyMutation = useMutation({
    mutationFn: (updates: Partial<Party>) =>
      api.parties.update(partyId, updates),
    onSuccess: (updated) => {
      queryClient.setQueryData(['party', partyId], updated);
      showToast({
        message: updated.remindersPaused
          ? 'Reminders paused for this customer'
          : 'Reminders resumed',
        undoAction: () => {
          updatePartyMutation.mutate({ remindersPaused: !updated.remindersPaused });
        },
      });
    },
  });

  const canEdit = can(currentUser || currentRole, 'party.edit');
  const canSend = can(currentUser || currentRole, 'reminders.send');

  const isCreditor =
    party?.partyType === 'creditor' ||
    Boolean(party?.parentGroup && party?.parentGroup.toLowerCase().includes('creditor')) ||
    Boolean(party?.notes && party?.notes.toLowerCase().includes('creditor'));

  const tallyPhones = party?.phones ?? [];
  const localPhones = party?.customPhones ?? [];
  const allPhones = React.useMemo(() => [
    ...tallyPhones.map((p) => ({ phone: p, source: 'tally' as const, label: 'Tally Master' })),
    ...localPhones.map((p) => ({ phone: p, source: 'local' as const, label: 'Local Contact' })),
  ], [tallyPhones, localPhones]);

  const targetPhone = selectedPhone || tallyPhones[0] || localPhones[0] || '';

  const isDemo = party?.id?.startsWith('demo-');
  const totalOwed =
    party?.closingBalance !== undefined && party?.closingBalance !== null && !isDemo
      ? (isCreditor ? Math.abs(party.closingBalance) : party.closingBalance)
      : (bills.length > 0 ? bills.reduce((sum, b) => sum + b.pending, 0) : 0);

  // Find oldest bill days late (strictly for debtors with positive total balance)
  let maxDaysLate = 0;
  if (!isCreditor && totalOwed > 0) {
    for (const b of bills) {
      if (b.pending > 0) {
        const days = getDaysOverdue(b.dueDate, FIXED_TODAY);
        if (days > maxDaysLate) maxDaysLate = days;
      }
    }
  }

  const handleAddLocalPhone = () => {
    const trimmed = newPhoneInput.trim();
    if (!trimmed) return;
    const currentCustom = party?.customPhones ?? [];
    if (currentCustom.includes(trimmed) || (party?.phones ?? []).includes(trimmed)) {
      showToast({
        message: 'This contact number is already recorded for this party',
        variant: 'neutral',
      });
      return;
    }
    const updated = [...currentCustom, trimmed];
    updatePartyMutation.mutate(
      { customPhones: updated },
      {
        onSuccess: () => {
          setNewPhoneInput('');
          setAddingPhone(false);
          showToast({
            message: 'Local contact number added successfully',
            variant: 'success',
          });
        },
      }
    );
  };

  const handleDeleteLocalPhone = (phoneToDelete: string) => {
    const currentCustom = party?.customPhones ?? [];
    const updated = currentCustom.filter((p) => p !== phoneToDelete);
    updatePartyMutation.mutate(
      { customPhones: updated },
      {
        onSuccess: () => {
          showToast({
            message: 'Local contact number removed',
            variant: 'success',
          });
          if (selectedPhone === phoneToDelete) {
            setSelectedPhone('');
          }
        },
      }
    );
  };

  const handleSendReminder = () => {
    setReminderSheetOpen(false);
    if (party && !isCreditor) {
      const computedDueDate = bills[0]?.date
        ? new Date(Date.parse(bills[0].date) + reminderDueDays * 86400000).toISOString().slice(0, 10)
        : bills[0]?.dueDate;
      openWhatsAppReminderUrl({
        phone: targetPhone,
        partyName: party.name,
        overdueAmountPaise: totalOwed,
        oldestBillNo: bills[0]?.billNo,
        daysLate: maxDaysLate,
        dueDate: computedDueDate,
        companyName: activeCompany?.name,
      });
      showToast({
        message: `Opening WhatsApp with built reminder for ${party.name}...`,
        variant: 'success',
      });
    }
  };

  if (partyLoading || !party) {
    return (
      <LargeTitleScreen title="Customer" showBack>
        <div className="p-8 text-center text-label-2 animate-pulse">
          Loading customer records...
        </div>
      </LargeTitleScreen>
    );
  }

  // Calculate running ledger balance
  let runningBal = 0;
  const ledgerWithBalance = ledger.map((line) => {
    runningBal += line.debit - line.credit;
    return {
      ...line,
      balance: runningBal,
    };
  });

  return (
    <LargeTitleScreen
      title={party.name}
      subtitle={
        <div className="flex items-center gap-2">
          <span className="text-subhead text-label-2 font-medium">
            {party.city}
          </span>
          <span
            className={`px-1.5 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider ${
              isCreditor
                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                : 'bg-accent-soft text-accent'
            }`}
          >
            {isCreditor ? 'Supplier' : 'Customer'}
          </span>
        </div>
      }
      showBack
      headerAction={
        <button
          type="button"
          onClick={() => setDetailsOpen(true)}
          className="text-subhead font-semibold text-accent px-2 py-1 rounded-lg hover:bg-fill/60 active:opacity-60 transition-all"
        >
          Details
        </button>
      }
    >
      {/* Hero Card: Total Owed / Payable */}
      <div className="bg-surface rounded-ios-card p-5 border border-separator/40 shadow-[0_2px_8px_rgba(0,0,0,0.03)] flex flex-col gap-3">
        <div className="flex flex-col">
          <div className="flex items-center justify-between">
            <span className="text-subhead text-label-2 font-medium">
              {isCreditor ? 'Payable (You owe)' : 'Currently owes'}
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-caption font-semibold uppercase tracking-wider ${
                isCreditor
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/20'
                  : 'bg-accent-soft text-accent border border-accent/20'
              }`}
            >
              {isCreditor ? 'Sundry Creditor (Supplier)' : 'Sundry Debtor (Customer)'}
            </span>
          </div>
          <div className="text-hero-num text-label font-semibold tracking-tight tabular-nums mt-0.5">
            {formatINR(totalOwed)}
          </div>
          {isCreditor ? (
            <div className="text-subhead text-label-2 font-medium mt-1">
              Supplier account · Reminders disabled
            </div>
          ) : maxDaysLate > 0 ? (
            <div className="text-subhead text-danger font-medium mt-1">
              Oldest bill is {maxDaysLate} days late.
            </div>
          ) : (
            <div className="text-subhead text-label-2 font-medium mt-1">
              All bills are within credit period.
            </div>
          )}
        </div>

        {/* Reminders enabled strictly for Customer Debtors who owe money */}
        {!isCreditor && canSend && (
          <div className="pt-2">
            <Button
              fullWidth
              onClick={() => setReminderSheetOpen(true)}
              disabled={party.remindersPaused}
            >
              <Send className="w-5 h-5 mr-2 stroke-[2.2]" />
              <span>Send reminder</span>
            </Button>
            {party.remindersPaused && (
              <p className="text-footnote text-warn text-center mt-1.5 font-medium">
                Reminders are currently paused for this customer.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Quick Contact Bar */}
      {allPhones.length > 0 && (
        <div className="bg-surface rounded-ios-card p-3.5 border border-separator/40 shadow-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-accent-soft text-accent flex items-center justify-center shrink-0">
              <Phone className="w-4 h-4" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-subhead font-semibold text-label truncate">
                {targetPhone}
              </span>
              <span className="text-caption text-label-2">
                {allPhones.find((p) => p.phone === targetPhone)?.label ?? 'Contact'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <a
              href={`tel:${cleanPhoneForTel(targetPhone)}`}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-fill/70 hover:bg-fill text-label text-caption font-semibold transition-colors"
              aria-label={`Call ${targetPhone}`}
            >
              <PhoneCall className="w-3.5 h-3.5 text-accent" />
              <span>Call</span>
            </a>
            <a
              href={`https://wa.me/${cleanPhoneForWhatsApp(targetPhone)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ok/10 hover:bg-ok/20 text-ok text-caption font-semibold transition-colors"
              aria-label={`WhatsApp ${targetPhone}`}
            >
              <MessageSquare className="w-3.5 h-3.5 text-ok" />
              <span>WhatsApp</span>
            </a>
          </div>
        </div>
      )}

      {/* 4-Option Segmented Control */}
      <SegmentedControl
        options={[
          { value: 'bills', label: 'Bills' },
          { value: 'challans', label: 'Challans' },
          { value: 'statement', label: 'Statement' },
          { value: 'history', label: 'History' },
        ]}
        value={activeTab}
        onChange={(val) => setActiveTab(val as typeof activeTab)}
      />

      {/* Tab 1: Bills */}
      {activeTab === 'bills' && (
        <div className="flex flex-col gap-3">
          {/* Date Range Filter Bar */}
          <div className="p-3 bg-surface rounded-xl border border-separator/50 flex flex-col gap-2 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-caption font-semibold uppercase tracking-wider text-label-2">
                Filter by Date Range
              </span>
              {(billStartDate || billEndDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setBillStartDate('');
                    setBillEndDate('');
                  }}
                  className="text-caption font-semibold text-accent hover:underline flex items-center gap-1"
                >
                  <X className="w-3 h-3" />
                  <span>Clear Dates</span>
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="party-bills-from-date" className="text-[11px] text-label-3 font-medium block mb-1">
                  From Date
                </label>
                <input
                  id="party-bills-from-date"
                  type="date"
                  aria-label="From Date"
                  value={billStartDate}
                  onChange={(e) => setBillStartDate(e.target.value)}
                  className="w-full h-9 px-2 bg-fill/30 border border-separator/40 rounded-lg text-footnote text-label focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              <div>
                <label htmlFor="party-bills-to-date" className="text-[11px] text-label-3 font-medium block mb-1">
                  To Date
                </label>
                <input
                  id="party-bills-to-date"
                  type="date"
                  aria-label="To Date"
                  value={billEndDate}
                  onChange={(e) => setBillEndDate(e.target.value)}
                  className="w-full h-9 px-2 bg-fill/30 border border-separator/40 rounded-lg text-footnote text-label focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>
            {/* Status Segmented Filter */}
            <div className="flex items-center gap-1.5 pt-1">
              {(['all', 'pending', 'settled'] as const).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setBillStatusFilter(filter)}
                  className={`px-3 py-1 rounded-lg text-caption font-semibold transition-all ${
                    billStatusFilter === filter
                      ? 'bg-accent text-accent-contrast shadow-xs'
                      : 'bg-fill/40 text-label-2 hover:bg-fill/60'
                  }`}
                >
                  {filter === 'all' ? 'All' : filter === 'pending' ? 'Pending Dues' : 'Settled (Paid)'}
                </button>
              ))}
            </div>
          </div>

          <InsetGroup>
            {bills.filter((b) => {
              const isPartySettled = (party?.closingBalance ?? 0) <= 0 && Boolean(party?.notes?.includes('Imported from Tally'));
              const effPending = isPartySettled ? 0 : b.pending;
              if (billStatusFilter === 'pending') return effPending !== 0;
              if (billStatusFilter === 'settled') return effPending === 0;
              return true;
            }).length === 0 ? (
              <div className="p-6 text-center text-label-2 text-subhead">
                {billStartDate || billEndDate
                  ? 'No bills match the selected date range.'
                  : billStatusFilter === 'pending'
                    ? 'No pending dues for this customer.'
                    : 'No bills found.'}
              </div>
            ) : (
              bills.filter((b) => {
                const isPartySettled = (party?.closingBalance ?? 0) <= 0 && Boolean(party?.notes?.includes('Imported from Tally'));
                const effPending = isPartySettled ? 0 : b.pending;
                if (billStatusFilter === 'pending') return effPending !== 0;
                if (billStatusFilter === 'settled') return effPending === 0;
                return true;
              }).map((bill) => {
                const isPartySettled = (party?.closingBalance ?? 0) <= 0 && Boolean(party?.notes?.includes('Imported from Tally'));
                const effPending = isPartySettled ? 0 : bill.pending;
                const daysLate = effPending > 0 ? getDaysOverdue(bill.dueDate, FIXED_TODAY) : 0;
                const isEstimated = bill.source === 'estimated';

                return (
                  <Row
                    key={bill.id}
                    title={bill.billNo}
                    subtitle={
                      <span className="inline-flex items-center gap-1.5 flex-wrap">
                        <span className="text-label-2">Inv: {bill.date}</span>
                        <span className="text-label-3">·</span>
                        <span className="font-semibold text-label">Due: {bill.dueDate}</span>
                        <span className="text-caption text-label-3">
                          ({party.creditDays}d terms)
                        </span>
                        {isEstimated && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEstimatedInfoOpen(true);
                            }}
                            className="inline-flex items-center gap-0.5 text-label-3 hover:text-accent ml-0.5"
                          >
                            <span>· Estimated</span>
                            <Info className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </span>
                    }
                    trailing={
                      <span className="tabular-nums font-semibold">
                        {effPending < 0
                          ? `${formatINR(Math.abs(effPending))} Cr`
                          : effPending === 0
                            ? <span className="text-label-3">₹0 (Paid)</span>
                            : formatINR(effPending)}
                      </span>
                    }
                    trailingSubtitle={
                      effPending > 0 ? (
                        daysLate > 0 ? (
                          <span className="text-danger font-semibold">
                            {daysLate} days late
                          </span>
                        ) : (
                          <span className="text-ok font-medium">Within terms</span>
                        )
                      ) : effPending < 0 ? (
                        <span className="text-ok font-medium">Credit / Advance</span>
                      ) : (
                        <span className="text-label-3 font-medium">Settled</span>
                      )
                    }
                  />
                );
              })
            )}
          </InsetGroup>
        </div>
      )}

      {/* Tab: Challans (Delivery Notes & Purchase Challans) */}
      {activeTab === 'challans' && (
        <div className="flex flex-col gap-3">
          {/* Date Range Filter Bar */}
          <div className="p-3 bg-surface rounded-xl border border-separator/50 flex flex-col gap-2 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-caption font-semibold uppercase tracking-wider text-label-2">
                Filter Challans by Date
              </span>
              {(challanStartDate || challanEndDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setChallanStartDate('');
                    setChallanEndDate('');
                  }}
                  className="text-caption font-semibold text-accent hover:underline flex items-center gap-1"
                >
                  <X className="w-3 h-3" />
                  <span>Clear Dates</span>
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="party-challans-from-date" className="text-[11px] text-label-3 font-medium block mb-1">
                  From Date
                </label>
                <input
                  id="party-challans-from-date"
                  type="date"
                  aria-label="From Date"
                  value={challanStartDate}
                  onChange={(e) => setChallanStartDate(e.target.value)}
                  className="w-full h-9 px-2 bg-fill/30 border border-separator/40 rounded-lg text-footnote text-label focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              <div>
                <label htmlFor="party-challans-to-date" className="text-[11px] text-label-3 font-medium block mb-1">
                  To Date
                </label>
                <input
                  id="party-challans-to-date"
                  type="date"
                  aria-label="To Date"
                  value={challanEndDate}
                  onChange={(e) => setChallanEndDate(e.target.value)}
                  className="w-full h-9 px-2 bg-fill/30 border border-separator/40 rounded-lg text-footnote text-label focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>
          </div>

          <InsetGroup>
            {partyChallans.length === 0 ? (
              <div className="p-6 text-center text-label-2 text-subhead">
                {challanStartDate || challanEndDate
                  ? 'No challans match the selected date range.'
                  : 'No past delivery or purchase challans for this party.'}
              </div>
            ) : (
              partyChallans.map((ch) => {
                const totalAmount = (ch.lines || []).reduce(
                  (acc: number, line: any) => acc + (line.amount || 0),
                  0
                );
                const itemsCount = (ch.lines || []).reduce(
                  (acc: number, line: any) => acc + (line.qty || 0),
                  0
                );
                return (
                  <Row
                    key={ch.id}
                    title={
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{ch.number}</span>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            ch.type === 'purchase'
                              ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {ch.type === 'purchase' ? 'Purchase' : 'Sales / Delivery'}
                        </span>
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-fill text-label-2 capitalize">
                          {ch.status}
                        </span>
                      </div>
                    }
                    subtitle={
                      <div className="flex flex-col gap-0.5 mt-0.5">
                        <span className="text-caption text-label-2">
                          Date: {ch.date} · {itemsCount} items ({(ch.lines || []).length} lines)
                        </span>
                        {(ch.lines || []).length > 0 && (
                          <span className="text-[11px] text-label-3 truncate max-w-[280px]">
                            {(ch.lines || []).map((l: any) => `${l.qty}x ${l.itemName || l.description || 'Item'}`).join(', ')}
                          </span>
                        )}
                        {ch.narration && (
                          <span className="text-[11px] text-label-3 italic truncate max-w-[280px]">
                            {ch.narration}
                          </span>
                        )}
                      </div>
                    }
                    trailing={totalAmount > 0 ? <span className="tabular-nums font-semibold">{formatINR(totalAmount)}</span> : undefined}
                    chevron
                    onClick={() => navigate(`/challans/${ch.id}`)}
                  />
                );
              })
            )}
          </InsetGroup>
        </div>
      )}

      {/* Tab 2: Statement (Tally Ledger with running balance) */}
      {activeTab === 'statement' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-footnote font-semibold uppercase tracking-wider text-label-2">
              FY 2026-27 (1-Apr to 31-Mar)
            </span>
            <button
              type="button"
              onClick={() => navigate(`/print/statement/${party.id}`)}
              className="text-subhead font-semibold text-accent inline-flex items-center gap-1 hover:opacity-80 transition-opacity"
            >
              <span>View PDF</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="bg-surface rounded-ios-card overflow-hidden border border-separator/40 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-subhead">
                <thead>
                  <tr className="border-b border-separator/50 bg-fill/30 text-footnote font-semibold text-label-2">
                    <th className="py-2.5 px-3 whitespace-nowrap">Date</th>
                    <th className="py-2.5 px-3">Particulars</th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">Debit (₹)</th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">Credit (₹)</th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-separator/30 text-body">
                  {ledgerWithBalance.map((line, idx) => (
                    <tr key={idx} className="hover:bg-fill/20 transition-colors">
                      <td className="py-3 px-3 text-footnote text-label-2 whitespace-nowrap">
                        {line.date}
                      </td>
                      <td className="py-3 px-3 text-label font-medium min-w-[180px]">
                        <div>{line.particulars}</div>
                        <div className="text-caption text-label-2">
                          {line.voucherType} · {line.voucherNo}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-semibold text-label whitespace-nowrap tabular-nums">
                        {line.debit > 0 ? formatINR(line.debit, { symbol: false }) : '—'}
                      </td>
                      <td className="py-3 px-3 text-right font-semibold text-ok whitespace-nowrap tabular-nums">
                        {line.credit > 0 ? formatINR(line.credit, { symbol: false }) : '—'}
                      </td>
                      <td className="py-3 px-3 text-right font-semibold text-label whitespace-nowrap tabular-nums">
                        {formatINR(line.balance, { drCr: true })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: History */}
      {activeTab === 'history' && (
        <InsetGroup title="Recent Reminders & Notes">
          {partyThread ? (
            partyThread.messages.map((msg, idx) => (
              <Row
                key={idx}
                leading={
                  msg.from === 'customer' ? (
                    <div className="w-8 h-8 rounded-full bg-accent-soft text-accent flex items-center justify-center">
                      <MessageSquare className="w-4 h-4" />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-fill text-label-2 flex items-center justify-center">
                      <Send className="w-4 h-4" />
                    </div>
                  )
                }
                title={msg.from === 'customer' ? 'Customer WhatsApp Reply' : 'WhatsApp Reminder Sent'}
                subtitle={msg.text}
                trailing={
                  <span className="text-footnote text-label-2">
                    {msg.at.slice(11, 16)}
                  </span>
                }
                trailingSubtitle={
                  msg.from === 'us' && <StatusText text="Delivered" variant="ok" />
                }
              />
            ))
          ) : (
            <div className="p-6 text-center text-label-2 text-subhead">
              No reminder activity recorded yet.
            </div>
          )}
        </InsetGroup>
      )}

      {/* Details Sheet (Edit party parameters) */}
      <Sheet
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        title="Customer Details"
        description="Settings and contact preferences"
      >
        <div className="flex flex-col gap-5 pt-2">
          {/* Pause reminders toggle */}
          <div className="flex items-center justify-between p-3.5 bg-fill/40 rounded-xl">
            <div className="flex items-center gap-3">
              <PauseCircle className="w-5 h-5 text-label-2" />
              <div className="flex flex-col">
                <span className="text-headline font-semibold text-label">
                  Pause Reminders
                </span>
                <span className="text-footnote text-label-2">
                  Skip automated reminder dispatches
                </span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={party.remindersPaused}
              disabled={!canEdit}
              onChange={(e) =>
                updatePartyMutation.mutate({ remindersPaused: e.target.checked })
              }
              className="w-6 h-6 accent-accent rounded cursor-pointer"
            />
          </div>

          {/* Section 1: Tally Master Numbers */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-footnote font-semibold uppercase tracking-wider text-label-2 block">
                  Tally Master Numbers
                </label>
                <span className="text-caption text-label-3 font-medium">Read-only · Synced from Tally ERP</span>
              </div>
            </div>

            {tallyPhones.length === 0 ? (
              <div className="p-3 bg-fill/20 border border-separator/30 rounded-xl text-footnote text-label-3 italic">
                No master numbers recorded in Tally.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {tallyPhones.map((phone, idx) => (
                  <div
                    key={`tally-${idx}`}
                    className="flex items-center justify-between p-3 bg-surface border border-separator/50 rounded-xl"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Phone className="w-4 h-4 text-label-2 shrink-0" />
                      <span className="text-subhead font-semibold text-label truncate">{phone}</span>
                      {idx === 0 && (
                        <span className="text-caption font-semibold bg-accent-soft text-accent px-2 py-0.5 rounded-full shrink-0">
                          Primary
                        </span>
                      )}
                      <span className="text-caption font-medium bg-fill text-label-2 px-1.5 py-0.5 rounded shrink-0">
                        Tally
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <a
                        href={`tel:${cleanPhoneForTel(phone)}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-fill/60 hover:bg-fill text-label text-caption font-semibold transition-colors"
                        aria-label={`Call ${phone}`}
                      >
                        <PhoneCall className="w-3.5 h-3.5 text-accent" />
                        <span>Call</span>
                      </a>
                      <a
                        href={`https://wa.me/${cleanPhoneForWhatsApp(phone)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-ok/10 hover:bg-ok/20 text-ok text-caption font-semibold transition-colors"
                        aria-label={`WhatsApp ${phone}`}
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-ok" />
                        <span>WhatsApp</span>
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 2: Local Contact Numbers */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-footnote font-semibold uppercase tracking-wider text-label-2 block">
                  Local Contact Numbers
                </label>
                <span className="text-caption text-label-3 font-medium">Stored locally · Preserved across Tally syncs</span>
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setAddingPhone(!addingPhone)}
                  className="text-caption font-semibold text-accent hover:underline inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{addingPhone ? 'Cancel' : 'Add Number'}</span>
                </button>
              )}
            </div>

            {addingPhone && (
              <div className="flex items-center gap-2 p-2 bg-fill/40 rounded-xl border border-separator/40">
                <input
                  type="tel"
                  placeholder="+91 98140 00000"
                  value={newPhoneInput}
                  onChange={(e) => setNewPhoneInput(e.target.value)}
                  className="flex-1 h-9 px-3 bg-surface rounded-lg border border-separator/50 text-subhead font-mono outline-none focus:border-accent"
                />
                <Button size="small" onClick={handleAddLocalPhone}>
                  Add
                </Button>
              </div>
            )}

            {localPhones.length === 0 ? (
              <div className="p-3 bg-fill/20 border border-separator/30 rounded-xl text-footnote text-label-3 italic">
                No local contact numbers saved yet. Add one above.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {localPhones.map((phone, idx) => (
                  <div
                    key={`local-${idx}`}
                    className="flex items-center justify-between p-3 bg-surface border border-separator/50 rounded-xl"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Phone className="w-4 h-4 text-label-2 shrink-0" />
                      <span className="text-subhead font-semibold text-label truncate">{phone}</span>
                      <span className="text-caption font-medium bg-ok/10 text-ok px-1.5 py-0.5 rounded shrink-0">
                        Local
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <a
                        href={`tel:${cleanPhoneForTel(phone)}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-fill/60 hover:bg-fill text-label text-caption font-semibold transition-colors"
                        aria-label={`Call ${phone}`}
                      >
                        <PhoneCall className="w-3.5 h-3.5 text-accent" />
                        <span>Call</span>
                      </a>
                      <a
                        href={`https://wa.me/${cleanPhoneForWhatsApp(phone)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-ok/10 hover:bg-ok/20 text-ok text-caption font-semibold transition-colors"
                        aria-label={`WhatsApp ${phone}`}
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-ok" />
                        <span>WhatsApp</span>
                      </a>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => handleDeleteLocalPhone(phone)}
                          aria-label={`Delete ${phone}`}
                          className="p-1.5 text-danger/80 hover:text-danger hover:bg-danger/10 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Credit Terms */}
          <div className="flex items-center justify-between p-3.5 bg-surface border border-separator/50 rounded-xl">
            <div className="flex items-center gap-2.5">
              <Calendar className="w-4 h-4 text-label-2" />
              <span className="text-subhead font-semibold text-label">Credit Period</span>
            </div>
            <span className="text-subhead font-semibold text-label">
              {party.creditDays} Days
            </span>
          </div>

          {/* Internal Notes */}
          <div className="flex flex-col gap-1.5">
            <label className="text-footnote font-semibold uppercase tracking-wider text-label-2">
              Notes
            </label>
            <div className="p-3 bg-fill/30 border border-separator/40 rounded-xl text-subhead text-label">
              {party.notes || 'No notes added yet.'}
            </div>
          </div>
        </div>
      </Sheet>

      {/* Send Reminder Sheet (Single WhatsApp-style preview bubble) */}
      <Sheet
        open={reminderSheetOpen}
        onOpenChange={setReminderSheetOpen}
        title="Send Payment Reminder"
        description="Via official WhatsApp Meta Cloud API"
      >
        <div className="flex flex-col gap-4 pt-2">
          {/* Due Date Term Selector (Applied after X Days) */}
          <div className="flex flex-col gap-1.5 bg-surface p-3 rounded-xl border border-separator/50">
            <div className="flex items-center justify-between">
              <span className="text-footnote font-semibold uppercase tracking-wider text-label-2">
                Due Date Term (Applied after X days)
              </span>
              <span className="text-caption font-bold text-accent">
                {reminderDueDays} Days Credit
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5 mt-1">
              {[7, 15, 30, 45].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setReminderDueDays(d)}
                  className={`py-1.5 px-2 rounded-lg text-caption font-semibold transition-all border ${
                    reminderDueDays === d
                      ? 'bg-accent text-white border-accent shadow-sm'
                      : 'bg-fill/40 border-separator/40 text-label hover:bg-fill/60'
                  }`}
                >
                  {d} Days
                </button>
              ))}
            </div>
          </div>

          {/* WhatsApp message bubble */}
          <div className="p-4 rounded-2xl bg-[#DCF8C6] border border-[#C5E1A5] text-label shadow-sm flex flex-col gap-2 relative">
            <div className="text-caption font-semibold uppercase text-[#1B5E20] flex items-center justify-between">
              <span>Template: Overdue Reminder</span>
              <span>WhatsApp</span>
            </div>
            <p className="text-body leading-relaxed">
              Hello <strong className="font-semibold">{party.name}</strong>, invoice{' '}
              <strong className="font-semibold">{bills[0]?.billNo ?? 'GST/004/26-27'}</strong> for{' '}
              <strong className="font-semibold">{formatINR(totalOwed)}</strong> was due on{' '}
              <strong className="font-semibold">
                {bills[0]?.date
                  ? new Date(Date.parse(bills[0].date) + reminderDueDays * 86400000).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })
                  : '—'}
              </strong>{' '}
              (applied after {reminderDueDays} days credit terms) and is still unpaid. Please arrange payment at the earliest, or reach out to our office if there is any clarification needed. Thank you.
            </p>
            <div className="text-right text-caption text-label-2">
              Just now
            </div>
          </div>

          {/* Phone selection */}
          <div className="flex flex-col gap-1.5">
            <span className="text-footnote font-semibold uppercase tracking-wider text-label-2">
              Send to
            </span>
            <div className="flex flex-col gap-2">
              {allPhones.map(({ phone, source, label }) => (
                <button
                  key={phone}
                  type="button"
                  onClick={() => setSelectedPhone(phone)}
                  className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                    targetPhone === phone
                      ? 'bg-accent/5 border-accent text-label'
                      : 'bg-surface border-separator/50 hover:bg-fill/40'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-label-2" />
                    <span className="text-subhead font-semibold text-label">{phone}</span>
                    <span
                      className={`text-caption px-2 py-0.5 rounded-full font-medium ${
                        source === 'local'
                          ? 'bg-ok/10 text-ok'
                          : 'bg-fill text-label-2'
                      }`}
                    >
                      {label}
                    </span>
                  </div>
                  {targetPhone === phone && (
                    <Check className="w-4 h-4 text-accent stroke-[2.5]" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <Button fullWidth onClick={handleSendReminder} className="h-[50px] mt-2">
            <Send className="w-5 h-5 mr-2 stroke-[2.2]" />
            <span>Send via WhatsApp</span>
          </Button>
        </div>
      </Sheet>

      {/* Estimated Bill Info Sheet */}
      <Sheet
        open={estimatedInfoOpen}
        onOpenChange={setEstimatedInfoOpen}
        title="Estimated Bill Reference"
      >
        <div className="flex flex-col gap-3 py-2 text-subhead text-label leading-relaxed">
          <p>
            Tally has no direct bill reference recorded for a past payment voucher, so our sync algorithm matched it to your oldest invoices using standard <strong>FIFO (First-In, First-Out)</strong> accounting rules.
          </p>
          <p className="text-footnote text-label-2">
            Once an accountant links the receipt to a specific invoice in Tally, the bill reference updates automatically on the next sync.
          </p>
          <Button
            variant="tinted"
            fullWidth
            onClick={() => setEstimatedInfoOpen(false)}
            className="mt-4"
          >
            Got it
          </Button>
        </div>
      </Sheet>
    </LargeTitleScreen>
  );
};
