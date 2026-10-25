import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileSpreadsheet,
  BookOpen,
  BellRing,
  Activity,
  Settings,
  Languages,
} from 'lucide-react';
import { LargeTitleScreen } from '../../components/ui/LargeTitleScreen.js';
import { InsetGroup, Row } from '../../components/ui/InsetGroup.js';
import { useAppStore } from '../../app/store.js';

export const MoreScreen: React.FC = () => {
  const navigate = useNavigate();
  const { language, setLanguage } = useAppStore();

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'hi' : 'en');
  };

  return (
    <LargeTitleScreen title="More">
      <InsetGroup title="Companion Tools">
        <Row
          leading={<FileSpreadsheet className="w-5 h-5 text-accent" />}
          title="Delivery Challans"
          chevron
          onClick={() => navigate('/challans')}
        />
        <Row
          leading={<BookOpen className="w-5 h-5 text-accent" />}
          title="Notebook"
          chevron
          onClick={() => navigate('/notebook')}
        />
        <Row
          leading={<BellRing className="w-5 h-5 text-accent" />}
          title="Payment Reminders"
          chevron
          onClick={() => navigate('/reminders')}
        />
        <Row
          leading={<Activity className="w-5 h-5 text-accent" />}
          title="Activity Log"
          chevron
          onClick={() => navigate('/activity')}
        />
      </InsetGroup>

      <InsetGroup title="System & Preferences">
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
