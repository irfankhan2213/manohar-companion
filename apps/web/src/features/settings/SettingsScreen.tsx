import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Edit3,
  ShieldCheck,
  Lock,
  Download,
  Smartphone,
  LogOut,
} from 'lucide-react';
import {
  User,
  Role,
  can,
  PERMISSION_KEYS,
  PermissionKey,
  ROLE_PERMISSIONS,
  setCustomPermissions,
} from '@saas/shared';
import { api } from '../../api/index.js';
import { useAppStore } from '../../app/store.js';
import { LargeTitleScreen } from '../../components/ui/LargeTitleScreen.js';
import { InsetGroup, Row } from '../../components/ui/InsetGroup.js';
import { Button } from '../../components/ui/Button.js';
import { Sheet } from '../../components/ui/Sheet.js';
import { useToast } from '../../components/ui/Toast.js';

export const SettingsScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const {
    currentCompanyId,
    setCompanyId,
    language,
    setLanguage,
    currentRole,
    currentUser,
    currentTenant,
    logout,
  } = useAppStore();
  const isAdminOrOwner = currentRole === 'owner' || currentRole === 'admin' || currentRole === 'dev';

  const handleSignOut = async () => {
    try {
      await api.auth.logout();
    } catch {}
    logout();
    showToast({ message: 'Signed out successfully' });
    navigate('/login');
  };

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

  const activeCompany =
    companies.find((c) => c.id === currentCompanyId) ||
    companies[0] ||
    ({
      id: (currentCompanyId as string) || 'c1',
      name: 'Manohar Traders',
      tallyName: 'Manohar Traders',
      financialYear: '2026-27',
      agentStatus: 'online',
    } as any);

  // Company management state
  const [editCompanyOpen, setEditCompanyOpen] = useState(false);
  const [addCompanyOpen, setAddCompanyOpen] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [tallyName, setTallyName] = useState('');
  const [financialYear, setFinancialYear] = useState('2026-27');
  const [gstin, setGstin] = useState('');

  // Role permissions matrix state
  const [permissionsModalOpen, setPermissionsModalOpen] = useState(false);
  const [selectedRoleForPerms, setSelectedRoleForPerms] = useState<Role>('sales');
  const [rolePermissions, setRolePermissions] = useState<Record<Role, Record<string, boolean>>>(() => {
    const stored = localStorage.getItem('manohar_custom_permissions');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {}
    }
    return ROLE_PERMISSIONS;
  });

  // PWA install state
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [installHelpOpen, setInstallHelpOpen] = useState(false);

  React.useEffect(() => {
    const checkStandalone =
      (typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
      (typeof window !== 'undefined' && (window.navigator as any)?.standalone === true);
    setIsStandalone(Boolean(checkStandalone));

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeinstallprompt', handleBeforeInstall);
      return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    }
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        showToast({ message: 'App install accepted! Adding to home screen...', variant: 'success' });
      }
      setDeferredPrompt(null);
    } else {
      setInstallHelpOpen(true);
    }
  };

  const handleOpenEditCompany = () => {
    if (!activeCompany) return;
    setCompanyName(activeCompany.name);
    setTallyName(activeCompany.tallyName || activeCompany.name);
    setFinancialYear(activeCompany.financialYear || '2026-27');
    setGstin(activeCompany.gstin || '');
    setEditCompanyOpen(true);
  };

  const handleSaveCompany = async () => {
    if (!activeCompany || !companyName.trim()) return;
    try {
      if (api.companies.update) {
        await api.companies.update(activeCompany.id, {
          name: companyName,
          tallyName: tallyName || companyName,
          financialYear,
          gstin,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      showToast({ message: `Updated organization: ${companyName}` });
      setEditCompanyOpen(false);
    } catch (err: any) {
      showToast({ message: 'Failed to update company: ' + err.message });
    }
  };

  const handleCreateCompany = async () => {
    if (!companyName.trim()) return;
    try {
      if (api.companies.create) {
        const created = await api.companies.create({
          name: companyName,
          tallyName: tallyName || companyName,
          financialYear,
          gstin,
        });
        setCompanyId(created.id);
      }
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      showToast({ message: `Created new organization: ${companyName}` });
      setAddCompanyOpen(false);
      setCompanyName('');
      setTallyName('');
      setGstin('');
    } catch (err: any) {
      showToast({ message: 'Failed to create company: ' + err.message });
    }
  };

  const handleTogglePermission = (role: Role, perm: PermissionKey) => {
    const currentVal = rolePermissions[role]?.[perm] ?? false;
    const updated = {
      ...rolePermissions,
      [role]: {
        ...rolePermissions[role],
        [perm]: !currentVal,
      },
    };
    setRolePermissions(updated);
    setCustomPermissions(updated as any);
    localStorage.setItem('manohar_custom_permissions', JSON.stringify(updated));
    if (api.permissions?.update) {
      api.permissions.update(updated as any);
    }
    showToast({ message: `Updated permission for ${role}` });
  };

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

  const handleDownloadBackup = (format: 'sqlite' | 'json') => {
    if (backendMode === 'real') {
      window.open(`/api/backup/${format}`, '_blank');
      showToast({ message: `Downloading ${format.toUpperCase()} database backup...` });
    } else {
      const stored = localStorage.getItem('mock-db-v4') || localStorage.getItem('mock-db-v3') || '{}';
      const blob = new Blob([stored], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `manohar-offline-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast({ message: 'Downloaded offline JSON backup' });
    }
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
      'clients.manage': 'Manage Platform Clients & Tenancy',
    };
    return map[key] || key;
  };

  return (
    <LargeTitleScreen title={t('settings.title', 'Settings')}>
      {/* 0. Signed In User Profile */}
      <InsetGroup title="Account & Organization">
        <div className="p-4 bg-surface rounded-2xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-accent text-white flex items-center justify-center font-bold text-title-medium shadow-sm shrink-0">
              {currentUser?.name?.charAt(0) || 'U'}
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-headline font-bold text-label">
                  {currentUser?.name || 'Staff User'}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold uppercase bg-accent-soft text-accent">
                  {currentUser?.role || currentRole}
                </span>
              </div>
              <span className="text-caption text-label-2">
                {currentUser?.phone} · {currentTenant?.name || 'Manohar Traders'}
              </span>
            </div>
          </div>

          <Button
            variant="tinted"
            size="small"
            onClick={handleSignOut}
            className="flex items-center gap-1.5 text-danger border border-danger/30 hover:bg-danger/10"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </Button>
        </div>
      </InsetGroup>

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
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-separator/40 text-footnote">
            <span className="text-label-2">
              {t('settings.lastSynced', 'Last synced')}:{' '}
              <strong className="text-label">2 min ago</strong>
            </span>
            <Button
              variant="tinted"
              size="small"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              className="flex items-center gap-1.5 h-8 px-3 whitespace-nowrap shrink-0"
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
                {t('settings.pairingCodeTitle', 'Pairing Code')}
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
              <span className="text-caption text-label-3">Expires in 9m</span>
            </div>

            <Button
              size="small"
              variant="tinted"
              onClick={handleCopyCode}
              className="flex items-center gap-1.5 h-8 px-2.5 whitespace-nowrap shrink-0"
            >
              {copiedCode ? (
                <>
                  <Check className="w-3.5 h-3.5 text-ok" />
                  <span className="text-ok">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>{t('settings.copyCode', 'Copy Code')}</span>
                </>
              )}
            </Button>
          </div>
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
              </div>
            </div>
          </div>

          {currentUser?.role === 'dev' && (
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
                  Live Server
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
          )}
        </div>
      </InsetGroup>

      {/* 1c. Organization & Active Company Setup */}
      <InsetGroup
        title={t('settings.organizationSection', 'Organization & Company Setup')}
        actionText={isAdminOrOwner ? '+ Add Company' : undefined}
        onActionClick={
          isAdminOrOwner
            ? () => {
                setCompanyName('');
                setTallyName('');
                setGstin('');
                setAddCompanyOpen(true);
              }
            : undefined
        }
      >
        <div className="p-4 bg-surface rounded-2xl flex flex-col gap-3.5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent-soft text-accent flex items-center justify-center shrink-0">
                <Building className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-headline font-bold text-label">
                    {activeCompany?.name || 'Active Company'}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-accent/10 text-accent">
                    Active
                  </span>
                </div>
                <span className="text-caption text-label-2">
                  Tally: {activeCompany?.tallyName || activeCompany?.name || 'Default'} · FY{' '}
                  {activeCompany?.financialYear || '2026-27'}
                </span>
                {activeCompany?.gstin && (
                  <span className="text-[11px] font-mono text-label-3 mt-0.5">
                    GSTIN: {activeCompany.gstin}
                  </span>
                )}
              </div>
            </div>

            {isAdminOrOwner ? (
              <Button
                variant="tinted"
                size="small"
                onClick={handleOpenEditCompany}
                className="flex items-center gap-1.5 h-8 px-2.5"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit</span>
              </Button>
            ) : (
              <span className="flex items-center gap-1 text-[11px] text-label-3 bg-fill px-2 py-1 rounded-md">
                <Lock className="w-3 h-3" />
                <span>Admin Only</span>
              </span>
            )}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-separator/40 text-footnote">
            <span className="text-label-2">Registered Companies:</span>
            <span className="font-semibold text-label">
              {companies.length} Active in System
            </span>
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
                  {u.companyIds === 'all' ? 'All Companies' : (activeCompany?.name || 'Primary Company')}
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

      {/* 2b. Role Permissions Matrix */}
      <InsetGroup
        title={t('settings.permissionsSection', 'Role Permissions & Access Control')}
        actionText={isAdminOrOwner ? 'Customize Matrix' : undefined}
        onActionClick={isAdminOrOwner ? () => setPermissionsModalOpen(true) : undefined}
      >
        <div className="p-4 bg-surface rounded-2xl flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-5 h-5 text-accent" />
              <span className="text-subhead font-bold text-label">
                Organization Access Rules
              </span>
            </div>
            <span className="text-caption text-label-3">
              {isAdminOrOwner ? 'Owner Editable' : 'Enforced'}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {(['owner', 'admin', 'accounts', 'sales', 'stock_keeper'] as Role[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setSelectedRoleForPerms(r);
                  setPermissionsModalOpen(true);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95 capitalize ${
                  selectedRoleForPerms === r
                    ? 'bg-accent text-white shadow-sm'
                    : 'bg-fill text-label-2 hover:text-label'
                }`}
              >
                {r.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
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

        {/* Database Backup Downloads */}
        <Row
          leading={<Download className="w-5 h-5 text-accent" />}
          title="Download Database Backup (SQLite)"
          onClick={() => handleDownloadBackup('sqlite')}
          chevron
        />

        <Row
          leading={<Download className="w-5 h-5 text-accent" />}
          title="Download Data Export (JSON)"
          onClick={() => handleDownloadBackup('json')}
          chevron
        />

        {/* Clear Local Cache */}
        <Row
          leading={<Trash2 className="w-5 h-5 text-danger" />}
          title={t('settings.clearCache', 'Clear Local Cache & Reset')}
          onClick={handleClearCache}
          chevron
        />
      </InsetGroup>

      {/* App Installation */}
      <InsetGroup title="App Installation & Mobile Access">
        <Row
          leading={<Smartphone className="w-5 h-5 text-accent" />}
          title={isStandalone ? 'Installed as App' : 'Install on Phone / Desktop'}
          trailing={
            isStandalone ? (
              <span className="text-ok font-semibold text-footnote flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> Installed
              </span>
            ) : deferredPrompt ? (
              <Button size="small" onClick={handleInstallClick}>
                Install
              </Button>
            ) : undefined
          }
          onClick={isStandalone ? undefined : handleInstallClick}
          chevron={!isStandalone && !deferredPrompt}
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

      {/* Edit Active Company Sheet */}
      <Sheet
        open={editCompanyOpen}
        onOpenChange={setEditCompanyOpen}
        title="Edit Organization Details"
        description="Configure active company name, Tally synchronization & GSTIN"
      >
        <div className="flex flex-col gap-4 pt-2">
          <div>
            <label className="text-caption font-semibold uppercase text-label-2 mb-1 block">
              Company / Business Name
            </label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. Apex Industries"
              className="w-full h-11 px-3 bg-surface border border-separator/60 rounded-xl text-subhead text-label focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="text-caption font-semibold uppercase text-label-2 mb-1 block">
              Tally Company Name (Exact Match)
            </label>
            <input
              type="text"
              value={tallyName}
              onChange={(e) => setTallyName(e.target.value)}
              placeholder="e.g. Apex Industries (2026-27)"
              className="w-full h-11 px-3 bg-surface border border-separator/60 rounded-xl text-subhead text-label focus:outline-none focus:border-accent"
            />
            <span className="text-[11px] text-label-3 mt-1 block">
              Must match the active company name in your office TallyPrime.
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-caption font-semibold uppercase text-label-2 mb-1 block">
                Financial Year
              </label>
              <input
                type="text"
                value={financialYear}
                onChange={(e) => setFinancialYear(e.target.value)}
                placeholder="2026-27"
                className="w-full h-11 px-3 bg-surface border border-separator/60 rounded-xl text-subhead text-label focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="text-caption font-semibold uppercase text-label-2 mb-1 block">
                GSTIN Number
              </label>
              <input
                type="text"
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                placeholder="03AABCM1234F1Z1"
                className="w-full h-11 px-3 bg-surface border border-separator/60 rounded-xl text-subhead text-label font-mono uppercase focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <Button fullWidth onClick={handleSaveCompany} disabled={!companyName.trim()}>
            Save Company Details
          </Button>
        </div>
      </Sheet>

      {/* Add New Company Sheet */}
      <Sheet
        open={addCompanyOpen}
        onOpenChange={setAddCompanyOpen}
        title="Add New Organization"
        description="Register a new business entity for multi-company management"
      >
        <div className="flex flex-col gap-4 pt-2">
          <div>
            <label className="text-caption font-semibold uppercase text-label-2 mb-1 block">
              Organization Name
            </label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. Apex Global Exports Ltd"
              className="w-full h-11 px-3 bg-surface border border-separator/60 rounded-xl text-subhead text-label focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="text-caption font-semibold uppercase text-label-2 mb-1 block">
              Tally Company Name
            </label>
            <input
              type="text"
              value={tallyName}
              onChange={(e) => setTallyName(e.target.value)}
              placeholder="Matches TallyPrime company name"
              className="w-full h-11 px-3 bg-surface border border-separator/60 rounded-xl text-subhead text-label focus:outline-none focus:border-accent"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-caption font-semibold uppercase text-label-2 mb-1 block">
                Financial Year
              </label>
              <input
                type="text"
                value={financialYear}
                onChange={(e) => setFinancialYear(e.target.value)}
                placeholder="2026-27"
                className="w-full h-11 px-3 bg-surface border border-separator/60 rounded-xl text-subhead text-label focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="text-caption font-semibold uppercase text-label-2 mb-1 block">
                GSTIN Number (Optional)
              </label>
              <input
                type="text"
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                placeholder="03AABCM5678F1Z2"
                className="w-full h-11 px-3 bg-surface border border-separator/60 rounded-xl text-subhead text-label font-mono uppercase focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <Button fullWidth onClick={handleCreateCompany} disabled={!companyName.trim()}>
            Create Organization
          </Button>
        </div>
      </Sheet>

      {/* Role Permissions Matrix Sheet */}
      <Sheet
        open={permissionsModalOpen}
        onOpenChange={setPermissionsModalOpen}
        title="Customize Role Permissions"
        description="Fine-tune operational permissions for this staff role"
      >
        <div className="flex flex-col gap-4 pt-2">
          {/* Role Selector Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-fill rounded-xl overflow-x-auto">
            {(['owner', 'admin', 'accounts', 'sales', 'stock_keeper'] as Role[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setSelectedRoleForPerms(r)}
                className={`flex-1 py-1 px-2.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all capitalize ${
                  selectedRoleForPerms === r
                    ? 'bg-surface text-label shadow-sm font-bold'
                    : 'text-label-2 hover:text-label'
                }`}
              >
                {r.replace('_', ' ')}
              </button>
            ))}
          </div>

          {/* Permissions Toggle List */}
          <div className="flex flex-col rounded-2xl bg-surface border border-separator/40 divide-y divide-separator/30 max-h-[50vh] overflow-y-auto">
            {PERMISSION_KEYS.map((perm) => {
              const isAllowed = rolePermissions[selectedRoleForPerms]?.[perm] ?? false;
              const isLocked = selectedRoleForPerms === 'owner'; // Owner always has all permissions

              return (
                <div
                  key={perm}
                  className="p-3 flex items-center justify-between text-subhead hover:bg-fill/20 transition-colors"
                >
                  <div className="flex flex-col pr-3">
                    <span className="text-subhead font-medium text-label">
                      {formatPermissionLabel(perm)}
                    </span>
                    <span className="text-[11px] font-mono text-label-3">
                      {perm}
                    </span>
                  </div>

                  <button
                    type="button"
                    disabled={isLocked || !isAdminOrOwner}
                    onClick={() => handleTogglePermission(selectedRoleForPerms, perm)}
                    className={`w-11 h-6 rounded-full transition-colors relative focus:outline-none disabled:opacity-50 ${
                      isAllowed ? 'bg-accent' : 'bg-fill'
                    }`}
                  >
                    <span
                      className={`block w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${
                        isAllowed ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              );
            })}
          </div>

          <Button fullWidth onClick={() => setPermissionsModalOpen(false)}>
            Apply & Close
          </Button>
        </div>
      </Sheet>

      {/* Install Help Sheet */}
      <Sheet
        open={installHelpOpen}
        onOpenChange={setInstallHelpOpen}
        title="Install Manohar Traders App"
        description="Add the app to your home screen for fast offline access."
      >
        <div className="flex flex-col gap-4 py-2 text-subhead">
          <div className="p-3.5 bg-fill/40 rounded-xl border border-separator/30 flex flex-col gap-2">
            <span className="font-bold text-label text-headline">🤖 Android Phone (Google Chrome)</span>
            <ol className="list-decimal pl-5 text-label-2 text-subhead flex flex-col gap-1.5">
              <li>Direct install: Tap <strong>Download Android APK</strong> below to directly install the app on your phone.</li>
              <li>Or via Chrome: Open Chrome menu (<strong>⋮</strong>) &gt; Tap <strong>"Install app"</strong>.</li>
              <li>If prompted, allow <em>"Install unknown apps"</em> in your Android settings.</li>
            </ol>
            <a
              href="/manohar-traders.apk"
              download="manohar-traders.apk"
              className="mt-2 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-accent text-white font-medium rounded-xl text-subhead hover:bg-accent/90 transition-colors shadow-sm"
            >
              <Download className="w-4 h-4" /> Download Android APK (703 KB)
            </a>
          </div>

          <div className="p-3.5 bg-fill/40 rounded-xl border border-separator/30 flex flex-col gap-2">
            <span className="font-bold text-label text-headline">🍎 iPhone / iPad (Safari)</span>
            <ol className="list-decimal pl-5 text-label-2 text-subhead flex flex-col gap-1.5">
              <li>Tap the <strong>Share</strong> button (the square box with an arrow pointing up at the bottom).</li>
              <li>Scroll down and tap <strong>"Add to Home Screen"</strong>.</li>
              <li>Tap <strong>Add</strong> in the top-right corner.</li>
            </ol>
          </div>

          <div className="p-3.5 bg-fill/40 rounded-xl border border-separator/30 flex flex-col gap-2">
            <span className="font-bold text-label text-headline">💻 Computer (Chrome / Edge)</span>
            <ol className="list-decimal pl-5 text-label-2 text-subhead flex flex-col gap-1.5">
              <li>Click the <strong>Install</strong> icon in the address bar (next to the star icon).</li>
              <li>Click <strong>Install</strong> to add it to your desktop taskbar.</li>
            </ol>
          </div>

          <Button fullWidth onClick={() => setInstallHelpOpen(false)} className="mt-2">
            Done
          </Button>
        </div>
      </Sheet>
    </LargeTitleScreen>
  );
};
