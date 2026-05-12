import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { motion } from 'motion/react';

export function AccessDenied({ module }: { module: string }) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
      <motion.div 
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-24 h-24 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20 mb-6 shadow-[0_0_50px_rgba(239,68,68,0.15)]"
      >
        <ShieldAlert className="w-12 h-12 text-red-500" />
      </motion.div>
      <motion.h2 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="text-3xl font-black text-text-main uppercase tracking-tighter mb-2"
      >
        Access Restricted
      </motion.h2>
      <motion.p 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-sm font-bold text-text-dim uppercase tracking-widest max-w-md"
      >
        You do not have permission to view the <span className="text-red-500">{module}</span> module.
        Contact your administrator to request access.
      </motion.p>
    </div>
  );
}
