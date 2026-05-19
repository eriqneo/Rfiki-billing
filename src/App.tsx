import React, { useState, useEffect } from 'react';
import { db } from './db/db';
import { Sidebar, ViewType } from './components/Sidebar';
import { Dashboard } from './views/Dashboard';
import { CalendarView } from './views/CalendarView';
import { Billing } from './views/Billing';
import { Quotations } from './views/Quotations';
import { Invoices } from './views/Invoices';
import { Agreements } from './views/Agreements';
import { Expenses } from './views/Expenses';
import { PocketHost } from './views/PocketHost';
import { Settings } from './views/Settings';
import { ClientHub } from './views/ClientHub';
import { Reports } from './views/Reports';
import { useSync } from './hooks/useSync';
import { useAuth } from './contexts/AuthContext';
import { LoginScreen } from './views/LoginScreen';
import { PasswordChangeModal } from './components/PasswordChangeModal';
import { AccessDenied } from './components/AccessDenied';
import { StorageNotice } from './components/StorageNotice';
import { PwaInstallPrompt } from './components/PwaInstallPrompt';
import { AnimatePresence, motion } from 'motion/react';

export default function App() {
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const { isSyncing, cloudBackoff } = useSync();
  const { isAuthenticated, isLoading, currentUser, canAccess } = useAuth();

  useEffect(() => {
    // Initial data seed and migrations
    const seed = async () => {
      // Migration: Ensure existing users have passwords and correct domains
      const users = await db.team_members.toArray();
      for (const u of users) {
        let updates: any = {};
        if (!u.password_hash) {
          updates.password_hash = 'admin123';
          updates.must_change_password = true;
        }
        if (u.email.includes('@nexus.sys')) {
          updates.email = u.email.replace('@nexus.sys', '@rafiki.app');
        }
        if (Object.keys(updates).length > 0) {
          await db.team_members.update(u.id!, updates);
        }
      }

      const memberCount = await db.team_members.count();
      if (memberCount === 0) {
        await db.team_members.add({ 
          name: 'System Admin', 
          email: 'admin@rafiki.app', 
          role: 'Admin', 
          password_hash: 'admin123', 
          must_change_password: true, 
          synced: true 
        });
      }

      // One-time migration: clear IndexedDB transactional tables when in PocketBase mode.
      // PocketBase is now the source of truth; local data is only used when offline.
      if (import.meta.env.VITE_AUTH_MODE === 'pocketbase') {
        const migrationKey = 'rafiki_idb_cleared_v1';
        if (!localStorage.getItem(migrationKey)) {
          await Promise.all([
            db.payments.clear(),
            db.expenses.clear(),
            db.agreements.clear(),
            db.billing_promises.clear(),
            db.invoices.clear(),
            db.syncQueue.clear(),
          ]);
          localStorage.setItem(migrationKey, 'true');
          console.log('[RAFIKI] IndexedDB transactional tables cleared — PocketBase is now source of truth.');
        }
      }
    };
    seed();
  }, []);

  useEffect(() => {
    if (isAuthenticated && currentUser && !canAccess(currentView)) {
      if (currentUser.module_permissions && currentUser.module_permissions.length > 0) {
        setCurrentView(currentUser.module_permissions[0] as ViewType);
      }
    }
  }, [isAuthenticated, currentUser, currentView, canAccess]);

  const renderView = () => {
    if (!canAccess(currentView)) {
      return <AccessDenied module={currentView} />;
    }

    switch (currentView) {
      case 'dashboard': return <Dashboard setView={setCurrentView} />;
      case 'calendar': return <CalendarView setView={setCurrentView} />;
      case 'billing': return <Billing />;
      case 'quotations': return <Quotations />;
      case 'invoices': return <Invoices setView={setCurrentView} />;
      case 'agreements': return <Agreements />;
      case 'expenses': return <Expenses />;
      case 'meetings': return <CalendarView setView={setCurrentView} />;
      case 'settings': return <Settings />;
      case 'clients': return <ClientHub />;
      case 'reports': return <Reports />;
      case 'pockethost': return <PocketHost />;
      default: return <Dashboard setView={setCurrentView} />;
    }
  };

  if (isLoading) {
    return (
      <>
        <div className="min-h-screen bg-bg-deep flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-4 border-accent-green/20 border-t-accent-green animate-spin" />
        </div>
        <PwaInstallPrompt />
        <StorageNotice />
      </>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <LoginScreen />
        <PwaInstallPrompt />
        <StorageNotice />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-bg-deep flex flex-col lg:flex-row font-sans text-text-main selection:bg-accent-green selection:text-bg-deep transition-colors duration-500">
      <PasswordChangeModal />
      <PwaInstallPrompt />
      <StorageNotice />
      <Sidebar 
        currentView={currentView} 
        setView={setCurrentView} 
        isSyncing={isSyncing} 
        cloudBackoff={cloudBackoff}
      />
      
      <main className="flex-1 lg:ml-60 min-h-screen p-6 md:p-12 pb-24 lg:pb-12 transition-colors duration-500">
        <div className="max-w-6xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentView}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
            >
              {renderView()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
