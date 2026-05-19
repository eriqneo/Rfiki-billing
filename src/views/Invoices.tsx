import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, ChevronLeft, ChevronRight, Download, FileText, LayoutGrid, Plus, ReceiptText, Search, Send, Table2, X } from 'lucide-react';
import jsPDF from 'jspdf';
import { db, type BusinessProfile, type Client, type Invoice, type Payment, type PaymentPromise, type Quotation } from '../db/db';
import { useUnifiedCollection } from '../hooks/useUnifiedCollection';
import { useSync } from '../hooks/useSync';
import { useToast } from '../contexts/ToastContext';
import { pb } from '../lib/pocketbase';
import { cn } from '../lib/utils';
import { buildInvoicePayload, generateInvoiceNumber, parseInvoiceItems } from '../services/invoiceService';
import type { ViewType } from '../components/Sidebar';

function money(amount: number, currency = 'KSh') {
  return `${currency} ${(Number(amount) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

function inferMilestonePercent(title?: string) {
  const normalized = String(title || '').toLowerCase();
  if (/(kickoff|deposit|start|initial)/.test(normalized)) return 40;
  if (/(build|progress|development|implementation)/.test(normalized)) return 40;
  if (/(deployment|handover|final|completion|launch)/.test(normalized)) return 20;
  return 100;
}

function findQuoteForPromise(promise: PaymentPromise | null | undefined, quotations: Quotation[] = []) {
  if (!promise) return null;
  return quotations.find(quote =>
    (promise.quote_number && quote.quote_number === promise.quote_number) ||
    (promise.quote_id && String(quote.id || quote.pb_id || quote.quote_number) === String(promise.quote_id))
  ) || null;
}

function resolveMilestoneAmount(promise?: PaymentPromise | null, quotations: Quotation[] = [], clients: Client[] = []) {
  if (!promise) return 0;
  const raw = [
    promise.amount_due,
    (promise as any).amount,
    (promise as any).total,
    (promise as any).value,
  ].find(value => Number(value) > 0);

  const directAmount = Number(raw) || 0;
  if (directAmount > 0) return directAmount;

  const quote = findQuoteForPromise(promise, quotations);
  const client = clients.find(item => item.node_id === promise.client_id);
  const quoteTotal = Number(quote?.total) || Number(client?.agreed_price) || 0;
  if (quoteTotal <= 0) return 0;

  return Math.round(quoteTotal * (inferMilestonePercent(promise.milestone_title) / 100));
}

function isInvoiceReadyPromise(promise: PaymentPromise, quotations: Quotation[] = [], clients: Client[] = []) {
  if (promise.status !== 'pending') return false;
  if (!promise.client_id || !promise.milestone_title) return false;
  if (!promise.quote_number && !promise.quote_id) return false;

  const quote = findQuoteForPromise(promise, quotations);
  if (!quote || quote.status !== 'accepted' || quote.billing_plan_created !== true) return false;

  return resolveMilestoneAmount(promise, quotations, clients) > 0;
}

function paymentMatchesInvoice(payment: Payment, invoice: Invoice) {
  if (payment.status !== 'completed') return false;

  const paymentPromiseId = String(payment.billing_promise_id || '');
  const invoicePromiseId = String(invoice.billing_promise_id || '');
  if (paymentPromiseId && invoicePromiseId && paymentPromiseId === invoicePromiseId) return true;

  return payment.client_id === invoice.client_id &&
    (payment.quote_number || '') === (invoice.quote_number || '') &&
    (payment.billing_milestone_title || '') === (invoice.milestone_title || '');
}

function getInvoicePaymentSummary(invoice: Invoice, payments: Payment[] = []) {
  const invoicePayments = payments.filter(payment => paymentMatchesInvoice(payment, invoice));
  const paidToDate = invoicePayments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
  const invoiceTotal = Number(invoice.total) || 0;

  return {
    invoiceTotal,
    paidToDate,
    balance: Math.max(0, invoiceTotal - paidToDate),
  };
}

function getClientAccountSummary(invoice: Invoice, payments: Payment[] = [], clients: Client[] = []) {
  const client = clients.find(item => item.node_id === invoice.client_id);
  const paidToDate = payments
    .filter(payment => payment.client_id === invoice.client_id && payment.status === 'completed')
    .reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
  const agreedPrice = Number(client?.agreed_price) || 0;

  return {
    agreedPrice,
    paidToDate,
    balance: agreedPrice > 0 ? Math.max(0, agreedPrice - paidToDate) : 0,
  };
}

function getInvoiceDueSummary(invoice: Invoice, payments: Payment[] = [], clients: Client[] = []) {
  const account = getClientAccountSummary(invoice, payments, clients);
  const invoicePayments = getInvoicePaymentSummary(invoice, payments);
  const projectSubtotal = account.agreedPrice > 0 ? account.agreedPrice : Number(invoice.subtotal) || Number(invoice.total) || 0;
  const paid = account.agreedPrice > 0 ? account.paidToDate : invoicePayments.paidToDate;
  const accountBalance = account.agreedPrice > 0
    ? account.balance
    : Math.max(0, (Number(invoice.subtotal) || Number(invoice.total) || 0) - paid);
  const taxRate = Number(invoice.tax_rate) || 0;
  const taxAmount = accountBalance * (taxRate / 100);

  return {
    projectSubtotal,
    paid,
    accountBalance,
    taxAmount,
    totalDue: accountBalance + taxAmount,
  };
}

export function Invoices({ setView }: { setView?: (view: ViewType) => void }) {
  const { data: invoices } = useUnifiedCollection<Invoice>('invoices', () => db.invoices.orderBy('id').reverse().toArray());
  const { data: promises } = useUnifiedCollection<PaymentPromise>('billing_promises', () => db.billing_promises.toArray());
  const { data: quotations } = useUnifiedCollection<Quotation>('quotations', () => db.quotations.toArray());
  const { data: payments } = useUnifiedCollection<Payment>('payments', () => db.payments.toArray());
  const { data: clients } = useUnifiedCollection<Client>('clients', () => db.clients.toArray());
  const { data: business } = useUnifiedCollection<BusinessProfile>('business', () => db.business.toArray());
  const { addEntity, updateEntity, isOnline } = useSync();
  const { showToast } = useToast();
  const [statusFilter, setStatusFilter] = useState<'all' | Invoice['status']>('all');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const filteredInvoices = useMemo(() => {
    return (invoices || [])
      .filter(invoice => {
        const haystack = `${invoice.invoice_number} ${invoice.client_name} ${invoice.client_id} ${invoice.quote_number || ''} ${invoice.milestone_title || ''}`.toLowerCase();
        const matchesSearch = haystack.includes(search.toLowerCase());
        const matchesStatus = statusFilter === 'all' || invoice.status === statusFilter;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => String(b.issue_date || '').localeCompare(String(a.issue_date || '')));
  }, [invoices, search, statusFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, viewMode]);

  const pageSize = viewMode === 'table' ? 10 : 6;
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  const paginatedInvoices = filteredInvoices.slice(start, end);
  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / pageSize));

  const existingPromiseIds = new Set((invoices || []).map(invoice => invoice.billing_promise_id).filter(Boolean));
  const existingPromiseKeys = new Set((invoices || []).map(invoice => `${invoice.client_id}:${invoice.quote_number || ''}:${invoice.milestone_title || ''}`));
  const billablePromises = (promises || [])
    .filter(promise => {
      const promiseKey = `${promise.client_id}:${promise.quote_number || ''}:${promise.milestone_title || ''}`;
      return isInvoiceReadyPromise(promise, quotations || [], clients || []) &&
        !existingPromiseIds.has(String(promise.id || promise.pb_id || '')) &&
        !existingPromiseKeys.has(promiseKey);
    })
    .sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')));

  const totals = {
    draft: (invoices || []).filter(invoice => invoice.status === 'draft').length,
    sent: (invoices || []).filter(invoice => invoice.status === 'sent').length,
    paid: (invoices || []).filter(invoice => invoice.status === 'paid').length,
    receivable: (invoices || [])
      .filter(invoice => invoice.status !== 'paid' && invoice.status !== 'void')
      .reduce((sum, invoice) => sum + getInvoiceDueSummary(invoice, payments || [], clients || []).totalDue, 0),
  };

  const updateStatus = async (invoice: Invoice, status: Invoice['status']) => {
    const patch = { status, paid_at: status === 'paid' ? new Date().toISOString() : invoice.paid_at || '' };
    setUpdatingId(String(invoice.id || invoice.pb_id || invoice.invoice_number));
    try {
      if (typeof invoice.id === 'number') {
        await updateEntity('invoices', invoice.id, patch);
      } else if (invoice.pb_id) {
        const local = await db.invoices.where('pb_id').equals(invoice.pb_id).first();
        if (local?.id) await updateEntity('invoices', local.id, patch);
        else if (import.meta.env.VITE_AUTH_MODE === 'pocketbase' && isOnline) await pb.collection('invoices').update(invoice.pb_id, patch);
      } else if (import.meta.env.VITE_AUTH_MODE === 'pocketbase' && isOnline && typeof invoice.id === 'string') {
        await pb.collection('invoices').update(invoice.id, patch);
      }
      if (status === 'paid') await markLinkedPromiseFulfilled(invoice);
      showToast(`Invoice marked ${status}`, 'success');
    } catch (error: any) {
      console.error('Invoice update failed:', error);
      showToast(error?.message || 'Failed to update invoice', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const markLinkedPromiseFulfilled = async (invoice: Invoice) => {
    const match = (promises || []).find(promise =>
      String(promise.id || promise.pb_id || '') === invoice.billing_promise_id ||
      promise.pb_id === invoice.billing_promise_id ||
      (
        promise.client_id === invoice.client_id &&
        (promise.quote_number || '') === (invoice.quote_number || '') &&
        (promise.milestone_title || '') === (invoice.milestone_title || '')
      )
    );
    if (!match || match.status === 'fulfilled') return;

    if (typeof match.id === 'number') {
      await updateEntity('billing_promises', match.id, { status: 'fulfilled' });
    } else if (match.pb_id) {
      const local = await db.billing_promises.where('pb_id').equals(match.pb_id).first();
      if (local?.id) await updateEntity('billing_promises', local.id, { status: 'fulfilled' });
      else if (import.meta.env.VITE_AUTH_MODE === 'pocketbase' && isOnline) await pb.collection('billing_promises').update(match.pb_id, { status: 'fulfilled' });
    } else if (import.meta.env.VITE_AUTH_MODE === 'pocketbase' && isOnline && typeof match.id === 'string') {
      await pb.collection('billing_promises').update(match.id, { status: 'fulfilled' });
    }
  };

  return (
    <div className="space-y-10 pb-20">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tighter text-text-main">Invoices</h1>
          <p className="mt-2 text-xs font-bold uppercase tracking-[0.2em] text-accent-green drop-shadow-[0_0_8px_rgba(57,255,20,0.5)]">Quote milestone billing</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 rounded-xl bg-accent-green px-6 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-bg-deep shadow-neon">
          <Plus className="h-4 w-4" />
          Generate Invoice
        </button>
      </header>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
        {[
          { label: 'Draft', value: totals.draft },
          { label: 'Sent', value: totals.sent },
          { label: 'Paid', value: totals.paid },
          { label: 'Ready Milestones', value: billablePromises.length },
          { label: 'Receivable', value: money(totals.receivable, business?.[0]?.currency || 'KSh') },
        ].map(stat => (
          <div key={stat.label} className="glass-panel rounded-2xl border-white/5 p-6">
            <p className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-text-dim">{stat.label}</p>
            <p className="text-2xl font-black tracking-tight text-text-main">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="relative w-full xl:max-w-md">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dim" />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search invoices, clients, quotes..."
            className="w-full rounded-2xl border border-white/10 bg-white/[0.03] py-3 pl-11 pr-4 text-sm font-bold text-text-main outline-none transition-all placeholder:text-text-dim/40 focus:border-accent-green/40"
          />
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/5 p-1">
            {(['all', 'draft', 'sent', 'paid', 'void'] as const).map(status => (
              <button key={status} onClick={() => setStatusFilter(status)} className={cn(
                'rounded-xl px-4 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all',
                statusFilter === status ? 'bg-accent-green text-bg-deep shadow-neon' : 'text-text-dim hover:text-text-main'
              )}>
                {status}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-white/5 p-1 md:w-[176px]">
            {[
              { id: 'cards' as const, label: 'Cards', icon: LayoutGrid },
              { id: 'table' as const, label: 'Table', icon: Table2 },
            ].map(option => {
              const Icon = option.icon;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setViewMode(option.id)}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[9px] font-black uppercase tracking-widest transition-all',
                    viewMode === option.id ? 'bg-accent-green text-bg-deep shadow-neon' : 'text-text-dim hover:text-text-main'
                  )}
                  title={`${option.label} view`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {viewMode === 'cards' ? (
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {paginatedInvoices.map(invoice => {
          const dueSummary = getInvoiceDueSummary(invoice, payments || [], clients || []);
          return (
          <article key={String(invoice.id || invoice.pb_id || invoice.invoice_number)} className="group overflow-hidden rounded-3xl border border-white/10 bg-white/[0.025] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.16)] transition-all hover:border-accent-green/30 hover:bg-white/[0.04]">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <span className="rounded-full border border-accent-green/25 bg-accent-green/10 px-3 py-1 text-[8px] font-black uppercase tracking-[0.18em] text-accent-green">
                  {invoice.invoice_number}
                </span>
                <h2 className="mt-4 truncate text-xl font-black uppercase tracking-tight text-text-main">{invoice.client_name}</h2>
                <p className="mt-1 line-clamp-2 text-xs font-bold uppercase tracking-widest text-text-dim">
                  {invoice.quote_number || 'General billing'} · {invoice.milestone_title || 'Invoice'}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[9px] font-black uppercase tracking-widest text-text-dim">Total Due</p>
                <p className="mt-1 text-2xl font-black text-accent-green">{money(dueSummary.totalDue, invoice.currency)}</p>
                <p className="mt-1 text-[9px] font-black uppercase tracking-widest text-text-dim">
                  Paid {money(dueSummary.paid, invoice.currency)}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 border-y border-white/5 py-4">
              <Meta label="Issued" value={invoice.issue_date} />
              <Meta label="Due" value={invoice.due_date} />
              <Meta label="Status" value={invoice.status} status={invoice.status} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-bg-deep/30 p-4 md:grid-cols-4">
              <Meta label="Subtotal" value={money(dueSummary.projectSubtotal, invoice.currency)} />
              <Meta label="Paid" value={money(dueSummary.paid, invoice.currency)} />
              <Meta label="Balance" value={money(dueSummary.accountBalance, invoice.currency)} />
              <Meta label="VAT" value={money(dueSummary.taxAmount, invoice.currency)} />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button onClick={() => exportInvoicePdf(invoice, business?.[0], payments || [], clients || [])} className="flex items-center gap-2 rounded-xl border border-accent-green/30 bg-accent-green/10 px-4 py-2 text-[9px] font-black uppercase tracking-widest text-accent-green transition-all hover:bg-accent-green hover:text-bg-deep">
                <Download className="h-3.5 w-3.5" />
                PDF
              </button>
              {invoice.status === 'draft' && (
                <button onClick={() => updateStatus(invoice, 'sent')} disabled={updatingId === String(invoice.id || invoice.pb_id || invoice.invoice_number)} className="flex items-center gap-2 rounded-xl border border-blue-400/30 bg-blue-400/10 px-4 py-2 text-[9px] font-black uppercase tracking-widest text-blue-300 transition-all hover:bg-blue-400 hover:text-bg-deep disabled:opacity-40">
                  <Send className="h-3.5 w-3.5" />
                  Send
                </button>
              )}
              {invoice.status !== 'paid' && invoice.status !== 'void' && (
                <button onClick={() => updateStatus(invoice, 'paid')} disabled={updatingId === String(invoice.id || invoice.pb_id || invoice.invoice_number)} className="flex items-center gap-2 rounded-xl border border-accent-green/30 bg-accent-green/10 px-4 py-2 text-[9px] font-black uppercase tracking-widest text-accent-green transition-all hover:bg-accent-green hover:text-bg-deep disabled:opacity-40">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Paid
                </button>
              )}
            </div>
          </article>
          );
        })}
      </div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.025] shadow-[0_24px_80px_rgba(0,0,0,0.16)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.04] text-left text-[9px] font-black uppercase tracking-[0.18em] text-text-dim">
                  <th className="px-6 py-5">Invoice</th>
                  <th className="px-6 py-5">Client</th>
                  <th className="px-6 py-5">Quote/Milestone</th>
                  <th className="px-6 py-5">Due Date</th>
                  <th className="px-6 py-5 text-right">Paid</th>
                  <th className="px-6 py-5 text-right">Total Due</th>
                  <th className="px-6 py-5 text-center">Status</th>
                  <th className="px-6 py-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {paginatedInvoices.map(invoice => {
                  const dueSummary = getInvoiceDueSummary(invoice, payments || [], clients || []);
                  const rowId = String(invoice.id || invoice.pb_id || invoice.invoice_number);
                  return (
                    <tr key={rowId} className="group transition-colors hover:bg-white/[0.03]">
                      <td className="px-6 py-5">
                        <p className="font-mono text-[10px] font-black uppercase tracking-widest text-accent-green">{invoice.invoice_number}</p>
                        <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-text-dim">Issued {invoice.issue_date}</p>
                      </td>
                      <td className="px-6 py-5">
                        <p className="max-w-[180px] truncate text-xs font-black uppercase text-text-main">{invoice.client_name}</p>
                        <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-text-dim">{invoice.client_id}</p>
                      </td>
                      <td className="px-6 py-5">
                        <p className="max-w-[230px] truncate text-xs font-black uppercase text-text-main">{invoice.quote_number || 'General billing'}</p>
                        <p className="mt-1 max-w-[230px] truncate text-[9px] font-bold uppercase tracking-widest text-text-dim">{invoice.milestone_title || 'Invoice'}</p>
                      </td>
                      <td className="px-6 py-5 text-xs font-black text-text-main">{invoice.due_date}</td>
                      <td className="px-6 py-5 text-right text-xs font-black text-text-main">{money(dueSummary.paid, invoice.currency)}</td>
                      <td className="px-6 py-5 text-right text-sm font-black text-accent-green">{money(dueSummary.totalDue, invoice.currency)}</td>
                      <td className="px-6 py-5 text-center">
                        <span className={cn(
                          'inline-flex rounded-full border px-3 py-1 text-[8px] font-black uppercase tracking-widest',
                          invoice.status === 'paid' && 'border-accent-green/30 bg-accent-green/10 text-accent-green',
                          invoice.status === 'sent' && 'border-blue-400/30 bg-blue-400/10 text-blue-300',
                          invoice.status === 'draft' && 'border-white/10 bg-white/5 text-text-dim',
                          invoice.status === 'void' && 'border-red-500/30 bg-red-500/10 text-red-400'
                        )}>
                          {invoice.status}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => exportInvoicePdf(invoice, business?.[0], payments || [], clients || [])} className="rounded-xl border border-accent-green/30 bg-accent-green/10 p-2 text-accent-green transition-all hover:bg-accent-green hover:text-bg-deep" title="Download PDF">
                            <Download className="h-4 w-4" />
                          </button>
                          {invoice.status === 'draft' && (
                            <button onClick={() => updateStatus(invoice, 'sent')} disabled={updatingId === rowId} className="rounded-xl border border-blue-400/30 bg-blue-400/10 p-2 text-blue-300 transition-all hover:bg-blue-400 hover:text-bg-deep disabled:opacity-40" title="Mark sent">
                              <Send className="h-4 w-4" />
                            </button>
                          )}
                          {invoice.status !== 'paid' && invoice.status !== 'void' && (
                            <button onClick={() => updateStatus(invoice, 'paid')} disabled={updatingId === rowId} className="rounded-xl border border-accent-green/30 bg-accent-green/10 p-2 text-accent-green transition-all hover:bg-accent-green hover:text-bg-deep disabled:opacity-40" title="Mark paid">
                              <CheckCircle2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {filteredInvoices.length === 0 && (
        <div className="glass-panel rounded-3xl border-dashed border-white/10 p-12 text-center">
          <ReceiptText className="mx-auto h-12 w-12 text-accent-green/50" />
          <h2 className="mt-5 text-xl font-black uppercase tracking-widest text-text-main">No Invoices Yet</h2>
          <p className="mx-auto mt-3 max-w-md text-sm font-medium text-text-dim">Invoices are generated from billable milestones. Set milestones on an accepted quotation, then return here to invoice them.</p>
          {setView && (
            <button onClick={() => setView('quotations')} className="mt-6 rounded-xl border border-accent-green/30 bg-accent-green/10 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-accent-green transition-all hover:bg-accent-green hover:text-bg-deep">
              Open Quotations
            </button>
          )}
        </div>
      )}

      {totalPages > 1 && (
        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          start={start}
          end={end}
          totalItems={filteredInvoices.length}
          onPageChange={setCurrentPage}
        />
      )}

      <AnimatePresence>
        {isModalOpen && (
          <InvoiceModal
            promises={billablePromises}
            existingInvoiceNumbers={(invoices || []).map(invoice => invoice.invoice_number)}
            clients={clients || []}
            quotations={quotations || []}
            business={business?.[0]}
            payments={payments || []}
            updateEntity={updateEntity}
            isOnline={isOnline}
            addEntity={addEntity}
            onClose={() => setIsModalOpen(false)}
            onOpenQuotations={setView ? () => setView('quotations') : undefined}
            showToast={showToast}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function Meta({ label, value, status }: { label: string; value: string; status?: Invoice['status'] }) {
  return (
    <div>
      <p className="text-[8px] font-black uppercase tracking-[0.18em] text-text-dim">{label}</p>
      <p className={cn('mt-1 text-xs font-black uppercase text-text-main', status === 'paid' && 'text-accent-green', status === 'void' && 'text-red-400', status === 'sent' && 'text-blue-300')}>{value}</p>
    </div>
  );
}

function PaginationControls({
  currentPage,
  totalPages,
  start,
  end,
  totalItems,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  start: number;
  end: number;
  totalItems: number;
  onPageChange: (page: number | ((page: number) => number)) => void;
}) {
  return (
    <div className="flex items-center justify-between px-2">
      <p className="text-[10px] font-black uppercase tracking-widest text-text-dim">
        Showing {start + 1} to {Math.min(end, totalItems)} of {totalItems} Entries
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(page => Math.max(1, page - 1))}
          disabled={currentPage === 1}
          className="rounded-xl border border-white/10 bg-white/5 p-2 text-text-dim transition-all hover:text-accent-green disabled:opacity-20"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-1">
          {Array.from({ length: totalPages }, (_, index) => index + 1).map(page => (
            <button
              key={page}
              onClick={() => onPageChange(page)}
              className={cn(
                "h-8 w-8 rounded-lg text-[10px] font-black transition-all",
                currentPage === page ? "bg-accent-green text-bg-deep shadow-neon" : "bg-white/5 text-text-dim hover:text-text-main"
              )}
            >
              {page}
            </button>
          ))}
        </div>
        <button
          onClick={() => onPageChange(page => Math.min(totalPages, page + 1))}
          disabled={currentPage === totalPages}
          className="rounded-xl border border-white/10 bg-white/5 p-2 text-text-dim transition-all hover:text-accent-green disabled:opacity-20"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function InvoiceModal({
  promises,
  existingInvoiceNumbers,
  clients,
  quotations,
  business,
  payments,
  updateEntity,
  isOnline,
  addEntity,
  onClose,
  onOpenQuotations,
  showToast,
}: {
  promises: PaymentPromise[];
  existingInvoiceNumbers: string[];
  clients: Client[];
  quotations: Quotation[];
  business?: BusinessProfile;
  payments: Payment[];
  updateEntity: any;
  isOnline: boolean;
  addEntity: any;
  onClose: () => void;
  onOpenQuotations?: () => void;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}) {
  const [clientId, setClientId] = useState('');
  const [promiseId, setPromiseId] = useState('');
  const [taxRate, setTaxRate] = useState(0);
  const [notes, setNotes] = useState('Payment is due by the stated due date. Please reference the invoice number when making payment.');
  const selectedClient = clients.find(item => item.node_id === clientId);
  const clientPromises = promises
    .filter(promise => !clientId || promise.client_id === clientId)
    .sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')));
  const selectedPromise = clientPromises.find(promise => String(promise.id || promise.pb_id) === promiseId);
  const client = selectedClient || clients.find(item => item.node_id === selectedPromise?.client_id);
  const clientPaid = payments
    .filter(payment => payment.client_id === clientId && payment.status === 'completed')
    .reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
  const clientAgreed = Number(selectedClient?.agreed_price) || 0;
  const clientBalance = clientAgreed > 0 ? Math.max(0, clientAgreed - clientPaid) : 0;
  const selectedAmount = resolveMilestoneAmount(selectedPromise, quotations, clients);
  const selectedClientPaid = payments
    .filter(payment => payment.client_id === selectedPromise?.client_id && payment.status === 'completed')
    .reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
  const selectedClientAgreed = Number(client?.agreed_price) || 0;
  const selectedAccountBalance = selectedClientAgreed > 0 ? Math.max(0, selectedClientAgreed - selectedClientPaid) : selectedAmount;

  const createInvoice = async () => {
    if (!clientId) {
      showToast('Select a client first', 'warning');
      return;
    }
    if (!selectedPromise) {
      showToast('Select a billable milestone first', 'warning');
      return;
    }
    const milestoneAmount = resolveMilestoneAmount(selectedPromise, quotations, clients);
    if (milestoneAmount <= 0) {
      showToast('This milestone has no billable amount. Update the quote milestone before creating an invoice.', 'warning');
      return;
    }

    if ((Number(selectedPromise.amount_due) || 0) <= 0) {
      await repairMilestoneAmount(selectedPromise, milestoneAmount);
    }

    const paidForClient = payments
      .filter(payment => payment.client_id === selectedPromise.client_id && payment.status === 'completed')
      .reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
    const agreedForClient = Number(client?.agreed_price) || 0;
    const outstandingBalance = agreedForClient > 0
      ? Math.max(0, agreedForClient - paidForClient)
      : milestoneAmount;
    const invoiceAmount = Math.min(milestoneAmount, outstandingBalance);
    if (invoiceAmount <= 0) {
      showToast('This client account is already cleared in Billing', 'info');
      return;
    }

    const payload = buildInvoicePayload({
      clientId: selectedPromise.client_id,
      invoiceNumber: generateInvoiceNumber(new Date(), existingInvoiceNumbers),
      clientName: client?.name || selectedPromise.client_id,
      quoteId: selectedPromise.quote_id,
      quoteNumber: selectedPromise.quote_number,
      billingPromiseId: String(selectedPromise.id || selectedPromise.pb_id || ''),
      milestoneTitle: selectedPromise.milestone_title || 'Project milestone',
      issueDate: today(),
      dueDate: selectedPromise.due_date || addDays(7),
      currency: business?.currency || 'KSh',
      taxRate,
      notes,
      items: [{
        description: outstandingBalance < milestoneAmount
          ? `Outstanding balance for ${selectedPromise.milestone_title || selectedPromise.quote_number || selectedPromise.client_id}`
          : selectedPromise.milestone_title || `Milestone billing for ${selectedPromise.quote_number || selectedPromise.client_id}`,
        quantity: 1,
        unit_price: invoiceAmount,
      }],
    });
    await addEntity('invoices', payload);
    showToast('Invoice generated from billing milestone', 'success');
    onClose();
  };

  const repairMilestoneAmount = async (promise: PaymentPromise, amount: number) => {
    if (!amount || amount <= 0) return;

    if (typeof promise.id === 'number') {
      await updateEntity('billing_promises', promise.id, { amount_due: amount });
      return;
    }

    if (promise.pb_id) {
      const local = await db.billing_promises.where('pb_id').equals(promise.pb_id).first();
      if (local?.id) {
        await updateEntity('billing_promises', local.id, { amount_due: amount });
        return;
      }
      if (import.meta.env.VITE_AUTH_MODE === 'pocketbase' && isOnline) {
        await pb.collection('billing_promises').update(promise.pb_id, { amount_due: amount });
      }
      return;
    }

    if (import.meta.env.VITE_AUTH_MODE === 'pocketbase' && isOnline && typeof promise.id === 'string') {
      await pb.collection('billing_promises').update(promise.id, { amount_due: amount });
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-bg-deep/80 backdrop-blur-xl" />
      <motion.div initial={{ opacity: 0, y: 18, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: 0.96 }} className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-bg-deep shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
        <div className="shrink-0 border-b border-white/5 p-6 pb-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-accent-green">Milestone Invoice</p>
              <h2 className="mt-2 text-3xl font-black uppercase tracking-tight text-text-main">Generate Invoice</h2>
            </div>
            <button onClick={onClose} className="rounded-xl bg-white/5 p-3 text-text-dim hover:text-text-main"><X className="h-5 w-5" /></button>
          </div>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {promises.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-6 text-center">
              <ReceiptText className="mx-auto h-8 w-8 text-accent-green/60" />
              <h3 className="mt-4 text-sm font-black uppercase tracking-widest text-text-main">No Billable Milestones</h3>
              <p className="mx-auto mt-2 max-w-md text-xs font-medium leading-relaxed text-text-dim">Accepted quotations become invoice-ready after their milestone schedule is set.</p>
              {onOpenQuotations && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenQuotations();
                  }}
                  className="mt-5 rounded-xl border border-accent-green/30 bg-accent-green/10 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-accent-green transition-all hover:bg-accent-green hover:text-bg-deep"
                >
                  Open Quotations
                </button>
              )}
            </div>
          ) : (
            <>
              <div>
                <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-text-dim">Client</label>
                <select
                  value={clientId}
                  onChange={event => {
                    setClientId(event.target.value);
                    setPromiseId('');
                  }}
                  className="w-full rounded-xl border border-white/10 bg-bg-deep px-4 py-3 text-xs font-black uppercase text-text-main outline-none focus:border-accent-green"
                >
                  <option value="">Select client to invoice</option>
                  {clients
                    .filter(client => promises.some(promise => promise.client_id === client.node_id))
                    .map(client => (
                      <option key={client.node_id} value={client.node_id}>
                        {client.name} - {client.node_id}
                      </option>
                    ))}
                </select>
              </div>

              {selectedClient && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex flex-col gap-1">
                    <p className="text-xs font-black uppercase text-text-main">{selectedClient.name}</p>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-text-dim">{clientPromises.length} invoice-ready milestone{clientPromises.length === 1 ? '' : 's'}</p>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <Meta label="Project Total" value={money(clientAgreed, business?.currency || 'KSh')} />
                    <Meta label="Paid" value={money(clientPaid, business?.currency || 'KSh')} />
                    <Meta label="Balance" value={money(clientBalance, business?.currency || 'KSh')} />
                  </div>
                  <p className={cn(
                    'mt-3 rounded-xl border px-3 py-2 text-[9px] font-black uppercase tracking-widest',
                    clientAgreed > 0 && clientBalance === 0
                      ? 'border-accent-green/20 bg-accent-green/10 text-accent-green'
                      : 'border-amber-400/20 bg-amber-400/10 text-amber-200'
                  )}>
                    {clientAgreed > 0 && clientBalance === 0 ? 'Client account cleared' : 'Balance after paid amount is pending'}
                  </p>
                </div>
              )}

              {clientId && (
                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-text-dim">Set Milestones</label>
                    <span className="text-[9px] font-black uppercase tracking-widest text-accent-green">
                      {selectedPromise ? 'Ready' : 'Select to activate'}
                    </span>
                  </div>
                  {clientPromises.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-5 text-center">
                      <p className="text-[10px] font-black uppercase tracking-widest text-text-dim">No set milestones found for this client</p>
                    </div>
                  ) : (
                    <div className="max-h-[260px] space-y-3 overflow-y-auto pr-1">
                      {clientPromises.map((promise) => {
                        const id = String(promise.id || promise.pb_id);
                        const amount = resolveMilestoneAmount(promise, quotations, clients);
                        const paid = payments
                          .filter(payment =>
                            payment.status === 'completed' &&
                            (
                              String(payment.billing_promise_id || '') === id ||
                              (
                                payment.client_id === promise.client_id &&
                                (payment.quote_number || '') === (promise.quote_number || '') &&
                                (payment.billing_milestone_title || '') === (promise.milestone_title || '')
                              )
                            )
                          )
                          .reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
                        const balance = Math.max(0, amount - paid);
                        const isSelected = promiseId === id;
                        const recovered = (Number(promise.amount_due) || 0) <= 0 && amount > 0;

                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setPromiseId(id)}
                            className={cn(
                              'w-full rounded-2xl border p-4 text-left transition-all',
                              isSelected
                                ? 'border-accent-green/60 bg-accent-green/10 shadow-[0_0_22px_rgba(57,255,20,0.16)]'
                                : 'border-white/10 bg-white/[0.03] hover:border-accent-green/30 hover:bg-accent-green/5'
                            )}
                          >
                            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                              <div>
                                <p className="text-xs font-black uppercase text-text-main">{promise.milestone_title || 'Project milestone'}</p>
                                <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-text-dim">
                                  {promise.quote_number || 'No quote'} · Due {promise.due_date || 'Open'}
                                </p>
                              </div>
                              <span className={cn(
                                'w-fit rounded-full border px-3 py-1 text-[8px] font-black uppercase tracking-widest',
                                isSelected ? 'border-accent-green/30 bg-accent-green text-bg-deep' : 'border-white/10 bg-white/5 text-text-dim'
                              )}>
                                {isSelected ? 'Selected' : 'Choose'}
                              </span>
                            </div>
                            {recovered && (
                              <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-amber-200">
                                Amount recovered from quotation total. It will be repaired when the invoice is created.
                              </p>
                            )}
                            <div className="mt-4 grid grid-cols-3 gap-3">
                              <Meta label="Milestone" value={money(amount, business?.currency || 'KSh')} />
                              <Meta label="Paid" value={money(paid, business?.currency || 'KSh')} />
                              <Meta label="Balance" value={money(balance, business?.currency || 'KSh')} />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          <div>
            <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-text-dim">VAT Tax (%)</label>
            <input type="number" value={taxRate} onChange={event => setTaxRate(Number(event.target.value))} className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-text-main outline-none focus:border-accent-green" />
          </div>
          <div>
            <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-text-dim">Invoice Notes</label>
            <textarea value={notes} onChange={event => setNotes(event.target.value)} rows={4} className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-text-main outline-none focus:border-accent-green" />
          </div>
        </div>
        <div className="shrink-0 border-t border-white/5 p-6 pt-4">
          <button disabled={promises.length === 0 || !clientId || !selectedPromise || selectedAmount <= 0 || selectedAccountBalance <= 0} onClick={createInvoice} className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent-green px-5 py-4 text-[10px] font-black uppercase tracking-[0.18em] text-bg-deep transition-all disabled:opacity-40">
            <FileText className="h-4 w-4" />
            Create Invoice
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function getImageType(dataUrl: string) {
  if (dataUrl.includes('image/jpeg') || dataUrl.includes('image/jpg')) return 'JPEG';
  if (dataUrl.includes('image/webp')) return 'WEBP';
  return 'PNG';
}

function drawInvoiceInfoCard(doc: jsPDF, title: string, lines: string[], x: number, y: number, width: number, height: number) {
  doc.setDrawColor(238, 241, 245);
  doc.setFillColor(247, 249, 251);
  doc.roundedRect(x, y, width, height, 8, 8, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(18, 18, 18);
  doc.text(title, x + 14, y + 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(35, 35, 35);

  let lineY = y + 38;
  for (const line of lines.filter(Boolean).slice(0, 6)) {
    doc.text(line, x + 14, lineY, { maxWidth: width - 28 });
    lineY += 13;
  }
  doc.setTextColor(0, 0, 0);
}

function drawInvoiceFooter(doc: jsPDF, invoiceNumber: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setDrawColor(230, 230, 230);
  doc.line(48, pageHeight - 42, pageWidth - 48, pageHeight - 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(`Invoice ${invoiceNumber}`, 48, pageHeight - 24);
  doc.text('Generated by Rafiki Business Manager', pageWidth - 48, pageHeight - 24, { align: 'right' });
  doc.setTextColor(0, 0, 0);
}

function drawInvoiceLogo(doc: jsPDF, business: BusinessProfile | undefined, x: number, y: number) {
  const badgeSize = 70;
  const centerX = x + badgeSize / 2;
  const centerY = y + badgeSize / 2;

  doc.setFillColor(13, 13, 13);
  doc.circle(centerX, centerY, badgeSize / 2, 'F');

  if (business?.logo_base64) {
    try {
      const image = doc.getImageProperties(business.logo_base64);
      const maxSize = 52;
      const ratio = Math.min(maxSize / image.width, maxSize / image.height);
      const width = image.width * ratio;
      const height = image.height * ratio;
      doc.addImage(
        business.logo_base64,
        getImageType(business.logo_base64),
        centerX - width / 2,
        centerY - height / 2,
        width,
        height,
        undefined,
        'FAST'
      );
    } catch {
      doc.setTextColor(57, 255, 20);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text((business.name || 'RB').slice(0, 2).toUpperCase(), centerX, centerY + 5, { align: 'center' });
    }
  }

  doc.setDrawColor(235, 238, 242);
  doc.setLineWidth(1.4);
  doc.circle(centerX, centerY, badgeSize / 2 + 1.5, 'S');
  doc.setDrawColor(18, 18, 18);
  doc.setLineWidth(1);
  doc.circle(centerX, centerY, badgeSize / 2 - 6, 'S');
  doc.setTextColor(0, 0, 0);
}

function exportInvoicePdf(invoice: Invoice, business?: BusinessProfile, payments: Payment[] = [], clients: Client[] = []) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const items = parseInvoiceItems(invoice.items_json);
  const currency = invoice.currency || business?.currency || 'KSh';
  const dueSummary = getInvoiceDueSummary(invoice, payments, clients);
  const safePaid = Math.max(0, Number(dueSummary.paid) || 0);
  const safeBalance = Math.max(0, Number(dueSummary.accountBalance) || 0);
  const safeTax = Math.max(0, Number(dueSummary.taxAmount) || 0);
  const safeTotalDue = Math.max(0, Number(dueSummary.totalDue) || 0);
  const displayItems = safeBalance > 0 && safeBalance < (Number(invoice.subtotal) || Number(invoice.total) || 0)
    ? [{
        description: `Outstanding balance for ${invoice.milestone_title || invoice.quote_number || invoice.client_name}`,
        quantity: 1,
        total: safeBalance,
      }]
    : items;

  doc.setTextColor(18, 18, 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(26);
  doc.text('Invoice', 48, 66);

  doc.setTextColor(120, 120, 120);
  doc.setFontSize(9);
  doc.text('Invoice #', 48, 104);
  doc.text('Invoice Date', 48, 128);
  doc.setTextColor(25, 25, 25);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(invoice.invoice_number, 150, 104);
  doc.text(invoice.issue_date, 150, 128);

  const identityX = pageWidth - 246;
  const logoX = identityX;
  const textX = identityX + 86;
  const textMaxWidth = pageWidth - textX - 48;

  drawInvoiceLogo(doc, business, logoX, 38);
  doc.setTextColor(18, 18, 18);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  const businessNameLines = doc.splitTextToSize(business?.name || 'Rafiki Business Manager', textMaxWidth);
  doc.text(businessNameLines.slice(0, 3), textX, 60);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 100, 100);
  let businessContactY = 64 + (Math.min(businessNameLines.length, 3) * 14);
  if (business?.phone) {
    doc.text(`Tel: ${business.phone}`, textX, businessContactY, { maxWidth: textMaxWidth });
    businessContactY += 13;
  }
  if (business?.website) {
    doc.text(business.website, textX, businessContactY, { maxWidth: textMaxWidth });
  }

  const byLines = [
    business?.name || 'Rafiki Code Solutions',
    business?.address || 'Nairobi, Kenya',
    business?.phone || 'Contact Number Not Set',
    business?.email || business?.website || 'www.rafikicode.com',
    business?.till_number ? `Till: ${business.till_number}` : '',
  ];
  const toLines = [
    invoice.client_name || 'Valued Client',
    invoice.client_id,
    invoice.quote_number ? `Quote: ${invoice.quote_number}` : '',
    invoice.milestone_title ? `Milestone: ${invoice.milestone_title}` : '',
    `Due date: ${invoice.due_date}`,
  ];

  drawInvoiceInfoCard(doc, 'Invoice by', byLines, 48, 172, 220, 120);
  drawInvoiceInfoCard(doc, 'Invoice to', toLines, 308, 172, 239, 120);

  let y = 338;
  doc.setFillColor(20, 20, 20);
  doc.roundedRect(48, y - 24, pageWidth - 96, 34, 7, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text('Description', 62, y);
  doc.text('Qty', pageWidth - 190, y, { align: 'right' });
  doc.text('Amount', pageWidth - 62, y, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  y += 34;
  displayItems.forEach((item, index) => {
    const descriptionLines = doc.splitTextToSize(item.description, 315);
    const rowHeight = Math.max(36, descriptionLines.length * 12 + 18);
    if (y + rowHeight > pageHeight - 150) {
      drawInvoiceFooter(doc, invoice.invoice_number);
      doc.addPage();
      y = 70;
      doc.setFillColor(20, 20, 20);
      doc.roundedRect(48, y - 24, pageWidth - 96, 34, 7, 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      doc.text('Description', 62, y);
      doc.text('Qty', pageWidth - 190, y, { align: 'right' });
      doc.text('Amount', pageWidth - 62, y, { align: 'right' });
      y += 34;
    }

    if (index % 2 === 0) {
      doc.setFillColor(250, 250, 250);
      doc.rect(48, y - 16, pageWidth - 96, rowHeight, 'F');
    }
    doc.setTextColor(18, 18, 18);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(descriptionLines, 62, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text(String(item.quantity), pageWidth - 190, y, { align: 'right' });
    doc.setTextColor(18, 18, 18);
    doc.setFont('helvetica', 'bold');
    doc.text(money(item.total, currency), pageWidth - 62, y, { align: 'right' });
    y += rowHeight;
  });

  y += 22;
  if (y > pageHeight - 210) {
    drawInvoiceFooter(doc, invoice.invoice_number);
    doc.addPage();
    y = 70;
  }

  const summaryY = y;
  const summaryX = pageWidth - 278;
  const summaryW = 230;
  doc.setDrawColor(225, 230, 235);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(summaryX, summaryY - 20, summaryW, 142, 8, 8, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(40, 45, 55);
  doc.text('Client Account Summary', summaryX + 16, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(70, 75, 85);
  y += 18;
  doc.text('Subtotal', summaryX + 16, y);
  doc.text(money(dueSummary.projectSubtotal, currency), summaryX + summaryW - 16, y, { align: 'right' });
  y += 16;
  doc.text('Paid', summaryX + 16, y);
  doc.text(money(safePaid, currency), summaryX + summaryW - 16, y, { align: 'right' });
  y += 16;
  doc.text('Account Balance', summaryX + 16, y);
  doc.text(money(safeBalance, currency), summaryX + summaryW - 16, y, { align: 'right' });
  y += 16;
  doc.text(`VAT Tax (${invoice.tax_rate || 0}%)`, summaryX + 16, y);
  doc.text(money(safeTax, currency), summaryX + summaryW - 16, y, { align: 'right' });
  y += 18;
  doc.setDrawColor(220, 225, 230);
  doc.line(summaryX + 16, y - 10, summaryX + summaryW - 16, y - 10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(20, 20, 20);
  doc.setFontSize(14);
  doc.text('Total Due', summaryX + 16, y + 4);
  doc.text(money(safeTotalDue, currency), summaryX + summaryW - 16, y + 4, { align: 'right' });

  y = summaryY + 142;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');

  drawBusinessStamp(doc, business, 48, summaryY - 14);

  if (invoice.notes) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(55, 65, 75);
    doc.text(doc.splitTextToSize(invoice.notes, pageWidth - 96), 48, y + 30);
  }

  drawInvoiceFooter(doc, invoice.invoice_number);
  doc.save(`${invoice.invoice_number}.pdf`);
}

function drawBusinessStamp(doc: jsPDF, business?: BusinessProfile, x = 48, y = 0) {
  const date = new Date();
  const stampDate = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
  const company = (business?.name || 'Rafiki Business').toUpperCase();
  const phone = business?.phone || business?.till_number || 'N/A';
  const address = (business?.address || business?.website || 'NAIROBI, KENYA').toUpperCase();
  const blue = [0, 38, 255] as const;
  const width = 210;
  const height = 88;
  const centerX = x + width / 2;

  doc.setDrawColor(...blue);
  doc.setLineWidth(2.2);
  doc.roundedRect(x, y, width, height, 14, 14, 'S');
  doc.setLineWidth(0.8);
  doc.roundedRect(x + 4, y + 4, width - 8, height - 8, 10, 10, 'S');
  doc.setTextColor(...blue);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text(doc.splitTextToSize(company, width - 18).slice(0, 1), centerX, y + 26, { align: 'center' });
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(10.5);
  doc.text('Official Business Seal', centerX, y + 41, { align: 'center' });
  doc.setTextColor(255, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(stampDate, centerX, y + 59, { align: 'center' });
  doc.setTextColor(...blue);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11.5);
  doc.text(`Tel: ${phone}`, centerX, y + 74, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(doc.splitTextToSize(address, width - 12).slice(0, 1), centerX, y + 84, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  doc.setLineWidth(0.2);
}
