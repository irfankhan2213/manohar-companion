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
import { NotebookScreen } from '../features/notebook/NotebookScreen.js';
import { MoreScreen } from '../features/more/MoreScreen.js';

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
            <Route element={<AppLayout />}>
              <Route path="/" element={<HomeScreen />} />
              <Route path="/collections" element={<CollectionsScreen />} />
              <Route path="/collections/:partyId" element={<PartyDetailScreen />} />
              <Route path="/stock" element={<StockScreen />} />
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
