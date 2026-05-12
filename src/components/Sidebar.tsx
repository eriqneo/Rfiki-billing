import React from 'react';
import { 
  LayoutDashboard, 
  Calendar as CalendarIcon, 
  CreditCard, 
  FileText, 
  TrendingUp,
  Users,
  Settings as SettingsIcon,
  HelpCircle,
  Menu,
  X,
  Wifi,
  WifiOff,
  Video,
  PieChart,
  Server
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { LogOut, User as UserIcon } from 'lucide-react';
import { pb } from '../lib/pocketbase';
import { usePbCollection } from '../hooks/usePbCollection';

export type ViewType = 'dashboard' | 'calendar' | 'billing' | 'agreements' | 'expenses' | 'meetings' | 'settings' | 'clients' | 'reports' | 'pockethost';

interface SidebarProps {
  currentView: ViewType;
  setView: (view: ViewType) => void;
  isSyncing: boolean;
}

export function Sidebar({ currentView, setView, isSyncing }: SidebarProps) {
  const { theme } = useTheme();
  const { currentUser, logout, canAccess } = useAuth();
  const [isOpen, setIsOpen] = React.useState(false);
  const [isOnline, setIsOnline] = React.useState(window.navigator.onLine);

  const business = useLiveQuery(() => db.business.limit(1).toArray());
  const { records: pbBusiness, isLoading: bizLoading } = usePbCollection<{ name: string; logo_base64?: string }>('business');

  const isPb = import.meta.env.VITE_AUTH_MODE === 'pocketbase';
  const bizLogo = isPb ? (pbBusiness[0]?.logo_base64 || null) : (business?.[0]?.logo_base64 || null);
  const bizName = (isPb ? pbBusiness[0]?.name : business?.[0]?.name) || 'Rafiki.';

  React.useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'clients', label: 'Client Hub', icon: Users },
    { id: 'calendar', label: 'Calendar', icon: CalendarIcon },
    { id: 'meetings', label: 'Meetings', icon: Video },
    { id: 'billing', label: 'Billing', icon: CreditCard },
    { id: 'pockethost', label: 'Pocket Host', icon: Server },
    { id: 'agreements', label: 'Agreements', icon: FileText },
    { id: 'expenses', label: 'Expenses', icon: TrendingUp },
    { id: 'reports', label: 'Reports', icon: PieChart },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
  ];

  const mobileNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'clients', label: 'Clients', icon: Users },
    { id: 'billing', label: 'Billing', icon: CreditCard },
    { id: 'meetings', label: 'Meetings', icon: Video },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
  ];

  const visibleNavItems = navItems.filter(item => canAccess(item.id));
  const visibleMobileNavItems = mobileNavItems.filter(item => canAccess(item.id));

  return (
    <>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden fixed top-4 right-4 z-50 p-2 glass-panel rounded-lg shadow-sm"
      >
        {isOpen ? <X className="w-5 h-5 text-accent-green" /> : <Menu className="w-5 h-5 text-accent-green" />}
      </button>

      <div className={cn(
        "fixed inset-y-0 left-0 z-40 w-60 transform transition-transform duration-200 ease-in-out lg:translate-x-0 border-r",
        theme === 'light' ? "bg-white border-slate-200 shadow-sm" : "glass-panel border-white/5",
        !isOpen && "-translate-x-full"
      )}>
        <div className="flex flex-col h-full py-8">
          <div className="px-8 pb-10 flex items-center justify-start min-h-[5rem]">
            {isPb && bizLoading && !bizLogo ? (
              // Premium skeleton — pulse while waiting for logo
              <div className="w-32 h-10 rounded-lg bg-white/5 animate-pulse" />
            ) : bizLogo ? (
              <img
                src={bizLogo}
                alt={bizName}
                className="max-h-16 md:max-h-20 w-auto max-w-full object-contain drop-shadow-[0_0_8px_rgba(57,255,20,0.5)] transition-opacity duration-300"
                style={{ opacity: bizLogo ? 1 : 0 }}
              />
            ) : (
              <h1 className="text-2xl font-bold text-accent-green tracking-tighter drop-shadow-[0_0_8px_rgba(57,255,20,0.5)] truncate transition-opacity duration-300">{bizName}</h1>
            )}
          </div>

          <nav className="flex-1 space-y-1 px-4">
            {visibleNavItems.map((item) => {
              const isActive = currentView === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setView(item.id as ViewType);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold tracking-wider uppercase transition-all rounded-xl border border-transparent",
                    isActive 
                      ? theme === 'light' 
                        ? "text-accent-green bg-accent-green/5 border-accent-green/10" 
                        : "text-accent-green bg-white/5 border-white/10 shadow-neon"
                      : "text-text-dim hover:text-text-main hover:bg-white/5"
                  )}
                >
                  <Icon className={cn("w-4 h-4", isActive ? "text-accent-green" : "text-text-dim")} />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="px-6 space-y-4 pt-6 mt-auto">
            {/* The old offline/online chip was removed in favor of the user badge indicator */}

            {isSyncing && (
              <div className="flex items-center gap-2 text-[10px] font-black text-accent-green uppercase tracking-[0.15em] animate-pulse">
                <Video className="w-3.5 h-3.5" />
                Processing...
              </div>
            )}
            
            {/* User Profile Widget */}
            {currentUser && (
              <div className="pt-4 border-t border-white/5 flex flex-col gap-3">
                <div className="flex items-center gap-3 bg-white/[0.02] p-3 rounded-2xl border border-white/5 relative overflow-hidden group">
                  <div className="absolute inset-0 bg-accent-green/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative w-10 h-10 rounded-full bg-accent-green/20 border border-accent-green/30 flex items-center justify-center shrink-0">
                    <span className="text-accent-green font-black text-sm uppercase">{currentUser?.name?.charAt(0) || 'U'}</span>
                    {isOnline && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-accent-green rounded-full border-2 border-[#1a1a1a] shadow-neon animate-pulse" />
                    )}
                  </div>
                  <div className="relative overflow-hidden flex-1">
                    <p className="text-sm font-black text-text-main truncate">{currentUser?.name?.split(' ')[0] || 'User'}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <p className="text-[8px] font-bold text-accent-green uppercase tracking-widest">{currentUser.role}</p>
                      <span className="text-[8px] text-text-dim">•</span>
                      {pb.authStore.isValid ? (
                        <div className="text-[8px] font-bold text-accent-green uppercase tracking-widest flex items-center gap-1">
                          <div className="w-1 h-1 rounded-full bg-accent-green animate-pulse" />
                          Cloud Active
                        </div>
                      ) : (
                        <div className="text-[8px] font-bold text-amber-500 uppercase tracking-widest flex items-center gap-1">
                          <div className="w-1 h-1 rounded-full bg-amber-500 animate-bounce" />
                          Local Only
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <button 
                  onClick={logout}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/20 text-red-500 hover:bg-red-500/10 transition-colors text-[9px] font-black uppercase tracking-widest"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-bg-deep border-t border-white/10 px-6 py-4 flex items-center justify-between pb-safe">
        {visibleMobileNavItems.map((item) => {
          const isActive = currentView === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setView(item.id as ViewType)}
              className={cn(
                "flex flex-col items-center gap-1 transition-all",
                isActive ? "text-accent-green" : "text-text-dim hover:text-text-main"
              )}
            >
              <div className={cn(
                "p-2 rounded-xl transition-all",
                isActive && "bg-accent-green/10 shadow-neon"
              )}>
                <Icon className="w-5 h-5" />
              </div>
              <span className="text-[8px] font-black uppercase tracking-wider">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Overlay for mobile */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 lg:hidden"
          />
        )}
      </AnimatePresence>
    </>
  );
}
