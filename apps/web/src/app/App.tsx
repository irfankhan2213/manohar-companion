import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Outlet, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { can, PermissionKey, setCustomPermissions } from '@saas/shared';
import { useAppStore } from './store.js';
import { api } from '../api/index.js';
import { TabBar } from '../components/ui/TabBar.js';
import { Sidebar } from '../components/ui/Sidebar.js';
import { ToastProvider } from '../components/ui/Toast.js';
import { LoginScreen } from '../features/auth/LoginScreen.js';
import { HomeScreen } from '../features/home/HomeScreen.js';

// Route-level code splitting: heavy screens & print/report bundles load on demand
const DevClientsScreen = lazy(() => import('../features/dev/DevClientsScreen.js').then((m) => ({ default: m.DevClientsScreen })));
const CollectionsScreen = lazy(() => import('../features/collections/CollectionsScreen.js').then((m) => ({ default: m.CollectionsScreen })));
const PartyDetailScreen = lazy(() => import('../features/collections/PartyDetailScreen.js').then((m) => ({ default: m.PartyDetailScreen })));
const StockScreen = lazy(() => import('../features/stock/StockScreen.js').then((m) => ({ default: m.StockScreen })));
const StockDetailScreen = lazy(() => import('../features/stock/StockDetailScreen.js').then((m) => ({ default: m.StockDetailScreen })));
const RemindersScreen = lazy(() => import('../features/reminders/RemindersScreen.js').then((m) => ({ default: m.RemindersScreen })));
const RemindersRepliesScreen = lazy(() => import('../features/reminders/RemindersRepliesScreen.js').then((m) => ({ default: m.RemindersRepliesScreen })));
const RemindersTemplatesScreen = lazy(() => import('../features/reminders/RemindersTemplatesScreen.js').then((m) => ({ default: m.RemindersTemplatesScreen })));
const NotebookScreen = lazy(() => import('../features/notebook/NotebookScreen.js').then((m) => ({ default: m.NotebookScreen })));
const ActivityScreen = lazy(() => import('../features/activity/ActivityScreen.js').then((m) => ({ default: m.ActivityScreen })));
const SettingsScreen = lazy(() => import('../features/settings/SettingsScreen.js').then((m) => ({ default: m.SettingsScreen })));
const MoreScreen = lazy(() => import('../features/more/MoreScreen.js').then((m) => ({ default: m.MoreScreen })));
const ChallansScreen = lazy(() => import('../features/challans/ChallansScreen.js').then((m) => ({ default: m.ChallansScreen })));
const CreateChallanScreen = lazy(() => import('../features/challans/CreateChallanScreen.js').then((m) => ({ default: m.CreateChallanScreen })));
const ChallanDetailScreen = lazy(() => import('../features/challans/ChallanDetailScreen.js').then((m) => ({ default: m.ChallanDetailScreen })));
const TasksScreen = lazy(() => import('../features/tasks/TasksScreen.js').then((m) => ({ default: m.TasksScreen })));
const ChallanPrintScreen = lazy(() => import('../features/print/ChallanPrintScreen.js').then((m) => ({ default: m.ChallanPrintScreen })));
const StatementPrintScreen = lazy(() => import('../features/print/StatementPrintScreen.js').then((m) => ({ default: m.StatementPrintScreen })));
const BalanceSheetScreen = lazy(() => import('../features/reports/BalanceSheetScreen.js').then((m) => ({ default: m.BalanceSheetScreen })));
const ProfitAndLossScreen = lazy(() => import('../features/reports/ProfitAndLossScreen.js').then((m) => ({ default: m.ProfitAndLossScreen })));
const TrialBalanceScreen = lazy(() => import('../features/reports/TrialBalanceScreen.js').then((m) => ({ default: m.TrialBalanceScreen })));
const DaybookScreen = lazy(() => import('../features/reports/DaybookScreen.js').then((m) => ({ default: m.DaybookScreen })));
const SalesRegisterScreen = lazy(() => import('../features/reports/SalesRegisterScreen.js').then((m) => ({ default: m.SalesRegisterScreen })));
const PurchaseRegisterScreen = lazy(() => import('../features/reports/PurchaseRegisterScreen.js').then((m) => ({ default: m.PurchaseRegisterScreen })));
const CashBankScreen = lazy(() => import('../features/reports/CashBankScreen.js').then((m) => ({ default: m.CashBankScreen })));

const RouteFallback: React.FC = () => (
  <div className="flex-1 flex items-center justify-center p-10 text-subhead text-label-2 animate-pulse">
    Loading...
  </div>
);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      gcTime: 1000 * 60 * 10,
      refetchOnWindowFocus: false,
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
        <Suspense fallback={<RouteFallback />}>
          <Outlet />
        </Suspense>
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
    return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
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
              <Route
                path="/reports/profit-and-loss"
                element={
                  <RequirePermission perm="ledgers.view">
                    <ProfitAndLossScreen />
                  </RequirePermission>
                }
              />
              <Route
                path="/reports/trial-balance"
                element={
                  <RequirePermission perm="ledgers.view">
                    <TrialBalanceScreen />
                  </RequirePermission>
                }
              />
              <Route
                path="/reports/daybook"
                element={
                  <RequirePermission perm="ledgers.view">
                    <DaybookScreen />
                  </RequirePermission>
                }
              />
              <Route
                path="/reports/sales-register"
                element={
                  <RequirePermission perm="ledgers.view">
                    <SalesRegisterScreen />
                  </RequirePermission>
                }
              />
              <Route
                path="/reports/purchase-register"
                element={
                  <RequirePermission perm="ledgers.view">
                    <PurchaseRegisterScreen />
                  </RequirePermission>
                }
              />
              <Route
                path="/reports/cash-bank"
                element={
                  <RequirePermission perm="ledgers.view">
                    <CashBankScreen />
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
