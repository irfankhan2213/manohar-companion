import React from 'react';
import { LargeTitleScreen } from '../../components/ui/LargeTitleScreen.js';

export const CollectionsScreen: React.FC = () => {
  return (
    <LargeTitleScreen title="Collections">
      <div className="bg-surface rounded-ios-card p-6 border border-separator/40 text-center text-label-2">
        <p className="text-body font-medium">Collections list will be delivered in Phase 2.</p>
      </div>
    </LargeTitleScreen>
  );
};
