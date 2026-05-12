import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, Zap } from 'lucide-react';
import { cn } from '../lib/utils';

interface NexusTableProps<T> {
  data: T[];
  renderRow: (item: T, index: number) => React.ReactNode;
  headers: { label: string; className?: string }[];
  pageSize?: number;
  emptyState?: React.ReactNode;
}

export function NexusTable<T>({ 
  data, 
  renderRow, 
  headers, 
  pageSize = 4,
  emptyState 
}: NexusTableProps<T>) {
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.ceil(data.length / pageSize);
  
  const paginatedData = data.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const nextPage = () => setCurrentPage(prev => Math.min(prev + 1, totalPages));
  const prevPage = () => setCurrentPage(prev => Math.max(prev - 1, 1));

  const defaultEmptyState = (
    <tr>
      <td colSpan={headers.length} className="py-24 text-center">
        <div className="flex flex-col items-center gap-4 opacity-20">
          <Zap className="w-12 h-12 text-accent-green" />
          <p className="text-[10px] font-black text-text-main uppercase tracking-[0.4em] italic">No records detected in this matrix.</p>
        </div>
      </td>
    </tr>
  );

  return (
    <div className="glass-panel rounded-[2rem] border-white/5 overflow-hidden shadow-2xl">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-white/5 bg-text-main/5">
              {headers.map((header, idx) => (
                <th 
                  key={idx} 
                  className={cn(
                    "px-6 py-5 text-[9px] font-black text-text-dim uppercase tracking-[0.2em]",
                    header.className
                  )}
                >
                  {header.label}
                </th>
              ))}
            </tr>
          </thead>
          <AnimatePresence mode="wait">
            <motion.tbody
              key={currentPage}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="divide-y divide-white/[0.03]"
            >
              {data.length > 0 ? (
                paginatedData.map((item, index) => renderRow(item, index))
              ) : (
                emptyState || defaultEmptyState
              )}
            </motion.tbody>
          </AnimatePresence>
        </table>
      </div>

      {/* Pagination Bar */}
      <div className="px-8 py-6 border-t border-white/5 flex items-center justify-between bg-text-main/[0.02]">
         <div className="flex items-center gap-6">
            <button 
              disabled={currentPage === 1}
              onClick={prevPage}
              className="text-[10px] font-black text-text-dim uppercase tracking-widest hover:text-accent-green disabled:opacity-20 transition-all flex items-center gap-2 group"
            >
              <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              PREV
            </button>
            
            <div className="h-4 w-[1px] bg-text-main/10" />
            
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-black text-text-dim uppercase tracking-widest opacity-40">PAGE</span>
              <span className="text-[11px] font-black text-accent-green tabular-nums">{currentPage.toString().padStart(2, '0')}</span>
              <span className="text-[10px] font-black text-text-dim uppercase tracking-widest opacity-40">OF</span>
              <span className="text-[11px] font-black text-text-main tabular-nums">{Math.max(1, totalPages).toString().padStart(2, '0')}</span>
            </div>
            
            <div className="h-4 w-[1px] bg-text-main/10" />
            
            <button 
              disabled={currentPage === totalPages || totalPages === 0}
              onClick={nextPage}
              className="text-[10px] font-black text-text-dim uppercase tracking-widest hover:text-accent-green disabled:opacity-20 transition-all flex items-center gap-2 group"
            >
              NEXT
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
         </div>
         
         <div className="hidden md:block">
            <span className="text-[9px] font-bold text-text-dim uppercase tracking-[0.3em] opacity-30 italic">Rafiki Table Engine v1.0</span>
         </div>
      </div>
    </div>
  );
}
