import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  Download,
  UserPlus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { can, formatINR } from '@saas/shared';
import { api } from '../../api/index.js';
import { useAppStore } from '../../app/store.js';
import { LargeTitleScreen } from '../../components/ui/LargeTitleScreen.js';
import { InsetGroup, Row } from '../../components/ui/InsetGroup.js';
import { Button } from '../../components/ui/Button.js';
import { StatusText } from '../../components/ui/StatusText.js';
import { useToast } from '../../components/ui/Toast.js';

export const HomeScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { currentCompanyId, currentRole, currentUser, currentTenant, authToken } = useAppStore();
  const actor = currentUser || currentRole;
  const canViewLedgers = can(actor, 'ledgers.view');
  const canSend = can(actor, 'reminders.send');
  const isOwnerOrAdmin =
    currentUser?.role === 'owner' ||
    currentUser?.role === 'admin' ||
    currentUser?.role === 'dev' ||
    currentRole === 'owner' ||
    currentRole === 'admin';

  const [demoLoading, setDemoLoading] = useState(false);
  const [zipDownloading, setZipDownloading] = useState(false);

  const { data: summary, isLoading } = useQuery({
    queryKey: ['home-summary', currentTenant?.id || 'default', currentCompanyId],
    queryFn: () => api.home.summary(currentCompanyId),
  });

  const { data: reminderRules } = useQuery({
    queryKey: ['reminder-rules', currentTenant?.id || 'default'],
    queryFn: () => api.reminders.rules.get(),
  });

  const isWhatsAppAttached = summary?.whatsappAttached ?? reminderRules?.whatsappEnabled ?? false;

  const isEmptyWorkspace =
    !isLoading &&
    summary &&
    summary.totalReceivables === 0 &&
    summary.totalOverdue === 0 &&
    (!summary.mostOverdue || summary.mostOverdue.length === 0);

  const isDemoActive = Boolean(
    currentTenant?.isDemo ||
      summary?.mostOverdue?.some((m: any) => String(m.party?.id || '').startsWith('demo-'))
  );

  const handleDownloadPrePairedZip = async () => {
    try {
      setZipDownloading(true);
      const compParam = currentCompanyId && currentCompanyId !== 'all'
        ? `?companyId=${encodeURIComponent(currentCompanyId)}&includeNode=1`
        : '?includeNode=1';
      const res = await fetch(`/api/agent/download-zip${compParam}`, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      if (!res.ok) throw new Error('Failed to generate pre-paired Windows Agent ZIP');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tally-agent-${(currentTenant?.name || 'manohar').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      showToast({
        message: 'Downloaded Pre-Paired Windows Tally Agent (.ZIP)! Extract and run install-service.bat on your Tally PC.',
        variant: 'success',
      });
    } catch {
      window.open('/tally-agent-windows.zip', '_blank');
    } finally {
      setZipDownloading(false);
    }
  };

  const handleLoadDemoData = async () => {
    try {
      setDemoLoading(true);
      const res = await fetch('/api/onboarding/demo-seed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ companyId: currentCompanyId }),
      });
      if (!res.ok) throw new Error('Failed to seed sample data');
      await queryClient.invalidateQueries();
      showToast({
        message: 'Sample Demo Mode loaded! It will automatically clear on your first live Tally sync.',
        variant: 'success',
      });
    } catch (err: any) {
      showToast({ message: err?.message || 'Could not load sample data', variant: 'danger' });
    } finally {
      setDemoLoading(false);
    }
  };

  const handleClearDemoData = async () => {
    try {
      setDemoLoading(true);
      const res = await fetch('/api/onboarding/demo-clear', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
      });
      if (!res.ok) throw new Error('Failed to clear sample data');
      await queryClient.invalidateQueries();
      showToast({ message: 'Sample demo data cleared.', variant: 'success' });
    } catch (err: any) {
      showToast({ message: err?.message || 'Could not clear sample data', variant: 'danger' });
    } finally {
      setDemoLoading(false);
    }
  };

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
      {/* Sample Demo Mode Active Banner */}
      {isDemoActive && isOwnerOrAdmin && (
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-amber-600 shrink-0" />
            <div className="flex flex-col">
              <span className="text-subhead font-bold text-label">
                Sample Demo Data Active
              </span>
              <span className="text-caption text-label-2">
                Exploring sample ledgers &amp; stock. Automatically clears when your Office Tally Agent connects.
              </span>
            </div>
          </div>
          <Button
            size="small"
            variant="tinted"
            disabled={demoLoading}
            onClick={handleClearDemoData}
            className="flex items-center gap-1.5 shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Demo</span>
          </Button>
        </div>
      )}

      {/* First-Login 3-Step Guided Setup Wizard for Empty Workspaces */}
      {isEmptyWorkspace && isOwnerOrAdmin && (
        <div className="bg-surface rounded-ios-card p-5 border-2 border-accent/30 shadow-sm flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col">
              <span className="text-caption font-bold uppercase tracking-wider text-accent">
                Welcome to {currentTenant?.name || 'Your Workspace'}
              </span>
              <h2 className="text-title-2 font-bold text-label mt-0.5">
                3-Step Quick Setup Guide
              </h2>
              <p className="text-footnote text-label-2 mt-1">
                Connect your office TallyPrime in under 2 minutes with zero manual key copying, or explore with 1-click sample data.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            {/* Step 1: Pre-Paired Windows Agent */}
            <div className="p-3.5 rounded-xl bg-fill/50 border border-separator/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-accent text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                  1
                </div>
                <div className="flex flex-col">
                  <span className="text-subhead font-bold text-label">
                    Download Pre-Paired Windows Tally Agent (.ZIP)
                  </span>
                  <span className="text-caption text-label-2">
                    Pre-configured with your organization key. Just extract on your Tally PC and run <code className="font-mono">install-service.bat</code>.
                  </span>
                </div>
              </div>
              <Button
                size="small"
                disabled={zipDownloading}
                onClick={handleDownloadPrePairedZip}
                className="flex items-center gap-1.5 shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{zipDownloading ? 'Building ZIP...' : 'Download Pre-Paired ZIP'}</span>
              </Button>
            </div>

            {/* Step 2: Add Staff */}
            <div className="p-3.5 rounded-xl bg-fill/50 border border-separator/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-accent/15 text-accent font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                  2
                </div>
                <div className="flex flex-col">
                  <span className="text-subhead font-bold text-label">
                    Invite Staff &amp; Assign Roles
                  </span>
                  <span className="text-caption text-label-2">
                    Add your sales, accounts, and warehouse team with custom 4-digit PINs and branch access.
                  </span>
                </div>
              </div>
              <Button
                size="small"
                variant="tinted"
                onClick={() => navigate('/settings')}
                className="flex items-center gap-1.5 shrink-0"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Manage Staff</span>
              </Button>
            </div>

            {/* Step 3: Configure Reminders */}
            <div className="p-3.5 rounded-xl bg-fill/50 border border-separator/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-accent/15 text-accent font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                  3
                </div>
                <div className="flex flex-col">
                  <span className="text-subhead font-bold text-label">
                    Configure WhatsApp Payment Reminders
                  </span>
                  <span className="text-caption text-label-2">
                    Set quiet hours, minimum overdue thresholds, and automated collection schedules.
                  </span>
                </div>
              </div>
              <Button
                size="small"
                variant="tinted"
                onClick={() => navigate('/reminders')}
                className="flex items-center gap-1.5 shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Setup Reminders</span>
              </Button>
            </div>
          </div>

          {/* 1-Click Sample Demo Mode CTA */}
          <div className="pt-2 border-t border-separator/40 flex flex-col sm:flex-row items-center justify-between gap-2">
            <span className="text-caption text-label-2">
              Want to test drive the dashboard before installing on your Tally PC?
            </span>
            <Button
              size="small"
              variant="tinted"
              disabled={demoLoading}
              onClick={handleLoadDemoData}
              className="flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{demoLoading ? 'Loading Demo...' : 'Load 1-Click Sample Demo Data'}</span>
            </Button>
          </div>
        </div>
      )}

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
              Machinery &amp; Dispatch Hub
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
