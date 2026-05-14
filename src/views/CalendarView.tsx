import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Meeting, Client } from '../db/db';
import { 
  Calendar as CalendarIcon, 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  Video, 
  Phone, 
  User2, 
  Clock,
  X,
  Search,
  ExternalLink,
  Zap,
  MapPin,
  Link as LinkIcon,
  ShieldCheck
} from 'lucide-react';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  addMonths, 
  subMonths,
  startOfWeek,
  endOfWeek,
  parseISO
} from 'date-fns';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { EventSequencingModal } from '../components/EventSequencingModal';

interface CalendarViewProps {
  setView: (view: any) => void;
}

export function CalendarView({ setView }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [meetingsPage, setMeetingsPage] = useState(1);
  const [promisesPage, setPromisesPage] = useState(1);
  const itemsPerPage = 4;

  // Queries
  const clients = useLiveQuery(() => db.clients.toArray());
  const meetings = useLiveQuery(() => db.meetings.toArray());
  const promises = useLiveQuery(() => db.billing_promises.toArray());

  // Aggregate all "temporal occurrences" with Multi-Stream distinction
  const allEvents = [
    ...(meetings || []).map(m => ({ 
      ...m, 
      category: 'meeting' as const,
      location: m.location || '',
      accentColor: 'accent-green'
    })),
    ...(promises || []).map(p => ({ 
      id: p.id, 
      client_id: p.client_id,
      summary: `Expectation: KSh ${p.amount_due}`, 
      start_time: p.due_date,
      type: 'Other' as const,
      category: 'promise' as const,
      status: p.status,
      amount: p.amount_due,
      payment_method: p.payment_method,
      location: '',
      accentColor: 'amber-500'
    })),
    ...(clients || []).filter(c => c.initial_meeting).map(c => ({
      id: `kickoff-${c.node_id}`,
      client_id: c.node_id,
      summary: `Kick-off: ${c.name}`,
      start_time: c.initial_meeting,
      type: 'Discovery' as const,
      category: 'meeting' as const,
      location: 'Virtual/Rafiki Hub',
      accentColor: 'accent-green'
    })),
    ...(clients || []).filter(c => c.target_payment).map(c => ({
      id: `payment-${c.node_id}`,
      client_id: c.node_id,
      summary: `Payment Due: ${c.name}`,
      start_time: c.target_payment,
      type: 'Other' as const,
      category: 'promise' as const,
      status: 'pending',
      amount: c.agreed_price,
      payment_method: 'Mpesa',
      location: '',
      accentColor: 'amber-500'
    }))
  ];

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);

  const days = eachDayOfInterval({
    start: calendarStart,
    end: calendarEnd,
  });

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  const handleDragEnd = (event: any, info: any) => {
    if (info.offset.x > 100) prevMonth();
    else if (info.offset.x < -100) nextMonth();
  };

  const selectedDayEvents = allEvents.filter(e => isSameDay(parseISO(e.start_time), selectedDate));
  
  const filteredEvents = selectedDayEvents.filter(e => 
    e.summary.toLowerCase().includes(sidebarSearch.toLowerCase()) ||
    e.location?.toLowerCase().includes(sidebarSearch.toLowerCase())
  );

  const dailyMeetings = filteredEvents.filter(e => e.category === 'meeting');
  const dailyPromises = filteredEvents.filter(e => e.category === 'promise');

  // Pagination logic
  const paginatedMeetings = dailyMeetings.slice((meetingsPage - 1) * itemsPerPage, meetingsPage * itemsPerPage);
  const paginatedPromises = dailyPromises.slice((promisesPage - 1) * itemsPerPage, promisesPage * itemsPerPage);

  const totalMeetingPages = Math.ceil(dailyMeetings.length / itemsPerPage);
  const totalPromisePages = Math.ceil(dailyPromises.length / itemsPerPage);

  const handleMarkAsReceived = async (promiseId: number) => {
    const promise = await db.billing_promises.get(promiseId);
    if (!promise) return;

    await db.billing_promises.update(promiseId, { status: 'fulfilled' });
    
    // Also record a payment potentially
    await db.payments.add({
      client_id: promise.client_id,
      quote_id: promise.quote_id,
      quote_number: promise.quote_number,
      billing_promise_id: String(promise.id || promise.pb_id || ''),
      billing_milestone_title: promise.milestone_title,
      amount: promise.amount_due,
      method: promise.payment_method || 'Mpesa',
      status: 'completed',
      date: new Date().toISOString(),
      transaction_id: `REC-${Date.now()}`,
      idempotency_key: `IDEM-${promiseId}-${Date.now()}`,
      synced: false
    });
  };

  return (
    <div className="space-y-8 pb-32">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-5xl font-black text-text-main uppercase tracking-tighter leading-none">Business Calendar</h1>
          <p className="text-[10px] text-accent-green font-bold tracking-[0.4em] uppercase mt-3 drop-shadow-[0_0_10px_rgba(57,255,20,0.6)]">Daily Schedule Interface</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex items-center glass-panel rounded-2xl px-2 bg-text-main/5 border-white/5 h-14">
            <button onClick={prevMonth} className="p-3 text-text-dim hover:text-accent-green transition-all active:scale-90">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="px-6 text-[10px] font-black uppercase tracking-[0.2em] min-w-[160px] text-center text-text-main tabular-nums">
              {format(currentDate, 'MMMM yyyy')}
            </span>
            <button onClick={nextMonth} className="p-3 text-text-dim hover:text-accent-green transition-all active:scale-90">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          <div className="flex gap-2">
            <button className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 h-14 glass-panel rounded-2xl text-[10px] font-black text-text-dim uppercase tracking-widest hover:text-accent-green transition-all hover:border-accent-green/20">
              <Plus className="w-4 h-4" />
              Sync Event
            </button>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-8 h-14 bg-accent-green text-bg-deep rounded-2xl font-black uppercase text-[10px] tracking-widest hover:scale-105 transition-all shadow-neon active:scale-95"
            >
              <Zap className="w-4 h-4" />
              Schedule Event
            </button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Main Calendar View */}
        <div className="lg:col-span-3">
          <motion.div 
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            onDragEnd={handleDragEnd}
            className="glass-panel rounded-[2.5rem] border-white/5 overflow-hidden shadow-2xl relative"
          >
            <div className="grid grid-cols-7 border-b border-white/5 bg-text-main/5">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="py-6 text-center text-[9px] font-black uppercase tracking-[0.3em] text-text-dim opacity-50">
                  {day}
                </div>
              ))}
            </div>
            
            <div className="grid grid-cols-7">
              {days.map((day, i) => {
                const dayEvents = allEvents.filter(e => isSameDay(parseISO(e.start_time), day));
                const dayMeetings = dayEvents.filter(e => e.category === 'meeting');
                const dayPromises = dayEvents.filter(e => e.category === 'promise');
                
                const isToday = isSameDay(day, new Date());
                const isSelected = isSameDay(day, selectedDate);
                const isThisMonth = isSameMonth(day, currentDate);

                return (
                  <motion.div 
                    key={day.toISOString()} 
                    onClick={() => setSelectedDate(day)}
                    className={cn(
                      "group min-h-[100px] md:min-h-[140px] p-2 md:p-4 border-r border-b border-white/5 transition-all cursor-pointer relative",
                      !isThisMonth && "bg-text-main/[0.05] opacity-30 grayscale",
                      isSelected && "bg-accent-green/[0.03] z-10"
                    )}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className={cn(
                        "text-[10px] font-black w-8 h-8 rounded-xl flex items-center justify-center border tracking-tighter transition-all tabular-nums",
                        isToday 
                          ? 'bg-accent-green text-bg-deep border-accent-green shadow-neon scale-110' 
                          : isSelected
                            ? 'border-accent-green text-accent-green bg-accent-green/10'
                            : 'text-text-dim/60 border-transparent group-hover:border-white/10 group-hover:text-text-main'
                      )}>
                        {format(day, 'd')}
                      </span>
                    </div>

                    <div className="space-y-1 mt-auto">
                      {/* Condensed View for Calendar */}
                      {dayEvents.slice(0, 2).map((event, idx) => (
                        <div 
                          key={`${event.category}-${event.id || idx}`} 
                          className={cn(
                            "px-2 py-1 rounded-lg text-[7px] font-black uppercase tracking-tighter leading-tight truncate border",
                            event.category === 'meeting' 
                              ? "bg-accent-green/5 text-accent-green border-accent-green/10"
                              : "bg-amber-500/5 text-amber-500 border-amber-500/10 shadow-[0_0_8px_rgba(255,176,0,0.1)]"
                          )}
                        >
                          {event.summary}
                        </div>
                      ))}
                      {dayEvents.length > 2 && (
                        <p className="text-[7px] font-black text-text-dim uppercase text-center mt-1">
                          + {dayEvents.length - 2} More
                        </p>
                      )}
                      
                      {/* Multi-Stream Dot Indicators */}
                      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                        {dayMeetings.length > 0 && (
                          <div className="w-1 h-1 rounded-full bg-accent-green shadow-neon animate-pulse" />
                        )}
                        {dayPromises.length > 0 && (
                          <div className="w-1 h-1 rounded-full bg-amber-500 shadow-[0_0_10px_rgba(255,176,0,0.8)] animate-pulse" />
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
          
          {/* Legend for Mobile/Visual Clarity */}
          <div className="mt-6 flex flex-wrap gap-6 px-4">
             <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-accent-green shadow-neon" />
                <span className="text-[9px] font-black text-text-dim uppercase tracking-[0.2em]">Operational Node (Meeting)</span>
             </div>
             <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_10px_rgba(255,176,0,0.8)]" />
                <span className="text-[9px] font-black text-text-dim uppercase tracking-[0.2em]">Financial Node (Promise)</span>
             </div>
          </div>
        </div>

        {/* Sidebar: Daily Schedule Detail Panel with Segmentation */}
        <div className="lg:col-span-1 space-y-10">
          {/* Sidebar Search */}
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim transition-colors group-focus-within:text-accent-green" />
            <input 
              type="text"
              placeholder="Filter daily schedule..."
              value={sidebarSearch}
              onChange={(e) => {
                setSidebarSearch(e.target.value);
                setMeetingsPage(1);
                setPromisesPage(1);
              }}
              className="w-full bg-text-main/[0.03] border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-[10px] font-black text-text-main focus:outline-none focus:border-accent-green/30 transition-all uppercase tracking-widest placeholder:text-text-dim/20"
            />
          </div>

          {/* Meetings Section */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-text-main uppercase tracking-[0.2em] flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-accent-green shadow-neon" />
                Operational Schedule
              </h3>
              {totalMeetingPages > 1 && (
                <div className="flex items-center gap-1">
                  <button 
                    disabled={meetingsPage === 1}
                    onClick={() => setMeetingsPage(p => Math.max(1, p - 1))}
                    className="p-1.5 rounded-lg bg-white/5 text-text-dim disabled:opacity-20 hover:text-accent-green transition-all"
                  >
                    <ChevronLeft className="w-3 h-3" />
                  </button>
                  <span className="text-[8px] font-black text-text-dim tabular-nums px-1">{meetingsPage}/{totalMeetingPages}</span>
                  <button 
                    disabled={meetingsPage === totalMeetingPages}
                    onClick={() => setMeetingsPage(p => Math.min(totalMeetingPages, p + 1))}
                    className="p-1.5 rounded-lg bg-white/5 text-text-dim disabled:opacity-20 hover:text-accent-green transition-all"
                  >
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {paginatedMeetings.length === 0 ? (
                <div className="p-10 text-center glass-panel !bg-text-main/5 border-dashed rounded-[2rem] border-white/5 flex flex-col items-center gap-3 opacity-40">
                  <p className="text-[9px] font-black text-text-dim uppercase tracking-widest italic tracking-tighter">
                    {sidebarSearch ? 'No matching entries' : 'No meetings scheduled'}
                  </p>
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {paginatedMeetings.map((event, i) => {
                    const client = clients?.find(c => c.node_id === event.client_id || c.id?.toString() === event.client_id);
                    return (
                      <motion.div 
                        key={`meeting-${event.id || i}`}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="glass-panel p-5 rounded-[2rem] border-white/5 bg-text-main/[0.02] hover:bg-text-main/[0.04] transition-all group border-l-4 border-l-accent-green"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Video className="w-4 h-4 text-accent-green" />
                            <span className="text-[9px] font-black text-text-dim uppercase tracking-widest tabular-nums">
                              {format(parseISO(event.start_time), 'p')}
                            </span>
                          </div>
                          {client && (
                            <button onClick={() => setView('clients')} className="p-2 rounded-xl bg-white/5 text-text-dim hover:text-accent-green transition-all">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <h4 className="text-xs font-black text-text-main uppercase tracking-tight mb-1 group-hover:text-accent-green transition-colors">
                          {event.summary}
                        </h4>
                        {client && <p className="text-[8px] text-text-dim uppercase font-bold tracking-[0.1em] truncate">Client: {client.name}</p>}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
            </div>
          </div>

          {/* Promises Section */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-text-main uppercase tracking-[0.2em] flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_10px_rgba(255,176,0,0.8)]" />
                Financial Schedule
              </h3>
              {totalPromisePages > 1 && (
                <div className="flex items-center gap-1">
                  <button 
                    disabled={promisesPage === 1}
                    onClick={() => setPromisesPage(p => Math.max(1, p - 1))}
                    className="p-1.5 rounded-lg bg-white/5 text-text-dim disabled:opacity-20 hover:text-accent-green transition-all"
                  >
                    <ChevronLeft className="w-3 h-3" />
                  </button>
                  <span className="text-[8px] font-black text-text-dim tabular-nums px-1">{promisesPage}/{totalPromisePages}</span>
                  <button 
                    disabled={promisesPage === totalPromisePages}
                    onClick={() => setPromisesPage(p => Math.min(totalPromisePages, p + 1))}
                    className="p-1.5 rounded-lg bg-white/5 text-text-dim disabled:opacity-20 hover:text-accent-green transition-all"
                  >
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {paginatedPromises.length === 0 ? (
                <div className="p-10 text-center glass-panel !bg-text-main/5 border-dashed rounded-[2rem] border-white/5 flex flex-col items-center gap-3 opacity-40">
                  <p className="text-[9px] font-black text-text-dim uppercase tracking-widest italic tracking-tighter">
                    {sidebarSearch ? 'No matching entries' : 'No payments found'}
                  </p>
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {paginatedPromises.map((event, i) => {
                    const client = clients?.find(c => c.node_id === event.client_id || c.id?.toString() === event.client_id);
                    const isFulfilled = event.status === 'fulfilled';
                    
                    return (
                      <motion.div 
                        key={`promise-${event.id || i}`}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className={cn(
                          "glass-panel p-5 rounded-[2rem] border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all group border-l-4",
                          isFulfilled ? "border-l-accent-green shadow-[0_0_20px_rgba(57,255,20,0.05)]" : "border-l-amber-500 shadow-[0_0_20px_rgba(255,176,0,0.1)]"
                        )}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Zap className={cn("w-4 h-4", isFulfilled ? "text-accent-green" : "text-amber-500")} />
                            <span className="text-[9px] font-black text-text-dim uppercase tracking-widest tabular-nums">
                              EXPECTED: {(event as any).payment_method || 'ANY'}
                            </span>
                          </div>
                          {isFulfilled ? (
                            <div className="w-6 h-6 rounded-lg bg-accent-green/10 flex items-center justify-center border border-accent-green/20">
                               <ShieldCheck className="w-3.5 h-3.5 text-accent-green" />
                            </div>
                          ) : (
                            <button 
                              onClick={() => handleMarkAsReceived(Number(event.id))}
                              className="text-[8px] font-black text-amber-500 border border-amber-500/20 bg-amber-500/5 px-3 py-1.5 rounded-xl hover:bg-amber-500 hover:text-bg-deep transition-all uppercase tracking-widest"
                            >
                              Mark Received
                            </button>
                          )}
                        </div>
                        
                        <div className="flex items-end justify-between">
                          <div>
                            <h4 className="text-xs font-black text-text-main uppercase tracking-tight mb-1">
                              {event.summary}
                            </h4>
                            {client && <p className="text-[8px] text-text-dim uppercase font-bold tracking-[0.1em] truncate">Source: {client.name}</p>}
                          </div>
                          <div className={cn(
                            "text-md font-black italic tracking-tighter tabular-nums",
                            isFulfilled ? "text-accent-green" : "text-amber-400"
                          )}>
                             KSh {event.amount?.toLocaleString()}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <EventSequencingModal 
            onClose={() => setIsModalOpen(false)} 
            clients={clients || []}
            initialDate={selectedDate}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
