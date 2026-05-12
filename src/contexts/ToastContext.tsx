import React, { createContext, useContext, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, AlertCircle, Info, X, ShieldAlert } from 'lucide-react';
import { cn } from '../lib/utils';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info', duration = 4000) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      
      <div className="fixed bottom-20 lg:bottom-8 right-0 left-0 lg:left-auto lg:right-8 z-[100] flex flex-col gap-3 px-4 lg:px-0 pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => {
            const Icon = 
              toast.type === 'success' ? CheckCircle2 :
              toast.type === 'error' ? AlertCircle :
              toast.type === 'warning' ? ShieldAlert : Info;

            const colorClass = 
              toast.type === 'success' ? 'text-accent-green border-l-accent-green' :
              toast.type === 'error' ? 'text-red-500 border-l-red-500' :
              toast.type === 'warning' ? 'text-amber-500 border-l-amber-500' :
              'text-blue-500 border-l-blue-500';

            return (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, y: 50, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                className={cn(
                  "pointer-events-auto glass-panel !bg-bg-deep/95 backdrop-blur-xl border border-white/10 border-l-4 shadow-2xl p-4 rounded-xl flex items-start gap-3 w-full lg:w-80",
                  colorClass
                )}
              >
                <Icon className={cn("w-5 h-5 shrink-0", colorClass.split(' ')[0])} />
                <div className="flex-1 pt-0.5">
                  <p className="text-[11px] font-black uppercase tracking-widest text-text-main leading-snug">
                    {toast.message}
                  </p>
                </div>
                <button
                  onClick={() => removeToast(toast.id)}
                  className="text-text-dim hover:text-text-main transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
