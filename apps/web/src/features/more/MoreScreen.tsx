import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileSpreadsheet,
  CheckSquare,
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
      <InsetGroup>
        <Row
          leading={<FileSpreadsheet className="w-5 h-5 text-accent" />}
          title="Challans"
          subtitle="Sales, Purchase & Delivery Challans"
          chevron
          onClick={() => navigate('/challans')}
        />
        <Row
          leading={<CheckSquare className="w-5 h-5 text-accent" />}
          title="Tasks & Instructions"
          subtitle="Assign text & photos to team members"
          chevron
          onClick={() => navigate('/tasks')}
        />
        <Row
          leading={<BellRing className="w-5 h-5 text-accent" />}
          title="Reminders"
          subtitle="Schedules, quiet hours & message templates"
          chevron
          onClick={() => navigate('/reminders')}
        />
        <Row
          leading={<Activity className="w-5 h-5 text-accent" />}
          title="Activity Log"
          subtitle="Audit trail of syncs and reminders"
          chevron
          onClick={() => navigate('/activity')}
        />
        <Row
          leading={<Settings className="w-5 h-5 text-accent" />}
          title="Settings"
          subtitle="Office PC, companies & staff roles"
          chevron
          onClick={() => navigate('/settings')}
        />
      </InsetGroup>

      <InsetGroup title="Preferences">
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
