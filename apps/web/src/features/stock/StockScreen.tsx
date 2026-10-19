import React from 'react';
import { LargeTitleScreen } from '../../components/ui/LargeTitleScreen.js';

export const StockScreen: React.FC = () => {
  return (
    <LargeTitleScreen title="Stock">
      <div className="bg-surface rounded-ios-card p-6 border border-separator/40 text-center text-label-2">
        <p className="text-body font-medium">Stock management will be delivered in Phase 3.</p>
      </div>
    </LargeTitleScreen>
  );
};
