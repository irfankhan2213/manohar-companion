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
} from 'lucide-react';
import {
  can,
  formatINR,
  paiseToRupees,
  ReminderRule,
  rupeesToPaise,
} from '@saas/shared';
import { api } from '../../api/index.js';
import { useAppStore } from '../../app/store.js';
import { LargeTitleScreen } from '../../components/ui/LargeTitleScreen.js';
import { InsetGroup, Row } from '../../components/ui/InsetGroup.js';
import { Sheet } from '../../components/ui/Sheet.js';
import { Button } from '../../components/ui/Button.js';
import { useToast } from '../../components/ui/Toast.js';

export const RemindersScreen: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentCompanyId, currentRole } = useAppStore();
  const { showToast } = useToast();

  const [scheduleSheetOpen, setScheduleSheetOpen] = useState(false);
  const [quietHoursSheetOpen, setQuietHoursSheetOpen] = useState(false);
  const [minAmountSheetOpen, setMinAmountSheetOpen] = useState(false);
  const [minRupees, setMinRupees] = useState<number>(1000);

  // Fetch reminder rules
  const { data: rules } = useQuery({
    queryKey: ['reminder-rules'],
    queryFn: () => api.reminders.rules.get(),
  });

  // Fetch reply threads
  const { data: threads = [] } = useQuery({
    queryKey: ['reply-threads', currentCompanyId],
    queryFn: () => api.reminders.replies.list(currentCompanyId),
  });

  // Fetch paused parties
  const { data: parties = [] } = useQuery({
    queryKey: ['parties', currentCompanyId],
    queryFn: () => api.parties.list(currentCompanyId),
  });

  const pausedParties = parties.filter((p) => p.remindersPaused);
  const unreadCount = threads.reduce((sum, t) => sum + t.unread, 0);

  const canConfigure = can(currentRole, 'reminders.configure');

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

  const toggleStep = (index: number) => {
    if (!rules || !canConfigure) return;
    const newSteps = [...rules.steps];
    const target = newSteps[index];
    if (target) {
      target.enabled = !target.enabled;
      updateRulesMutation.mutate({ steps: newSteps });
    }
  };

  return (
    <LargeTitleScreen title="Reminders" showBack>
      {/* Automatic Reminders Master Switch */}
      <InsetGroup>
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

      {/* Rules Configuration */}
      <InsetGroup title="Configuration">
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

      {/* Messages Sub-Screens */}
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
