import React, { useState, useMemo } from 'react';
import { db, type Expense, type Budget } from '../db/db';
import { TrendingUp, Plus, Search, Filter, Download, X, AlertCircle, Calendar, Hash, Zap, ShieldAlert, Fingerprint, Activity, History, Bus, Zap as ZapIcon, Home, Edit2, Trash2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { useSync } from '../hooks/useSync';
import { useTheme } from '../contexts/ThemeContext';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { useUnifiedCollection } from '../hooks/useUnifiedCollection';
import { pb } from '../lib/pocketbase';

const HIGH_SPEND_THRESHOLD = 50000;
const VOTEHEADS = ['Utility', 'Rent', 'Salary', 'Tithe', 'Operations', 'Marketing'];

const QUICK_TAGS: Record<string, string[]> = {
  Utility: ['Electricity', 'Water', 'Internet', 'Transport'],
  Rent: ['Office Space', 'Storage', 'Co-working'],
  Salary: ['Freelance', 'Full-time', 'Bonus'],
  Tithe: ['Ministry', 'Community', 'Project Support'],
  Operations: ['Petty Cash', 'Repairs', 'Cleaning'],
  Marketing: ['Social Ads', 'SEO', 'Print', 'Events']
};

const MONTHLY_BUDGETS: Record<string, number> = {
  Utility: 25000,
  Rent: 55000,
  Salary: 180000,
  Tithe: 15000,
  Operations: 35000,
  Marketing: 45000
};

import { NexusTable } from '../components/NexusTable';
import { useToast } from '../contexts/ToastContext';

export function Expenses() {
  const { theme } = useTheme();
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [tracedTag, setTracedTag] = useState<string | null>(null);
  const { data: expenses } = useUnifiedCollection<Expense>('expenses', () => db.expenses.orderBy('id').reverse().toArray());
  const { data: clients } = useUnifiedCollection<any>('clients', () => db.clients.toArray());
  const { data: payments } = useUnifiedCollection<any>('payments', () => db.payments.toArray());
  const { addEntity, updateEntity, deleteEntity, isOnline } = useSync();
  const { showToast } = useToast();

  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  const totalCollectedRevenue = useMemo(() => {
    if (!payments) return 0;

    let filteredPayments = payments.filter(p => p.status === 'completed');

    if (dateRange.start && dateRange.end) {
      filteredPayments = filteredPayments.filter(p =>
        isWithinInterval(parseISO(p.date), {
          start: parseISO(dateRange.start),
          end: parseISO(dateRange.end)
        })
      );
    } else {
      const now = new Date();
      const interval = { start: startOfMonth(now), end: endOfMonth(now) };
      filteredPayments = filteredPayments.filter(p => isWithinInterval(parseISO(p.date), interval));
    }

    return filteredPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  }, [payments, dateRange]);

  const filteredExpenses = useMemo(() => {
    if (!expenses) return [];
    return expenses.filter(e => {
      const matchesSearch = (e.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (e.sub_tag || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === 'ALL' || e.category === selectedCategory;
      const matchesTag = !tracedTag || e.sub_tag === tracedTag;

      let matchesDate = true;
      if (dateRange.start && dateRange.end) {
        const d = parseISO(e.date);
        matchesDate = isWithinInterval(d, {
          start: parseISO(dateRange.start),
          end: parseISO(dateRange.end)
        });
      }

      return matchesSearch && matchesCategory && matchesTag && matchesDate;
    });
  }, [expenses, searchTerm, selectedCategory, tracedTag, dateRange]);

  const totalMonthlySpend = useMemo(() => {
    return filteredExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  }, [filteredExpenses]);

  const categoryStats = useMemo(() => {
    if (!expenses) return [];
    const now = new Date();
    const interval = { start: startOfMonth(now), end: endOfMonth(now) };

    return VOTEHEADS.map(v => {
      const spent = expenses
        .filter(e => e.category === v && isWithinInterval(parseISO(e.date), interval))
        .reduce((sum, e) => sum + Number(e.amount || 0), 0);

      const revenueShare = totalCollectedRevenue > 0 ? (spent / totalCollectedRevenue) * 100 : 0;
      const totalSpendShare = totalMonthlySpend > 0 ? (spent / totalMonthlySpend) * 100 : 0;

      return { name: v, spent, revenueShare, totalSpendShare };
    });
  }, [expenses, totalMonthlySpend, totalCollectedRevenue]);

  const headers = [
    { label: 'Status', className: 'px-8 text-left' },
    { label: 'Date', className: 'px-8 text-left' },
    { label: 'Context', className: 'px-8 text-left' },
    { label: 'Allocation', className: 'px-8 text-left' },
    { label: 'Tag', className: 'px-8 text-left' },
    { label: 'Debit', className: 'px-8 text-right' },
    { label: 'Trace', className: 'px-8 text-center' },
    { label: 'Actions', className: 'px-8 text-right' },
  ];

  const handleEdit = (expense: Expense) => {
    setEditingExpense(expense);
    setIsModalOpen(true);
  };

  const handleDelete = async (expense: Expense) => {
    setDeletingExpense(expense);
  };

  const confirmDelete = async () => {
    if (!deletingExpense) return;

    try {
      const isPbMode = import.meta.env.VITE_AUTH_MODE === 'pocketbase';

      // 1. PocketBase Deletion
      if (isPbMode && isOnline) {
        // In PB mode, the 'id' field of the record is the PocketBase ID (string)
        const pbId = (deletingExpense as any).id || deletingExpense.pb_id;
        if (pbId && typeof pbId === 'string') {
          await pb.collection('expenses').delete(pbId);
        }
      }

      // 2. Local Dexie Deletion
      if (typeof deletingExpense.id === 'number') {
        await db.expenses.delete(deletingExpense.id);
      } else {
        // If the ID is a string (PB ID), try to find the local record by pb_id
        const pbId = (deletingExpense as any).id || deletingExpense.pb_id;
        if (pbId) {
          const localRecord = await db.expenses.where('pb_id').equals(pbId).first();
          if (localRecord?.id) {
            await db.expenses.delete(localRecord.id);
          }
        }
      }

      showToast('Expenditure record expunged from system', 'success');
    } catch (e) {
      console.error('RAFIKI_ERROR: Failed to expunge expense:', e);
      showToast('Data expungement failure', 'error');
    } finally {
      setDeletingExpense(null);
    }
  };

  return (
    <div className="space-y-12 pb-24 relative">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-text-main uppercase tracking-tighter">Expenditure</h1>
          <p className="text-xs text-accent-green font-bold tracking-[0.2em] uppercase mt-2 drop-shadow-[0_0_8px_rgba(57,255,20,0.5)]">Network Resource Tracking</p>
        </div>
        <div className="flex gap-4">
          {tracedTag && (
            <button
              onClick={() => setTracedTag(null)}
              className="text-[10px] font-black text-red-400 uppercase tracking-[0.2em] border border-red-400/20 px-6 py-2.5 rounded-xl hover:bg-red-400/5 transition-colors flex items-center gap-2"
            >
              <X className="w-3.5 h-3.5" />
              Reset Trace
            </button>
          )}
          <button
            onClick={() => setIsModalOpen(true)}
            className="text-[10px] font-black text-bg-deep uppercase tracking-[0.2em] bg-accent-green px-6 py-2.5 rounded-xl transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(57,255,20,0.3)] flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create Entry
          </button>
        </div>
      </header>

      {/* Filter Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-2 mt-4">
        <div className="relative group lg:col-span-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-dim group-focus-within:text-accent-green transition-colors" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="SEARCH LEDGER..."
            className="w-full bg-bg-deep border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-[10px] font-black text-text-main focus:outline-none focus:border-accent-green/50 uppercase tracking-widest transition-all"
          />
        </div>

        <div className="lg:col-span-1">
          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            className="w-full bg-bg-deep border border-white/5 rounded-2xl py-4 px-5 text-[10px] font-black text-text-main focus:outline-none focus:border-accent-green/50 uppercase tracking-widest appearance-none cursor-pointer"
          >
            <option value="ALL">ALL VOTEHEADS</option>
            {VOTEHEADS.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>

        <div className="lg:col-span-2 grid grid-cols-2 gap-2">
          <div className="relative group">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[8px] font-black text-text-dim uppercase tracking-tighter pointer-events-none">FROM:</span>
            <input
              type="date"
              value={dateRange.start}
              onChange={e => setDateRange({...dateRange, start: e.target.value})}
              className="w-full bg-bg-deep border border-white/5 rounded-2xl py-4 pl-14 pr-4 text-[9px] font-black text-text-main focus:outline-none focus:border-accent-green/50 [color-scheme:dark]"
            />
          </div>
          <div className="relative group">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[8px] font-black text-text-dim uppercase tracking-tighter pointer-events-none">TO:</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={e => setDateRange({...dateRange, end: e.target.value})}
              className="w-full bg-bg-deep border border-white/5 rounded-2xl py-4 pl-10 pr-4 text-[9px] font-black text-text-main focus:outline-none focus:border-accent-green/50 [color-scheme:dark]"
            />
          </div>
        </div>
      </div>

      {/* Treasury Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-panel p-8 rounded-[2rem] border-white/5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-accent-green/5 blur-3xl -mr-16 -mt-16 group-hover:bg-accent-green/10 transition-colors" />
          <p className="text-[10px] font-black text-text-dim uppercase tracking-[0.3em] mb-3">Collected Revenue</p>
          <p className="text-4xl font-black text-accent-green tabular-nums">KSh {totalCollectedRevenue.toLocaleString()}</p>
          <div className="flex items-center gap-2 mt-2 opacity-40">
             <div className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
             <span className="text-[8px] font-black text-text-dim uppercase tracking-widest">
               {dateRange.start ? 'Revenue (Selected Range)' : 'Revenue (Current Month)'}
             </span>
          </div>
        </div>

        <div className="glass-panel p-8 rounded-[2rem] border-white/5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 blur-3xl -mr-16 -mt-16 group-hover:bg-red-500/10 transition-colors" />
          <p className="text-[10px] font-black text-text-dim uppercase tracking-[0.3em] mb-3">Total Expenditure</p>
          <p className="text-4xl font-black text-text-main tabular-nums">KSh {totalMonthlySpend.toLocaleString()}</p>
          <div className="flex items-center gap-2 mt-2 opacity-40">
             <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
             <span className="text-[8px] font-black text-text-dim uppercase tracking-widest">
               {(searchTerm || selectedCategory !== 'ALL' || dateRange.start || tracedTag) ? 'Filtered Outflow' : 'Global Outflow (MTD)'}
             </span>
          </div>
        </div>

        <div className="glass-panel p-8 rounded-[2rem] border-white/5 relative overflow-hidden group border-l-accent-green/30">
          <p className="text-[10px] font-black text-text-dim uppercase tracking-[0.3em] mb-3">Burn Rate Index</p>
          <p className={cn(
            "text-4xl font-black tabular-nums",
            totalCollectedRevenue > 0 && (totalMonthlySpend / totalCollectedRevenue) > 0.8 ? "text-red-500" : "text-text-main"
          )}>
            {totalCollectedRevenue > 0 ? ((totalMonthlySpend / totalCollectedRevenue) * 100).toFixed(1) : '0.0'}%
          </p>
          <div className="flex items-center gap-2 mt-2 opacity-40">
             <div className={cn(
               "w-1.5 h-1.5 rounded-full animate-pulse",
               totalCollectedRevenue > 0 && (totalMonthlySpend / totalCollectedRevenue) > 0.8 ? "bg-red-500" : "bg-accent-green"
             )} />
             <span className="text-[8px] font-black text-text-dim uppercase tracking-widest">Revenue vs Spent</span>
          </div>
        </div>
      </div>

      {/* Burn Rate Heatmap */}
      <section className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        {categoryStats.map(stat => (
          <motion.div
            key={stat.name}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.02 }}
            className={cn(
              "relative p-4 rounded-2xl glass-panel border-white/5 overflow-hidden group transition-all duration-700",
              stat.revenueShare > 30 ? "border-red-500/30" : "border-white/5"
            )}
          >
            <div
              className="absolute inset-0 pointer-events-none opacity-20 group-hover:opacity-40 transition-opacity duration-1000"
              style={{
                background: `radial-gradient(circle at center, ${stat.revenueShare > 30 ? '#ef4444' : '#39ff14'} 0%, transparent ${Math.min(100, stat.revenueShare * 2 + 30)}%)`,
                filter: 'blur(30px)'
              }}
            />
            <div className="relative z-10 space-y-3">
              <div className="flex justify-between items-start">
                <span className="text-[9px] font-black text-text-dim uppercase tracking-widest leading-none">{stat.name}</span>
                <Activity className={cn("w-3 h-3 transition-colors", stat.revenueShare > 30 ? "text-red-500" : "text-accent-green")} />
              </div>
              <div>
                <p className="text-sm font-black text-text-main tabular-nums">KSh {stat.spent.toLocaleString()}</p>
                <div className="flex justify-between items-end mt-1">
                  <span className="text-[8px] font-bold text-text-dim italic">OF REVENUE</span>
                  <span className={cn(
                    "text-[8px] font-black tabular-nums",
                    stat.revenueShare > 30 ? "text-red-500" : "text-accent-green"
                  )}>{stat.revenueShare.toFixed(1)}%</span>
                </div>
              </div>
              <div className="h-1 w-full bg-text-main/5 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, stat.revenueShare)}%` }}
                  className={cn(
                    "h-full transition-all",
                    stat.revenueShare > 30 ? "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]" : "bg-accent-green shadow-neon"
                  )}
                />
              </div>
            </div>
          </motion.div>
        ))}
      </section>

      {/* Unit Trace Visualization */}
      <AnimatePresence>
        {tracedTag && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: 24 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            className="overflow-hidden"
          >
            <div className="glass-panel p-8 rounded-3xl border-accent-green/20 space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-2xl bg-accent-green/10 border border-accent-green/20">
                    <Fingerprint className="w-5 h-5 text-accent-green" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-text-main uppercase italic tracking-tighter">NODE TRACE: {tracedTag}</h2>
                    <p className="text-[9px] text-text-dim font-bold tracking-[0.2em] uppercase">6-Month Fiscal Deviation Matrix</p>
                  </div>
                </div>
                <div className="md:text-right">
                  <p className="text-[9px] font-black text-text-dim uppercase tracking-widest mb-1">Total Vector Mass</p>
                  <p className="text-lg font-black text-accent-green tabular-nums">KSh {filteredExpenses.reduce((sum, e) => sum + e.amount, 0).toLocaleString()}</p>
                </div>
              </div>

              <div className="h-64 w-full">
                <TraceTrendChart tag={tracedTag} expenses={expenses || []} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <NexusTable<Expense>
        data={filteredExpenses || []}
        headers={headers}
        pageSize={4}
        renderRow={(expense) => (
          <tr key={expense.id} className="hover:bg-text-main/[0.02] transition-colors group text-text-main">
            <td className="px-8 py-6">
              <span className={cn(
                "text-[8px] font-black px-2 py-0.5 rounded-full border tracking-widest uppercase",
                expense.synced
                  ? "border-accent-green/20 bg-accent-green/10 text-accent-green shadow-neon"
                  : "border-text-main/10 bg-text-main/5 text-text-dim"
              )}>
                {expense.synced ? "Synced" : "Local"}
              </span>
            </td>
            <td className="px-8 py-6">
              <span className="text-[10px] font-black text-text-main tabular-nums">
                {format(parseISO(expense.date), 'MMM dd, yyyy')}
              </span>
            </td>
            <td className="px-8 py-6">
              <p className="text-sm font-bold text-text-main truncate max-w-xs">{expense.description}</p>
            </td>
            <td className="px-8 py-6">
              <span className="text-[10px] text-text-dim font-black uppercase tracking-widest">
                {expense.category}
              </span>
            </td>
            <td className="px-8 py-6">
              <span className="px-2 py-1 rounded bg-text-main/5 border border-text-main/5 text-[9px] font-bold text-text-dim uppercase tracking-tighter">
                {expense.sub_tag || 'Standard'}
              </span>
            </td>
            <td className="px-8 py-6 text-right font-black text-sm text-accent-green drop-shadow-[0_0_8px_rgba(57,255,20,0.3)] tabular-nums">KSh {expense.amount.toLocaleString()}</td>
            <td className="px-8 py-6 text-center">
              {expense.sub_tag && (
                <button
                  onClick={() => setTracedTag(expense.sub_tag || null)}
                  className={cn(
                    "p-2 rounded-xl transition-all",
                    tracedTag === expense.sub_tag
                      ? "bg-accent-green text-bg-deep shadow-neon scale-110"
                      : "bg-text-main/5 text-text-dim hover:bg-accent-green/10 hover:text-accent-green"
                  )}
                >
                  <History className="w-4 h-4" />
                </button>
              )}
            </td>
            <td className="px-8 py-6 text-right">
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => handleEdit(expense)}
                  className="p-2 rounded-lg bg-text-main/5 hover:bg-accent-green/10 text-text-dim hover:text-accent-green transition-all"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(expense)}
                  className="p-2 rounded-lg bg-text-main/5 hover:bg-red-500/10 text-text-dim hover:text-red-500 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </td>
          </tr>
        )}
      />

      <AnimatePresence>
        {deletingExpense && (
          <ConfirmationModal
            onConfirm={confirmDelete}
            onCancel={() => setDeletingExpense(null)}
            title="Expunge Entry"
            message={`Are you sure you want to permanently remove the record for "${deletingExpense.description}"? This action cannot be reversed within the Rafiki Matrix.`}
          />
        )}
      </AnimatePresence>

      {/* Quick Log Mobile Bar */}
      <div className="md:hidden fixed bottom-6 left-6 right-6 z-50">
        <QuickLogBar onSave={async (exp) => {
          const payload = { ...exp, date: new Date().toISOString().split('T')[0], synced: false } as Expense;
          await addEntity('expenses', payload);
        }} />
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <ExpenseModal
            onClose={() => {
              setIsModalOpen(false);
              setEditingExpense(null);
            }}
            editingExpense={editingExpense}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function TraceTrendChart({ tag, expenses }: { tag: string, expenses: Expense[] }) {
  const chartData = useMemo(() => {
    const data = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const monthDate = subMonths(now, i);
      const start = startOfMonth(monthDate);
      const end = endOfMonth(monthDate);
      const monthlyTotal = expenses
        .filter(e => e.sub_tag === tag && isWithinInterval(parseISO(e.date), { start, end }))
        .reduce((sum, e) => sum + e.amount, 0);
      data.push({ name: format(monthDate, 'MMM'), amount: monthlyTotal });
    }
    return data;
  }, [tag, expenses]);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
        <XAxis
          dataKey="name"
          stroke="#94a3b8"
          fontSize={10}
          fontWeight="bold"
          axisLine={false}
          tickLine={false}
          dy={10}
        />
        <YAxis
          stroke="#94a3b8"
          fontSize={10}
          fontWeight="bold"
          axisLine={false}
          tickLine={false}
          tickFormatter={(val) => `KSh ${val.toLocaleString()}`}
        />
        <Tooltip
          contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '10px', color: '#fff' }}
          itemStyle={{ color: '#39ff14', fontWeight: 'bold' }}
          cursor={{ stroke: '#39ff1430', strokeWidth: 2 }}
        />
        <Line
          type="monotone"
          dataKey="amount"
          stroke="#39ff14"
          strokeWidth={4}
          dot={{ fill: '#39ff14', r: 6, strokeWidth: 0 }}
          activeDot={{ r: 8, stroke: '#121212', strokeWidth: 3 }}
          animationDuration={1000}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function QuickLogBar({ onSave }: { onSave: (exp: Partial<Expense>) => Promise<void> }) {
  const [activeQuickLog, setActiveQuickLog] = useState<{ category: string, tag: string, icon: React.ReactNode } | null>(null);
  const [amount, setAmount] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const QUICK_RECORDS = [
    { category: 'Utility', tag: 'Transport', icon: <Bus className="w-4 h-4" /> },
    { category: 'Utility', tag: 'Internet', icon: <Fingerprint className="w-4 h-4" /> },
    { category: 'Operations', tag: 'Petty Cash', icon: <ZapIcon className="w-4 h-4" /> },
    { category: 'Rent', tag: 'Co-working', icon: <Home className="w-4 h-4" /> },
  ];

  const handleQuickSave = async () => {
    if (!amount || !activeQuickLog) return;
    setIsSaving(true);
    await onSave({
      category: activeQuickLog.category,
      sub_tag: activeQuickLog.tag,
      amount: parseFloat(amount),
      description: `Quick log: ${activeQuickLog.tag}`
    });
    setIsSaving(false);
    setActiveQuickLog(null);
    setAmount('');
  };

  return (
    <div className="glass-panel overflow-hidden border-accent-green/20 rounded-2xl shadow-[0_0_40px_rgba(0,0,0,0.5)]">
      <AnimatePresence mode="wait">
        {!activeQuickLog ? (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            className="flex items-center justify-around p-3 bg-text-main/[0.02]"
          >
            {QUICK_RECORDS.map((rec, i) => (
              <button
                key={i}
                onClick={() => setActiveQuickLog(rec)}
                className="w-10 h-10 rounded-xl bg-text-main/5 border border-text-main/10 flex items-center justify-center text-text-dim hover:bg-accent-green hover:text-bg-deep transition-all"
              >
                {rec.icon}
              </button>
            ))}
          </motion.div>
        ) : (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            className="p-4 flex flex-col gap-3 bg-text-main/[0.05]"
          >
             <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-accent-green/20 text-accent-green">{activeQuickLog.icon}</div>
                  <span className="text-[10px] font-black text-text-main uppercase tracking-widest">{activeQuickLog.tag}</span>
                </div>
                <button onClick={() => setActiveQuickLog(null)}><X className="w-3.5 h-3.5 text-text-dim" /></button>
             </div>
             <div className="flex gap-2">
                <input
                  type="number"
                  autoFocus
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="KSh..."
                  className="flex-1 bg-text-main/5 border border-text-main/10 rounded-xl px-4 py-2 text-xs font-black text-accent-green outline-none focus:border-accent-green"
                />
                <button
                  onClick={handleQuickSave}
                  disabled={isSaving || !amount}
                  className="px-6 rounded-xl bg-accent-green text-bg-deep text-[10px] font-black uppercase tracking-widest shadow-neon"
                >
                  {isSaving ? <ZapIcon className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                </button>
             </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ExpenseModal({ onClose, editingExpense }: { onClose: () => void, editingExpense?: Expense | null }) {
  const { theme } = useTheme();
  const { showToast } = useToast();
  const { addEntity, updateEntity, isOnline } = useSync();
  const { data: clients } = useUnifiedCollection<any>('clients', () => db.clients.toArray());
  const [formData, setFormData] = useState(editingExpense ? {
    description: editingExpense.description,
    amount: editingExpense.amount.toString(),
    tax_amount: editingExpense.tax_amount?.toString() || '',
    category: editingExpense.category,
    sub_tag: editingExpense.sub_tag || '',
    client_id: editingExpense.client_id || '',
    date: editingExpense.date
  } : {
    description: '',
    amount: '',
    tax_amount: '',
    category: 'Utility',
    sub_tag: '',
    client_id: '',
    date: new Date().toISOString().split('T')[0]
  });

  const [isSaving, setIsSaving] = useState(false);

  const currentBudget = MONTHLY_BUDGETS[formData.category] || 1;
  const currentAmount = parseFloat(formData.amount) || 0;
  const impactPercentage = (currentAmount / currentBudget) * 100;
  const isHighSpend = currentAmount > HIGH_SPEND_THRESHOLD;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }

    setIsSaving(true);
    onClose(); // ULTIMATE OPTIMISTIC CLOSE: Vanish instantly

    try {
      const payload: any = {
        ...formData,
        amount: currentAmount,
        tax_amount: parseFloat(formData.tax_amount) || 0,
        synced: false
      };

      if (!payload.client_id) {
        delete payload.client_id;
      }

      if (editingExpense) {
        const targetId = (editingExpense as any).id;

        if (typeof targetId === 'number') {
          await updateEntity('expenses', targetId, payload);
        } else if (typeof targetId === 'string') {
          const local = await db.expenses.where('pb_id').equals(targetId).first();
          if (local?.id) {
            await updateEntity('expenses', local.id, payload);
          }
        }
        showToast('Expenditure record updated', 'success');
      } else {
        await addEntity('expenses', payload);
        showToast('Expenditure record created', 'success');
      }
    } catch (err: any) {
      console.error('Failed to save expense:', err);
      showToast(err?.message || 'System Error: Handshake failed', 'error');
    } finally {
      setIsSaving(false);
    }
  };


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
        className="relative w-full max-w-2xl glass-panel !bg-bg-deep rounded-[2.5rem] border-white/10 shadow-[0_0_80px_rgba(0,0,0,0.6)] overflow-hidden"
      >
        <div className="p-8 border-b border-white/5 flex items-center justify-between bg-text-main/[0.02]">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-2xl bg-accent-green/10 flex items-center justify-center border border-accent-green/20">
              <TrendingUp className="w-5 h-5 text-accent-green" />
            </div>
            <div>
              <h2 className="text-xl font-black text-text-main uppercase tracking-tighter italic">REGISTER FINANCIAL OUTFLOW</h2>
              <p className="text-[8px] text-text-dim font-bold tracking-[0.3em] uppercase mt-1 opacity-60">System Expenditure Ledger Engine</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-text-main/5 hover:bg-text-main/10 text-text-dim transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-10 space-y-10 overflow-y-auto max-h-[80vh]">
          <div className="space-y-4">
            <div className="flex justify-between items-end px-1">
               <label className="text-[9px] font-black text-text-dim uppercase tracking-widest">Quantum Allocation (KSh)</label>
               {isHighSpend && (
                 <motion.div
                   animate={{ x: [0, -5, 5, -5, 5, 0] }}
                   className="flex items-center gap-2 px-3 py-1 bg-[#ffdb00]/10 border border-[#ffdb00]/30 rounded-full"
                 >
                   <ShieldAlert className="w-3 h-3 text-[#ffdb00]" />
                   <span className="text-[9px] font-black text-[#ffdb00] uppercase tracking-tighter">High Spend Warning</span>
                 </motion.div>
               )}
            </div>
            <div className="relative group">
              <span className={cn(
                "absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-black transition-colors duration-500",
                isHighSpend ? "text-[#ffdb00]" : "text-accent-green"
              )}>KSh</span>
              <input
                type="number"
                required
                autoFocus
                value={formData.amount}
                onChange={e => setFormData({...formData, amount: e.target.value})}
                placeholder="0.00"
                className={cn(
                  "w-full bg-bg-deep rounded-[2rem] py-10 pl-24 pr-10 text-6xl font-black focus:outline-none transition-all duration-500 border-2 uppercase",
                  isHighSpend
                    ? "border-[#ffdb00] text-[#ffdb00] shadow-[0_0_30px_rgba(255,219,0,0.1)] outline-[#ffdb00]/20"
                    : "border-accent-green/30 text-accent-green focus:border-accent-green focus:shadow-[0_0_40px_rgba(57,255,20,0.1)]"
                )}
              />
               <div className="absolute -bottom-1 left-8 right-8 h-1 bg-text-main/5 rounded-full overflow-hidden blur-[0.5px]">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, impactPercentage)}%` }}
                    className={cn(
                        "h-full transition-colors duration-500",
                        impactPercentage > 85 ? "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]" :
                        impactPercentage > 50 ? "bg-[#ffdb00]" : "bg-accent-green shadow-neon"
                    )}
                  />
               </div>
            </div>
            <div className="flex justify-between px-8">
              <span className="text-[8px] font-bold text-text-dim uppercase tracking-widest">Monthly Limit Threshold</span>
              <span className="text-[8px] font-black text-text-main tabular-nums">{impactPercentage.toFixed(1)}% CONSUMED</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-[9px] font-black text-text-dim uppercase tracking-widest pl-1">Target Client Assignment</label>
                <select
                  value={formData.client_id}
                  onChange={e => setFormData({...formData, client_id: e.target.value})}
                  className="w-full bg-bg-deep border border-text-main/10 rounded-xl py-4 px-4 text-xs font-bold text-text-main focus:outline-none focus:border-accent-green uppercase"
                >
                  <option value="">INTERNAL (NO CLIENT)</option>
                  {clients?.map(c => (
                    <option key={c.node_id} value={c.node_id}>{c.name} ({c.node_id})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-3">
                <label className="text-[9px] font-black text-text-dim uppercase tracking-widest pl-1">Tax Component (KSh)</label>
                <div className="relative">
                  <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-3 h-3 text-text-dim opacity-30" />
                  <input
                    type="number"
                    value={formData.tax_amount}
                    onChange={e => setFormData({...formData, tax_amount: e.target.value})}
                    placeholder="TAX AMOUNT..."
                    className="w-full bg-bg-deep border border-text-main/10 rounded-xl py-3 pl-10 pr-5 text-xs font-bold text-text-main focus:outline-none focus:border-accent-green"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[9px] font-black text-text-dim uppercase tracking-widest pl-1">Votehead Segmentation</label>
                <div className="grid grid-cols-2 gap-2">
                  {VOTEHEADS.map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setFormData({...formData, category: v, sub_tag: ''})}
                      className={cn(
                        "py-3 px-4 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border",
                        formData.category === v
                          ? "bg-accent-green text-bg-deep border-accent-green shadow-neon"
                          : "bg-text-main/5 text-text-dim border-text-main/5 hover:bg-text-main/10"
                      )}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={formData.category}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="space-y-3"
                >
                  <label className="text-[9px] font-black text-text-dim uppercase tracking-widest pl-1">Dynamic Sub-Tags</label>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {QUICK_TAGS[formData.category].map(tag => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setFormData({...formData, sub_tag: tag})}
                        className={cn(
                          "px-4 py-2 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all border",
                          formData.sub_tag === tag
                            ? "bg-text-main/10 text-accent-green border-accent-green/50 shadow-[0_0_15px_rgba(57,255,20,0.2)]"
                            : "bg-text-main/[0.02] text-text-dim border-text-main/5 hover:border-text-main/20"
                        )}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                      <Search className="w-3 h-3 text-text-dim opacity-30 group-focus-within:text-accent-green transition-colors" />
                    </div>
                    <input
                      type="text"
                      value={formData.sub_tag}
                      onChange={e => setFormData({...formData, sub_tag: e.target.value})}
                      placeholder="ENTER OR EDIT CUSTOM TAG..."
                      className="w-full bg-bg-deep border border-text-main/10 rounded-xl py-3 pl-10 pr-5 text-[10px] font-bold text-text-main focus:outline-none focus:border-accent-green uppercase tracking-widest transition-all"
                    />
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="space-y-6">
               <div className="space-y-2">
                <label className="text-[9px] font-black text-text-dim uppercase tracking-widest ml-1">Allocation Description</label>
                <textarea
                  required
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  placeholder="ENTER LEDGER CONTEXT..."
                  rows={3}
                  className="w-full bg-bg-deep border border-text-main/10 rounded-2xl py-4 px-5 text-xs font-bold text-text-main focus:outline-none focus:border-accent-green uppercase tracking-widest"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[9px] font-black text-text-dim uppercase tracking-widest ml-1">Debit Date</label>
                <input
                  type="date"
                  required
                  value={formData.date}
                  onChange={e => setFormData({...formData, date: e.target.value})}
                  className={cn(
                    "w-full bg-bg-deep border border-text-main/10 rounded-xl py-4 px-4 text-[10px] font-black text-text-main focus:outline-none focus:border-accent-green uppercase tracking-widest",
                    theme === 'dark' ? "[color-scheme:dark]" : "[color-scheme:light]"
                  )}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-10 border-t border-white/5">
            <span className="text-[8px] font-black text-text-dim uppercase tracking-[.4rem] opacity-40 italic">Handshake Pending</span>
            <button
              type="submit"
              disabled={isSaving}
              className="px-14 py-5 bg-accent-green text-bg-deep rounded-2xl font-black uppercase tracking-[.2rem] text-[11px] shadow-neon hover:scale-105 active:scale-95 transition-all flex items-center gap-3"
            >
              {isSaving ? <ZapIcon className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {editingExpense ? 'Update Entry' : 'Commit Entry'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function ConfirmationModal({ onConfirm, onCancel, title, message }: { onConfirm: () => void, onCancel: () => void, title: string, message: string }) {
  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onCancel}
        className="absolute inset-0 bg-bg-deep/95 backdrop-blur-xl"
      />
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="relative w-full max-w-md bg-bg-deep/50 border border-red-500/30 rounded-[3rem] p-12 text-center shadow-[0_0_100px_rgba(239,68,68,0.2)] overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent" />

        <div className="w-20 h-20 rounded-3xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-8 relative">
          <div className="absolute inset-0 bg-red-500/20 blur-2xl animate-pulse rounded-full" />
          <AlertTriangle className="w-10 h-10 text-red-500 relative z-10" />
        </div>

        <h2 className="text-2xl font-black text-text-main uppercase tracking-tighter mb-4">{title}</h2>
        <p className="text-[11px] text-text-dim font-bold leading-relaxed uppercase tracking-[0.2em] mb-10 opacity-60">
          {message}
        </p>

        <div className="grid grid-cols-1 gap-4">
          <button
            type="button"
            onClick={() => {
              console.log("Confirmation initiated");
              onConfirm();
            }}
            className="w-full py-5 rounded-2xl bg-red-500 text-bg-deep text-[11px] font-black uppercase tracking-[0.3em] shadow-[0_0_30px_rgba(239,68,68,0.4)] hover:scale-[1.02] active:scale-95 transition-all"
          >
            Confirm & Expunge
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full py-5 rounded-2xl border border-white/10 text-[10px] font-black text-text-dim uppercase tracking-widest hover:bg-white/5 transition-all active:scale-95"
          >
            Abort Protocol
          </button>
        </div>
      </motion.div>
    </div>
  );
}
