import React, { useMemo } from 'react';
import { db } from '../db/db';
import { AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GreetingBanner } from '../components/GreetingBanner';
import { cn } from '../lib/utils';
import { useUnifiedCollection } from '../hooks/useUnifiedCollection';
import { useLiveQuery } from 'dexie-react-hooks';

function sameClient(recordClientId: unknown, client: any) {
  const candidate = String(recordClientId || '');
  return candidate === String(client.node_id || '') || candidate === String(client.id || '');
}

function dateKey(value?: string) {
  if (!value) return '';
  return String(value).includes('T') ? String(value).split('T')[0] : String(value).slice(0, 10);
}

export function Dashboard({ setView }: { setView: (view: any) => void }) {
  const { data: expenses } = useUnifiedCollection<any>('expenses', () => db.expenses.toArray());
  const { data: payments } = useUnifiedCollection<any>('payments', () => db.payments.toArray());
  const { data: agreements } = useUnifiedCollection<any>('agreements', () => db.agreements.toArray());
  const { data: instances } = useUnifiedCollection<any>('pocket_host_instances', () => db.pocket_host_instances.toArray());
  const { data: billingPromises } = useUnifiedCollection<any>('billing_promises', () => db.billing_promises.toArray());
  const { data: invoices } = useUnifiedCollection<any>('invoices', () => db.invoices.toArray());
  const { data: quotations } = useUnifiedCollection<any>('quotations', () => db.quotations.toArray());
  const { data: meetings } = useUnifiedCollection<any>('meetings', () => db.meetings.toArray());
  const { data: clients } = useUnifiedCollection<any>('clients', () => db.clients.toArray());
  const syncQueue = useLiveQuery(() => db.syncQueue.toArray(), []);

  const totalRevenue = (payments || []).filter((p: any) => p.status === 'completed').reduce((sum: number, p: any) => sum + p.amount, 0);
  const totalExpenses = (expenses || []).reduce((sum: number, e: any) => sum + e.amount, 0);
  const remainingInstances = (instances || []).filter((i: any) => !i.client_id).length;
  const activeAgreements = (agreements || []).filter((a: any) => a.status === 'active').length;
  const pendingPayments = (payments || []).filter((p: any) => p.status === 'pending').length;
  const today = new Date().toISOString().split('T')[0];
  const billingClearanceRows = (clients || []).map((client: any) => {
    const totalPaid = (payments || [])
      .filter((item: any) => item.client_id === client.node_id && item.status === 'completed')
      .reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0);
    const agreedPrice = Number(client?.agreed_price) || 0;
    const balance = Math.max(0, agreedPrice - totalPaid);
    return {
      clientId: client.node_id,
      agreedPrice,
      balance,
      isPendingClearance: agreedPrice > 0 && balance > 0,
    };
  });
  const todaysSyncRecords = [
    ...(payments || []).filter((record: any) => dateKey(record.date) === today),
    ...(expenses || []).filter((record: any) => dateKey(record.date) === today),
    ...(invoices || []).filter((record: any) => dateKey(record.issue_date) === today),
    ...(quotations || []).filter((record: any) => dateKey(record.issue_date) === today),
    ...(agreements || []).filter((record: any) => dateKey(record.signed_date || record.created_date) === today),
    ...(meetings || []).filter((record: any) => dateKey(record.start_time) === today),
    ...(instances || []).filter((record: any) => dateKey(record.created_at) === today),
  ];
  const todaysSynced = todaysSyncRecords.filter((record: any) => record.synced !== false).length;
  const todaysLocal = todaysSyncRecords.length - todaysSynced;
  const queuedToday = (syncQueue || []).filter((item: any) => new Date(item.timestamp).toISOString().split('T')[0] === today).length;
  const todaysSyncCount = todaysSyncRecords.length + queuedToday;
  const pendingBillCount = billingClearanceRows.filter(row => row.isPendingClearance).length;
  const projectSuccess = useMemo(() => {
    const getBillableTarget = (client: any) => {
      const agreedPrice = Number(client.agreed_price) || 0;
      const promisedAmount = (billingPromises || [])
        .filter((promise: any) => sameClient(promise.client_id, client))
        .reduce((sum: number, promise: any) => sum + Math.max(Number(promise.amount_due) || 0, 0), 0);

      return Math.max(agreedPrice, promisedAmount);
    };

    const projectClients = (clients || []).filter((client: any) => getBillableTarget(client) > 0);
    const successfulProjects = projectClients.filter((client: any) => {
      const billableTarget = getBillableTarget(client);
      const completedRevenue = (payments || [])
        .filter((payment: any) => payment.status === 'completed' && sameClient(payment.client_id, client))
        .reduce((sum: number, payment: any) => sum + (Number(payment.amount) || 0), 0);
      const clientPromises = (billingPromises || [])
        .filter((promise: any) => sameClient(promise.client_id, client) && (Number(promise.amount_due) || 0) > 0);
      const allPromisesFulfilled = clientPromises.length > 0 && clientPromises.every((promise: any) => promise.status === 'fulfilled');

      return completedRevenue >= billableTarget || allPromisesFulfilled;
    }).length;

    return {
      total: projectClients.length,
      successful: successfulProjects,
      rate: projectClients.length > 0 ? (successfulProjects / projectClients.length) * 100 : null
    };
  }, [billingPromises, clients, payments]);
  const successRate = projectSuccess.rate === null ? '--' : projectSuccess.rate.toFixed(1);

  const stats = { revenue: totalRevenue, expenses: totalExpenses, remainingInstances, activeAgreements, pendingPayments, successRate };

  const recentAgreements = (agreements || []).slice(-4).reverse().map((a: any) => ({
    ...a,
    value: (clients || []).find((c: any) => c.node_id === a.client_id)?.agreed_price || 0
  }));

  const overduePromises = (billingPromises || []).filter((p: any) => p.status === 'pending' && p.due_date < today);

  return (
    <div className="space-y-8 pb-20">
      <GreetingBanner
        todaysSyncs={todaysSyncCount}
        pendingBills={pendingBillCount}
        activeContracts={activeAgreements}
      />
      
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="title-group">
          <h1 className="text-4xl font-black text-text-main uppercase tracking-tighter">Business Snapshot</h1>
          <p className="text-xs text-accent-green font-bold tracking-[0.2em] uppercase mt-2 drop-shadow-[0_0_8px_rgba(57,255,20,0.5)]">Quick Insight Panel</p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Total Revenue', value: `KSh ${totalRevenue.toLocaleString()}`, color: 'accent-green' },
          { label: 'Available Servers', value: remainingInstances, color: 'accent-green' },
          { label: 'Active Contracts', value: activeAgreements, color: 'text-main', sub: activeAgreements === 1 ? '1 signed agreement' : `${activeAgreements} signed agreements` },
          {
            label: 'Project Success Rate',
            value: successRate !== '--' ? `${successRate}%` : '--',
            color: 'accent-green',
            sub: projectSuccess.total > 0 ? `${projectSuccess.successful}/${projectSuccess.total} complete` : 'No projects'
          },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.1 }}
            className="glass-panel p-6 rounded-2xl relative group overflow-hidden"
          >
            <p className="text-[10px] font-black text-text-dim uppercase tracking-[0.2em] mb-4">{stat.label}</p>
            <p className={cn(
              "text-3xl font-black transition-all",
              stat.color === 'accent-green' ? 'text-accent-green drop-shadow-[0_0_10px_rgba(57,255,20,0.4)]' : 'text-text-main'
            )}>
              {stat.value}
            </p>
            {'sub' in stat && stat.sub && (
              <p className="mt-2 text-[9px] font-black uppercase tracking-[0.14em] text-text-dim">
                {stat.sub}
              </p>
            )}
            <div className="absolute top-0 right-0 w-16 h-16 bg-accent-green/5 blur-2xl group-hover:bg-accent-green/10 transition-all" />
          </motion.div>
        ))}
      </div>

      {overduePromises && overduePromises.length > 0 && (
        <section className="animate-in fade-in duration-1000">
           <div className="flex items-center gap-3 mb-6">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.8)]" />
            <h3 className="text-sm font-black text-red-500 uppercase tracking-[0.2em] drop-shadow-[0_0_8px_rgba(239,68,68,0.4)]">Recent Payment Reminders</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {overduePromises.map((promise) => (
              <div 
                key={promise.id} 
                className="glass-panel p-6 rounded-2xl border-red-500/20 bg-red-500/[0.03] relative overflow-hidden group hover:border-red-500/40 transition-all"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-red-400 uppercase tracking-widest">Overdue Payment</p>
                    <p className="text-xl font-black text-text-main">KSh {promise.amount_due.toLocaleString()}</p>
                  </div>
                  <AlertCircle className="w-5 h-5 text-red-500 animate-bounce" />
                </div>
                <div className="flex justify-between items-center text-[8px] font-black uppercase tracking-widest text-text-dim">
                  <span>Client: {promise.client_id}</span>
                  <span className="text-red-500/80">Lapsed: {promise.due_date}</span>
                </div>
                <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 blur-3xl group-hover:bg-red-500/10 transition-all" />
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="glass-panel p-8 rounded-3xl h-full">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-sm font-black text-text-main uppercase tracking-widest flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-accent-green shadow-neon" />
                Recent Activity
              </h3>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-[10px] font-black uppercase tracking-[0.15em] text-text-dim/60 border-b border-white/5">
                    <th className="text-left pb-4">Client</th>
                    <th className="text-left pb-4">Status</th>
                    <th className="text-right pb-4">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {recentAgreements?.map((a) => (
                    <tr key={a.id} className="group hover:bg-white/[0.02] transition-colors">
                      <td className="py-5">
                        <p className="text-sm font-bold text-text-main">{a.client_name}</p>
                        <p className="text-[10px] text-text-dim uppercase tracking-tighter mt-1">{a.project_details}</p>
                      </td>
                      <td className="py-5">
                        <span className={cn(
                          "text-[8px] px-2 py-0.5 rounded-full font-black tracking-widest uppercase border",
                          a.status === 'active' 
                            ? "bg-accent-green/10 text-accent-green border-accent-green/20" 
                            : "bg-white/5 text-text-dim border-white/10"
                        )}>
                          {a.status}
                        </span>
                      </td>
                      <td className="py-5 text-right font-mono text-xs text-text-main tracking-tight italic">
                        KSh {(a as any).value.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="glass-panel p-8 rounded-3xl h-full">
            <h3 className="text-sm font-black text-text-main uppercase tracking-widest mb-8">System Health</h3>
            <div className="space-y-6">
              {[
                { label: 'Connectivity', value: 98 },
                { label: 'Server Utilization', value: stats ? Math.round(((44 - stats.remainingInstances) / 44) * 100) : 0 },
                { label: 'Sync Progress', value: 100 },
              ].map((meter, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex justify-between text-[10px] font-bold uppercase text-text-dim tracking-widest">
                    <span>{meter.label}</span>
                    <span>{meter.value}%</span>
                  </div>
                  <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${meter.value}%` }}
                      className="h-full bg-accent-green shadow-neon"
                    />
                  </div>
                </div>
              ))}
              
              <div className="mt-8 pt-6 border-t border-white/5">
                <button className="w-full py-3 rounded-xl bg-accent-green text-bg-deep text-[10px] font-black uppercase tracking-widest neon-glow">
                  Sync Now
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
