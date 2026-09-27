import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { BottomNav } from './BottomNav';
import { useAuthStore } from '../../stores/authStore';
import { Navigate } from 'react-router-dom';
import { ChatbotWidget } from '../chat/ChatbotWidget';
import { EmergencyGlobalHandler } from '../emergency/EmergencyGlobalHandler';

interface MainLayoutProps {
  children: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const { token, loading } = useAuthStore();
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-dark flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 border-2 border-brand-primary border-t-transparent animate-spin" />
          <p className="font-mono text-brand-primary text-xs uppercase tracking-widest">
            Autenticando...
          </p>
        </div>
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="app-shell w-full h-[100dvh] max-h-[100dvh] flex text-brand-text relative overflow-hidden">
      <a href="#main-content" className="skip-link">
        Pular para o conteúdo principal
      </a>
      <Sidebar
        isOpenMobile={isMobileDrawerOpen}
        onCloseMobile={() => setIsMobileDrawerOpen(false)}
      />
      <div className="flex-1 flex min-w-0 flex-col h-full max-h-[100dvh] overflow-hidden">
        <Header onOpenMobileMenu={() => setIsMobileDrawerOpen(true)} />
        <main id="main-content" tabIndex={-1} className="app-content flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-5 lg:p-8 overscroll-contain focus:outline-none">
          {children}
          <footer className="mt-8 border-t border-white/25 pt-3 pb-1 text-center text-xs sm:text-sm text-[#172b4d]/60">
            © {new Date().getFullYear()} AssetTrack TI. Todos os direitos reservados.
          </footer>
        </main>
        {/* O campo de ajuda é acessível a todo usuário autenticado. */}
        <ChatbotWidget />
        <EmergencyGlobalHandler />
        <BottomNav onOpenDrawer={() => setIsMobileDrawerOpen(true)} />
      </div>
    </div>
  );
};
