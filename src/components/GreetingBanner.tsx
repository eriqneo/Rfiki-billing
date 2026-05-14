import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import { Calendar, CreditCard, FileText } from 'lucide-react';
import { format } from 'date-fns';

export function GreetingBanner({
  todaysSyncs = 0,
  pendingBills = 0,
  activeContracts = 0,
}: {
  todaysSyncs?: number;
  pendingBills?: number;
  activeContracts?: number;
}) {
  const { currentUser } = useAuth();
  const [greeting, setGreeting] = useState('');
  const [icon, setIcon] = useState('');

  useEffect(() => {
    const updateGreeting = () => {
      const hour = new Date().getHours();
      if (hour >= 5 && hour < 12) {
        setGreeting('Good morning');
        setIcon('☀️');
      } else if (hour >= 12 && hour < 17) {
        setGreeting('Good afternoon');
        setIcon('🌤️');
      } else if (hour >= 17 && hour < 21) {
        setGreeting('Good evening');
        setIcon('🌇');
      } else {
        setGreeting('Working late');
        setIcon('🌙');
      }
    };

    updateGreeting();
    // Update every minute just in case they cross a boundary
    const interval = setInterval(updateGreeting, 60000);
    return () => clearInterval(interval);
  }, []);

  if (!currentUser) return null;

  const firstName = currentUser.name.split(' ')[0];
  const currentDate = format(new Date(), 'EEEE, d MMMM yyyy');

  return (
    <motion.div 
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-8"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 glass-panel p-8 rounded-[2rem] border-white/5 relative overflow-hidden group">
        {/* Decorative Background Elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-accent-green/5 blur-[80px] rounded-full group-hover:bg-accent-green/10 transition-colors duration-1000" />
        
        <div className="relative z-10">
          <p className="text-[10px] font-black text-accent-green uppercase tracking-[0.3em] mb-2">{currentDate}</p>
          <h1 className="text-3xl md:text-4xl font-black text-text-main tracking-tighter flex items-center gap-3">
            {greeting}, {firstName}
            <span className="text-2xl md:text-3xl animate-bounce-slow">{icon}</span>
          </h1>
          <p className="text-xs text-text-dim mt-2 font-medium max-w-md">
            Here's what's happening across your business ecosystem today.
          </p>
        </div>

        <div className="flex items-center gap-4 relative z-10">
          <div className="flex items-center gap-3 bg-white/[0.02] border border-white/5 px-4 py-3 rounded-2xl hover:border-accent-green/30 transition-colors">
            <div className="w-8 h-8 rounded-full bg-accent-green/10 flex items-center justify-center text-accent-green">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[9px] font-bold text-text-dim uppercase tracking-widest">Today's Syncs</p>
              <p className="text-sm font-black text-text-main tabular-nums">{todaysSyncs}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-white/[0.02] border border-white/5 px-4 py-3 rounded-2xl hover:border-amber-500/30 transition-colors">
            <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[9px] font-bold text-text-dim uppercase tracking-widest">Pending Bills</p>
              <p className="text-sm font-black text-text-main tabular-nums">{pendingBills}</p>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-3 bg-white/[0.02] border border-white/5 px-4 py-3 rounded-2xl hover:border-blue-500/30 transition-colors">
            <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[9px] font-bold text-text-dim uppercase tracking-widest">Active Contracts</p>
              <p className="text-sm font-black text-text-main tabular-nums">{activeContracts}</p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
