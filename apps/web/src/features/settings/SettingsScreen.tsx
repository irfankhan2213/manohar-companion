import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Monitor,
  Check,
  Copy,
  RefreshCw,
  Globe,
  Building,
  Trash2,
  KeyRound,
  CheckCircle2,
  XCircle,
  Database,
} from 'lucide-react';
import { User, Role, can, PERMISSION_KEYS, PermissionKey } from '@saas/shared';
import { api } from '../../api/index.js';
import { useAppStore } from '../../app/store.js';
import { LargeTitleScreen } from '../../components/ui/LargeTitleScreen.js';
import { InsetGroup, Row } from '../../components/ui/InsetGroup.js';
import { Button } from '../../components/ui/Button.js';
import { Sheet } from '../../components/ui/Sheet.js';
import { useToast } from '../../components/ui/Toast.js';

export const SettingsScreen: React.FC = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { currentCompanyId, setCompanyId, language, setLanguage } = useAppStore();

  // Queries
  const { data: agent } = useQuery({
    queryKey: ['agentStatus'],
    queryFn: () => api.agent.status(),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.users.list(),
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => api.companies.list(),
  });

  // Pairing code state
  const [pairingCode, setPairingCode] = useState<string>('839201');
  const [copiedCode, setCopiedCode] = useState(false);

  // Inspector sheet state
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Add staff sheet state
  const [addStaffOpen, setAddStaffOpen] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffPhone, setNewStaffPhone] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<Role>('sales');

  // Backend mode state
  const [backendMode, setBackendMode] = useState<'real' | 'mock'>(() => {
    return localStorage.getItem('manohar_backend_mode') === 'real' ? 'real' : 'mock';
  });
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  React.useEffect(() => {
    fetch('http://localhost:3001/api/health')
      .then((r) => (r.ok ? setServerStatus('online') : setServerStatus('offline')))
      .catch(() => setServerStatus('offline'));
  }, []);

  const handleToggleBackend = (mode: 'real' | 'mock') => {
    localStorage.setItem('manohar_backend_mode', mode);
    setBackendMode(mode);
    showToast({
      message:
        mode === 'real'
          ? 'Switched to Live SQLite Backend (Port 3001)'
          : 'Switched to Offline Sandbox Mode',
    });
    setTimeout(() => {
      window.location.reload();
    }, 600);
  };

  // Trigger sync mutation
  const syncMutation = useMutation({
    mutationFn: () => api.agent.triggerSync(),
    onSuccess: (data) => {
      queryClient.invalidateQueries();
      showToast({
        message: t('settings.syncSuccess', 'Tally sync complete ({{vouchers}} vouchers updated)', {
          vouchers: data.vouchersCount,
        }),
      });
    },
    onError: () => {
      showToast({ message: 'Failed to sync with Tally' });
    },
  });

  // Regenerate pairing code mutation
  const pairingMutation = useMutation({
    mutationFn: () => api.agent.createPairingCode(),
    onSuccess: (data) => {
      setPairingCode(data.code);
      showToast({ message: 'New pairing code generated' });
    },
  });

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(pairingCode);
      setCopiedCode(true);
      showToast({ message: t('settings.codeCopied', 'Pairing code copied to clipboard') });
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      showToast({ message: 'Code copied: ' + pairingCode });
    }
  };

  const handleClearCache = () => {
    localStorage.removeItem('mock-db-v4');
    localStorage.removeItem('mock-db-v3');
    showToast({
      message: t('settings.cacheCleared', 'Local cache cleared. Fresh data reloaded.'),
    });
    setTimeout(() => {
      window.location.reload();
    }, 600);
  };

  const handleAddStaff = () => {
    if (!newStaffName.trim() || !newStaffPhone.trim()) return;
    showToast({ message: `Staff member ${newStaffName} added` });
    setAddStaffOpen(false);
    setNewStaffName('');
    setNewStaffPhone('');
  };

  const formatPermissionLabel = (key: PermissionKey): string => {
    const map: Record<PermissionKey, string> = {
      'dashboard.view': 'View Executive Dashboard',
      'ledgers.view': 'View Customer & Vendor Ledgers',
      'reminders.view': 'View Payment Reminders & History',
      'reminders.send': 'Send WhatsApp Payment Reminders',
      'reminders.configure': 'Configure Auto-Reminder Rules',
      'party.edit': 'Update Party Terms & Credit Limits',
      'stock.view': 'View Stock Items & Balances',
      'stock.adjust': 'Create Stock Adjustments (Physical Variance)',
      'challan.view': 'View Delivery & Sales Challans',
      'challan.create': 'Create & Dispatch New Challans',
      'notebook.view': 'View Calculation Notebooks',
      'notebook.edit': 'Edit Calculation Spreadsheets & Math',
      'activity.view': 'View System Audit Activity Log',
      'tally.write': 'Write Back Vouchers into Tally ERP',
      'tally.write.stock': 'Post Stock Journals to TallyPrime',
      'settings.manage': 'Manage Office PC & Global Settings',
      'users.manage': 'Manage Staff Accounts & Security Roles',
    };
    return map[key] || key;
  };

  return (
    <LargeTitleScreen title={t('settings.title', 'Settings')}>
      {/* 1. Office PC & Tally Sync Connection */}
      <InsetGroup title={t('settings.officePcSection', 'Office PC & Tally Sync')}>
        <div className="p-4 bg-surface rounded-2xl flex flex-col gap-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent-soft text-accent flex items-center justify-center shrink-0">
                <Monitor className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-headline font-bold text-label">
                    Office PC (Windows Agent)
                  </span>
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-ok/10 text-ok">
                    <span className="w-1.5 h-1.5 rounded-full bg-ok animate-pulse" />
                    {agent?.status === 'online'
                      ? t('settings.online', 'Online')
                      : t('settings.offline', 'Offline')}
                  </span>
                </div>
                <span className="text-caption text-label-2">
                  TallyPrime Port 9000 XML · Agent {agent?.version ?? 'v1.4.2'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-separator/40 text-footnote">
            <span className="text-label-2">
              {t('settings.lastSynced', 'Last synced')}:{' '}
              <strong className="text-label">2 min ago (17 Oct, 3:18 PM)</strong>
            </span>
            <Button
              variant="tinted"
              size="small"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              className="flex items-center gap-1.5 h-8 px-3"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${syncMutation.isPending ? 'animate-spin' : ''}`}
              />
              <span>
                {syncMutation.isPending
                  ? t('settings.syncing', 'Syncing...')
                  : t('settings.syncNow', 'Sync Tally Now')}
              </span>
            </Button>
          </div>
        </div>

        {/* Pairing Code Inset */}
        <div className="p-4 bg-fill/30 rounded-2xl border border-separator/40 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-accent" />
              <span className="text-subhead font-semibold text-label">
                {t('settings.pairingCodeTitle', 'Pairing Code for Windows Agent')}
              </span>
            </div>
            <button
              type="button"
              onClick={() => pairingMutation.mutate()}
              className="text-caption font-semibold text-accent hover:underline active:opacity-70"
            >
              {t('settings.regenerateCode', 'Generate New')}
            </button>
          </div>

          <div className="flex items-center justify-between bg-surface p-3 rounded-xl border border-separator/50">
            <div className="flex items-center gap-3">
              <span className="font-mono text-title-large font-bold tracking-widest text-label">
                {pairingCode}
              </span>
              <span className="text-caption text-label-3">Expires in 9 mins</span>
            </div>

            <Button
              size="small"
              variant="tinted"
              onClick={handleCopyCode}
              className="flex items-center gap-1.5 h-8 px-2.5"
            >
              {copiedCode ? (
                <>
                  <Check className="w-3.5 h-3.5 text-ok" />
                  <span className="text-ok">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>{t('settings.copyCode', 'Copy')}</span>
                </>
              )}
            </Button>
          </div>
          <span className="text-caption text-label-2">
            {t(
              'settings.pairingCodeSubtitle',
              'Enter this 6-digit code in the desktop agent setup'
            )}
          </span>
        </div>
      </InsetGroup>

      {/* 1b. Backend & Database Server */}
      <InsetGroup title={t('settings.backendSection', 'Backend & Cloud Database')}>
        <div className="p-4 bg-surface rounded-2xl flex flex-col gap-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent-soft text-accent flex items-center justify-center shrink-0">
                <Database className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-headline font-bold text-label">
                    Live SQLite API Server
                  </span>
                  <span
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                      serverStatus === 'online'
                        ? 'bg-ok/10 text-ok'
                        : 'bg-danger/10 text-danger'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        serverStatus === 'online'
                          ? 'bg-ok animate-pulse'
                          : 'bg-danger'
                      }`}
                    />
                    {serverStatus === 'online' ? 'Active (:3001)' : 'Offline'}
                  </span>
                </div>
                <span className="text-caption text-label-2">
                  High-performance persistent SQLite engine · Full relational tables
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-separator/40 text-footnote">
            <span className="text-label-2">Data Source:</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleToggleBackend('real')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                  backendMode === 'real'
                    ? 'bg-accent text-white shadow-sm'
                    : 'bg-fill text-label-2 hover:text-label'
                }`}
              >
                Live SQLite (:3001)
              </button>
              <button
                type="button"
                onClick={() => handleToggleBackend('mock')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                  backendMode === 'mock'
                    ? 'bg-accent text-white shadow-sm'
                    : 'bg-fill text-label-2 hover:text-label'
                }`}
              >
                Offline Sandbox
              </button>
            </div>
          </div>
        </div>
      </InsetGroup>

      {/* 2. Staff & Role Management */}
      <InsetGroup
        title={t('settings.staffSection', 'Staff & Role Management')}
        actionText={t('settings.addStaff', 'Add Staff')}
        onActionClick={() => setAddStaffOpen(true)}
      >
        {users.map((u) => (
          <Row
            key={u.id}
            leading={
              <div className="w-9 h-9 rounded-full bg-accent-soft text-accent flex items-center justify-center font-bold text-headline shrink-0">
                {u.name.charAt(0)}
              </div>
            }
            title={u.name}
            subtitle={
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-label-2">{u.phone}</span>
                <span className="text-label-3">·</span>
                <span className="text-[11px] font-mono text-label-3 uppercase">
                  {u.companyIds === 'all' ? 'All Companies' : 'Manohar Traders'}
                </span>
              </div>
            }
            trailing={
              <span className="px-2.5 py-1 rounded-full text-caption font-bold bg-fill text-label">
                {t(`roles.${u.role}`, u.role)}
              </span>
            }
            chevron
            onClick={() => setSelectedUser(u)}
          />
        ))}
      </InsetGroup>

      {/* 3. Preferences & Storage */}
      <InsetGroup title={t('settings.preferencesSection', 'Preferences & Storage')}>
        {/* Language Toggle */}
        <Row
          leading={<Globe className="w-5 h-5 text-accent" />}
          title={t('settings.language', 'App Language')}
          trailing={
            <div className="flex items-center gap-1 bg-fill p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`px-3 py-1 rounded-lg text-footnote font-semibold transition-all ${
                  language === 'en'
                    ? 'bg-surface text-label shadow-sm'
                    : 'text-label-2 hover:text-label'
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => setLanguage('hi')}
                className={`px-3 py-1 rounded-lg text-footnote font-semibold transition-all ${
                  language === 'hi'
                    ? 'bg-surface text-label shadow-sm'
                    : 'text-label-2 hover:text-label'
                }`}
              >
                हिंदी
              </button>
            </div>
          }
        />

        {/* Active Company Selector */}
        <Row
          leading={<Building className="w-5 h-5 text-accent" />}
          title={t('settings.activeCompany', 'Active Company')}
          trailing={
            <select
              value={currentCompanyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="bg-fill/60 border border-separator/40 rounded-lg px-2.5 py-1.5 text-footnote font-semibold text-label focus:outline-none cursor-pointer max-w-[180px] truncate"
            >
              <option value="all">All Companies</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          }
        />

        {/* Clear Local Cache */}
        <Row
          leading={<Trash2 className="w-5 h-5 text-danger" />}
          title={t('settings.clearCache', 'Clear Local Cache & Reset')}
          subtitle="Resets mock database and reloads latest seed data"
          onClick={handleClearCache}
          chevron
        />
      </InsetGroup>

      {/* 4. System Info */}
      <InsetGroup title={t('settings.systemInfo', 'System Information')}>
        <Row
          title={t('settings.client', 'Client')}
          trailing="Manohar Traders / International"
        />
        <Row
          title={t('settings.environment', 'Environment')}
          trailing="PWA Production Prototype"
        />
        <Row
          title={t('settings.version', 'Version')}
          trailing={
            <span className="font-mono text-label-2">
              v1.4.2 (Build 2026.10)
            </span>
          }
        />
      </InsetGroup>

      {/* User Permissions Inspector Sheet */}
      <Sheet
        open={Boolean(selectedUser)}
        onOpenChange={(open) => !open && setSelectedUser(null)}
        title={selectedUser?.name ?? 'User Permissions'}
        description={`Role: ${
          selectedUser ? t(`roles.${selectedUser.role}`, selectedUser.role) : ''
        }`}
      >
        {selectedUser && (
          <div className="flex flex-col gap-4 pt-2">
            <div className="p-3 bg-fill/40 rounded-xl border border-separator/30 flex items-center justify-between text-subhead">
              <div>
                <span className="text-caption uppercase text-label-2 font-bold block">
                  Contact
                </span>
                <span className="text-label font-semibold">{selectedUser.phone}</span>
              </div>
              <div>
                <span className="text-caption uppercase text-label-2 font-bold block">
                  Companies
                </span>
                <span className="text-label font-semibold">
                  {selectedUser.companyIds === 'all'
                    ? 'All Companies'
                    : 'Manohar Traders'}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-caption uppercase text-label-2 font-bold tracking-wide">
                {t('settings.permissionsTitle', 'Role Permissions')}
              </span>

              <div className="divide-y divide-separator/30 border border-separator/40 rounded-xl overflow-hidden bg-surface">
                {PERMISSION_KEYS.map((perm) => {
                  const allowed = can(selectedUser.role, perm);
                  return (
                    <div
                      key={perm}
                      className="flex items-center justify-between p-2.5 text-subhead"
                    >
                      <span
                        className={
                          allowed
                            ? 'text-label font-medium'
                            : 'text-label-3 line-through'
                        }
                      >
                        {formatPermissionLabel(perm)}
                      </span>
                      {allowed ? (
                        <CheckCircle2 className="w-4 h-4 text-ok shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-label-3 shrink-0 opacity-40" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <Button fullWidth onClick={() => setSelectedUser(null)}>
              Done
            </Button>
          </div>
        )}
      </Sheet>

      {/* Add Staff Sheet */}
      <Sheet
        open={addStaffOpen}
        onOpenChange={setAddStaffOpen}
        title={t('settings.addStaff', 'Add Staff Member')}
        description="Provision staff account with designated role"
      >
        <div className="flex flex-col gap-4 pt-2">
          <div>
            <label className="text-caption font-semibold uppercase text-label-2 mb-1 block">
              Staff Full Name
            </label>
            <input
              type="text"
              placeholder="e.g. Vikas Sharma"
              value={newStaffName}
              onChange={(e) => setNewStaffName(e.target.value)}
              className="w-full h-11 px-3 bg-surface border border-separator/60 rounded-xl text-subhead text-label focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
          </div>

          <div>
            <label className="text-caption font-semibold uppercase text-label-2 mb-1 block">
              Mobile Number (WhatsApp)
            </label>
            <input
              type="tel"
              placeholder="+91 98765 00000"
              value={newStaffPhone}
              onChange={(e) => setNewStaffPhone(e.target.value)}
              className="w-full h-11 px-3 bg-surface border border-separator/60 rounded-xl text-subhead text-label focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
          </div>

          <div>
            <label className="text-caption font-semibold uppercase text-label-2 mb-1 block">
              Security Role
            </label>
            <select
              value={newStaffRole}
              onChange={(e) => setNewStaffRole(e.target.value as Role)}
              className="w-full h-11 px-3 bg-surface border border-separator/60 rounded-xl text-subhead text-label focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            >
              <option value="owner">Owner (Full access)</option>
              <option value="admin">Admin (All operations except billing)</option>
              <option value="accounts">Accounts (Ledgers, bills & reminders)</option>
              <option value="sales">Sales (Challans & stock lookup)</option>
              <option value="stock_keeper">Stock Keeper (Adjustments & godowns)</option>
              <option value="viewer">Viewer (Read only)</option>
            </select>
          </div>

          <Button
            fullWidth
            disabled={!newStaffName.trim() || !newStaffPhone.trim()}
            onClick={handleAddStaff}
          >
            Create Staff Account
          </Button>
        </div>
      </Sheet>
    </LargeTitleScreen>
  );
};
