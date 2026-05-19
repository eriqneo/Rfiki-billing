import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { PieChart, Download, Calendar, ArrowUpRight, ArrowDownRight, Activity, Filter, Users, Tag, TrendingUp, ShieldCheck, Zap, Building2, CheckCircle2, FileText, TableProperties } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { NexusTable } from '../components/NexusTable';
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval, parseISO, startOfDay, endOfDay, addDays, isBefore } from 'date-fns';
import { useUnifiedCollection } from '../hooks/useUnifiedCollection';
import { type Expense, type Payment, type PaymentPromise, type Client, type PocketHostInstance } from '../db/db';
import { getVoteheadsFromBudgetsAndExpenses } from '../services/voteheadService';

interface MonthlyReport {
  id: string;
  month: string;
  revenue: number;
  expenses: number;
  profit: number;
  margin: string;
}

function safeMoneyValue(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function isDueWithinNext30Days(value?: string) {
  if (!value) return false;
  const dueDate = parseISO(value);
  if (Number.isNaN(dueDate.getTime())) return false;
  const now = new Date();
  const next30Days = addDays(now, 30);
  return !isBefore(dueDate, startOfDay(now)) && isBefore(dueDate, next30Days);
}

export function Reports() {
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [filterClient, setFilterClient] = useState('all');
  const [filterVotehead, setFilterVotehead] = useState('all');
  const [isExportOpen, setIsExportOpen] = useState(false);

  const { data: expenses } = useUnifiedCollection<Expense>('expenses', () => db.expenses.toArray());
  const { data: payments } = useUnifiedCollection<Payment>('payments', () => db.payments.where('status').equals('completed').toArray());
  const { data: promises } = useUnifiedCollection<PaymentPromise>('billing_promises', () => db.billing_promises.where('status').equals('pending').toArray());
  const { data: clients } = useUnifiedCollection<Client>('clients', () => db.clients.toArray());
  const { data: instances } = useUnifiedCollection<PocketHostInstance>('pocket_host_instances', () => db.pocket_host_instances.toArray());
  const budgets = useLiveQuery(() => db.budgets.toArray());
  const voteheads = useMemo(() => getVoteheadsFromBudgetsAndExpenses(budgets, expenses), [budgets, expenses]);

  const filteredData = useMemo(() => {
    if (!expenses || !payments) return { expenses: [], payments: [] };

    let filteredExpenses = [...expenses];
    let filteredPayments = [...payments];

    // Filter by Date Range
    if (dateStart && dateEnd) {
      const interval = { start: startOfDay(new Date(dateStart)), end: endOfDay(new Date(dateEnd)) };
      filteredExpenses = filteredExpenses.filter(e => isWithinInterval(parseISO(e.date), interval));
      filteredPayments = filteredPayments.filter(p => isWithinInterval(parseISO(p.date), interval));
    }

    // Filter by Client
    if (filterClient !== 'all') {
      filteredPayments = filteredPayments.filter(p => p.client_id === filterClient);
    }

    // Filter by Votehead
    if (filterVotehead !== 'all') {
      filteredExpenses = filteredExpenses.filter(e => e.category === filterVotehead);
    }

    return { expenses: filteredExpenses, payments: filteredPayments };
  }, [expenses, payments, dateStart, dateEnd, filterClient, filterVotehead]);

  const reportsData = useMemo(() => {
    const data: MonthlyReport[] = [];
    const now = new Date();

    for (let i = 0; i < 12; i++) {
      const monthDate = subMonths(now, i);
      const start = startOfMonth(monthDate);
      const end = endOfMonth(monthDate);
      const interval = { start, end };

      const monthlyRevenue = filteredData.payments
        .filter(p => isWithinInterval(parseISO(p.date), interval))
        .reduce((sum, p) => sum + safeMoneyValue(p.amount), 0);

      const monthlyExpenses = filteredData.expenses
        .filter(e => isWithinInterval(parseISO(e.date), interval))
        .reduce((sum, e) => sum + safeMoneyValue(e.amount), 0);

      const profit = monthlyRevenue - monthlyExpenses;
      const margin = monthlyRevenue > 0 ? ((profit / monthlyRevenue) * 100).toFixed(1) : '0.0';

      data.push({
        id: format(monthDate, 'yyyy-MM'),
        month: format(monthDate, 'MMMM yyyy'),
        revenue: monthlyRevenue,
        expenses: monthlyExpenses,
        profit: profit,
        margin: `${margin}%`
      });
    }

    return data;
  }, [filteredData]);

  const totalRevenue = useMemo(() => filteredData.payments.reduce((sum, p) => sum + safeMoneyValue(p.amount), 0), [filteredData]);
  const totalExpenses = useMemo(() => filteredData.expenses.reduce((sum, e) => sum + safeMoneyValue(e.amount), 0), [filteredData]);
  const netSurplus = totalRevenue - totalExpenses;

  const forecastMetrics = useMemo(() => {
    if (!promises || !payments || !instances) return { projected: 0, actual: 0, efficiency: 0 };
    
    const projectedRevenue = promises
      .filter(p => isDueWithinNext30Days(p.due_date))
      .reduce((sum, p) => sum + safeMoneyValue(p.amount_due), 0);

    const hostRevenue = instances
      .filter(i => i.status === 'active' && i.client_id)
      .reduce((sum, i) => {
        const fee = safeMoneyValue(i.monthly_fee);
        const cycle = i.billing_cycle || 'monthly';
        if (cycle === 'monthly') return sum + fee;
        if (cycle === 'quarterly') return sum + (fee / 3);
        if (cycle === 'semi-annual') return sum + (fee / 6);
        if (cycle === 'yearly') return sum + (fee / 12);
        return sum + fee;
      }, 0);
    
    const totalPromised = promises.reduce((sum, p) => sum + safeMoneyValue(p.amount_due), 0) +
      payments.reduce((sum, p) => sum + safeMoneyValue(p.amount), 0) +
      hostRevenue;
    const collectionEfficiency = totalPromised > 0 ? Math.min(100, (totalRevenue / totalPromised) * 100) : 0;

    return {
      projected: projectedRevenue + hostRevenue,
      actual: totalRevenue,
      efficiency: collectionEfficiency
    };
  }, [promises, payments, instances, totalRevenue]);

  const unitEconomyData = useMemo(() => {
    if (!clients || !expenses || !payments) return [];

    return clients.map(client => {
      const clientRevenue = payments
        .filter(p => p.client_id === client.node_id)
        .reduce((sum, p) => sum + safeMoneyValue(p.amount), 0);
      
      const clientExpenses = expenses
        .filter(e => e.client_id === client.node_id)
        .reduce((sum, e) => sum + safeMoneyValue(e.amount), 0);
      
      const netProfit = clientRevenue - clientExpenses;
      const margin = clientRevenue > 0 ? (netProfit / clientRevenue) * 100 : 0;

      return {
        ...client,
        revenue: clientRevenue,
        expenses: clientExpenses,
        profit: netProfit,
        margin: margin
      };
    }).sort((a, b) => b.profit - a.profit);
  }, [clients, expenses, payments]);

  const headers = [
    { label: 'Reporting Period', className: 'px-8 text-left' },
    { label: 'Gross Revenue', className: 'px-8 text-right' },
    { label: 'Operating Cost', className: 'px-8 text-right' },
    { label: 'Net Profit', className: 'px-8 text-right' },
    { label: 'Margin', className: 'px-8 text-center' },
  ];

  const handleExportCSV = () => {
    const csvRows = [];
    csvRows.push(['Reporting Period', 'Gross Revenue (KSh)', 'Operating Cost (KSh)', 'Net Profit (KSh)', 'Margin']);
    reportsData.forEach(r => {
      csvRows.push([r.month, r.revenue, r.expenses, r.profit, r.margin]);
    });
    const csvContent = csvRows.map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Rafiki_Financial_Report_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsExportOpen(false);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(22);
    doc.setTextColor(57, 255, 20); // accent-green
    doc.text('RAFIKI BUSINESS MANAGER', 14, 22);
    
    doc.setFontSize(10);
    doc.setTextColor(150, 150, 150);
    doc.text(`FINANCIAL SUMMARY REPORT - ${format(new Date(), 'PPP').toUpperCase()}`, 14, 30);

    // Global Metrics Summary
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Global Revenue: KSh ${totalRevenue.toLocaleString()}`, 14, 45);
    doc.text(`Operating Expenditure: KSh ${totalExpenses.toLocaleString()}`, 14, 52);
    doc.text(`Net Profit: KSh ${netSurplus.toLocaleString()}`, 14, 59);

    // Timeline Table
    const tableData = reportsData.map(r => [
      r.month, 
      `KSh ${r.revenue.toLocaleString()}`, 
      `KSh ${r.expenses.toLocaleString()}`, 
      `KSh ${r.profit.toLocaleString()}`, 
      r.margin
    ]);

    autoTable(doc, {
      startY: 70,
      head: [['FISCAL PERIOD', 'GROSS REVENUE', 'OPERATING COST', 'NET YIELD', 'EFFICIENCY']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [15, 15, 15], textColor: [57, 255, 20], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { textColor: [50, 50, 50], fontSize: 8 },
      alternateRowStyles: { fillColor: [245, 245, 245] }
    });

    doc.save(`Rafiki_Financial_Report_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    setIsExportOpen(false);
  };

  return (
    <div className="space-y-12 pb-24 relative">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-text-main uppercase tracking-tighter">Reports & Analytics</h1>
          <p className="text-xs text-accent-green font-bold tracking-[0.2em] uppercase mt-1 drop-shadow-[0_0_8px_rgba(57,255,20,0.5)] flex items-center gap-2">
            <TrendingUp className="w-3 h-3" />
            Financial overview
          </p>
        </div>
        <div className="relative">
          <button 
            onClick={() => setIsExportOpen(!isExportOpen)}
            className="text-[10px] font-black text-bg-deep uppercase tracking-[0.2em] bg-accent-green px-6 py-2.5 rounded-xl transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(57,255,20,0.3)] flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Export Dataset
          </button>

          <AnimatePresence>
            {isExportOpen && (
              <motion.div 
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute right-0 top-full mt-3 w-56 glass-panel !bg-bg-deep/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50"
              >
                <div className="p-2 space-y-1">
                  <button 
                    onClick={handleExportCSV}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-text-main/5 transition-all rounded-xl text-left group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-text-main/5 flex items-center justify-center group-hover:text-accent-green transition-colors">
                      <TableProperties className="w-4 h-4 text-text-dim group-hover:text-accent-green" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-text-main uppercase tracking-widest group-hover:text-accent-green transition-colors">Excel / CSV</p>
                      <p className="text-[8px] text-text-dim font-bold uppercase tracking-widest">Spreadsheet export</p>
                    </div>
                  </button>
                  <button 
                    onClick={handleExportPDF}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-text-main/5 transition-all rounded-xl text-left group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-text-main/5 flex items-center justify-center group-hover:text-red-400 transition-colors">
                      <FileText className="w-4 h-4 text-text-dim group-hover:text-red-400" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-text-main uppercase tracking-widest group-hover:text-red-400 transition-colors">PDF Document</p>
                      <p className="text-[8px] text-text-dim font-bold uppercase tracking-widest">Executive Summary</p>
                    </div>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* Advanced Multi-Filtering */}
      <section className="glass-panel p-6 rounded-3xl border-white/5 bg-text-main/[0.02]">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
             <Filter className="w-4 h-4 text-accent-green" />
             <span className="text-[10px] font-black text-text-dim uppercase tracking-widest">Filters:</span>
          </div>

          <div className="flex flex-wrap gap-4 flex-1">
             <div className="flex items-center gap-2 bg-text-main/5 p-1 rounded-xl border border-white/5">
                <Calendar className="w-3.5 h-3.5 text-text-dim ml-2" />
                <input 
                  type="date"
                  value={dateStart}
                  onChange={(e) => setDateStart(e.target.value)}
                  className="bg-transparent text-[10px] font-bold text-text-main p-1 focus:outline-none uppercase"
                />
                <span className="text-[10px] text-text-dim px-1">TO</span>
                <input 
                  type="date"
                  value={dateEnd}
                  onChange={(e) => setDateEnd(e.target.value)}
                  className="bg-transparent text-[10px] font-bold text-text-main p-1 focus:outline-none uppercase mr-2"
                />
             </div>

              <div className="flex items-center gap-2 bg-text-main/5 p-1 rounded-xl border border-white/5 px-4 min-w-[200px]">
                <Users className="w-3.5 h-3.5 text-text-dim" />
                <select 
                  value={filterClient}
                  onChange={(e) => setFilterClient(e.target.value)}
                  className="bg-transparent text-[10px] font-bold text-text-main focus:outline-none uppercase w-full cursor-pointer"
                >
                  <option value="all" className="bg-bg-deep">ALL CLIENTS</option>
                  {clients?.map(c => (
                    <option key={c.node_id} value={c.node_id} className="bg-bg-deep">{c.name}</option>
                  ))}
                </select>
             </div>

             <div className="flex items-center gap-2 bg-text-main/5 p-1 rounded-xl border border-white/5 px-4 min-w-[180px]">
                <Tag className="w-3.5 h-3.5 text-text-dim" />
                <select 
                  value={filterVotehead}
                  onChange={(e) => setFilterVotehead(e.target.value)}
                  className="bg-transparent text-[10px] font-bold text-text-main focus:outline-none uppercase w-full cursor-pointer"
                >
                  <option value="all" className="bg-bg-deep">ALL VOTEHEADS</option>
                  {voteheads.map(v => (
                    <option key={v} value={v} className="bg-bg-deep">{v}</option>
                  ))}
                </select>
             </div>
          </div>

          <button 
            onClick={() => {
              setDateStart('');
              setDateEnd('');
              setFilterClient('all');
              setFilterVotehead('all');
            }}
            className="text-[9px] font-black text-text-dim uppercase tracking-widest hover:text-accent-green transition-colors"
          >
            Clear Filters
          </button>
        </div>
      </section>

      {/* Economic Health Dashboard */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-panel p-8 rounded-3xl border-white/5 space-y-4 relative overflow-hidden group">
           <div className="absolute top-0 right-0 w-32 h-32 bg-accent-green/10 blur-[60px] translate-x-12 -translate-y-12" />
           <div className="flex justify-between items-start">
              <span className="text-[10px] font-black text-text-dim uppercase tracking-[0.2em]">Total Revenue</span>
              <ArrowUpRight className="w-5 h-5 text-accent-green" />
           </div>
           <p className="text-4xl font-black text-accent-green tabular-nums tracking-tighter drop-shadow-[0_0_15px_rgba(57,255,20,0.4)]">
             KSh {totalRevenue.toLocaleString()}
           </p>
           <div className="text-[9px] font-bold text-text-dim uppercase tracking-widest">Total money received</div>
        </div>

        <div className="glass-panel p-8 rounded-3xl border-white/5 space-y-4 bg-text-main/[0.01] relative overflow-hidden group scale-105 shadow-2xl z-10">
           <div className="flex flex-col items-center text-center space-y-4">
              <span className="text-[11px] font-black text-text-dim uppercase tracking-[0.3em]">Net Profit</span>
              <p className={cn(
                "text-5xl font-black tabular-nums tracking-tighter transition-all",
                netSurplus >= 0 
                  ? "text-accent-green drop-shadow-[0_0_25px_rgba(57,255,20,0.6)]" 
                  : "text-red-500 drop-shadow-[0_0_25px_rgba(239,68,68,0.6)]"
              )}>
                KSh {netSurplus.toLocaleString()}
              </p>
              <div className="flex items-center gap-2">
                 <div className={cn(
                   "w-2 h-2 rounded-full animate-pulse",
                   netSurplus >= 0 ? "bg-accent-green shadow-[0_0_10px_#39ff14]" : "bg-red-500 shadow-[0_0_10px_#ef4444]"
                 )} />
                 <span className={cn(
                   "text-[10px] font-black uppercase tracking-widest",
                   netSurplus >= 0 ? "text-accent-green" : "text-red-500"
                 )}>
                   {netSurplus >= 0 ? 'Business is profitable' : 'Costs are higher than revenue'}
                 </span>
              </div>
           </div>
        </div>

        <div className="glass-panel p-8 rounded-3xl border-white/5 space-y-4 bg-text-main/[0.01] relative overflow-hidden group">
           <div className="absolute top-0 right-0 w-32 h-32 bg-cyber-mustard/10 blur-[60px] translate-x-12 -translate-y-12" />
           <div className="flex justify-between items-start">
              <span className="text-[10px] font-black text-text-dim uppercase tracking-[0.2em]">Operating Expenditure</span>
              <ArrowDownRight className="w-5 h-5 text-cyber-mustard" />
           </div>
           <p className="text-4xl font-black text-cyber-mustard tabular-nums tracking-tighter drop-shadow-[0_0_15px_rgba(255,215,0,0.4)]">
             KSh {totalExpenses.toLocaleString()}
           </p>
           <div className="text-[9px] font-bold text-text-dim uppercase tracking-widest">Total money spent</div>
        </div>
      </section>
      
      {/* 30-Day Revenue Forecast */}
      <section className="glass-panel p-10 rounded-[2.5rem] border-white/5 space-y-8 bg-bg-deep/60 backdrop-blur-xl">
         <div className="flex items-center justify-between">
            <div className="space-y-1">
               <h2 className="text-xl font-black text-text-main uppercase tracking-tight italic">30-Day Revenue Forecast</h2>
               <p className="text-[10px] font-bold text-text-dim uppercase tracking-[0.2em]">Expected income over the next month</p>
            </div>
            <div className="flex items-center gap-4 px-6 py-3 bg-accent-green/10 rounded-2xl border border-accent-green/20 shadow-neon">
               <div className="flex flex-col">
                  <span className="text-[8px] font-black text-accent-green uppercase tracking-widest">Collection Efficiency</span>
                  <span className="text-lg font-black text-accent-green tabular-nums">{forecastMetrics.efficiency.toFixed(1)}%</span>
               </div>
               <div className="w-12 h-12 rounded-full border-2 border-accent-green/20 flex items-center justify-center relative overflow-hidden">
                  <motion.div 
                    initial={{ height: 0 }}
                    animate={{ height: `${forecastMetrics.efficiency}%` }}
                    className="absolute bottom-0 w-full bg-accent-green/40 shadow-neon"
                  />
                  <ShieldCheck className="w-5 h-5 text-accent-green relative z-10" />
               </div>
            </div>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="glass-panel !bg-text-main/5 p-8 rounded-3xl border-dashed border-white/10 space-y-4 shadow-xl">
               <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-text-main/5 flex items-center justify-center">
                     <CheckCircle2 className="w-5 h-5 text-accent-green shadow-neon" />
                  </div>
                  <div>
                     <p className="text-[9px] font-black text-text-dim uppercase tracking-widest">Confirmed Cash</p>
                     <p className="text-xl font-black text-text-main tabular-nums italic">KSh {forecastMetrics.actual.toLocaleString()}</p>
                  </div>
               </div>
                <p className="text-[9px] text-text-dim uppercase font-bold tracking-[0.1em] leading-relaxed">Verified payments successfully recorded within the current period.</p>
            </div>

            <div className="glass-panel !bg-accent-green/5 p-8 rounded-3xl border border-accent-green/20 space-y-4 shadow-[0_0_50px_rgba(57,255,20,0.1)]">
               <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-accent-green/10 flex items-center justify-center border border-accent-green/20">
                     <TrendingUp className="w-5 h-5 text-accent-green" />
                  </div>
                  <div>
                     <p className="text-[9px] font-black text-accent-green uppercase tracking-widest">Projected Revenue</p>
                     <p className="text-xl font-black text-accent-green tabular-nums italic drop-shadow-neon">KSh {forecastMetrics.projected.toLocaleString()}</p>
                  </div>
               </div>
               <p className="text-[9px] text-accent-green/70 uppercase font-bold tracking-[0.1em] leading-relaxed">Expected income from due client payments and active hosting within the next 30 days.</p>
            </div>
         </div>
      </section>

      {/* Flow Visualization (Simplified Sankey-style SVG) */}
      <section className="glass-panel p-10 rounded-[2.5rem] border-white/5 space-y-8 bg-text-main/[0.01]">
         <div className="flex items-center justify-between">
            <div className="space-y-1">
               <h2 className="text-xl font-black text-text-main uppercase tracking-tight">Economic Flow Map</h2>
               <p className="text-[10px] font-bold text-text-dim uppercase tracking-[0.2em]">How money moves through the business</p>
            </div>
            <div className="flex gap-4">
               <div className="flex items-center gap-2">
                  <div className="w-3 h-1.5 rounded-full bg-accent-green" />
                  <span className="text-[8px] font-black text-text-dim uppercase tracking-widest">Revenue</span>
               </div>
               <div className="flex items-center gap-2">
                  <div className="w-3 h-1.5 rounded-full bg-cyber-mustard" />
                  <span className="text-[8px] font-black text-text-dim uppercase tracking-widest">Expenses</span>
               </div>
            </div>
         </div>

         <div className="relative h-[300px] w-full flex items-center">
            <svg className="w-full h-full" viewBox="0 0 800 300" preserveAspectRatio="none">
               {/* Gradients */}
               <defs>
                  <linearGradient id="flow-rev" x1="0%" y1="0%" x2="100%" y2="0%">
                     <stop offset="0%" stopColor="#39ff14" stopOpacity="0.8" />
                     <stop offset="100%" stopColor="#39ff14" stopOpacity="0.2" />
                  </linearGradient>
                  <linearGradient id="flow-exp" x1="0%" y1="0%" x2="100%" y2="0%">
                     <stop offset="0%" stopColor="#39ff14" stopOpacity="0.2" />
                     <stop offset="50%" stopColor="#FFD700" stopOpacity="0.5" />
                     <stop offset="100%" stopColor="#FFD700" stopOpacity="0.8" />
                  </linearGradient>
                  <linearGradient id="flow-profit" x1="0%" y1="0%" x2="100%" y2="0%">
                     <stop offset="0%" stopColor="#39ff14" stopOpacity="0.2" />
                     <stop offset="100%" stopColor="#39ff14" stopOpacity="0.8" />
                  </linearGradient>
               </defs>

               {/* Paths */}
               <motion.path 
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 1.5, ease: "easeInOut" }}
                  d="M 150 150 C 300 150, 400 50, 650 50" 
                  fill="none" 
                  stroke="url(#flow-exp)" 
                  strokeWidth="60" 
                  strokeLinecap="round"
                  className="opacity-40"
               />
               <motion.path 
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 1.5, ease: "easeInOut", delay: 0.2 }}
                  d="M 150 150 C 300 150, 400 250, 650 250" 
                  fill="none" 
                  stroke="url(#flow-profit)" 
                  strokeWidth="40" 
                  strokeLinecap="round"
                  className="opacity-40"
               />

               {/* Summary boxes */}
                <g>
                  {/* Revenue box */}
                  <rect x="50" y="100" width="100" height="100" rx="15" fill="var(--bg-deep)" stroke="#39ff14" strokeWidth="2" />
                  <text x="100" y="145" textAnchor="middle" fill="#39ff14" fontSize="10" fontWeight="900" className="uppercase tracking-widest">Revenue</text>
                  <text x="100" y="165" textAnchor="middle" fill="currentColor" fontSize="12" fontWeight="900" className="tabular-nums">
                    {Math.round(totalRevenue/1000)}K
                  </text>
                  
                  {/* Expense box */}
                  <rect x="650" y="20" width="100" height="60" rx="12" fill="var(--bg-deep)" stroke="#FFD700" strokeWidth="2" />
                  <text x="700" y="45" textAnchor="middle" fill="#FFD700" fontSize="8" fontWeight="900" className="uppercase tracking-widest">Expenses</text>
                  <text x="700" y="60" textAnchor="middle" fill="currentColor" fontSize="11" fontWeight="900" className="tabular-nums">
                    {Math.round(totalExpenses/1000)}K
                  </text>

                  {/* Profit box */}
                  <rect x="650" y="220" width="100" height="60" rx="12" fill="var(--bg-deep)" stroke="#39ff14" strokeWidth="2" />
                  <text x="700" y="245" textAnchor="middle" fill="#39ff14" fontSize="8" fontWeight="900" className="uppercase tracking-widest">Profit</text>
                  <text x="700" y="260" textAnchor="middle" fill="currentColor" fontSize="11" fontWeight="900" className="tabular-nums">
                    {Math.round(netSurplus/1000)}K
                  </text>
               </g>
            </svg>
            
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
               <div className="w-[1px] h-full bg-text-main/5 dash-line" />
            </div>
         </div>
      </section>

      {/* Client Profitability */}
      <section className="space-y-6">
         <div className="flex items-center justify-between">
            <div className="space-y-1">
               <h2 className="text-xl font-black text-text-main uppercase tracking-tight">Unit Economy Analysis</h2>
               <p className="text-[10px] font-bold text-text-dim uppercase tracking-[0.2em]">Client Profitability Analysis</p>
            </div>
            <div className="flex gap-4">
               <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-accent-green shadow-neon" />
                  <span className="text-[8px] font-black text-text-dim uppercase tracking-widest">Healthy margin</span>
               </div>
               <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-cyber-mustard animate-pulse shadow-[0_0_10px_#FFD700]" />
                  <span className="text-[8px] font-black text-text-dim uppercase tracking-widest">Low margin</span>
               </div>
            </div>
         </div>

         <NexusTable<any>
            data={unitEconomyData}
            pageSize={6}
            headers={[
               { label: 'Client / System built', className: 'px-8 text-left' },
               { label: 'Client Revenue', className: 'px-8 text-right' },
               { label: 'Client Expenses', className: 'px-8 text-right' },
               { label: 'Net Profit', className: 'px-8 text-right' },
               { label: 'ROI Margin', className: 'px-8 text-center' },
            ]}
            renderRow={(client) => {
               const isLowYield = client.margin < 15 && client.revenue > 0;
               return (
                  <tr key={client.node_id} className={cn(
                    "hover:bg-text-main/[0.02] transition-colors group text-text-main",
                    isLowYield && "border-l-4 border-l-cyber-mustard bg-cyber-mustard/[0.02]"
                  )}>
                     <td className="px-8 py-6">
                        <div className="flex items-center gap-3">
                           <div className="w-8 h-8 rounded-lg bg-text-main/5 flex items-center justify-center border border-white/5">
                              {client.entity_type === 'COMPANY' ? <Building2 className="w-4 h-4 text-text-dim" /> : <Users className="w-4 h-4 text-text-dim" />}
                           </div>
                           <div className="flex flex-col">
                              <span className="text-xs font-black uppercase tracking-tight">{client.name}</span>
                              <span className="text-[8px] font-black text-accent-green/70 uppercase opacity-60 italic">{client.app_built || 'Unclassified App'}</span>
                           </div>
                        </div>
                     </td>
                     <td className="px-8 py-6 text-right font-black text-sm text-text-main tabular-nums">
                        KSh {client.revenue.toLocaleString()}
                     </td>
                     <td className="px-8 py-6 text-right font-bold text-sm text-text-dim tabular-nums">
                        KSh {client.expenses.toLocaleString()}
                     </td>
                     <td className={cn(
                        "px-8 py-6 text-right font-black text-sm tabular-nums",
                        client.profit >= 0 ? "text-accent-green" : "text-red-500"
                     )}>
                        KSh {client.profit.toLocaleString()}
                     </td>
                     <td className="px-8 py-6 text-center">
                        <div className="flex items-center justify-center gap-2">
                           <span className={cn(
                              "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border",
                              isLowYield ? "bg-cyber-mustard/10 text-cyber-mustard border-cyber-mustard/20" : 
                              client.margin >= 30 ? "bg-accent-green/10 text-accent-green border-accent-green/20" : 
                              "bg-text-main/5 text-text-dim border-text-main/5"
                           )}>
                              {client.margin.toFixed(1)}%
                           </span>
                           {isLowYield && <Zap className="w-3.5 h-3.5 text-cyber-mustard animate-pulse" />}
                        </div>
                     </td>
                  </tr>
               );
            }}
         />
      </section>

      <div className="space-y-6">
         <div className="flex items-center justify-between">
            <div className="space-y-1">
               <h2 className="text-xl font-black text-text-main uppercase tracking-tight">Monthly Summary</h2>
               <p className="text-[10px] font-bold text-text-dim uppercase tracking-[0.2em]">Last 12 months</p>
            </div>
         </div>
         <NexusTable<MonthlyReport>
        data={reportsData}
        headers={headers}
        pageSize={4}
        emptyState={
          <div className="py-20 text-center">
            <PieChart className="w-12 h-12 text-text-dim mx-auto mb-4 opacity-20" />
            <p className="text-[10px] font-black text-text-dim uppercase tracking-[0.2em]">Not enough report data yet</p>
          </div>
        }
        renderRow={(report) => (
          <tr key={report.id} className="hover:bg-text-main/[0.02] transition-colors group text-text-main">
            <td className="px-8 py-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-text-main/5 flex items-center justify-center border border-border">
                  <Calendar className="w-4 h-4 text-text-dim" />
                </div>
                <span className="text-xs font-black uppercase tracking-tight">{report.month}</span>
              </div>
            </td>
            <td className="px-8 py-6 text-right font-black text-sm text-text-main tabular-nums">
              KSh {report.revenue.toLocaleString()}
            </td>
            <td className="px-8 py-6 text-right font-bold text-sm text-text-dim tabular-nums">
              KSh {report.expenses.toLocaleString()}
            </td>
            <td className={cn(
               "px-8 py-6 text-right font-black text-sm tabular-nums",
               report.profit >= 0 ? "text-accent-green" : "text-red-500"
            )}>
              KSh {report.profit.toLocaleString()}
            </td>
            <td className="px-8 py-6 text-center">
              <span className={cn(
                "px-3 py-1 rounded-full bg-text-main/5 border border-text-main/5 text-[9px] font-black uppercase tracking-widest",
                report.profit >= 0 ? "text-accent-green shadow-neon" : "text-red-500"
              )}>
                {report.margin}
              </span>
            </td>
          </tr>
        )}
      />
    </div>
    </div>
  );
}
