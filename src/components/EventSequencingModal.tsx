import React, { useState } from 'react';
import { db, Meeting, Client } from '../db/db';
import { 
  Zap,
  X,
  Search,
  ShieldCheck,
  Link as LinkIcon
} from 'lucide-react';
import { 
  format,
} from 'date-fns';
import { useSync } from '../hooks/useSync';
import { useTheme } from '../contexts/ThemeContext';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

import { googleCalendarService } from '../services/googleCalendarService';

interface EventSequencingModalProps {
  onClose: () => void;
  clients: Client[];
  initialDate: Date;
  initialNodeType?: 'OPERATIONAL' | 'FINANCIAL';
  initialMeetingType?: Meeting['type'] | 'Payment Follow-up';
}

export function EventSequencingModal({ 
  onClose, 
  clients, 
  initialDate, 
  initialNodeType = 'OPERATIONAL',
  initialMeetingType = 'Discovery'
}: EventSequencingModalProps) {
  const { theme } = useTheme();
  const { addEntity } = useSync();
  const [nodeType, setNodeType] = useState<'OPERATIONAL' | 'FINANCIAL'>(initialNodeType);
  
  const [formData, setFormData] = useState({
    client_id: '',
    summary: initialMeetingType !== 'Discovery' ? `${initialMeetingType}: Scheduled Session` : '',
    type: (initialMeetingType === 'Payment Follow-up' ? 'Payment Follow-up' : initialMeetingType) as Meeting['type'],
    start_time: format(initialDate, "yyyy-MM-dd'T'10:00"),
    end_time: format(initialDate, "yyyy-MM-dd'T'11:00"),
    location: '',
    description: '',
    expected_amount: '',
    payment_method: 'Mpesa' as 'Mpesa' | 'Bank' | 'Cash'
  });
  
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.node_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.client_id) return;
    
    setIsSaving(true);
    try {
      if (nodeType === 'OPERATIONAL') {
        const meetingData: Omit<Meeting, 'id' | 'synced'> = {
          client_id: formData.client_id,
          summary: formData.summary || `${formData.type}: Scheduled Session`,
          type: formData.type,
          start_time: new Date(formData.start_time).toISOString(),
          end_time: new Date(formData.end_time).toISOString(),
          location: formData.location,
          description: formData.description,
        };
        await googleCalendarService.scheduleMeeting(meetingData);
      } else {
        await db.billing_promises.add({
          client_id: formData.client_id,
          amount_due: Number(formData.expected_amount),
          due_date: new Date(formData.start_time).toISOString(),
          payment_method: formData.payment_method,
          status: 'pending',
          synced: false
        });
      }
      
      setTimeout(() => {
        setIsSaving(false);
        onClose();
      }, 1000);
    } catch (error) {
      console.error('Failed to sequence node:', error);
      setIsSaving(false);
    }
  };

  const isFinancial = nodeType === 'FINANCIAL';
  const accentColor = isFinancial ? 'amber-500' : 'accent-green';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-bg-deep/90 backdrop-blur-[10px]"
      />
      
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className={cn(
          "relative w-full max-w-2xl glass-panel !bg-bg-deep/90 rounded-[2.5rem] border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.3)] overflow-hidden transition-all duration-500",
          isFinancial ? "border-amber-500/30" : "border-accent-green/30"
        )}
      >
        <div className="p-8 border-b border-white/5 flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={cn(
                "w-10 h-10 rounded-2xl flex items-center justify-center border transition-all duration-500",
                isFinancial ? "bg-amber-500/10 border-amber-500/20" : "bg-accent-green/10 border-accent-green/20"
              )}>
                <Zap className={cn("w-5 h-5 transition-all duration-500", isFinancial ? "text-amber-500" : "text-accent-green")} />
              </div>
              <div>
                <h2 className="text-xl font-black text-text-main uppercase tracking-tighter">Business Scheduling Interface</h2>
                <p className="text-[8px] text-text-dim font-bold tracking-[0.3em] uppercase mt-1">
                  Scheduled {nodeType.toLowerCase()} Module // Context Linking enabled
                </p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-text-dim hover:text-accent-green transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex p-1 bg-text-main/5 rounded-2xl">
             <button 
                type="button"
                onClick={() => setNodeType('OPERATIONAL')}
                className={cn(
                  "flex-1 py-3 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all",
                  nodeType === 'OPERATIONAL' ? "bg-accent-green text-bg-deep shadow-neon" : "text-text-dim hover:text-text-main"
                )}
             >
               Operational
             </button>
             <button 
                type="button"
                onClick={() => setNodeType('FINANCIAL')}
                className={cn(
                  "flex-1 py-3 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all",
                  nodeType === 'FINANCIAL' ? "bg-amber-500 text-bg-deep shadow-[0_0_15px_rgba(255,176,0,0.5)]" : "text-text-dim hover:text-text-main"
                )}
             >
               Financial
             </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-10 space-y-8 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {/* Client Searchable Dropdown */}
          <div className="space-y-2 relative">
            <label className="text-[9px] font-black text-text-dim uppercase tracking-widest ml-1">Client Node Linkage</label>
            <div className="relative group">
              <Search className={cn("absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim transition-colors", `group-focus-within:text-${accentColor}`)} />
              <input 
                type="text"
                placeholder="PROBE CLIENT NAME OR SYSTEM ID..."
                value={searchTerm}
                onFocus={() => setShowDropdown(true)}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setShowDropdown(true);
                }}
                className={cn(
                  "w-full bg-text-main/[0.03] border border-text-main/10 rounded-2xl py-4 pl-12 pr-4 text-xs font-black text-text-main focus:outline-none transition-all uppercase tracking-widest placeholder:text-text-dim/20",
                  isFinancial ? "focus:border-amber-500/50" : "focus:border-accent-green/50"
                )}
              />
            </div>
            
            <AnimatePresence>
              {showDropdown && filteredClients.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute z-20 top-full left-0 right-0 mt-2 bg-bg-deep border border-text-main/10 rounded-2xl overflow-hidden shadow-2xl max-h-48 overflow-y-auto"
                >
                  {filteredClients.map(client => (
                    <button
                      key={client.id}
                      type="button"
                      onClick={() => {
                        setFormData({...formData, client_id: client.node_id});
                        setSearchTerm(client.name);
                        setShowDropdown(false);
                      }}
                      className="w-full text-left px-5 py-4 hover:bg-text-main/5 transition-all flex items-center justify-between group"
                    >
                      <div>
                        <p className={cn("text-[10px] font-black text-text-main uppercase transition-colors", `group-hover:text-${accentColor}`)}>{client.name}</p>
                        <p className="text-[8px] text-text-dim uppercase font-bold tracking-widest">{client.node_id}</p>
                      </div>
                      <ShieldCheck className={cn("w-3.5 h-3.5 text-text-dim opacity-20 group-hover:opacity-100 transition-all", `group-hover:text-${accentColor}`)} />
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             {isFinancial ? (
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-text-dim uppercase tracking-widest ml-1">Expected Amount (KSh)</label>
                  <input 
                    required
                    type="number" 
                    value={formData.expected_amount}
                    onChange={e => setFormData({...formData, expected_amount: e.target.value})}
                    placeholder="ENTER AMOUNT..."
                    className="w-full bg-white/[0.02] border border-white/10 rounded-2xl py-4 px-5 text-xs font-black text-text-main focus:outline-none focus:border-amber-500/50 transition-all uppercase tracking-widest italic"
                  />
                </div>
             ) : (
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-text-dim uppercase tracking-widest ml-1">Meeting Type</label>
                  <select 
                    value={formData.type}
                    onChange={e => setFormData({...formData, type: e.target.value as any})}
                    className="w-full bg-white/[0.02] border border-white/10 rounded-2xl py-4 px-5 text-xs font-black text-text-main focus:outline-none focus:border-accent-green/50 transition-all uppercase tracking-widest appearance-none"
                  >
                    <option value="Discovery" className="bg-bg-deep">Discovery Phase</option>
                    <option value="Agreement Signing" className="bg-bg-deep">Agreement Signing</option>
                    <option value="Payment Follow-up" className="bg-bg-deep">Payment Follow-up</option>
                    <option value="Other" className="bg-bg-deep">Other Sequence</option>
                  </select>
                </div>
             )}
            
            <div className="space-y-2">
              <label className="text-[9px] font-black text-text-dim uppercase tracking-widest ml-1">
                {isFinancial ? 'Payment Method' : 'Event Summary'}
              </label>
              {isFinancial ? (
                <select 
                  value={formData.payment_method}
                  onChange={e => setFormData({...formData, payment_method: e.target.value as any})}
                  className="w-full bg-white/[0.02] border border-white/10 rounded-2xl py-4 px-5 text-xs font-black text-text-main focus:outline-none focus:border-amber-500/50 transition-all uppercase tracking-widest appearance-none"
                >
                  <option value="Mpesa" className="bg-bg-deep">Mpesa Node</option>
                  <option value="Bank" className="bg-bg-deep">Bank Uplink</option>
                  <option value="Cash" className="bg-bg-deep">Physical Settlement</option>
                </select>
              ) : (
                <input 
                  required
                  type="text" 
                  value={formData.summary}
                  onChange={e => setFormData({...formData, summary: e.target.value})}
                  placeholder="M-PESA VERIFICATION MEETING..."
                  className="w-full bg-white/[0.02] border border-white/10 rounded-2xl py-4 px-5 text-xs font-black text-text-main focus:outline-none focus:border-accent-green/50 transition-all uppercase tracking-widest"
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[9px] font-black text-text-dim uppercase tracking-widest ml-1">
                {isFinancial ? 'Fulfillment Deadline' : 'Start Interval'}
              </label>
              <input 
                type="datetime-local" 
                value={formData.start_time}
                onChange={e => setFormData({...formData, start_time: e.target.value})}
                className={cn(
                  "w-full bg-white/[0.02] border border-white/10 rounded-2xl py-4 px-5 text-xs font-black text-text-main focus:outline-none transition-all uppercase tracking-widest",
                  isFinancial ? "focus:border-amber-500/50" : "focus:border-accent-green/50",
                  theme === 'dark' ? "[color-scheme:dark]" : "[color-scheme:light]"
                )}
              />
            </div>
            {!isFinancial && (
              <div className="space-y-2">
                <label className="text-[9px] font-black text-text-dim uppercase tracking-widest ml-1">End Interval</label>
                <input 
                  type="datetime-local" 
                  value={formData.end_time}
                  onChange={e => setFormData({...formData, end_time: e.target.value})}
                  className={cn(
                    "w-full bg-white/[0.02] border border-white/10 rounded-2xl py-4 px-5 text-xs font-black text-text-main focus:outline-none focus:border-accent-green/50 transition-all uppercase tracking-widest",
                    theme === 'dark' ? "[color-scheme:dark]" : "[color-scheme:light]"
                  )}
                />
              </div>
            )}
          </div>

          {!isFinancial && (
            <div className="space-y-2">
              <label className="text-[9px] font-black text-text-dim uppercase tracking-widest ml-1">Location / Uplink URL</label>
              <div className="relative group">
                <LinkIcon className={cn("absolute left-4 top-1/2 -translate-y-1/2 w-3 h-3 text-text-dim opacity-30", `group-focus-within:text-${accentColor}`)} />
                <input 
                  type="text" 
                  value={formData.location}
                  onChange={e => setFormData({...formData, location: e.target.value})}
                  placeholder="HTTPS://MEET.GOOGLE.COM/..."
                  className={cn(
                    "w-full bg-white/[0.02] border border-white/10 rounded-2xl py-4 pl-10 pr-5 text-xs font-black text-text-main focus:outline-none transition-all tracking-widest",
                    isFinancial ? "focus:border-amber-500/50" : "focus:border-accent-green/50"
                  )}
                />
              </div>
            </div>
          )}

          <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-10 border-t border-white/5">
            <div className="flex items-center gap-3 opacity-40">
              <div className={cn("w-1.5 h-1.5 rounded-full animate-ping", isFinancial ? "bg-amber-500" : "bg-accent-green")} />
              <span className="text-[8px] font-black text-text-dim uppercase tracking-[.4em]">Agreement ready for execution...</span>
            </div>
            
            <div className="flex items-center gap-4 w-full md:w-auto">
              <button 
                type="button"
                onClick={onClose}
                className="flex-1 md:flex-none px-10 py-5 rounded-2xl border border-white/10 text-[10px] font-black text-text-dim uppercase tracking-widest hover:bg-white/5 transition-all active:scale-95"
              >
                Abort
              </button>
              <button 
                type="submit"
                disabled={isSaving}
                className={cn(
                  "flex-1 md:flex-none px-12 py-5 rounded-2xl text-bg-deep text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all active:scale-95 flex items-center justify-center gap-2",
                  isFinancial ? "bg-amber-500 shadow-[0_0_15px_rgba(255,176,0,0.5)]" : "bg-accent-green shadow-neon"
                )}
              >
                {isSaving ? (
                  <div className="w-4 h-4 border-2 border-bg-deep border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Zap className="w-4 h-4" />
                )}
                {isSaving ? 'Scheduling...' : 'Schedule Event'}
              </button>
            </div>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
