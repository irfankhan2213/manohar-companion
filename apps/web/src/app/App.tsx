import React from 'react';
import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TabBar } from '../components/ui/TabBar.js';
import { Sidebar } from '../components/ui/Sidebar.js';
import { ToastProvider } from '../components/ui/Toast.js';
import { HomeScreen } from '../features/home/HomeScreen.js';
import { CollectionsScreen } from '../features/collections/CollectionsScreen.js';
import { PartyDetailScreen } from '../features/collections/PartyDetailScreen.js';
import { StockScreen } from '../features/stock/StockScreen.js';
import { StockDetailScreen } from '../features/stock/StockDetailScreen.js';
import { RemindersScreen } from '../features/reminders/RemindersScreen.js';
import { RemindersRepliesScreen } from '../features/reminders/RemindersRepliesScreen.js';
import { RemindersTemplatesScreen } from '../features/reminders/RemindersTemplatesScreen.js';
import { NotebookScreen } from '../features/notebook/NotebookScreen.js';
import { MoreScreen } from '../features/more/MoreScreen.js';
import { ChallansScreen } from '../features/challans/ChallansScreen.js';
import { CreateChallanScreen } from '../features/challans/CreateChallanScreen.js';
import { ChallanDetailScreen } from '../features/challans/ChallanDetailScreen.js';
import { ChallanPrintScreen } from '../features/print/ChallanPrintScreen.js';
import { StatementPrintScreen } from '../features/print/StatementPrintScreen.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
});

const AppLayout: React.FC = () => {
  return (
    <div className="flex w-full min-h-screen bg-bg">
      {/* Desktop Master Sidebar */}
      <Sidebar />

      {/* Main Screen Outlet */}
      <div className="flex-1 flex flex-col min-w-0">
        <Outlet />
      </div>

      {/* Mobile Tab Bar */}
      <TabBar />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            {/* Standalone Print Documents (No App chrome, Sidebar, or TabBar) */}
            <Route path="/print/challan/:id" element={<ChallanPrintScreen />} />
            <Route path="/print/statement/:partyId" element={<StatementPrintScreen />} />

            {/* Standard App Layout */}
            <Route element={<AppLayout />}>
              <Route path="/" element={<HomeScreen />} />
              <Route path="/collections" element={<CollectionsScreen />} />
              <Route path="/collections/:partyId" element={<PartyDetailScreen />} />
              <Route path="/stock" element={<StockScreen />} />
              <Route path="/stock/:itemId" element={<StockDetailScreen />} />
              <Route path="/challans" element={<ChallansScreen />} />
              <Route path="/challans/new" element={<CreateChallanScreen />} />
              <Route path="/challans/:id" element={<ChallanDetailScreen />} />
              <Route path="/reminders" element={<RemindersScreen />} />
              <Route path="/reminders/replies" element={<RemindersRepliesScreen />} />
              <Route path="/reminders/templates" element={<RemindersTemplatesScreen />} />
              <Route path="/notebook" element={<NotebookScreen />} />
              <Route path="/more" element={<MoreScreen />} />
              {/* Fallbacks */}
              <Route path="*" element={<HomeScreen />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
};
