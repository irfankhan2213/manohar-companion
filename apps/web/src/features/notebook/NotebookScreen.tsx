import React from 'react';
import { LargeTitleScreen } from '../../components/ui/LargeTitleScreen.js';

export const NotebookScreen: React.FC = () => {
  return (
    <LargeTitleScreen title="Notebook">
      <div className="bg-surface rounded-ios-card p-6 border border-separator/40 text-center text-label-2">
        <p className="text-body font-medium">Notebook table grid with inline math will be delivered in Phase 5.</p>
      </div>
    </LargeTitleScreen>
  );
};
