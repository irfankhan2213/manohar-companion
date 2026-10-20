import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  FileSpreadsheet,
  MessageSquare,
  Package,
  RefreshCw,
  CornerDownLeft,
  LogIn,
  Smartphone,
  Monitor,
  Cpu,
} from 'lucide-react';
import { ActivityEvent } from '@saas/shared';
import { api } from '../../api/index.js';
import { useAppStore } from '../../app/store.js';
import { LargeTitleScreen } from '../../components/ui/LargeTitleScreen.js';
import { InsetGroup, Row } from '../../components/ui/InsetGroup.js';
import { SegmentedControl } from '../../components/ui/SegmentedControl.js';

type ActivityFilter = 'all' | 'sync' | 'challans' | 'reminders' | 'stock' | 'logins';
type DeviceFilter = 'all' | 'iPhone' | 'Android' | 'Desktop' | 'Agent';

export const ActivityScreen: React.FC = () => {
  const { t } = useTranslation();
  const { currentCompanyId } = useAppStore();

  const [activeFilter, setActiveFilter] = useState<ActivityFilter>('all');
  const [deviceFilter, setDeviceFilter] = useState<DeviceFilter>('all');

  const { data: activities = [], isLoading } = useQuery({
    queryKey: ['activity', currentCompanyId],
    queryFn: () => api.activity.list(currentCompanyId),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.users.list(),
  });

  const getUserName = (actorId: string): string => {
    if (actorId === 'u-agent') return 'Office Windows PC (Sync Agent)';
    if (actorId === 'u-system') return 'TallyCompanion Service';
    const found = users.find((u) => u.id === actorId);
    return found ? `${found.name} (${t(`roles.${found.role}`, found.role)})` : actorId;
  };

  // Filter activities
  const filteredActivities = activities.filter((act) => {
    // Action category filter
    if (activeFilter === 'sync' && !act.action.includes('sync')) return false;
    if (activeFilter === 'challans' && !act.action.includes('challan')) return false;
    if (activeFilter === 'reminders' && !act.action.includes('reminder')) return false;
    if (activeFilter === 'stock' && !act.action.includes('stock')) return false;
    if (activeFilter === 'logins' && !act.action.includes('login')) return false;

    // Device filter
    if (deviceFilter !== 'all' && act.device !== deviceFilter) return false;

    return true;
  });

  // Group by date (Today vs Earlier)
  const todayActs = filteredActivities.filter((a) => a.at.startsWith('2026-10-17'));
  const earlierActs = filteredActivities.filter((a) => !a.at.startsWith('2026-10-17'));

  const getActionIcon = (action: string) => {
    if (action.includes('sync')) {
      return (
        <div className="w-8 h-8 rounded-lg bg-ok/10 text-ok flex items-center justify-center shrink-0">
          <RefreshCw className="w-4 h-4 stroke-[2.2]" />
        </div>
      );
    }
    if (action.includes('challan')) {
      return (
        <div className="w-8 h-8 rounded-lg bg-accent-soft text-accent flex items-center justify-center shrink-0">
          <FileSpreadsheet className="w-4 h-4 stroke-[2.2]" />
        </div>
      );
    }
    if (action.includes('reply')) {
      return (
        <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-700 flex items-center justify-center shrink-0">
          <CornerDownLeft className="w-4 h-4 stroke-[2.2]" />
        </div>
      );
    }
    if (action.includes('reminder')) {
      return (
        <div className="w-8 h-8 rounded-lg bg-accent-soft text-accent flex items-center justify-center shrink-0">
          <MessageSquare className="w-4 h-4 stroke-[2.2]" />
        </div>
      );
    }
    if (action.includes('stock')) {
      return (
        <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-700 flex items-center justify-center shrink-0">
          <Package className="w-4 h-4 stroke-[2.2]" />
        </div>
      );
    }
    if (action.includes('login')) {
      return (
        <div className="w-8 h-8 rounded-lg bg-ok/10 text-ok flex items-center justify-center shrink-0">
          <LogIn className="w-4 h-4 stroke-[2.2]" />
        </div>
      );
    }
    return (
      <div className="w-8 h-8 rounded-lg bg-fill text-label-2 flex items-center justify-center shrink-0">
        <Activity className="w-4 h-4 stroke-[2.2]" />
      </div>
    );
  };

  const getDeviceIcon = (device: ActivityEvent['device']) => {
    if (device === 'iPhone' || device === 'Android') {
      return <Smartphone className="w-3 h-3 text-label-3" />;
    }
    if (device === 'Desktop') {
      return <Monitor className="w-3 h-3 text-label-3" />;
    }
    return <Cpu className="w-3 h-3 text-label-3" />;
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  return (
    <LargeTitleScreen
      title={t('activity.title', 'Activity Log')}
      subtitle={
        <span className="text-footnote text-label-2 font-medium">
          {filteredActivities.length} {filteredActivities.length === 1 ? 'event' : 'events'}
        </span>
      }
    >
      {/* Category Segmented Control */}
      <SegmentedControl
        value={activeFilter}
        onChange={(val) => setActiveFilter(val as ActivityFilter)}
        options={[
          { value: 'all', label: t('activity.filterAll', 'All') },
          { value: 'sync', label: t('activity.filterSync', 'Sync') },
          { value: 'challans', label: t('activity.filterChallans', 'Challans') },
          { value: 'reminders', label: t('activity.filterReminders', 'Reminders') },
          { value: 'stock', label: t('activity.filterStock', 'Stock') },
          { value: 'logins', label: t('activity.filterUsers', 'Logins') },
        ]}
      />

      {/* Device Filter Quick Badges */}
      <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 -mt-2">
        {(['all', 'iPhone', 'Android', 'Desktop', 'Agent'] as DeviceFilter[]).map((dev) => (
          <button
            key={dev}
            type="button"
            onClick={() => setDeviceFilter(dev)}
            className={`px-3 py-1 rounded-full text-caption font-semibold transition-all select-none whitespace-nowrap active:scale-95 ${
              deviceFilter === dev
                ? 'bg-accent text-white shadow-sm'
                : 'bg-fill text-label-2 hover:bg-fill/80'
            }`}
          >
            {dev === 'all' ? 'All Devices' : dev}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-label-2 text-subhead">
          Loading audit activities...
        </div>
      ) : filteredActivities.length === 0 ? (
        <div className="bg-surface rounded-ios-card p-8 border border-separator/50 text-center">
          <Activity className="w-10 h-10 text-label-3 mx-auto mb-2 opacity-50" />
          <p className="text-subhead font-semibold text-label">
            {t('activity.empty', 'No activity matching this filter.')}
          </p>
          <p className="text-footnote text-label-2 mt-1">
            Try switching category or device filters above.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* Today Group */}
          {todayActs.length > 0 && (
            <InsetGroup title={t('activity.today', 'Today')}>
              {todayActs.map((act) => (
                <Row
                  key={act.id}
                  leading={getActionIcon(act.action)}
                  title={act.target}
                  subtitle={
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="font-semibold text-label-2 truncate">
                        {getUserName(act.actorId)}
                      </span>
                      <span className="text-label-3">·</span>
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.2 bg-fill rounded text-[11px] text-label-2 font-mono">
                        {getDeviceIcon(act.device)}
                        {act.device}
                      </span>
                    </div>
                  }
                  trailing={
                    <span className="text-caption font-mono text-label-3 whitespace-nowrap">
                      {formatTime(act.at)}
                    </span>
                  }
                />
              ))}
            </InsetGroup>
          )}

          {/* Earlier Group */}
          {earlierActs.length > 0 && (
            <InsetGroup title={t('activity.earlier', 'Earlier')}>
              {earlierActs.map((act) => (
                <Row
                  key={act.id}
                  leading={getActionIcon(act.action)}
                  title={act.target}
                  subtitle={
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="font-semibold text-label-2 truncate">
                        {getUserName(act.actorId)}
                      </span>
                      <span className="text-label-3">·</span>
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.2 bg-fill rounded text-[11px] text-label-2 font-mono">
                        {getDeviceIcon(act.device)}
                        {act.device}
                      </span>
                    </div>
                  }
                  trailing={
                    <span className="text-caption font-mono text-label-3 whitespace-nowrap">
                      {formatTime(act.at)}
                    </span>
                  }
                />
              ))}
            </InsetGroup>
          )}
        </div>
      )}
    </LargeTitleScreen>
  );
};
