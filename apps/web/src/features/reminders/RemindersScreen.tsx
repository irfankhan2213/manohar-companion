import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BellRing,
  Calendar,
  Moon,
  Coins,
  PauseCircle,
  MessageSquare,
  FileCheck,
  Phone,
  UserPlus,
  Send,
  UserCheck,
  Search,
  ShieldAlert,
  ChevronRight,
} from 'lucide-react';
import {
  can,
  formatINR,
  paiseToRupees,
  ReminderRule,
  rupeesToPaise,
  getDaysOverdue,
  Party,
} from '@saas/shared';
import { api } from '../../api/index.js';
import { useAppStore } from '../../app/store.js';
import { LargeTitleScreen } from '../../components/ui/LargeTitleScreen.js';
import { InsetGroup, Row } from '../../components/ui/InsetGroup.js';
import { Sheet } from '../../components/ui/Sheet.js';
import { Button } from '../../components/ui/Button.js';
import { SegmentedControl } from '../../components/ui/SegmentedControl.js';
import { StatusText } from '../../components/ui/StatusText.js';
import { useToast } from '../../components/ui/Toast.js';
import { FIXED_TODAY } from '../../mock/seed.js';
import { openWhatsAppReminderUrl } from './whatsapp.js';

export const RemindersScreen: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentCompanyId, currentRole } = useAppStore();
  const { showToast } = useToast();

  const [scheduleSheetOpen, setScheduleSheetOpen] = useState(false);
  const [quietHoursSheetOpen, setQuietHoursSheetOpen] = useState(false);
  const [minAmountSheetOpen, setMinAmountSheetOpen] = useState(false);
  const [dueDateSheetOpen, setDueDateSheetOpen] = useState(false);
  const [minRupees, setMinRupees] = useState<number>(1000);
  const [dueDaysInput, setDueDaysInput] = useState<number>(30);

  // Overdue filter & search
  const [searchQuery, setSearchQuery] = useState('');
  const [tabFilter, setTabFilter] = useState<'all' | 'urgent' | 'paused'>('all');

  // Add person / contact modal state
  const [addPersonSheetOpen, setAddPersonSheetOpen] = useState(false);
  const [selectedPartyForEdit, setSelectedPartyForEdit] = useState<Party | null>(null);
  const [newPersonName, setNewPersonName] = useState('');
  const [newPersonPhone, setNewPersonPhone] = useState('');
  const [selectedCollectorId, setSelectedCollectorId] = useState('');

  // Add new party state
  const [isCreatingNewParty, setIsCreatingNewParty] = useState(false);
  const [newPartyName, setNewPartyName] = useState('');
  const [newPartyCity, setNewPartyCity] = useState('');
  const [newPartyTerms, setNewPartyTerms] = useState(30);

  // Permission checks
  const canView = can(currentRole, 'reminders.view');
  const canConfigure = can(currentRole, 'reminders.configure');

  // Queries
  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => api.companies.list(),
  });
  const activeCompany = companies.find(c => c.id === currentCompanyId);

  // Queries
  const { data: rules } = useQuery({
    queryKey: ['reminder-rules'],
    queryFn: () => api.reminders.rules.get(),
  });

  const { data: threads = [] } = useQuery({
    queryKey: ['reply-threads', currentCompanyId],
    queryFn: () => api.reminders.replies.list(currentCompanyId),
  });

  const { data: parties = [] } = useQuery({
    queryKey: ['parties', currentCompanyId],
    queryFn: () => api.parties.list(currentCompanyId),
  });

  const { data: bills = [] } = useQuery({
    queryKey: ['bills', currentCompanyId],
    queryFn: () => api.bills.list(currentCompanyId),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.users.list(),
  });

  // Calculate overdue balances
  const overdueItems = React.useMemo(() => {
    return parties
      .map((party) => {
        const partyBills = bills.filter((b) => b.partyId === party.id);
        const overdueBills = partyBills.filter(
          (b) => b.pending > 0 && getDaysOverdue(b.dueDate, FIXED_TODAY) > 0
        );
        const totalOverdue = overdueBills.reduce((sum, b) => sum + b.pending, 0);
        let maxDaysLate = 0;
        let oldestBill = overdueBills[0];
        for (const b of overdueBills) {
          const days = getDaysOverdue(b.dueDate, FIXED_TODAY);
          if (days > maxDaysLate) {
            maxDaysLate = days;
            oldestBill = b;
          }
        }
        const collector = users.find((u) => u.id === party.collectorId);
        return {
          party,
          overdueBills,
          totalOverdue,
          maxDaysLate,
          oldestBill,
          collector,
        };
      })
      .filter((item) => item.totalOverdue > 0)
      .sort((a, b) => b.maxDaysLate - a.maxDaysLate);
  }, [parties, bills, users]);

  const filteredOverdue = React.useMemo(() => {
    let list = overdueItems;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (item) =>
          item.party.name.toLowerCase().includes(q) ||
          item.party.city.toLowerCase().includes(q) ||
          item.party.phones.some((p) => p.includes(q)) ||
          (item.collector?.name.toLowerCase().includes(q) ?? false)
      );
    }
    if (tabFilter === 'urgent') {
      list = list.filter((item) => item.maxDaysLate > 30);
    } else if (tabFilter === 'paused') {
      list = list.filter((item) => item.party.remindersPaused);
    }
    return list;
  }, [overdueItems, searchQuery, tabFilter]);

  const totalOverdueAmount = overdueItems.reduce((sum, item) => sum + item.totalOverdue, 0);
  const pausedParties = parties.filter((p) => p.remindersPaused);
  const unreadCount = threads.reduce((sum, t) => sum + t.unread, 0);

  const updateRulesMutation = useMutation({
    mutationFn: (updates: Partial<ReminderRule>) =>
      api.reminders.rules.update(updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminder-rules'] });
      showToast({
        message: 'Reminder configuration updated',
        variant: 'success',
      });
    },
  });

  const updatePartyMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Party> }) =>
      api.parties.update(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parties'] });
      showToast({
        message: 'Customer contacts & follow-up person updated',
        variant: 'success',
      });
      setAddPersonSheetOpen(false);
      setSelectedPartyForEdit(null);
      setNewPersonName('');
      setNewPersonPhone('');
    },
  });

  const createPartyMutation = useMutation({
    mutationFn: (newParty: Partial<Party>) =>
      api.parties.create ? api.parties.create(newParty) : Promise.resolve(newParty as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parties'] });
      showToast({
        message: 'New customer added to follow-up system',
        variant: 'success',
      });
      setAddPersonSheetOpen(false);
      setIsCreatingNewParty(false);
      setNewPartyName('');
      setNewPersonPhone('');
    },
  });

  const toggleStep = (index: number) => {
    if (!rules || !canConfigure) return;
    const newSteps = [...rules.steps];
    const target = newSteps[index];
    if (target) {
      target.enabled = !target.enabled;
      updateRulesMutation.mutate({ steps: newSteps });
    }
  };

  const handleOpenAddPerson = (party?: Party) => {
    if (party) {
      setSelectedPartyForEdit(party);
      setSelectedCollectorId(party.collectorId || '');
      setIsCreatingNewParty(false);
    } else {
      setSelectedPartyForEdit(null);
      setSelectedCollectorId(users[0]?.id || '');
      setIsCreatingNewParty(true);
    }
    setNewPersonName('');
    setNewPersonPhone('');
    setAddPersonSheetOpen(true);
  };

  const handleSavePerson = () => {
    if (isCreatingNewParty) {
      if (!newPartyName.trim()) {
        showToast({ message: 'Please enter customer name' });
        return;
      }
      const targetCompanyId = (currentCompanyId === 'all' || !currentCompanyId) ? (companies[0]?.id || '') : currentCompanyId;
      createPartyMutation.mutate({
        companyId: targetCompanyId,
        name: newPartyName.trim(),
        city: newPartyCity.trim(),
        phones: newPersonPhone.trim() ? [newPersonPhone.trim()] : [],
        creditDays: newPartyTerms,
        collectorId: selectedCollectorId,
        remindersPaused: false,
        notes: newPersonName ? `Contact: ${newPersonName}` : '',
      });
    } else if (selectedPartyForEdit) {
      const existingPhones = [...selectedPartyForEdit.phones];
      if (newPersonPhone.trim() && !existingPhones.includes(newPersonPhone.trim())) {
        existingPhones.push(newPersonPhone.trim());
      }
      const existingNotes = selectedPartyForEdit.notes || '';
      const updatedNotes = newPersonName.trim()
        ? `${existingNotes}${existingNotes ? ' | ' : ''}Contact: ${newPersonName.trim()} (${newPersonPhone.trim()})`
        : existingNotes;

      updatePartyMutation.mutate({
        id: selectedPartyForEdit.id,
        updates: {
          phones: existingPhones,
          collectorId: selectedCollectorId || undefined,
          notes: updatedNotes,
        },
      });
    }
  };

  const handleSendOneClickReminder = (item: typeof overdueItems[0]) => {
    const primaryPhone = item.party.phones[0] || '';
    if (!primaryPhone) {
      showToast({ message: `No phone number on record for ${item.party.name}` });
      return;
    }
    openWhatsAppReminderUrl({
      phone: primaryPhone,
      partyName: item.party.name,
      overdueAmountPaise: item.totalOverdue,
      oldestBillNo: item.oldestBill?.billNo,
      daysLate: item.maxDaysLate,
      dueDate: item.oldestBill?.dueDate,
      companyName: activeCompany?.name,
    });
    showToast({
      message: `Opening WhatsApp with built reminder for ${item.party.name}...`,
      variant: 'success',
    });
  };

  // If user lacks permission to view reminders & overdues
  if (!canView) {
    return (
      <LargeTitleScreen title="Payment Reminders" showBack>
        <div className="p-8 text-center flex flex-col items-center justify-center gap-2">
          <ShieldAlert className="w-12 h-12 text-warn mb-1" />
          <h2 className="text-title-2 font-bold text-label">Access Restricted</h2>
          <p className="text-subhead text-label-2 max-w-sm">
            You do not have permission to view overdue customer receivables or payment reminders. Contact an administrator to adjust role permissions.
          </p>
        </div>
      </LargeTitleScreen>
    );
  }

  const isWhatsAppActive = rules?.whatsappEnabled ?? false;

  return (
    <LargeTitleScreen
      title="Reminders"
      showBack
      headerAction={
        <button
          type="button"
          onClick={() => handleOpenAddPerson()}
          className="flex items-center gap-1 text-subhead font-semibold text-accent px-2.5 py-1.5 rounded-lg bg-surface/80 border border-separator/40 hover:bg-fill/60 active:scale-95 transition-all shadow-sm"
        >
          <UserPlus className="w-4 h-4 stroke-[2]" />
          <span>Add Person</span>
        </button>
      }
    >
      {/* 1. WhatsApp Reminders System Mode Toggle */}
      <InsetGroup>
        <div className="p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                isWhatsAppActive ? 'bg-ok/10 text-ok' : 'bg-fill text-label-2'
              }`}
            >
              <MessageSquare className="w-5 h-5" />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-headline font-semibold text-label">
                  WhatsApp Reminder System
                </span>
                <span
                  className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full shrink-0 ${
                    isWhatsAppActive
                      ? 'bg-ok/10 text-ok border border-ok/20'
                      : 'bg-fill text-label-2 border border-separator/40'
                  }`}
                >
                  {isWhatsAppActive ? 'WhatsApp Active' : 'Internal Mode (Off)'}
                </span>
              </div>
              <span className="text-footnote text-label-2 mt-0.5 leading-snug">
                {isWhatsAppActive
                  ? 'WhatsApp reminders active. Tap "Send Reminder" on any customer to open WhatsApp with pre-filled message.'
                  : 'As of now, WhatsApp messaging is off. Showing overdue balances internally for authorized staff follow-up.'}
              </span>
            </div>
          </div>
          <input
            type="checkbox"
            checked={isWhatsAppActive}
            disabled={!canConfigure}
            onChange={(e) =>
              updateRulesMutation.mutate({ whatsappEnabled: e.target.checked })
            }
            className="w-6 h-6 accent-accent rounded cursor-pointer shrink-0"
          />
        </div>
      </InsetGroup>

      {/* 2. Overdue Overview Hero */}
      <div className="bg-surface rounded-ios-card p-5 border border-separator/40 shadow-[0_2px_8px_rgba(0,0,0,0.03)] flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-subhead text-label-2 font-medium">
            Total Overdue Outstanding
          </span>
          <span className="text-caption font-bold uppercase tracking-wider text-label-3">
            {overdueItems.length} Overdue Accounts
          </span>
        </div>
        <div className="text-hero-num text-danger font-semibold tracking-tight tabular-nums">
          {formatINR(totalOverdueAmount)}
        </div>
        <div className="flex items-center gap-2 pt-1 text-footnote text-label-2">
          <span className="w-2 h-2 rounded-full bg-danger shrink-0" />
          <span>
            {overdueItems.filter((i) => i.maxDaysLate > 30).length} accounts are over 30 days late.
          </span>
        </div>
      </div>

      {/* 3. Search and Segmented Filter */}
      <div className="flex flex-col gap-2.5">
        <div className="relative w-full">
          <Search className="w-4 h-4 text-label-3 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search customer, city, phone, or staff..."
            className="w-full h-11 pl-10 pr-4 bg-surface rounded-xl border border-separator/50 text-body text-label placeholder:text-label-3 outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all shadow-sm"
          />
        </div>

        <SegmentedControl
          options={[
            { value: 'all', label: `All Overdue (${overdueItems.length})` },
            {
              value: 'urgent',
              label: `Urgent >30d (${overdueItems.filter((i) => i.maxDaysLate > 30).length})`,
            },
            { value: 'paused', label: `Paused (${pausedParties.length})` },
          ]}
          value={tabFilter}
          onChange={(val) => setTabFilter(val as typeof tabFilter)}
        />
      </div>

      {/* 4. Overdue Customer Follow-up List */}
      <InsetGroup title="Overdue Accounts For Follow-up">
        {filteredOverdue.length === 0 ? (
          <div className="p-8 text-center text-label-2 text-subhead">
            No customers match the current filter.
          </div>
        ) : (
          filteredOverdue.map((item) => (
            <div
              key={item.party.id}
              className="p-4 flex flex-col gap-3 hover:bg-fill/20 transition-colors"
            >
              {/* Customer Top Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => navigate(`/collections/${item.party.id}`)}
                    className="text-left font-bold text-headline text-label hover:text-accent transition-colors flex items-center gap-1"
                  >
                    <span className="truncate">{item.party.name}</span>
                    <ChevronRight className="w-4 h-4 text-label-3 shrink-0" />
                  </button>
                  <span className="text-subhead text-label-2 mt-0.5">
                    {item.party.city} · {item.party.creditDays}d terms
                  </span>
                </div>

                <div className="flex flex-col items-end shrink-0">
                  <span className="text-headline font-bold text-label tabular-nums">
                    {formatINR(item.totalOverdue)}
                  </span>
                  <StatusText
                    text={`${item.maxDaysLate} days late`}
                    variant={item.maxDaysLate > 30 ? 'danger' : 'warn'}
                    dot={false}
                  />
                </div>
              </div>

              {/* Contacts & Assigned Staff Pill */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-footnote text-label-2 pt-1 border-t border-separator/30">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="flex items-center gap-1 font-mono text-label font-medium bg-fill/50 px-2 py-0.5 rounded-md">
                    <Phone className="w-3.5 h-3.5 text-label-3" />
                    {item.party.phones[0] || 'No phone'}
                  </span>
                  {item.party.phones.length > 1 && (
                    <span className="text-caption text-label-3">
                      +{item.party.phones.length - 1} more
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleOpenAddPerson(item.party)}
                    className="text-caption font-semibold text-accent hover:underline flex items-center gap-0.5"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>+ Add Person / Phone</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenAddPerson(item.party)}
                  className="flex items-center gap-1 text-caption font-medium bg-surface border border-separator/60 px-2 py-0.5 rounded-lg text-label hover:border-accent transition-all"
                  title="Change follow-up staff assignee"
                >
                  <UserCheck className="w-3 h-3 text-accent" />
                  <span>Assignee: {item.collector?.name.split(' ')[0] ?? 'Unassigned'}</span>
                </button>
              </div>

              {/* Direct Action Buttons on One Side */}
              <div className="flex items-center justify-end gap-2 pt-1">
                {item.party.phones[0] && (
                  <a
                    href={`tel:${item.party.phones[0]}`}
                    className="h-9 px-3 rounded-xl bg-surface border border-separator/60 text-subhead font-semibold text-label flex items-center gap-1.5 hover:bg-fill/40 active:scale-95 transition-all shadow-sm"
                  >
                    <Phone className="w-4 h-4 text-label-2" />
                    <span>Call</span>
                  </a>
                )}

                <button
                  type="button"
                  onClick={() => handleSendOneClickReminder(item)}
                  className="h-9 px-3.5 rounded-xl bg-ok/10 border border-ok/25 text-ok hover:bg-ok/20 text-subhead font-bold flex items-center gap-1.5 active:scale-95 transition-all shadow-sm"
                  title="Opens WhatsApp directly with pre-built invoice reminder"
                >
                  <Send className="w-4 h-4 stroke-[2.2]" />
                  <span>Send Reminder</span>
                </button>
              </div>
            </div>
          ))
        )}
      </InsetGroup>

      {/* 5. Automatic Reminders Master Switch (for tests & rule config) */}
      <InsetGroup title="Automated Schedule Switch">
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BellRing className="w-5 h-5 text-accent" />
            <div className="flex flex-col">
              <span className="text-headline font-semibold text-label">
                Automatic Reminders
              </span>
              <span className="text-footnote text-label-2">
                Reminders stop after payment reaches your records.
              </span>
            </div>
          </div>
          <input
            type="checkbox"
            checked={rules?.enabled ?? true}
            disabled={!canConfigure}
            onChange={(e) =>
              updateRulesMutation.mutate({ enabled: e.target.checked })
            }
            className="w-6 h-6 accent-accent rounded cursor-pointer"
          />
        </div>
      </InsetGroup>

      {/* 6. Rules Configuration */}
      <InsetGroup title="Configuration & Rules">
        <Row
          leading={<Calendar className="w-5 h-5 text-accent" />}
          title="Due Date Rule"
          subtitle="Payment due date applied after X days"
          trailing={
            <span className="text-subhead font-semibold text-label">
              {rules?.defaultDueDays ?? 30} Days
            </span>
          }
          chevron
          onClick={() => {
            setDueDaysInput(rules?.defaultDueDays ?? 30);
            setDueDateSheetOpen(true);
          }}
        />
        <Row
          leading={<Calendar className="w-5 h-5 text-accent" />}
          title="Schedule"
          subtitle="Before, on, and after due date triggers"
          trailing={
            <span className="text-subhead text-label-2 font-medium">
              {rules?.steps.filter((s) => s.enabled).length ?? 5} active
            </span>
          }
          chevron
          onClick={() => setScheduleSheetOpen(true)}
        />
        <Row
          leading={<Moon className="w-5 h-5 text-accent" />}
          title="Quiet Hours"
          subtitle="Pause messages overnight & on Sundays"
          trailing={
            <span className="text-subhead text-label-2 font-medium">
              {rules?.quietHours.from} – {rules?.quietHours.to}
            </span>
          }
          chevron
          onClick={() => setQuietHoursSheetOpen(true)}
        />
        <Row
          leading={<Coins className="w-5 h-5 text-accent" />}
          title="Smallest Amount"
          subtitle="Skip reminders below threshold"
          trailing={
            <span className="text-subhead font-semibold text-label">
              {formatINR(rules?.minAmount ?? 100000)}
            </span>
          }
          chevron
          onClick={() => {
            setMinRupees(paiseToRupees(rules?.minAmount ?? 100000));
            setMinAmountSheetOpen(true);
          }}
        />
        {pausedParties.length > 0 && (
          <Row
            leading={<PauseCircle className="w-5 h-5 text-warn" />}
            title="Paused Customers"
            subtitle={`${pausedParties.length} customers excluded from queue`}
            chevron
            onClick={() => navigate('/collections')}
          />
        )}
      </InsetGroup>

      {/* 7. Messages & Templates */}
      <InsetGroup title="Messages & Templates">
        <Row
          leading={<MessageSquare className="w-5 h-5 text-accent" />}
          title="Replies"
          subtitle="Incoming WhatsApp customer responses"
          trailing={
            unreadCount > 0 ? (
              <span className="px-2 py-0.5 rounded-full bg-accent text-white text-caption font-bold">
                {unreadCount} unread
              </span>
            ) : undefined
          }
          chevron
          onClick={() => navigate('/reminders/replies')}
        />
        <Row
          leading={<FileCheck className="w-5 h-5 text-accent" />}
          title="Message Templates"
          subtitle="Meta WhatsApp approved templates"
          chevron
          onClick={() => navigate('/reminders/templates')}
        />
      </InsetGroup>

      {/* Sheet: Add Person / Contact / Reassign Follow-up */}
      <Sheet
        open={addPersonSheetOpen}
        onOpenChange={setAddPersonSheetOpen}
        title={
          isCreatingNewParty
            ? 'Add New Customer & Person'
            : `Add Person / Contact for ${selectedPartyForEdit?.name ?? 'Customer'}`
        }
        description="Add contact persons, phone numbers, and assign team follow-up responsibilities."
      >
        <div className="flex flex-col gap-4 py-2">
          {isCreatingNewParty ? (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-footnote font-semibold uppercase tracking-wider text-label-2">
                  Customer / Business Name
                </label>
                <input
                  type="text"
                  value={newPartyName}
                  onChange={(e) => setNewPartyName(e.target.value)}
                  placeholder="e.g. Ludhiana Hosiery Works"
                  className="w-full h-11 px-3.5 bg-surface border border-separator/60 rounded-xl text-subhead text-label font-medium outline-none focus:border-accent"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-footnote font-semibold uppercase tracking-wider text-label-2">
                    City
                  </label>
                  <input
                    type="text"
                    value={newPartyCity}
                    onChange={(e) => setNewPartyCity(e.target.value)}
                    className="w-full h-11 px-3.5 bg-surface border border-separator/60 rounded-xl text-subhead text-label font-medium outline-none focus:border-accent"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-footnote font-semibold uppercase tracking-wider text-label-2">
                    Credit Terms (Days)
                  </label>
                  <input
                    type="number"
                    value={newPartyTerms}
                    onChange={(e) => setNewPartyTerms(Number(e.target.value))}
                    className="w-full h-11 px-3.5 bg-surface border border-separator/60 rounded-xl text-subhead text-label font-medium outline-none focus:border-accent"
                  />
                </div>
              </div>
            </>
          ) : (
            selectedPartyForEdit && (
              <div className="p-3 bg-fill/40 rounded-xl border border-separator/30 flex flex-col gap-1">
                <span className="text-footnote uppercase text-label-2 font-bold">
                  Existing Contact Numbers
                </span>
                <div className="flex flex-wrap gap-2 pt-1">
                  {selectedPartyForEdit.phones.map((p, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 bg-surface border border-separator/50 rounded-lg text-subhead font-mono text-label"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )
          )}

          {/* New Person & Phone Inputs */}
          <div className="flex flex-col gap-1.5">
            <label className="text-footnote font-semibold uppercase tracking-wider text-label-2">
              Contact Person Name / Label (Optional)
            </label>
            <input
              type="text"
              value={newPersonName}
              onChange={(e) => setNewPersonName(e.target.value)}
              placeholder="e.g. Sharma Ji (Accounts Manager)"
              className="w-full h-11 px-3.5 bg-surface border border-separator/60 rounded-xl text-subhead text-label font-medium outline-none focus:border-accent"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-footnote font-semibold uppercase tracking-wider text-label-2">
              Phone Number (WhatsApp)
            </label>
            <input
              type="tel"
              value={newPersonPhone}
              onChange={(e) => setNewPersonPhone(e.target.value)}
              placeholder="e.g. +91 98140 98765"
              className="w-full h-11 px-3.5 bg-surface border border-separator/60 rounded-xl text-subhead text-label font-medium outline-none focus:border-accent font-mono"
            />
          </div>

          {/* Assign Staff Collector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-footnote font-semibold uppercase tracking-wider text-label-2">
              Assigned Follow-up Person (Team Staff)
            </label>
            <select
              value={selectedCollectorId}
              onChange={(e) => setSelectedCollectorId(e.target.value)}
              className="w-full h-11 px-3 bg-surface border border-separator/60 rounded-xl text-subhead font-semibold text-label focus:outline-none cursor-pointer"
            >
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role})
                </option>
              ))}
            </select>
          </div>

          <Button fullWidth onClick={handleSavePerson} className="h-12 mt-2">
            Save Person &amp; Details
          </Button>
        </div>
      </Sheet>

      {/* Due Date Terms Sheet */}
      <Sheet
        open={dueDateSheetOpen}
        onOpenChange={setDueDateSheetOpen}
        title="Payment Due Date Rule"
        description="Set how many days after the invoice date payment becomes due."
      >
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-footnote font-semibold uppercase text-label-2">
              Preset Credit Periods
            </span>
            <div className="grid grid-cols-3 gap-2">
              {[7, 15, 30, 45, 60, 90].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDueDaysInput(d)}
                  className={`py-2 px-3 rounded-xl text-subhead font-semibold transition-all border ${
                    dueDaysInput === d
                      ? 'bg-accent text-white border-accent shadow-sm'
                      : 'bg-surface border-separator/60 text-label hover:bg-fill/40'
                  }`}
                >
                  {d} Days
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-footnote font-semibold uppercase text-label-2">
              Custom Days
            </span>
            <div className="flex items-center h-12 bg-surface border border-separator/60 rounded-xl px-3 gap-2">
              <input
                type="number"
                min="0"
                max="365"
                value={dueDaysInput}
                onChange={(e) => setDueDaysInput(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full bg-transparent text-headline font-bold text-label focus:outline-none"
              />
              <span className="text-subhead font-semibold text-label-2">days</span>
            </div>
          </div>

          <div className="p-3.5 bg-accent-soft/40 border border-accent/20 rounded-xl flex flex-col gap-1">
            <span className="text-footnote font-bold text-accent uppercase tracking-wider">
              Live Reminder Rule
            </span>
            <p className="text-footnote leading-relaxed text-label">
              Invoices dated <strong>17-Oct-2026</strong> will have payment due date applied as{' '}
              <strong>
                {new Date(Date.parse('2026-10-17') + dueDaysInput * 86400000).toLocaleDateString(
                  'en-IN',
                  {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  }
                )}
              </strong>{' '}
              ({dueDaysInput} days after invoice date).
            </p>
            <span className="text-caption text-label-2 mt-0.5">
              WhatsApp overdue follow-ups trigger automatically relative to this due date.
            </span>
          </div>

          <Button
            fullWidth
            onClick={() => {
              updateRulesMutation.mutate({ defaultDueDays: dueDaysInput });
              setDueDateSheetOpen(false);
            }}
            className="h-12 mt-2"
          >
            Save Due Date Rule
          </Button>
        </div>
      </Sheet>

      {/* Schedule Sheet */}
      <Sheet
        open={scheduleSheetOpen}
        onOpenChange={setScheduleSheetOpen}
        title="Reminder Schedule"
        description="Choose when reminders are dispatched"
      >
        <div className="flex flex-col gap-2 pt-2 divide-y divide-separator/30">
          {[
            '3 days before due date',
            'On due date',
            '3 days late',
            '7 days late',
            '15 days late',
          ].map((label, idx) => {
            const step = rules?.steps[idx];
            const isEnabled = step?.enabled ?? true;

            return (
              <div
                key={idx}
                className="flex items-center justify-between py-3.5 px-1"
              >
                <span className="text-headline text-label font-medium">
                  {label}
                </span>
                <input
                  type="checkbox"
                  checked={isEnabled}
                  disabled={!canConfigure}
                  onChange={() => toggleStep(idx)}
                  className="w-6 h-6 accent-accent rounded cursor-pointer"
                />
              </div>
            );
          })}
        </div>
      </Sheet>

      {/* Quiet Hours Sheet */}
      <Sheet
        open={quietHoursSheetOpen}
        onOpenChange={setQuietHoursSheetOpen}
        title="Quiet Hours"
        description="Times during which no messages will be sent"
      >
        <div className="flex flex-col gap-4 py-2">
          <div className="flex items-center justify-between p-3.5 bg-surface border border-separator/50 rounded-xl">
            <span className="text-headline text-label font-medium">
              Evening Cutoff (From)
            </span>
            <span className="text-headline font-semibold text-label">
              8:00 PM (20:00)
            </span>
          </div>

          <div className="flex items-center justify-between p-3.5 bg-surface border border-separator/50 rounded-xl">
            <span className="text-headline text-label font-medium">
              Morning Start (To)
            </span>
            <span className="text-headline font-semibold text-label">
              9:00 AM (09:00)
            </span>
          </div>

          <div className="flex items-center justify-between p-3.5 bg-surface border border-separator/50 rounded-xl">
            <span className="text-headline text-label font-medium">
              Sunday Quiet Day
            </span>
            <span className="text-headline font-semibold text-accent">
              Active
            </span>
          </div>
        </div>
      </Sheet>

      {/* Smallest Amount Sheet */}
      <Sheet
        open={minAmountSheetOpen}
        onOpenChange={setMinAmountSheetOpen}
        title="Smallest Reminder Amount"
        description="Bills below this threshold will not trigger reminders"
      >
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-footnote font-semibold uppercase tracking-wider text-label-2">
              Minimum Pending (₹)
            </label>
            <input
              type="number"
              value={minRupees}
              onChange={(e) => setMinRupees(Number(e.target.value))}
              className="w-full h-12 px-3.5 bg-surface border border-separator/60 rounded-xl text-headline text-label font-semibold outline-none focus:border-accent tabular-nums"
            />
          </div>

          <Button
            fullWidth
            onClick={() => {
              updateRulesMutation.mutate({ minAmount: rupeesToPaise(minRupees) });
              setMinAmountSheetOpen(false);
            }}
            className="h-[50px] mt-2"
          >
            Save Minimum
          </Button>
        </div>
      </Sheet>
    </LargeTitleScreen>
  );
};
