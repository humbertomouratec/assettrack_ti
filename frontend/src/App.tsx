import React, { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { IS_NATIVE_APP } from './api/client';
import { useAuthStore } from './stores/authStore';
import { MainLayout } from './components/layout/MainLayout';
import { LoginPage } from './pages/LoginPage';
const LandingPage = lazy(() => import('./pages/landing/LandingPage').then(m => ({ default: m.LandingPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const UsersPage = lazy(() => import('./pages/UsersPage').then(m => ({ default: m.UsersPage })));
const BadgePage = lazy(() => import('./pages/BadgePage').then(m => ({ default: m.BadgePage })));
const AssetsPage = lazy(() => import('./pages/AssetsPage').then(m => ({ default: m.AssetsPage })));
const ServiceDeskPage = lazy(() => import('./pages/ServiceDeskPage').then(m => ({ default: m.ServiceDeskPage })));
const MaintenancePage = lazy(() => import('./pages/MaintenancePage').then(m => ({ default: m.MaintenancePage })));
const BorrowingsPage = lazy(() => import('./pages/BorrowingsPage').then(m => ({ default: m.BorrowingsPage })));
const PreventiveMaintenancePage = lazy(() => import('./pages/PreventiveMaintenancePage').then(m => ({ default: m.PreventiveMaintenancePage })));
const KanbanPage = lazy(() => import('./pages/KanbanPage').then(m => ({ default: m.KanbanPage })));
const AlertsPage = lazy(() => import('./pages/AlertsPage').then(m => ({ default: m.AlertsPage })));
const ProcurementPage = lazy(() => import('./pages/ProcurementPage').then(m => ({ default: m.ProcurementPage })));
const RHPage = lazy(() => import('./pages/RHPage').then(m => ({ default: m.RHPage })));
const WebhooksPage = lazy(() => import('./pages/WebhooksPage').then(m => ({ default: m.WebhooksPage })));
const BackupPage = lazy(() => import('./pages/BackupPage').then(m => ({ default: m.BackupPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then(m => ({ default: m.ProfilePage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const EmailLogsPage = lazy(() => import('./pages/EmailLogsPage').then(m => ({ default: m.EmailLogsPage })));
const SetoresPage = lazy(() => import('./pages/SetoresPage').then(m => ({ default: m.SetoresPage })));
const MonitoramentoPage = lazy(() => import('./pages/MonitoramentoPage').then(m => ({ default: m.MonitoramentoPage })));
const ManualPage = lazy(() => import('./pages/ManualPage').then(m => ({ default: m.ManualPage })));
import { AppUpdateNotifier } from './components/layout/AppUpdateNotifier';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { initializeAndroidNotifications } from './utils/androidNotifications';

const queryClient = new QueryClient();

const App: React.FC = () => {
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const canAccessSettings = ['admin', 'gerente_ti', 'gerente_infra'].includes(user?.role?.toLowerCase() || '');

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (user) void initializeAndroidNotifications();
  }, [user]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {token && <AppUpdateNotifier />}
        <Suspense fallback={<div className="grid min-h-[50vh] place-items-center text-sm text-brand-muted">Carregando módulo...</div>}>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/apresentacao" element={<LandingPage />} />

          {/* TV monitoring mode: the page performs its own staff-role guard. */}
          <Route path="/monitoramento" element={<MonitoramentoPage />} />
          <Route
            path="/manual"
            element={
              <MainLayout>
                <ManualPage />
              </MainLayout>
            }
          />

          {/* Public home for visitors; authenticated users keep their dashboard. */}
          <Route
            path="/"
            element={token ? (
              <MainLayout>
                <DashboardPage />
              </MainLayout>
            ) : IS_NATIVE_APP ? <Navigate to="/login" replace /> : <LandingPage />}
          />
          <Route
            path="/dashboard"
            element={
              <MainLayout>
                <DashboardPage />
              </MainLayout>
            }
          />
          <Route
            path="/users"
            element={
              <MainLayout>
                <UsersPage />
              </MainLayout>
            }
          />
          <Route
            path="/assets"
            element={
              <MainLayout>
                <AssetsPage />
              </MainLayout>
            }
          />
          <Route path="/ativos" element={<Navigate to="/assets" replace />} />
          <Route path="/ativos/*" element={<Navigate to="/assets" replace />} />
          <Route
            path="/badge"
            element={
              <MainLayout>
                <BadgePage />
              </MainLayout>
            }
          />
          <Route
            path="/servicos"
            element={
              <MainLayout>
                <ServiceDeskPage />
              </MainLayout>
            }
          />
          <Route
            path="/manutencoes"
            element={
              <MainLayout>
                <MaintenancePage />
              </MainLayout>
            }
          />
          <Route
            path="/emprestimos"
            element={
              <MainLayout>
                <BorrowingsPage />
              </MainLayout>
            }
          />
          <Route
            path="/setores"
            element={
              <MainLayout>
                <SetoresPage />
              </MainLayout>
            }
          />
          <Route
            path="/manutencao-preventiva"
            element={
              <MainLayout>
                <PreventiveMaintenancePage />
              </MainLayout>
            }
          />
          <Route
            path="/manutencoes-preventivas"
            element={
              <MainLayout>
                <PreventiveMaintenancePage />
              </MainLayout>
            }
          />
          <Route
            path="/kanban"
            element={
              <MainLayout>
                <KanbanPage />
              </MainLayout>
            }
          />
          <Route
            path="/alertas"
            element={
              <MainLayout>
                <AlertsPage />
              </MainLayout>
            }
          />
          <Route
            path="/compras"
            element={
              <MainLayout>
                <ProcurementPage />
              </MainLayout>
            }
          />
          <Route
            path="/compras/fornecedores"
            element={
              <MainLayout>
                <ProcurementPage />
              </MainLayout>
            }
          />
          <Route path="/fornecedores" element={<Navigate to="/compras/fornecedores" replace />} />
          <Route
            path="/rh"
            element={
              <MainLayout>
                <RHPage />
              </MainLayout>
            }
          />
          <Route
            path="/webhooks"
            element={
              <MainLayout>
                <WebhooksPage />
              </MainLayout>
            }
          />
          <Route
            path="/backups"
            element={
              <MainLayout>
                <BackupPage />
              </MainLayout>
            }
          />
          <Route
            path="/profile"
            element={
              <MainLayout>
                <ProfilePage />
              </MainLayout>
            }
          />
          <Route
            path="/configuracoes"
            element={
              canAccessSettings ? (
                <MainLayout>
                  <SettingsPage />
                </MainLayout>
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/logs-email"
            element={
              <MainLayout>
                <EmailLogsPage />
              </MainLayout>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;
