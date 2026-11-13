import React from 'react';
import { BrowserRouter, Routes, Route, Outlet, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { can, PermissionKey, setCustomPermissions } from '@saas/shared';
import { useAppStore } from './store.js';
import { api } from '../api/index.js';
import { TabBar } from '../components/ui/TabBar.js';
import { Sidebar } from '../components/ui/Sidebar.js';
import { ToastProvider } from '../components/ui/Toast.js';
import { LoginScreen } from '../features/auth/LoginScreen.js';
import { DevClientsScreen } from '../features/dev/DevClientsScreen.js';
import { HomeScreen } from '../features/home/HomeScreen.js';
import { CollectionsScreen } from '../features/collections/CollectionsScreen.js';
import { PartyDetailScreen } from '../features/collections/PartyDetailScreen.js';
import { StockScreen } from '../features/stock/StockScreen.js';
import { StockDetailScreen } from '../features/stock/StockDetailScreen.js';
import { RemindersScreen } from '../features/reminders/RemindersScreen.js';
import { RemindersRepliesScreen } from '../features/reminders/RemindersRepliesScreen.js';
import { RemindersTemplatesScreen } from '../features/reminders/RemindersTemplatesScreen.js';
import { NotebookScreen } from '../features/notebook/NotebookScreen.js';
import { ActivityScreen } from '../features/activity/ActivityScreen.js';
import { SettingsScreen } from '../features/settings/SettingsScreen.js';
import { MoreScreen } from '../features/more/MoreScreen.js';
import { ChallansScreen } from '../features/challans/ChallansScreen.js';
import { CreateChallanScreen } from '../features/challans/CreateChallanScreen.js';
import { ChallanDetailScreen } from '../features/challans/ChallanDetailScreen.js';
import { TasksScreen } from '../features/tasks/TasksScreen.js';
import { ChallanPrintScreen } from '../features/print/ChallanPrintScreen.js';
import { StatementPrintScreen } from '../features/print/StatementPrintScreen.js';
import { BalanceSheetScreen } from '../features/reports/BalanceSheetScreen.js';

export const queryClient = new QueryClient({
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

const RequireAuth: React.FC<{ standalone?: boolean; children?: React.ReactElement }> = ({
  standalone,
  children,
}) => {
  const { authToken, currentUser, currentTenant, currentCompanyId, setUser, logout } = useAppStore();
  const prevScopeRef = React.useRef<string>(`${currentTenant?.id || ''}_${currentCompanyId}`);

  // Flush TanStack Query cache on logout or tenant/branch switch to prevent cross-tenant cache bleed
  React.useEffect(() => {
    if (!authToken) {
      queryClient.clear();
      return;
    }
    const nextScope = `${currentTenant?.id || ''}_${currentCompanyId}`;
    if (prevScopeRef.current && prevScopeRef.current !== nextScope) {
      queryClient.invalidateQueries();
    }
    prevScopeRef.current = nextScope;
  }, [authToken, currentTenant?.id, currentCompanyId]);

  React.useEffect(() => {
    if (authToken) {
      api.auth
        .me()
        .then((res) => {
          if (res?.user) {
            setUser(res.user);
          }
        })
        .catch(() => {
          queryClient.clear();
          logout();
        });

      api.permissions
        ?.get()
        .then((perms) => {
          if (perms) {
            setCustomPermissions(perms as any);
          }
        })
        .catch(() => {});
    }
  }, [authToken, setUser, logout]);

  if (!authToken || !currentUser) {
    return <Navigate to="/login" replace />;
  }
  if (standalone && children) {
    return children;
  }
  return <AppLayout />;
};

const RequireDevRole: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { currentUser } = useAppStore();
  if (!currentUser || currentUser.role !== 'dev') {
    return <Navigate to="/" replace />;
  }
  return children;
};

const RequirePermission: React.FC<{
  perm: PermissionKey;
  children: React.ReactElement;
}> = ({ perm, children }) => {
  const { currentUser, currentRole } = useAppStore();
  const actor = currentUser || currentRole;
  if (currentUser && !can(actor, perm)) {
    return <Navigate to="/" replace />;
  }
  return children;
};

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            {/* Public Login Route */}
            <Route path="/login" element={<LoginScreen />} />

            {/* Auth-Guarded Standalone Print Documents (No App chrome, Sidebar, or TabBar) */}
            <Route
              path="/print/challan/:id"
              element={
                <RequireAuth standalone>
                  <ChallanPrintScreen />
                </RequireAuth>
              }
            />
            <Route
              path="/print/statement/:partyId"
              element={
                <RequireAuth standalone>
                  <StatementPrintScreen />
                </RequireAuth>
              }
            />

            {/* Protected App Layout */}
            <Route element={<RequireAuth />}>
              <Route path="/" element={<HomeScreen />} />
              <Route
                path="/dev/clients"
                element={
                  <RequireDevRole>
                    <DevClientsScreen />
                  </RequireDevRole>
                }
              />
              <Route
                path="/collections"
                element={
                  <RequirePermission perm="ledgers.view">
                    <CollectionsScreen />
                  </RequirePermission>
                }
              />
              <Route
                path="/collections/:partyId"
                element={
                  <RequirePermission perm="ledgers.view">
                    <PartyDetailScreen />
                  </RequirePermission>
                }
              />
              <Route
                path="/stock"
                element={
                  <RequirePermission perm="stock.view">
                    <StockScreen />
                  </RequirePermission>
                }
              />
              <Route
                path="/stock/:itemId"
                element={
                  <RequirePermission perm="stock.view">
                    <StockDetailScreen />
                  </RequirePermission>
                }
              />
              <Route
                path="/challans"
                element={
                  <RequirePermission perm="challan.view">
                    <ChallansScreen />
                  </RequirePermission>
                }
              />
              <Route
                path="/challans/new"
                element={
                  <RequirePermission perm="challan.create">
                    <CreateChallanScreen />
                  </RequirePermission>
                }
              />
              <Route
                path="/challans/:id/edit"
                element={
                  <RequirePermission perm="challan.create">
                    <CreateChallanScreen />
                  </RequirePermission>
                }
              />
              <Route
                path="/challans/:id"
                element={
                  <RequirePermission perm="challan.view">
                    <ChallanDetailScreen />
                  </RequirePermission>
                }
              />
              <Route path="/tasks" element={<TasksScreen />} />
              <Route path="/reminders" element={<RemindersScreen />} />
              <Route
                path="/reminders/replies"
                element={
                  <RequirePermission perm="reminders.view">
                    <RemindersRepliesScreen />
                  </RequirePermission>
                }
              />
              <Route
                path="/reminders/templates"
                element={
                  <RequirePermission perm="reminders.view">
                    <RemindersTemplatesScreen />
                  </RequirePermission>
                }
              />
              <Route
                path="/notebook"
                element={
                  <RequirePermission perm="notebook.view">
                    <NotebookScreen />
                  </RequirePermission>
                }
              />
              <Route
                path="/activity"
                element={
                  <RequirePermission perm="activity.view">
                    <ActivityScreen />
                  </RequirePermission>
                }
              />
              <Route
                path="/reports/balance-sheet"
                element={
                  <RequirePermission perm="ledgers.view">
                    <BalanceSheetScreen />
                  </RequirePermission>
                }
              />
              <Route path="/settings" element={<SettingsScreen />} />
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
