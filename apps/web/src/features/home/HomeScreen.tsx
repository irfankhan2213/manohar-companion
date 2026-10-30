import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Send,
  AlertTriangle,
  MessageSquare,
  CheckCircle2,
  TrendingUp,
  FileSpreadsheet,
  CheckSquare,
  Package,
  BookOpen,
} from 'lucide-react';
import { can, formatINR } from '@saas/shared';
import { api } from '../../api/index.js';
import { useAppStore } from '../../app/store.js';
import { LargeTitleScreen } from '../../components/ui/LargeTitleScreen.js';
import { InsetGroup, Row } from '../../components/ui/InsetGroup.js';
import { Button } from '../../components/ui/Button.js';
import { StatusText } from '../../components/ui/StatusText.js';

export const HomeScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentCompanyId, currentRole } = useAppStore();
  const canViewLedgers = can(currentRole, 'ledgers.view');
  const canSend = can(currentRole, 'reminders.send');

  const { data: summary, isLoading } = useQuery({
    queryKey: ['home-summary', currentCompanyId],
    queryFn: () => api.home.summary(currentCompanyId),
  });

  const { data: reminderRules } = useQuery({
    queryKey: ['reminder-rules'],
    queryFn: () => api.reminders.rules.get(),
  });

  const isWhatsAppAttached = summary?.whatsappAttached ?? reminderRules?.whatsappEnabled ?? false;

  return (
    <LargeTitleScreen
      title={t('home.title', 'Home')}
      subtitle={
        <div className="flex items-center gap-1.5 bg-surface/80 border border-separator/40 px-3 py-1.5 rounded-full shadow-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-ok animate-pulse" />
          <span className="text-footnote text-label-2 font-medium">
            {t('home.updatedMinutesAgo', { count: 2, defaultValue: 'Updated 2 min ago' })}
          </span>
        </div>
      }
    >
      {/* Hero Metric Card: Apple Calm Inset Card */}
      {!canViewLedgers ? (
        <div className="bg-surface rounded-ios-card p-5 border border-separator/40 shadow-[0_2px_8px_rgba(0,0,0,0.03)] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-subhead text-label-2 font-medium">
              Warehouse Operations Active
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-caption font-bold bg-amber-500/10 text-amber-600 capitalize">
              {currentRole.replace('_', ' ')}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-title-1 font-bold text-label tracking-tight">
              Machinery & Dispatch Hub
            </span>
            <span className="text-caption text-label-2 mt-1">
              Real-time access to stock inventory, delivery challans, and inspection tasks.
            </span>
          </div>
          <div className="pt-2">
            <Button
              fullWidth
              variant="primary"
              onClick={() => navigate('/stock')}
              className="h-[48px]"
            >
              Open Stock Inventory
            </Button>
          </div>
        </div>
      ) : (
        <div className="bg-surface rounded-ios-card p-5 border border-separator/40 shadow-[0_2px_8px_rgba(0,0,0,0.03)] flex flex-col gap-4">
        <div className="flex flex-col">
          <div className="flex items-center justify-between">
            <span className="text-subhead text-label-2 font-medium">
              {t('home.customersOweYou', 'Customers owe you')}
            </span>
            <TrendingUp className="w-4 h-4 text-label-3" />
          </div>

          <div className="flex items-baseline mt-1 font-semibold text-hero-num text-label tracking-tight tabular-nums">
            {isLoading ? (
              <span className="animate-pulse bg-fill h-12 w-48 rounded-lg" />
            ) : (
              formatINR(summary?.totalReceivables ?? 0)
            )}
          </div>

          <div className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full bg-danger/10 border border-danger/15 w-fit">
            <span className="w-1.5 h-1.5 rounded-full bg-danger" />
            <span className="text-footnote text-danger font-semibold tabular-nums">
              {t('home.isOverdue', {
                amount: formatINR(summary?.totalOverdue ?? 0),
                defaultValue: `${formatINR(summary?.totalOverdue ?? 0)} is overdue`,
              })}
            </span>
          </div>
        </div>

        {/* Visual Aging Distribution Bar */}
        <div className="flex flex-col gap-2 pt-1">
          <div className="w-full h-2.5 bg-fill p-0.5 rounded-full flex overflow-hidden gap-0.5">
            <div
              className="bg-accent h-full rounded-l-full transition-all duration-500"
              style={{ width: `${summary?.notDuePercentage ?? 67}%` }}
              title={`Not due: ${summary?.notDuePercentage ?? 67}%`}
            />
            <div
              className="bg-warn h-full transition-all duration-500"
              style={{ width: `${summary?.latePercentage ?? 20}%` }}
              title={`Late: ${summary?.latePercentage ?? 20}%`}
            />
            <div
              className="bg-danger h-full rounded-r-full transition-all duration-500"
              style={{ width: `${summary?.over30Percentage ?? 13}%` }}
              title={`Over 30 days: ${summary?.over30Percentage ?? 13}%`}
            />
          </div>

          <div className="flex items-center justify-between pt-0.5 text-footnote text-label-2 font-medium">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-accent" />
              <span>{t('home.notDue', 'Not due')} ({summary?.notDuePercentage ?? 67}%)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-warn" />
              <span>{t('home.late', 'Late')} ({summary?.latePercentage ?? 20}%)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-danger" />
              <span>{t('home.over30Days', 'Over 30 days')} ({summary?.over30Percentage ?? 13}%)</span>
            </div>
          </div>
        </div>

        {/* Primary Action Button: Send Reminders if WhatsApp is attached; View Dues otherwise */}
        <div className="pt-2">
          {isWhatsAppAttached && canSend ? (
            <Button
              fullWidth
              onClick={() => navigate('/reminders')}
              className="h-[52px]"
            >
              <Send className="w-5 h-5 mr-2 stroke-[2.2]" />
              <span>{t('home.sendReminders', 'Send reminders')}</span>
            </Button>
          ) : (
            <Button
              fullWidth
              variant="primary"
              onClick={() => navigate('/collections')}
              className="h-[52px]"
            >
              <TrendingUp className="w-5 h-5 mr-2 stroke-[2.2]" />
              <span>{t('home.viewDues', 'View dues')}</span>
            </Button>
          )}
        </div>
      </div>
      )}

      {/* Quick Operations Links */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => navigate('/stock')}
          className="p-3.5 bg-surface rounded-ios-card border border-separator/40 shadow-sm flex flex-col gap-1 text-left hover:border-accent active:scale-[0.98] transition-all"
        >
          <div className="w-8 h-8 rounded-lg bg-accent-soft text-accent flex items-center justify-center mb-1">
            <Package className="w-4 h-4 stroke-[2]" />
          </div>
          <span className="text-subhead font-bold text-label">Stock Inventory</span>
          <span className="text-caption text-label-2 truncate">
            Available units &amp; reorders
          </span>
        </button>

        <button
          type="button"
          onClick={() => navigate('/challans')}
          className="p-3.5 bg-surface rounded-ios-card border border-separator/40 shadow-sm flex flex-col gap-1 text-left hover:border-accent active:scale-[0.98] transition-all"
        >
          <div className="w-8 h-8 rounded-lg bg-accent-soft text-accent flex items-center justify-center mb-1">
            <FileSpreadsheet className="w-4 h-4 stroke-[2]" />
          </div>
          <span className="text-subhead font-bold text-label">Delivery Challans</span>
          <span className="text-caption text-label-2 truncate">
            Material &amp; dispatch vouchers
          </span>
        </button>

        <button
          type="button"
          onClick={() => navigate('/tasks')}
          className="p-3.5 bg-surface rounded-ios-card border border-separator/40 shadow-sm flex flex-col gap-1 text-left hover:border-accent active:scale-[0.98] transition-all"
        >
          <div className="w-8 h-8 rounded-lg bg-accent-soft text-accent flex items-center justify-center mb-1">
            <CheckSquare className="w-4 h-4 stroke-[2]" />
          </div>
          <span className="text-subhead font-bold text-label">Company Tasks</span>
          <span className="text-caption text-label-2 truncate">
            Team assignments &amp; photos
          </span>
        </button>

        <button
          type="button"
          onClick={() => navigate('/notebook')}
          className="p-3.5 bg-surface rounded-ios-card border border-separator/40 shadow-sm flex flex-col gap-1 text-left hover:border-accent active:scale-[0.98] transition-all"
        >
          <div className="w-8 h-8 rounded-lg bg-accent-soft text-accent flex items-center justify-center mb-1">
            <BookOpen className="w-4 h-4 stroke-[2]" />
          </div>
          <span className="text-subhead font-bold text-label">Notebook</span>
          <span className="text-caption text-label-2 truncate">
            Spreadsheets &amp; calculations
          </span>
        </button>
      </div>

      {/* Section: Needs Attention */}
      {summary && summary.needsAttention.length > 0 && (
        <InsetGroup title={t('home.needsAttention', 'Needs attention')}>
          {summary.needsAttention.map((item) => (
            <Row
              key={item.id}
              onClick={() => navigate(item.actionPath)}
              leading={
                item.type === 'overdue' ? (
                  <div className="w-9 h-9 rounded-xl bg-danger/10 text-danger flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                ) : (
                  <div className="w-9 h-9 rounded-xl bg-accent-soft text-accent flex items-center justify-center">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                )
              }
              title={item.title}
              subtitle={item.subtitle}
              trailing={
                <span className="text-footnote font-semibold text-accent">
                  {item.actionLabel}
                </span>
              }
              chevron
            />
          ))}
        </InsetGroup>
      )}

      {/* Section: By Company (Visible when "All companies" is selected) */}
      {currentCompanyId === 'all' && summary?.companyBreakdown && (
        <InsetGroup title={t('home.byCompany', 'By company')}>
          {summary.companyBreakdown.map((item) => (
            <Row
              key={item.company.id}
              onClick={() => {
                useAppStore.getState().setCompanyId(item.company.id);
              }}
              title={item.company.name}
              subtitle={`Overdue: ${formatINR(item.overdueAmount)}`}
              trailing={<span className="tabular-nums">{formatINR(item.totalAmount)}</span>}
              chevron
            />
          ))}
        </InsetGroup>
      )}

      {/* Section: Most Overdue */}
      {canViewLedgers && (
        <InsetGroup
          title={t('home.mostOverdue', 'Most overdue')}
          actionText={t('home.seeAll', 'See all')}
          onActionClick={() => navigate('/collections')}
        >
          {summary?.mostOverdue.map((item) => (
            <Row
              key={item.party.id}
              onClick={() => navigate(`/collections/${item.party.id}`)}
              title={item.party.name}
              subtitle={`${item.party.city} · ${item.invoiceRef ?? 'Invoice'}`}
              trailing={<span className="tabular-nums">{formatINR(item.amount)}</span>}
              trailingSubtitle={
                <StatusText
                  text={t('home.daysLate', {
                    days: item.daysLate,
                    defaultValue: `${item.daysLate} days late`,
                  })}
                  variant={item.daysLate > 30 ? 'danger' : 'warn'}
                  dot={false}
                />
              }
            />
          ))}
        </InsetGroup>
      )}

      {/* Tally Automatic Sync Note */}
      <div className="pt-2 flex items-center justify-center gap-2 text-label-2 opacity-75">
        <CheckCircle2 className="w-4 h-4 text-ok" />
        <span className="text-footnote font-medium">
          {t('home.vouchersSynced', 'Vouchers synced automatically from Tally ERP')}
        </span>
      </div>
    </LargeTitleScreen>
  );
};
