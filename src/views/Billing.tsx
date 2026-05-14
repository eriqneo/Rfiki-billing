import React, { useState, useRef, useEffect } from 'react';
import { db, Client, type Invoice, type PaymentPromise } from '../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { CreditCard, Plus, Clock, CheckCircle2, AlertCircle, ShieldCheck, Smartphone, Landmark, Zap, Search, ChevronDown, User, Building2, Trash2, FileDown, Filter, ChevronLeft, ChevronRight, Edit2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { useSync } from '../hooks/useSync';
import { useToast } from '../contexts/ToastContext';
import { billingService } from '../services/billingService';
import { motion, AnimatePresence } from 'motion/react';
import { useUnifiedCollection } from '../hooks/useUnifiedCollection';
import { pb } from '../lib/pocketbase';

export function Billing() {
  const { data: payments } = useUnifiedCollection<any>('payments', () => db.payments.orderBy('id').reverse().toArray());
  const { data: clients } = useUnifiedCollection<Client>('clients', () => db.clients.toArray());
  const { data: billingPromises } = useUnifiedCollection<PaymentPromise>('billing_promises', () => db.billing_promises.toArray());
  const { data: invoices } = useUnifiedCollection<Invoice>('invoices', () => db.invoices.toArray());
  const { addEntity, updateEntity, deleteEntity, isOnline } = useSync();
  const { showToast } = useToast();
  const [editingPayment, setEditingPayment] = useState<any>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [paymentPendingDelete, setPaymentPendingDelete] = useState<any>(null);
  const [clearanceFilter, setClearanceFilter] = useState<'all' | 'cleared' | 'pending'>('all');
  const [currentPage, setCurrentPage] = useState(1);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    client_id: '',
    client_name: '',
    amount: '',
    method: 'Mpesa' as 'Cash' | 'Mpesa' | 'Bank',
    transaction_id: '',
    billing_promise_id: '',
    quote_id: '',
    quote_number: '',
    billing_milestone_title: '',
  });

  const [clientSearch, setClientSearch] = useState('');
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsClientDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredClients = clients?.filter(c => 
    (c.name || '').toLowerCase().includes((clientSearch || '').toLowerCase()) || 
    (c.node_id || '').toLowerCase().includes((clientSearch || '').toLowerCase())
  ).slice(0, 5);

  const selectedClient = clients?.find(c => c.node_id === formData.client_id);
  const clientPayments = payments?.filter(p => p.client_id === formData.client_id && p.status === 'completed');
  const totalPaid = clientPayments?.reduce((sum, p) => sum + p.amount, 0) || 0;
  const balance = selectedClient ? selectedClient.agreed_price - totalPaid : 0;
  const openClientPromises = (billingPromises || [])
    .filter(promise => promise.client_id === formData.client_id && promise.status !== 'fulfilled')
    .sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')));
  const selectedPromise = openClientPromises.find(promise => String(promise.id || promise.pb_id) === formData.billing_promise_id);
  const selectedInvoice = (invoices || []).find(invoice =>
    invoice.status !== 'paid' &&
    (
      invoice.billing_promise_id === formData.billing_promise_id ||
      (
        invoice.client_id === formData.client_id &&
        (invoice.quote_number || '') === (formData.quote_number || '') &&
        (invoice.milestone_title || '') === (formData.billing_milestone_title || '')
      )
    )
  );

  const clientInstances = useLiveQuery(() => 
    formData.client_id ? db.pocket_host_instances.where('client_id').equals(formData.client_id).toArray() : []
  , [formData.client_id]);

  const totalMonthlyInstances = clientInstances?.reduce((sum, i) => sum + i.monthly_fee, 0) || 0;

  const handleVerify = async () => {
    if (!formData.transaction_id) return;
    setIsVerifying(true);
    setVerifyMessage(null);
    try {
      const result = await billingService.verifyMpesaTransaction(formData.transaction_id);
      setVerifyMessage(result.message);
    } catch (e) {
      setVerifyMessage('System Error during verification.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.client_id || !formData.amount || !formData.transaction_id) return;

    const idempotencyKey = billingService.generateIdempotencyKey();
    const timestamp = new Date().toISOString();
    const payload = {
      client_id: formData.client_id,
      quote_id: formData.quote_id,
      quote_number: formData.quote_number,
      billing_promise_id: formData.billing_promise_id,
      billing_milestone_title: formData.billing_milestone_title,
      amount: Number(formData.amount),
      method: formData.method,
      status: 'completed' as 'pending' | 'completed' | 'failed',
      date: timestamp.split('T')[0],
      transaction_id: formData.transaction_id,
      idempotency_key: idempotencyKey,
    };

    try {
      if (editingPayment) {
        const isPbMode = import.meta.env.VITE_AUTH_MODE === 'pocketbase';
        const targetId = editingPayment.id;

        if (typeof targetId === 'number') {
          await updateEntity('payments', targetId, payload);
        } else if (typeof targetId === 'string') {
          const local = await db.payments.where('pb_id').equals(targetId).first();
          if (local?.id) {
            await updateEntity('payments', local.id, payload);
          } else if (isPbMode && isOnline) {
            await pb.collection('payments').update(targetId, payload);
          }
        }
        showToast('Payment record updated', 'success');
      } else {
        await addEntity('payments', payload);
        showToast('Payment successful', 'success');
      }

      if (selectedPromise && payload.status === 'completed') {
        await markPromiseFulfilled(selectedPromise);
      }
      if (selectedInvoice && payload.status === 'completed') {
        await markInvoicePaid(selectedInvoice);
      }

      setIsFormOpen(false);
      setEditingPayment(null);
      setFormData({
        client_id: '',
        client_name: '',
        amount: '',
        method: 'Mpesa',
        transaction_id: '',
        billing_promise_id: '',
        quote_id: '',
        quote_number: '',
        billing_milestone_title: '',
      });
      setClientSearch('');
    } catch (err: any) {
      console.error('Payment Error:', err);
      showToast(err?.message || 'Handshake failed', 'error');
    }
  };

  const markPromiseFulfilled = async (promise: PaymentPromise) => {
    const targetId = promise.id;
    if (typeof targetId === 'number') {
      await updateEntity('billing_promises', targetId, { status: 'fulfilled' });
      return;
    }

    if (promise.pb_id) {
      const local = await db.billing_promises.where('pb_id').equals(promise.pb_id).first();
      if (local?.id) {
        await updateEntity('billing_promises', local.id, { status: 'fulfilled' });
        return;
      }
    }

    if (import.meta.env.VITE_AUTH_MODE === 'pocketbase' && isOnline && typeof targetId === 'string') {
      await pb.collection('billing_promises').update(targetId, { status: 'fulfilled' });
    }
  };

  const markInvoicePaid = async (invoice: Invoice) => {
    const patch = { status: 'paid' as const, paid_at: new Date().toISOString() };
    if (typeof invoice.id === 'number') {
      await updateEntity('invoices', invoice.id, patch);
      return;
    }
    if (invoice.pb_id) {
      const local = await db.invoices.where('pb_id').equals(invoice.pb_id).first();
      if (local?.id) {
        await updateEntity('invoices', local.id, patch);
        return;
      }
      if (import.meta.env.VITE_AUTH_MODE === 'pocketbase' && isOnline) {
        await pb.collection('invoices').update(invoice.pb_id, patch);
      }
    }
  };

  const handleEdit = (payment: any) => {
    setEditingPayment(payment);
    const client = (clients || []).find(c => c.node_id === payment.client_id);
    setFormData({
      client_id: payment.client_id,
      client_name: client?.name || payment.client_id,
      amount: payment.amount.toString(),
      method: payment.method,
      transaction_id: payment.transaction_id,
      billing_promise_id: payment.billing_promise_id || '',
      quote_id: payment.quote_id || '',
      quote_number: payment.quote_number || '',
      billing_milestone_title: payment.billing_milestone_title || '',
    });
    setClientSearch(client?.name || payment.client_id);
    setIsFormOpen(true);
  };

  const handleDelete = async () => {
    if (!paymentPendingDelete) return;
    const payment = paymentPendingDelete;
    setDeletingId(String(payment.id || payment.pb_id || payment.transaction_id));
    try {
      if (payment.id && typeof payment.id === 'number') {
        await deleteEntity('payments', payment.id);
      } else if (import.meta.env.VITE_AUTH_MODE === 'pocketbase' && isOnline && typeof payment.id === 'string') {
        await pb.collection('payments').delete(payment.id);
      } else if (payment.pb_id && import.meta.env.VITE_AUTH_MODE === 'pocketbase' && isOnline) {
        await pb.collection('payments').delete(payment.pb_id);
      } else {
        throw new Error('Cannot delete this cloud payment while offline.');
      }
      setPaymentPendingDelete(null);
      showToast('Payment deleted', 'success');
    } catch (err: any) {
      console.error('Delete failed:', err);
      showToast(err?.response?.message || 'Failed to delete payment', 'error');
    } finally {
      setDeletingId(null);
    }
  };
  const handleExport = () => {
    if (!payments || !payments.length) return;
    
    const headers = ["Txn Status", "Transaction Reference", "Method", "Client Name", "Client ID", "Quote", "Milestone", "Payment Date", "Amount Paid", "Current Balance", "Clearance Status"];
    
    const rows = (payments || []).map(b => {
      const client = (clients || []).find(c => c.node_id === b.client_id);
      const totalPaid = (payments || []).filter((p: any) => p.client_id === b.client_id && p.status === 'completed').reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
      const agreedPrice = client?.agreed_price || 0;
      const balance = Math.max(0, agreedPrice - totalPaid);
      const isCleared = agreedPrice > 0 && balance === 0;
      
      return [
        b.status,
        b.transaction_id,
        b.method,
        client?.name || 'N/A',
        b.client_id,
        b.quote_number || '',
        b.billing_milestone_title || '',
        b.date,
        b.amount,
        balance,
        isCleared ? 'Cleared' : 'Pending'
      ];
    });
    
    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Rafiki_Billing_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Exporting to Excel (CSV format)', 'success');
  };

  const filteredPayments = (payments || []).filter(b => {
    if (clearanceFilter === 'all') return true;
    
    const client = (clients || []).find(c => c.node_id === b.client_id);
    const totalPaid = (payments || []).filter((p: any) => p.client_id === b.client_id && p.status === 'completed').reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
    const agreedPrice = client?.agreed_price || 0;
    const balance = Math.max(0, agreedPrice - totalPaid);
    const isCleared = agreedPrice > 0 && balance === 0;
    
    if (clearanceFilter === 'cleared') return isCleared;
    if (clearanceFilter === 'pending') return !isCleared;
    return true;
  });

  const getPageRange = (page: number) => {
    if (page === 1) return { start: 0, end: 5 };
    const start = 5 + (page - 2) * 10;
    return { start, end: start + 10 };
  };
  const { start, end } = getPageRange(currentPage);
  const paginatedPayments = filteredPayments.slice(start, end);
  const totalPages = filteredPayments.length <= 5 ? 1 : 1 + Math.ceil((filteredPayments.length - 5) / 10);

  return (
    <div className="space-y-12 pb-20">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-text-main uppercase tracking-tighter">Settlements</h1>
          <p className="text-xs text-accent-green font-bold tracking-[0.2em] uppercase mt-2 drop-shadow-[0_0_8px_rgba(57,255,20,0.5)]">Client Financial Management</p>
        </div>
        <button 
          onClick={() => setIsFormOpen(!isFormOpen)} 
          className="text-[10px] font-black text-bg-deep uppercase tracking-[0.2em] bg-accent-green px-6 py-2.5 rounded-xl neon-glow flex items-center gap-2"
        >
          {isFormOpen ? 'Cancel Entry' : 'New Settlement'}
          {isFormOpen ? <Zap className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        </button>
      </header>

      {isFormOpen && (
        <div className="glass-panel p-8 rounded-3xl border-accent-green/20 animate-in fade-in slide-in-from-top-4 duration-500">
          <form onSubmit={handleRecordPayment} className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="relative" ref={dropdownRef}>
                <label className="text-[10px] font-black text-text-dim uppercase tracking-[0.2em] mb-2 block">Search Client Profile</label>
                <div 
                  className={cn(
                    "relative flex items-center bg-white/5 border rounded-xl transition-all",
                    isClientDropdownOpen ? "border-accent-green/50 ring-1 ring-accent-green/20" : "border-white/10"
                  )}
                >
                  <Search className="absolute left-4 w-3.5 h-3.5 text-text-dim" />
                  <input 
                    type="text" 
                    value={formData.client_id ? (selectedClient?.name || formData.client_id) : clientSearch}
                    onChange={e => {
                      setClientSearch(e.target.value);
                      if (formData.client_id) setFormData({
                        ...formData,
                        client_id: '',
                        billing_promise_id: '',
                        quote_id: '',
                        quote_number: '',
                        billing_milestone_title: '',
                      });
                      setIsClientDropdownOpen(true);
                    }}
                    onFocus={() => setIsClientDropdownOpen(true)}
                    className="w-full bg-transparent py-3 pl-10 pr-4 text-xs font-bold text-text-main outline-none uppercase placeholder:text-text-dim/20"
                    placeholder="ENTER CLIENT NAME OR ID..."
                  />
                  {formData.client_id && (
                    <button 
                      type="button"
                      onClick={() => {
                        setFormData({
                          ...formData,
                          client_id: '',
                          billing_promise_id: '',
                          quote_id: '',
                          quote_number: '',
                          billing_milestone_title: '',
                        });
                        setClientSearch('');
                      }}
                      className="absolute right-3 p-1 hover:text-red-500"
                    >
                      <Plus className="w-3 h-3 rotate-45" />
                    </button>
                  )}
                </div>

                <AnimatePresence>
                  {isClientDropdownOpen && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute z-50 w-full mt-2 glass-panel !bg-bg-deep/95 backdrop-blur-xl border-white/10 rounded-xl overflow-hidden shadow-2xl overflow-y-auto max-h-60 custom-scrollbar"
                    >
                      <div className="px-4 py-2 bg-text-main/5 border-b border-text-main/10">
                        <span className="text-[9px] font-black text-text-dim uppercase tracking-widest">Select a Client</span>
                      </div>
                      {filteredClients?.length ? filteredClients.map(c => (
                        <button
                          key={c.node_id}
                          type="button"
                          onClick={() => {
                            setFormData({
                              ...formData,
                              client_id: c.node_id,
                              billing_promise_id: '',
                              quote_id: '',
                              quote_number: '',
                              billing_milestone_title: '',
                            });
                            setIsClientDropdownOpen(false);
                            setClientSearch(c.name);
                          }}
                          className="w-full px-4 py-3 text-left hover:bg-accent-green/10 flex items-center justify-between group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-6 h-6 rounded-full bg-accent-green/20 border border-accent-green/30 flex items-center justify-center shrink-0">
                              <span className="text-accent-green font-black text-[10px] uppercase">{c.name.charAt(0)}</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[10px] font-black text-text-main uppercase">{c.name}</span>
                              <span className="text-[8px] font-mono text-accent-green/70">{c.node_id}</span>
                            </div>
                          </div>
                          <span className="text-[8px] font-black text-text-dim uppercase opacity-0 group-hover:opacity-100 transition-opacity tracking-widest">Select</span>
                        </button>
                      )) : (
                        <div className="px-4 py-8 flex flex-col items-center justify-center text-center gap-2">
                          <User className="w-6 h-6 text-text-dim/30" />
                          <span className="text-[10px] font-black text-text-dim uppercase tracking-widest italic">No clients found — add one first</span>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {selectedClient && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-3"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-black text-text-dim uppercase tracking-widest">Client Ledger Summary</span>
                    <span className="px-2 py-0.5 rounded bg-accent-green/10 text-accent-green text-[8px] font-black uppercase tracking-tighter">Live Link</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[8px] font-bold text-text-dim uppercase tracking-widest mb-1">Total Agreed</p>
                      <p className="text-xs font-black text-text-main">KSh {selectedClient.agreed_price.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-[8px] font-bold text-text-dim uppercase tracking-widest mb-1">Current Balance</p>
                      <p className={cn("text-xs font-black", balance > 0 ? "text-amber-500" : "text-accent-green")}>
                         KSh {balance.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  
                  {clientInstances && clientInstances.length > 0 && (
                    <div className="pt-2 border-t border-white/5 mt-2">
                       <p className="text-[8px] font-black text-accent-green uppercase tracking-widest mb-2 flex items-center gap-2">
                         <Zap className="w-2.5 h-2.5" />
                         Active Cloud Instances
                       </p>
                       <div className="space-y-1.5">
                          {clientInstances.map(instance => (
                            <div key={instance.id} className="flex items-center justify-between text-[7px] font-bold text-text-dim uppercase tracking-widest bg-white/5 px-2 py-1 rounded">
                               <span>{instance.instance_name}</span>
                               <span className="text-text-main">KSh {instance.monthly_fee}/mo</span>
                            </div>
                          ))}
                          <div className="flex items-center justify-between text-[8px] font-black text-accent-green uppercase pt-1 px-1">
                             <span>Total Monthly Yield</span>
                             <span>KSh {totalMonthlyInstances.toLocaleString()}</span>
                          </div>
                       </div>
                    </div>
                  )}

                  <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden mt-3">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, (totalPaid / selectedClient.agreed_price) * 100)}%` }}
                      className="h-full bg-accent-green shadow-neon"
                    />
                  </div>
                </motion.div>
              )}

              {selectedClient && openClientPromises.length > 0 && (
                <div>
                  <label className="text-[10px] font-black text-text-dim uppercase tracking-[0.2em] mb-2 block">Billing Milestone</label>
                  <select
                    value={formData.billing_promise_id}
                    onChange={event => {
                      const promise = openClientPromises.find(item => String(item.id || item.pb_id) === event.target.value);
                      setFormData({
                        ...formData,
                        billing_promise_id: event.target.value,
                        quote_id: promise?.quote_id || '',
                        quote_number: promise?.quote_number || '',
                        billing_milestone_title: promise?.milestone_title || '',
                        amount: promise ? String(promise.amount_due) : formData.amount,
                      });
                    }}
                    className="w-full rounded-xl border border-white/10 bg-bg-deep px-4 py-3 text-xs font-black uppercase text-text-main outline-none focus:border-accent-green"
                  >
                    <option value="">General payment / no quote milestone</option>
                    {openClientPromises.map(promise => (
                      <option key={String(promise.id || promise.pb_id)} value={String(promise.id || promise.pb_id)}>
                        {(promise.quote_number || 'Billing')} - {promise.milestone_title || 'Milestone'} - KSh {(Number(promise.amount_due) || 0).toLocaleString()}
                      </option>
                    ))}
                  </select>
                  {selectedPromise && (
                    <div className="mt-3 rounded-2xl border border-accent-green/20 bg-accent-green/5 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-accent-green">{selectedPromise.quote_number || 'Quote Billing'}</p>
                          <p className="mt-1 text-xs font-black uppercase text-text-main">{selectedPromise.milestone_title || 'Billing milestone'}</p>
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-text-dim">Due {selectedPromise.due_date}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="text-[10px] font-black text-text-dim uppercase tracking-[0.2em] mb-2 block">Allocation Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-accent-green font-black text-[10px]">KSh</span>
                  <input 
                    type="number" 
                    required
                    value={formData.amount}
                    onChange={e => setFormData({...formData, amount: e.target.value})}
                    className="w-full bg-text-main/[0.03] border border-text-main/10 rounded-xl py-3 pl-12 pr-4 text-text-main focus:border-accent-green outline-none transition-all font-bold text-xs"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-black text-text-dim uppercase tracking-[0.2em] mb-2 block">Payment Method</label>
                <div className="flex gap-2">
                  {(['Mpesa', 'Bank', 'Cash'] as const).map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setFormData({...formData, method: m})}
                      className={cn(
                        "flex-1 py-3 rounded-xl border font-black text-[9px] uppercase tracking-widest transition-all",
                        formData.method === m ? "bg-accent-green text-bg-deep border-accent-green shadow-neon" : "bg-white/5 text-text-dim border-white/10 hover:border-white/20"
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-text-dim uppercase tracking-[0.2em] mb-2 block">Transaction Reference</label>
                <div className="flex gap-3">
                  <input 
                    type="text" 
                    required
                    value={formData.transaction_id}
                    onChange={e => setFormData({...formData, transaction_id: e.target.value})}
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-text-main focus:border-accent-green outline-none transition-all font-black text-xs uppercase"
                    placeholder="MPX-..."
                  />
                  {formData.method === 'Mpesa' && (
                    <button 
                      type="button"
                      onClick={handleVerify}
                      disabled={isVerifying || !formData.transaction_id}
                      className="px-6 rounded-xl border border-accent-green/30 text-accent-green flex items-center justify-center hover:bg-accent-green/5 transition-all disabled:opacity-30"
                    >
                      {isVerifying ? <Clock className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
                    </button>
                  )}
                </div>
                {verifyMessage && (
                  <p className="mt-2 text-[8px] font-black text-accent-green uppercase tracking-widest animate-pulse">
                    {verifyMessage}
                  </p>
                )}
              </div>

              <div className="p-6 bg-text-main/[0.02] border border-dashed border-text-main/10 rounded-2xl">
                <div className="flex items-center gap-3 mb-4">
                  <ShieldCheck className="w-4 h-4 text-accent-green" />
                  <p className="text-[10px] font-black text-text-main uppercase tracking-[0.15em]">Security Checksum (2026)</p>
                </div>
                <p className="text-[9px] text-text-dim uppercase leading-relaxed tracking-tight">
                  Every entry utilizes an idempotency hash and cryptographic callback validation to maintain fiscal integrity.
                </p>
              </div>

              <button 
                type="submit"
                disabled={!formData.client_id || !formData.amount}
                className="w-full bg-accent-green text-bg-deep font-black py-4 rounded-xl uppercase tracking-[0.2em] shadow-neon hover:scale-[1.01] transition-transform active:scale-100 disabled:opacity-30 disabled:hover:scale-100"
              >
                {editingPayment ? 'Apply Corrections' : 'Record Payment'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'Total Collected', value: `KSh ${((payments || []).reduce((acc: number, p: any) => acc + (p.status === 'completed' ? p.amount : 0), 0)).toLocaleString()}` },
          { label: 'Transactions', value: `${(payments || []).length}` },
          { label: 'Pending Milestones', value: `${(billingPromises || []).filter(promise => promise.status === 'pending').length}` },
          { label: 'This Month', value: (() => {
            const now = new Date();
            const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            return (payments || []).filter((p: any) => (p.date || '').startsWith(ym)).length;
          })() },
        ].map((stat, i) => (
          <div key={i} className="glass-panel p-6 rounded-2xl relative group overflow-hidden border-white/5">
            <p className="text-[10px] font-black text-text-dim uppercase tracking-[0.2em] mb-4">{stat.label}</p>
            <p className="text-2xl font-black text-text-main tracking-tighter">{stat.value}</p>
            <div className="absolute top-0 right-0 w-12 h-12 bg-accent-green/5 blur-xl group-hover:bg-accent-green/10 transition-all" />
          </div>
        ))}
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 p-1 bg-white/5 rounded-2xl w-fit border border-white/10">
          {(['all', 'cleared', 'pending'] as const).map((f) => (
            <button 
              key={f}
              onClick={() => setClearanceFilter(f)}
              className={cn(
                "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                clearanceFilter === f ? "bg-accent-green text-bg-deep shadow-neon" : "text-text-dim hover:text-text-main"
              )}
            >
              {f}
            </button>
          ))}
        </div>

        <button 
          onClick={handleExport}
          className="text-[10px] font-black text-accent-green uppercase tracking-[0.2em] border border-accent-green/30 px-6 py-2.5 rounded-xl hover:bg-accent-green/10 transition-all flex items-center gap-2"
        >
          Export Report
          <FileDown className="w-4 h-4" />
        </button>
      </div>

      <div className="glass-panel rounded-3xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-text-main/[0.03] text-[10px] font-black uppercase tracking-[0.2em] text-text-dim/60 border-b border-text-main/5">
              <tr>
                <th className="px-8 py-6">Txn Status</th>
                <th className="px-8 py-6">Transaction Reference</th>
                <th className="px-8 py-6">Client Profile</th>
                <th className="px-8 py-6">Quote/Milestone</th>
                <th className="px-8 py-6 text-center">Payment Date</th>
                <th className="px-8 py-6 text-right">Amount Paid</th>
                <th className="px-8 py-6 text-right">Current Balance</th>
                <th className="px-8 py-6 text-center">Clearance</th>
                <th className="px-8 py-6 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {(paginatedPayments || []).map((b: any) => {
                const client = (clients || []).find(c => c.node_id === b.client_id);
                const clientName = client?.name || b.client_id;
                
                // Calculate balance across all completed payments for this client
                const totalPaid = (payments || []).filter((p: any) => p.client_id === b.client_id && p.status === 'completed').reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
                const agreedPrice = client?.agreed_price || 0;
                const balance = Math.max(0, agreedPrice - totalPaid);
                const isCleared = agreedPrice > 0 && balance === 0;

                return (
                  <tr key={b.id} className="hover:bg-white/[0.02] transition-colors cursor-pointer group text-text-main">
                    <td className="px-8 py-6">
                      <span className={cn(
                        "text-[8px] font-black px-2 py-0.5 rounded-full border tracking-widest uppercase flex items-center gap-1.5 w-fit",
                        b.status === 'completed' ? "border-accent-green/20 bg-accent-green/10 text-accent-green shadow-neon" :
                        b.status === 'failed' ? "border-red-500/20 bg-red-500/10 text-red-500" :
                        "border-white/10 bg-white/5 text-text-dim"
                      )}>
                         {b.status === 'completed' ? <CheckCircle2 className="w-2.5 h-2.5" /> : <Clock className="w-2.5 h-2.5" />}
                         {b.status}
                      </span>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex flex-col gap-1">
                        <p className="text-[10px] font-black text-text-main uppercase flex items-center gap-2">
                          {b.method === 'Mpesa' && <Smartphone className="w-3 h-3 text-accent-green" />}
                          {b.method === 'Bank' && <Landmark className="w-3 h-3 text-accent-green" />}
                          {b.method === 'Cash' && <Zap className="w-3 h-3 text-accent-green" />}
                          {b.transaction_id}
                        </p>
                        <p className="text-[7px] font-bold text-text-dim/40 uppercase tracking-tighter truncate max-w-[120px]">Idem: {b.idempotency_key}</p>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex flex-col">
                        <span className="text-xs font-black uppercase text-accent-green/90">{clientName}</span>
                        <span className="text-[8px] font-bold text-text-dim/60 uppercase">{b.client_id}</span>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      {b.quote_number || b.billing_milestone_title ? (
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black uppercase text-text-main">{b.quote_number || 'Linked Billing'}</span>
                          <span className="max-w-[180px] truncate text-[8px] font-bold uppercase tracking-widest text-text-dim/60">{b.billing_milestone_title || 'Milestone settlement'}</span>
                        </div>
                      ) : (
                        <span className="text-[8px] font-black uppercase tracking-widest text-text-dim/30">General</span>
                      )}
                    </td>
                    <td className="px-8 py-6 text-center text-[10px] text-text-dim font-black tracking-widest uppercase">{b.date}</td>
                    <td className="px-8 py-6 text-right font-black text-sm text-text-main group-hover:text-accent-green transition-colors">KSh {(b.amount || 0).toLocaleString()}</td>
                    <td className="px-8 py-6 text-right font-black text-sm text-text-main">
                      {agreedPrice > 0 ? `KSh ${balance.toLocaleString()}` : <span className="text-text-dim/50 text-[10px] uppercase">No Agreement</span>}
                    </td>
                    <td className="px-8 py-6 text-center">
                      {agreedPrice > 0 ? (
                        <span className={cn(
                          "text-[8px] font-black px-2 py-0.5 rounded-full border tracking-widest uppercase",
                          isCleared ? "border-accent-green/20 bg-accent-green/10 text-accent-green" : "border-amber-500/20 bg-amber-500/10 text-amber-500"
                        )}>
                          {isCleared ? 'Cleared' : 'Pending'}
                        </span>
                      ) : (
                        <span className="text-[8px] font-black text-text-dim/30 tracking-widest uppercase">-</span>
                      )}
                    </td>
                    <td className="px-8 py-6 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleEdit(b)}
                          className="p-2 rounded-xl bg-white/5 border border-white/10 text-text-dim/40 hover:bg-accent-green/10 hover:text-accent-green hover:border-accent-green/30 transition-all"
                          title="Edit payment"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setPaymentPendingDelete(b)}
                          disabled={deletingId === String(b.id || b.pb_id || b.transaction_id)}
                          className="p-2 rounded-xl bg-red-500/5 border border-red-500/10 text-red-500/40 hover:bg-red-500/15 hover:text-red-500 hover:border-red-500/30 transition-all disabled:opacity-30 group/del"
                          title="Delete payment"
                        >
                          {deletingId === String(b.id || b.pb_id || b.transaction_id)
                            ? <Clock className="w-3.5 h-3.5 animate-spin" />
                            : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2">
          <p className="text-[10px] font-black text-text-dim uppercase tracking-widest">
            Showing {start + 1} to {Math.min(end, filteredPayments.length)} of {filteredPayments.length} Entries
          </p>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-xl bg-white/5 border border-white/10 text-text-dim hover:text-accent-green disabled:opacity-20 transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  onClick={() => setCurrentPage(p)}
                  className={cn(
                    "w-8 h-8 rounded-lg text-[10px] font-black transition-all",
                    currentPage === p ? "bg-accent-green text-bg-deep shadow-neon" : "bg-white/5 text-text-dim hover:text-text-main"
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
            <button 
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-2 rounded-xl bg-white/5 border border-white/10 text-text-dim hover:text-accent-green disabled:opacity-20 transition-all"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      <AnimatePresence>
        {paymentPendingDelete && (
          <DeletePaymentNotice
            payment={paymentPendingDelete}
            isDeleting={deletingId === String(paymentPendingDelete.id || paymentPendingDelete.pb_id || paymentPendingDelete.transaction_id)}
            onCancel={() => setPaymentPendingDelete(null)}
            onConfirm={handleDelete}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function DeletePaymentNotice({
  payment,
  isDeleting,
  onCancel,
  onConfirm,
}: {
  payment: any;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onCancel}
        className="absolute inset-0 bg-bg-deep/80 backdrop-blur-xl"
      />
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.96 }}
        className="relative w-full max-w-md overflow-hidden rounded-3xl border border-red-500/20 bg-bg-deep shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
      >
        <div className="absolute inset-x-0 top-0 h-1 bg-red-500" />
        <div className="p-7">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-red-500/25 bg-red-500/10 text-red-400">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-red-400">Delete Settlement</p>
              <h2 className="mt-2 text-2xl font-black uppercase tracking-tight text-text-main">Confirm Removal</h2>
              <p className="mt-3 text-sm font-medium leading-relaxed text-text-dim">
                This will permanently remove payment <span className="font-black text-text-main">{payment.transaction_id}</span>.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-text-dim">Amount</p>
            <p className="mt-1 text-xl font-black text-accent-green">KSh {(Number(payment.amount) || 0).toLocaleString()}</p>
            <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-text-dim">{payment.client_id} · {payment.date}</p>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={isDeleting}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-text-main transition-all hover:bg-white/10 disabled:opacity-50"
            >
              Keep Payment
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isDeleting}
              className="rounded-xl border border-red-500/30 bg-red-500 px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-white transition-all hover:brightness-110 disabled:opacity-50"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
