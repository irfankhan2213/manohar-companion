import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileSpreadsheet,
  BookOpen,
  BellRing,
  Activity,
  Settings,
  Languages,
  ShieldCheck,
  Smartphone,
  Scale,
  TrendingUp,
  BarChart3,
  Calendar,
  ShoppingCart,
  Wallet,
} from 'lucide-react';
import { can } from '@saas/shared';
import { LargeTitleScreen } from '../../components/ui/LargeTitleScreen.js';
import { InsetGroup, Row } from '../../components/ui/InsetGroup.js';
import { useAppStore } from '../../app/store.js';

export const MoreScreen: React.FC = () => {
  const navigate = useNavigate();
  const { language, setLanguage, currentRole, currentUser } = useAppStore();
  const actor = currentUser || currentRole;

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'hi' : 'en');
  };

  return (
    <LargeTitleScreen title="More">
      {currentRole === 'dev' && (
        <InsetGroup title="Platform Administration">
          <Row
            leading={<ShieldCheck className="w-5 h-5 text-accent" />}
            title="Client Organizations"
            chevron
            onClick={() => navigate('/dev/clients')}
          />
        </InsetGroup>
      )}

      <InsetGroup title="Companion Tools">
        {can(actor, 'challan.view') && (
          <Row
            leading={<FileSpreadsheet className="w-5 h-5 text-accent" />}
            title="Delivery Challans"
            chevron
            onClick={() => navigate('/challans')}
          />
        )}
        {can(actor, 'notebook.view') && (
          <Row
            leading={<BookOpen className="w-5 h-5 text-accent" />}
            title="Notebook"
            chevron
            onClick={() => navigate('/notebook')}
          />
        )}
        {can(actor, 'reminders.view') && (
          <Row
            leading={<BellRing className="w-5 h-5 text-accent" />}
            title="Payment Reminders"
            chevron
            onClick={() => navigate('/reminders')}
          />
        )}
        {can(actor, 'activity.view') && (
          <Row
            leading={<Activity className="w-5 h-5 text-accent" />}
            title="Activity Log"
            chevron
            onClick={() => navigate('/activity')}
          />
        )}
      </InsetGroup>

      {can(actor, 'ledgers.view') && (
        <InsetGroup title="Financial Statements & Registers">
          <Row
            leading={<Scale className="w-5 h-5 text-accent" />}
            title="Balance Sheet"
            chevron
            onClick={() => navigate('/reports/balance-sheet')}
          />
          <Row
            leading={<TrendingUp className="w-5 h-5 text-accent" />}
            title="Profit & Loss A/c"
            chevron
            onClick={() => navigate('/reports/profit-and-loss')}
          />
          <Row
            leading={<BarChart3 className="w-5 h-5 text-accent" />}
            title="Trial Balance"
            chevron
            onClick={() => navigate('/reports/trial-balance')}
          />
          <Row
            leading={<Calendar className="w-5 h-5 text-accent" />}
            title="Daybook"
            chevron
            onClick={() => navigate('/reports/daybook')}
          />
          <Row
            leading={<ShoppingCart className="w-5 h-5 text-accent" />}
            title="Sales Register"
            chevron
            onClick={() => navigate('/reports/sales-register')}
          />
          <Row
            leading={<FileSpreadsheet className="w-5 h-5 text-accent" />}
            title="Purchase Register"
            chevron
            onClick={() => navigate('/reports/purchase-register')}
          />
          <Row
            leading={<Wallet className="w-5 h-5 text-accent" />}
            title="Cash & Bank Summary"
            chevron
            onClick={() => navigate('/reports/cash-bank')}
          />
        </InsetGroup>
      )}

      <InsetGroup title="System & Preferences">
        <Row
          leading={<Smartphone className="w-5 h-5 text-accent" />}
          title="Download Android App"
          trailing="APK (703 KB)"
          chevron
          onClick={() => {
            window.location.href = '/manohar-traders.apk';
          }}
        />
        <Row
          leading={<Settings className="w-5 h-5 text-accent" />}
          title="Settings & Backups"
          chevron
          onClick={() => navigate('/settings')}
        />
        <Row
          leading={<Languages className="w-5 h-5 text-label-2" />}
          title="Language"
          trailing={language === 'en' ? 'English' : 'हिंदी'}
          onClick={toggleLanguage}
          chevron
        />
      </InsetGroup>
    </LargeTitleScreen>
  );
};
