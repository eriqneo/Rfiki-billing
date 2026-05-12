import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Meeting, type Client, type PaymentPromise } from '../db/db';
import { 
  Plus, 
  Video, 
  ExternalLink, 
  RefreshCw, 
  MapPin, 
  Zap, 
  Clock, 
  Search, 
  ShieldCheck, 
  Activity, 
  Grid,
  ChevronRight,
  WifiOff
} from 'lucide-react';
import { cn } from '../lib/utils';
import { googleCalendarService } from '../services/googleCalendarService';
import { useSync } from '../hooks/useSync';
import { useTheme } from '../contexts/ThemeContext';
import { motion, AnimatePresence } from 'motion/react';
import { format, parseISO, isWithinInterval, addMinutes, subMinutes, isAfter } from 'date-fns';
import { EventSequencingModal } from '../components/EventSequencingModal';

export function Meetings() {
  const meetings = useLiveQuery(() => db.meetings.orderBy('start_time').toArray());
  const promises = useLiveQuery(() => db.billing_promises.toArray());
  const clients = useLiveQuery(() => db.clients.toArray());
  const authTokens = useLiveQuery(() => db.auth_tokens.get('google_calendar'));
  
  const { isSyncing, isOnline } = useSync();
  const { theme } = useTheme();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'STREAM' | 'ACTIONS'>('STREAM');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState<{
    nodeType: 'OPERATIONAL' | 'FINANCIAL',
    meetingType: Meeting['type'] | 'Payment Follow-up'
  }>({ nodeType: 'OPERATIONAL', meetingType: 'Discovery' });
  
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const itemsPerPage = 5;

  // Aggregate and sort events for the Upcoming Tasks
  const sortedEvents = React.useMemo(() => {
    const rawEvents = [
      ...(meetings || []).map(m => ({
        ...m,
        category: 'meeting' as const,
        timestamp: parseISO(m.start_time).getTime()
      })),
      ...(promises || []).map(p => ({
        id: p.id,
        client_id: p.client_id,
        summary: `Expectation: KSh ${p.amount_due}`,
        start_time: p.due_date,
        type: 'Other' as const,
        category: 'promise' as const,
        status: p.status,
        timestamp: parseISO(p.due_date).getTime(),
        payment_method: p.payment_method
      }))
    ];
    
    // Stabilize threshold to avoid millisecond jitter
    const threshold = Date.now() - 3600000;
    
    return rawEvents
      .filter(e => !isNaN(e.timestamp) && e.timestamp > threshold)
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [meetings, promises]);

  // Derived filtered and paginated feed
  const filteredEvents = React.useMemo(() => {
    const query = searchQuery.toLowerCase();
    return sortedEvents.filter(e => 
      e.summary.toLowerCase().includes(query) || 
      (e.type && e.type.toLowerCase().includes(query))
    );
  }, [sortedEvents, searchQuery]);

  const totalPages = Math.ceil(filteredEvents.length / itemsPerPage);
  const paginatedEvents = React.useMemo(() => {
    return filteredEvents.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [filteredEvents, currentPage]);

  const isConnected = !!authTokens;

  const handleConnect = async () => {
    setAuthError(null);
    try {
      const url = await googleCalendarService.getAuthUrl();
      window.open(url, 'google_oauth', 'width=600,height=700');
    } catch (error) {
       setAuthError('Uplink failed.');
       console.error('Failed to start OAuth:', error);
    }
  };

  const notify = (msg: string) => {
    setToastMessage(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const handleRefresh = async () => {
    if (!isOnline) {
      notify('SYNC QUEUED: Waiting for uplink...');
      return;
    }
    setAuthError(null);
    setIsRefreshing(true);
    try {
      await googleCalendarService.fetchMeetings();
    } catch (e: any) {
      if (e.message?.includes('401')) {
        setAuthError('Authentication Expired.');
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const openScheduler = (nodeType: 'OPERATIONAL' | 'FINANCIAL', meetingType: Meeting['type'] | 'Payment Follow-up') => {
    setModalConfig({ nodeType, meetingType });
    setIsModalOpen(true);
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) return;
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        if (event.data.tokens) {
          googleCalendarService.saveTokens(event.data.tokens).then(() => {
            handleRefresh();
          });
        } else {
          handleRefresh();
        }
      }
    };
    window.addEventListener('message', handleMessage);
    
    // Listen for global auth errors
    const handleAuthError = (e: Event) => {
      const msg = (e as CustomEvent).detail;
      setAuthError(msg);
    };
    window.addEventListener('google-auth-error', handleAuthError);

    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('google-auth-error', handleAuthError);
    };
  }, []);

  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);

  const openDetail = (meeting: Meeting) => {
    setSelectedMeeting(meeting);
    setIsDetailModalOpen(true);
  };

  return (
    <div className="space-y-8 pb-20 md:pb-0">
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className={cn(
          "lg:col-span-12 mb-10 pb-6 border-b border-white/5",
          currentPage === 1 && searchQuery === '' ? "block" : "hidden sm:block"
        )}>
          <h1 className="text-4xl font-black text-text-main uppercase tracking-tighter">
            Meetings
          </h1>
          <p className="text-xs text-accent-green font-bold tracking-[0.2em] uppercase mt-2 drop-shadow-[0_0_8px_rgba(57,255,20,0.5)]">Business Calendar</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="flex items-center gap-4">
            <button 
              onClick={handleRefresh}
              disabled={isRefreshing}
              className={cn(
                "h-14 px-8 glass-panel rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-3",
                isConnected ? "text-accent-green border-accent-green/20 hover:bg-accent-green/5" : "text-text-dim hover:text-text-main",
                isOnline ? "" : "opacity-50"
              )}
            >
              <RefreshCw className={cn("w-4 h-4", (isRefreshing || isSyncing) && "animate-spin text-accent-green")} />
              {isConnected ? 'Sync Now' : 'Sync Google Calendar'}
            </button>
            {!isConnected && (
              <button 
                onClick={handleConnect}
                className="h-14 px-8 bg-accent-green text-bg-deep rounded-2xl font-black uppercase text-[10px] tracking-widest hover:scale-105 transition-all shadow-neon"
              >
                Connect Google
              </button>
            )}
          </div>
        </div>
      </header>

      <AnimatePresence>
        {authError && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-8"
          >
            <div className="glass-panel p-6 rounded-[2rem] border-amber-500/20 bg-amber-500/5 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-[0_0_50px_rgba(245,158,11,0.05)]">
               <div className="flex items-center gap-5">
                 <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500 border border-amber-500/20">
                    <WifiOff className="w-6 h-6" />
                 </div>
                 <div>
                    <p className="text-xs font-black text-amber-500 uppercase tracking-widest leading-none mb-1">
                      {authError.includes('407') ? 'Network Connectivity Issue' : 'Authorization Disrupted'}
                    </p>
                    <p className="text-[9px] text-text-dim uppercase font-bold tracking-widest italic opacity-60">
                      {authError.includes('407') 
                        ? 'Your local network proxy is intercepting requests. Check your connection.'
                        : 'Please re-connect to sync your meetings.'
                      } // {authError}
                    </p>
                 </div>
               </div>
               <button 
                 onClick={authError.includes('407') ? () => setAuthError(null) : handleConnect}
                 className="w-full sm:w-auto px-10 py-4 bg-amber-500 text-bg-deep rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(245,158,11,0.3)]"
               >
                 {authError.includes('407') ? 'Acknowledge' : 'Reconnect'}
               </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Tab Switcher */}
      <div className="md:hidden flex p-1 bg-text-main/5 rounded-2xl border border-text-main/5">
        <button 
          onClick={() => setActiveTab('STREAM')}
          className={cn(
            "flex-1 py-4 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2",
            activeTab === 'STREAM' ? "bg-accent-green text-bg-deep shadow-neon" : "text-text-dim"
          )}
        >
          <Activity className="w-4 h-4" />
          Schedule
        </button>
        <button 
          onClick={() => setActiveTab('ACTIONS')}
          className={cn(
            "flex-1 py-4 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2",
            activeTab === 'ACTIONS' ? "bg-accent-green text-bg-deep shadow-neon" : "text-text-dim"
          )}
        >
          <Grid className="w-4 h-4" />
          Log Meeting
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Upcoming Tasks - Meetings List */}
        <div className={cn(
          "lg:col-span-7 space-y-6",
          activeTab === 'ACTIONS' ? "hidden md:block" : "block"
        )}>
          <div className="flex items-center justify-between px-2">
            <h3 className="text-sm font-black text-text-main uppercase tracking-[0.3em] flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-accent-green shadow-neon" />
              Upcoming Tasks
            </h3>
            
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-dim group-focus-within:text-accent-green transition-colors" />
              <input 
                type="text"
                placeholder="SEARCH SCHEDULE..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className="bg-text-main/[0.03] border border-text-main/10 rounded-xl py-2 pl-9 pr-4 text-[9px] font-black text-text-main focus:outline-none focus:border-accent-green/30 transition-all uppercase tracking-widest placeholder:text-text-dim/20 w-40 sm:w-64"
              />
            </div>
          </div>

          <div 
            className="space-y-4 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar glass-panel !bg-bg-deep/40 p-6 rounded-[2.5rem] border-white/5"
          >
            {filteredEvents.length === 0 ? (
               <div className="p-24 text-center glass-panel !bg-transparent border-dashed rounded-[2rem] border-white/5 opacity-30">
                <Activity className="w-8 h-8 mx-auto mb-4 text-text-dim" />
                <p className="text-[10px] font-black text-text-dim uppercase tracking-widest italic tracking-tighter">No upcoming meetings or payments.</p>
              </div>
            ) : (
              <AnimatePresence mode="popLayout" initial={false}>
                {paginatedEvents.map((event, i) => {
                  const client = clients?.find(c => c.node_id === event.client_id || c.id?.toString() === event.client_id);
                  const isFinancial = event.category === 'promise';
                  const isImminent = isWithinInterval(new Date(), {
                    start: subMinutes(parseISO(event.start_time), 30),
                    end: addMinutes(parseISO(event.start_time), 5)
                  });
                  
                  return (
                    <motion.div 
                      key={`${event.category}-${event.id || i}`}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                      layout
                      onClick={() => event.category === 'meeting' && openDetail(event as Meeting)}
                      className={cn(
                        "glass-panel p-6 rounded-[2rem] border-white/10 bg-text-main/[0.02] hover:bg-text-main/[0.05] transition-all group relative overflow-hidden flex items-center justify-between shadow-2xl cursor-pointer hover:border-accent-green/20",
                        isFinancial ? "border-l-4 border-l-amber-500" : "border-l-4 border-l-accent-green",
                        isImminent && "ring-2 ring-accent-green/20 ring-inset"
                      )}
                    >
                      {isImminent && (
                        <motion.div 
                          className="absolute inset-0 bg-accent-green/5 pointer-events-none"
                          animate={{ opacity: [0.05, 0.15, 0.05] }}
                          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                        />
                      )}
                      
                      <div className="flex items-center gap-6 z-10">
                        <div className={cn(
                          "w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center border transition-all shadow-xl group-hover:scale-110",
                          isFinancial ? "bg-amber-500/10 border-amber-500/20 text-amber-500" : "bg-accent-green/10 border-accent-green/20 text-accent-green"
                        )}>
                          {isFinancial ? <Zap className="w-5 h-5 md:w-6 md:h-6" /> : <Video className="w-5 h-5 md:w-6 md:h-6" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-3 mb-1">
                            <h4 className="text-xs md:text-sm font-black text-text-main uppercase tracking-tight group-hover:text-accent-green transition-colors truncate max-w-[120px] sm:max-w-none">
                              {client?.name || 'Isolated Node'}
                            </h4>
                            {event.synced && <ShieldCheck className="w-3.5 h-3.5 text-accent-green drop-shadow-neon" />}
                          </div>
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                             <div className="flex items-center gap-2">
                                <Clock className="w-3 h-3 text-text-dim" />
                                <span className="text-[9px] md:text-[10px] font-black text-text-dim uppercase tracking-widest tabular-nums italic">
                                  {format(parseISO(event.start_time), 'p')}
                                </span>
                             </div>
                             <span className={cn(
                               "text-[7px] md:text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest w-fit",
                                isFinancial ? "bg-amber-500/10 text-amber-500" : "bg-accent-green/10 text-accent-green"
                             )}>
                               {event.category === 'meeting' ? (event as Meeting).type : 'Financial'}
                             </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 md:gap-3 z-10">
                        {event.category === 'meeting' && (
                          <div className="flex gap-1 md:gap-2">
                            {(event as Meeting).location?.includes('http') ? (
                              <a 
                                href={(event as Meeting).location} 
                                target="_blank" 
                                rel="noreferrer"
                                className="p-3 md:p-4 rounded-2xl bg-text-main/5 text-text-dim hover:text-accent-green hover:bg-text-main/10 transition-all border border-text-main/5 active:scale-90"
                              >
                                <Video className="w-3.5 h-3.5 md:w-4 md:h-4" />
                              </a>
                            ) : (event as Meeting).location && (
                              <button className="p-3 md:p-4 rounded-2xl bg-white/5 text-text-dim hover:text-accent-green hover:bg-white/10 transition-all border border-white/5 active:scale-90">
                                <MapPin className="w-3.5 h-3.5 md:w-4 md:h-4" />
                              </button>
                            )}
                          </div>
                        )}
                        <ChevronRight className="w-4 h-4 md:w-5 md:h-5 text-text-dim opacity-20 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 pt-4">
              <p className="text-[9px] font-black text-text-dim uppercase tracking-widest">Schedule Segment {currentPage} // {totalPages}</p>
              <div className="flex gap-2">
                 <button 
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="px-4 py-2 glass-panel rounded-xl text-[9px] font-black uppercase tracking-widest disabled:opacity-20 hover:text-accent-green transition-all"
                >
                  Prev
                </button>
                <button 
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className="px-4 py-2 glass-panel rounded-xl text-[9px] font-black uppercase tracking-widest disabled:opacity-20 hover:text-accent-green transition-all"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Meeting Actions - Big Cards */}
        <div className={cn(
          "lg:col-span-5 space-y-8",
          activeTab === 'STREAM' ? "hidden md:block" : "block"
        )}>
          <h3 className="text-sm font-black text-text-main uppercase tracking-[0.3em] px-2 mb-6">Agreements & Engagements</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-1 gap-6 md:max-h-[70vh] md:overflow-y-auto md:pr-4">
            {[
              { 
                type: 'Discovery' as const, 
                desc: 'First meeting to understand the project, goals, and client requirements.', 
                accent: 'accent-green',
                node: 'OPERATIONAL'
              },
              { 
                type: 'Agreement Signing' as const, 
                desc: 'Walk through and sign the project agreement with the client.', 
                accent: 'accent-green',
                node: 'OPERATIONAL'
              },
              { 
                type: 'Payment Follow-up' as const, 
                desc: 'Follow up on pending payments and financial milestones.', 
                accent: 'amber-500',
                node: 'FINANCIAL'
              },
            ].map((proc, i) => (
              <motion.button 
                key={proc.type}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => openScheduler(proc.node as any, proc.type)}
                className={cn(
                  "glass-panel p-8 rounded-3xl text-left group overflow-hidden relative transition-all border-l-4",
                  proc.node === 'FINANCIAL' ? "border-l-amber-500 hover:shadow-[0_0_40px_rgba(245,158,11,0.15)] bg-amber-500/[0.02]" : "border-l-accent-green hover:shadow-[0_0_40px_rgba(57,255,20,0.15)] bg-accent-green/[0.02]"
                )}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center border transition-all",
                    proc.node === 'FINANCIAL' ? "bg-amber-500/10 border-amber-500/20 text-amber-500" : "bg-accent-green/10 border-accent-green/20 text-accent-green"
                  )}>
                    <Plus className="w-6 h-6" />
                  </div>
                  <div className={cn(
                    "text-[8px] font-black uppercase tracking-[.4em] px-3 py-1 rounded-full border",
                    proc.node === 'FINANCIAL' ? "border-amber-500/20 text-amber-500" : "border-accent-green/20 text-accent-green"
                  )}>
                    {proc.node === 'FINANCIAL' ? 'Financial' : 'Operational'}
                  </div>
                </div>
                <h4 className="font-black text-xl text-text-main uppercase tracking-tighter mb-2 group-hover:text-accent-green transition-colors">{proc.type}</h4>
                <p className="text-[10px] text-text-dim uppercase tracking-tight leading-relaxed font-bold opacity-60 italic">{proc.desc}</p>
                
                {/* Background ambient glow */}
                <div className={cn(
                  "absolute top-0 right-0 w-32 h-32 blur-3xl opacity-10 group-hover:opacity-20 transition-all",
                  proc.node === 'FINANCIAL' ? "bg-amber-500" : "bg-accent-green"
                )} />
              </motion.button>
            ))}
          </div>

          {/* Sync Status Info Card */}
          <div className="glass-panel p-8 rounded-3xl !bg-text-main/5 border-dashed border-white/5 opacity-40">
            <div className="flex items-center gap-4 mb-4">
              <WifiOff className="w-5 h-5 text-text-dim" />
              <h4 className="text-[10px] font-black text-text-main uppercase tracking-[.3em]">Offline Scheduling</h4>
            </div>
            <p className="text-[9px] text-text-dim uppercase tracking-widest leading-[1.8] italic">
              Meetings you schedule are saved locally and will sync to Google Calendar as soon as you're back online.
            </p>
          </div>
        </div>
      </div>

      {/* Global Toast - Surveillance Style */}
      <AnimatePresence>
        {showToast && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed bottom-32 md:bottom-12 left-1/2 -translate-x-1/2 z-[200] w-full max-w-sm px-4"
          >
            <div className="glass-panel !bg-bg-deep/95 backdrop-blur-2xl border-white/10 p-5 rounded-[2rem] flex items-center justify-between shadow-[0_0_50px_rgba(0,0,0,0.3)] border-l-4 border-l-amber-500">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <WifiOff className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-text-main uppercase tracking-widest leading-none mb-1">You're offline</p>
                  <p className="text-[8px] text-text-dim font-bold uppercase tracking-widest">{toastMessage}</p>
                </div>
              </div>
              <button onClick={() => setShowToast(false)} className="text-text-dim p-2">
                 <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isDetailModalOpen && selectedMeeting && (
          <MeetingDetailModal 
            meeting={selectedMeeting} 
            onClose={() => {
              setIsDetailModalOpen(false);
              setSelectedMeeting(null);
            }} 
            clients={clients || []}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isModalOpen && (
          <EventSequencingModal 
            onClose={() => setIsModalOpen(false)} 
            clients={clients || []}
            initialDate={new Date()}
            initialNodeType={modalConfig.nodeType}
            initialMeetingType={modalConfig.meetingType}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function MeetingDetailModal({ meeting, onClose, clients }: { meeting: Meeting, onClose: () => void, clients: Client[] }) {
  const [minutes, setMinutes] = useState(meeting.minutes || '');
  const [isSaving, setIsSaving] = useState(false);
  const client = clients.find(c => c.node_id === meeting.client_id || c.id?.toString() === meeting.client_id);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (meeting.id) {
        await db.meetings.update(meeting.id, { minutes });
      }
      setTimeout(() => {
        setIsSaving(false);
        onClose();
      }, 500);
    } catch (error) {
      console.error('Failed to save minutes:', error);
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
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
        className="relative w-full max-w-3xl glass-panel !bg-bg-deep/90 rounded-[2.5rem] border-white/10 shadow-[0_0_80px_rgba(0,0,0,0.4)] overflow-hidden"
      >
        <div className="p-8 border-b border-white/5 flex items-center justify-between bg-text-main/[0.03]">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-accent-green/10 flex items-center justify-center border border-accent-green/20">
              <Activity className="w-6 h-6 text-accent-green drop-shadow-neon" />
            </div>
            <div>
              <h2 className="text-xl font-black text-text-main uppercase tracking-tighter">Meeting Details</h2>
              <p className="text-[8px] text-text-dim font-bold tracking-[0.3em] uppercase mt-1">Review and add notes from this meeting</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-text-main/5 hover:bg-text-main/10 text-text-dim transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-10 space-y-8 overflow-y-auto max-h-[80vh]">
          <div className="grid grid-cols-2 gap-8 pb-8 border-b border-white/5">
            <div className="space-y-4">
              <div>
                <p className="text-[9px] font-black text-text-dim uppercase tracking-widest mb-1">Subject</p>
                <h4 className="text-sm font-black text-text-main uppercase tracking-tight italic">{meeting.summary}</h4>
              </div>
              <div>
                <p className="text-[9px] font-black text-text-dim uppercase tracking-widest mb-1">Date & Time</p>
                <div className="flex items-center gap-2 text-accent-green">
                  <Clock className="w-3.5 h-3.5" />
                  <span className="text-xs font-black tabular-nums">{format(parseISO(meeting.start_time), 'PPP p')}</span>
                </div>
              </div>
            </div>
            <div className="space-y-4">
               <div>
                <p className="text-[9px] font-black text-text-dim uppercase tracking-widest mb-1">Client</p>
                <h4 className="text-sm font-black text-text-main uppercase tracking-tight">{client?.name || 'No client linked'}</h4>
              </div>
              <div>
                <p className="text-[9px] font-black text-text-dim uppercase tracking-widest mb-1">Location</p>
                <div className="flex items-center gap-2 text-text-dim">
                  <MapPin className="w-3.5 h-3.5" />
                  <span className="text-xs font-bold truncate max-w-[200px]">{meeting.location || 'No location set'}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-[9px] font-black text-text-dim uppercase tracking-[0.3em]">Operational meeting minutes</label>
              <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/5">
                <div className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
                <span className="text-[8px] font-black text-text-dim uppercase tracking-widest">Live Edit</span>
              </div>
            </div>
            <textarea 
              value={minutes}
              onChange={e => setMinutes(e.target.value)}
              placeholder="ENTER MEETING NOTES, ACTION ITEMS, AND DECISIONS..."
              className="w-full bg-text-main/[0.03] border border-text-main/10 rounded-[2rem] p-8 text-xs font-bold text-text-main focus:outline-none focus:border-accent-green focus:shadow-[0_0_30px_rgba(57,255,20,0.05)] transition-all min-h-[250px] leading-relaxed placeholder:text-text-dim/10 resize-none uppercase"
            />
          </div>

          <div className="flex items-center justify-between pt-6">
            <p className="text-[8px] text-text-dim uppercase font-bold tracking-widest italic opacity-40">Notes are saved locally</p>
            <button 
              onClick={handleSave}
              disabled={isSaving}
              className="px-12 py-5 bg-accent-green text-bg-deep rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] shadow-neon hover:scale-105 active:scale-95 transition-all flex items-center gap-3"
            >
              {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              Commit Minutes
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function X({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
    </svg>
  );
}
