import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, ChevronLeft, ChevronRight, Download, FileText, Plus, ReceiptText, Send, X } from 'lucide-react';
import jsPDF from 'jspdf';
import { db, type BusinessProfile, type Client, type Invoice, type PaymentPromise } from '../db/db';
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

export function Invoices({ setView }: { setView?: (view: ViewType) => void }) {
  const { data: invoices } = useUnifiedCollection<Invoice>('invoices', () => db.invoices.orderBy('id').reverse().toArray());
  const { data: promises } = useUnifiedCollection<PaymentPromise>('billing_promises', () => db.billing_promises.toArray());
  const { data: clients } = useUnifiedCollection<Client>('clients', () => db.clients.toArray());
  const { data: business } = useUnifiedCollection<BusinessProfile>('business', () => db.business.toArray());
  const { addEntity, updateEntity, isOnline } = useSync();
  const { showToast } = useToast();
  const [statusFilter, setStatusFilter] = useState<'all' | Invoice['status']>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const filteredInvoices = useMemo(() => {
    return (invoices || [])
      .filter(invoice => statusFilter === 'all' || invoice.status === statusFilter)
      .sort((a, b) => String(b.issue_date || '').localeCompare(String(a.issue_date || '')));
  }, [invoices, statusFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter]);

  const getPageRange = (page: number) => {
    if (page === 1) return { start: 0, end: 5 };
    const start = 5 + (page - 2) * 10;
    return { start, end: start + 10 };
  };
  const { start, end } = getPageRange(currentPage);
  const paginatedInvoices = filteredInvoices.slice(start, end);
  const totalPages = filteredInvoices.length <= 5 ? 1 : 1 + Math.ceil((filteredInvoices.length - 5) / 10);

  const existingPromiseIds = new Set((invoices || []).map(invoice => invoice.billing_promise_id).filter(Boolean));
  const existingPromiseKeys = new Set((invoices || []).map(invoice => `${invoice.client_id}:${invoice.quote_number || ''}:${invoice.milestone_title || ''}`));
  const billablePromises = (promises || [])
    .filter(promise => {
      const promiseKey = `${promise.client_id}:${promise.quote_number || ''}:${promise.milestone_title || ''}`;
      return promise.status !== 'fulfilled' &&
        !existingPromiseIds.has(String(promise.id || promise.pb_id || '')) &&
        !existingPromiseKeys.has(promiseKey);
    })
    .sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')));

  const totals = {
    draft: (invoices || []).filter(invoice => invoice.status === 'draft').length,
    sent: (invoices || []).filter(invoice => invoice.status === 'sent').length,
    paid: (invoices || []).filter(invoice => invoice.status === 'paid').length,
    receivable: (invoices || []).filter(invoice => invoice.status !== 'paid' && invoice.status !== 'void').reduce((sum, invoice) => sum + (Number(invoice.total) || 0), 0),
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

      <div className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/5 p-1 w-fit">
        {(['all', 'draft', 'sent', 'paid', 'void'] as const).map(status => (
          <button key={status} onClick={() => setStatusFilter(status)} className={cn(
            'rounded-xl px-5 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all',
            statusFilter === status ? 'bg-accent-green text-bg-deep shadow-neon' : 'text-text-dim hover:text-text-main'
          )}>
            {status}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {paginatedInvoices.map(invoice => (
          <article key={String(invoice.id || invoice.pb_id || invoice.invoice_number)} className="glass-panel rounded-3xl border-white/10 p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-accent-green">{invoice.invoice_number}</p>
                <h2 className="mt-2 truncate text-xl font-black uppercase tracking-tight text-text-main">{invoice.client_name}</h2>
                <p className="mt-1 text-xs font-bold uppercase tracking-widest text-text-dim">{invoice.quote_number || 'General billing'} · {invoice.milestone_title || 'Invoice'}</p>
              </div>
              <p className="shrink-0 text-right text-xl font-black text-accent-green">{money(invoice.total, invoice.currency)}</p>
            </div>
            <div className="mt-6 grid grid-cols-3 gap-3 border-y border-white/5 py-4">
              <Meta label="Issued" value={invoice.issue_date} />
              <Meta label="Due" value={invoice.due_date} />
              <Meta label="Status" value={invoice.status} status={invoice.status} />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button onClick={() => exportInvoicePdf(invoice, business?.[0])} className="flex items-center gap-2 rounded-xl border border-accent-green/30 bg-accent-green/10 px-4 py-2 text-[9px] font-black uppercase tracking-widest text-accent-green transition-all hover:bg-accent-green hover:text-bg-deep">
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
        ))}
      </div>

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
            business={business?.[0]}
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
  business,
  addEntity,
  onClose,
  onOpenQuotations,
  showToast,
}: {
  promises: PaymentPromise[];
  existingInvoiceNumbers: string[];
  clients: Client[];
  business?: BusinessProfile;
  addEntity: any;
  onClose: () => void;
  onOpenQuotations?: () => void;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}) {
  const [promiseId, setPromiseId] = useState('');
  const [taxRate, setTaxRate] = useState(0);
  const [notes, setNotes] = useState('Payment is due by the stated due date. Please reference the invoice number when making payment.');
  const selectedPromise = promises.find(promise => String(promise.id || promise.pb_id) === promiseId);
  const client = clients.find(item => item.node_id === selectedPromise?.client_id);

  const createInvoice = async () => {
    if (!selectedPromise) {
      showToast('Select a billable milestone first', 'warning');
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
        description: selectedPromise.milestone_title || `Milestone billing for ${selectedPromise.quote_number || selectedPromise.client_id}`,
        quantity: 1,
        unit_price: Number(selectedPromise.amount_due) || 0,
      }],
    });
    await addEntity('invoices', payload);
    showToast('Invoice generated from billing milestone', 'success');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-bg-deep/80 backdrop-blur-xl" />
      <motion.div initial={{ opacity: 0, y: 18, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: 0.96 }} className="relative w-full max-w-2xl rounded-3xl border border-white/10 bg-bg-deep p-7 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
        <div className="mb-7 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-accent-green">Milestone Invoice</p>
            <h2 className="mt-2 text-3xl font-black uppercase tracking-tight text-text-main">Generate Invoice</h2>
          </div>
          <button onClick={onClose} className="rounded-xl bg-white/5 p-3 text-text-dim hover:text-text-main"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-5">
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
            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-text-dim">Billable Milestone</label>
              <select value={promiseId} onChange={event => setPromiseId(event.target.value)} className="w-full rounded-xl border border-white/10 bg-bg-deep px-4 py-3 text-xs font-black uppercase text-text-main outline-none focus:border-accent-green">
                <option value="">Select pending milestone</option>
                {promises.map(promise => (
                  <option key={String(promise.id || promise.pb_id)} value={String(promise.id || promise.pb_id)}>
                    {(promise.quote_number || 'Billing')} - {promise.milestone_title || 'Milestone'} - KSh {(Number(promise.amount_due) || 0).toLocaleString()}
                  </option>
                ))}
              </select>
            </div>
          )}
          {selectedPromise && (
            <div className="rounded-2xl border border-accent-green/20 bg-accent-green/5 p-4">
              <p className="text-xs font-black uppercase text-text-main">{client?.name || selectedPromise.client_id}</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-text-dim">{selectedPromise.quote_number || 'No quote'} · Due {selectedPromise.due_date}</p>
            </div>
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
        <button disabled={promises.length === 0} onClick={createInvoice} className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-accent-green px-5 py-4 text-[10px] font-black uppercase tracking-[0.18em] text-bg-deep transition-all disabled:opacity-40">
          <FileText className="h-4 w-4" />
          Create Invoice
        </button>
      </motion.div>
    </div>
  );
}

function exportInvoicePdf(invoice: Invoice, business?: BusinessProfile) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const items = parseInvoiceItems(invoice.items_json);
  const currency = invoice.currency || business?.currency || 'KSh';

  doc.setFillColor(12, 14, 16);
  doc.rect(0, 0, pageWidth, 118, 'F');
  doc.setTextColor(57, 255, 20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('Invoice', 48, 52);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text(invoice.invoice_number, 48, 75);

  if (business?.logo_base64) {
    doc.addImage(business.logo_base64, 'PNG', pageWidth - 142, 34, 74, 52, undefined, 'FAST');
  } else {
    doc.setFontSize(16);
    doc.text(business?.name || 'Rafiki', pageWidth - 150, 58);
  }

  doc.setTextColor(30, 30, 30);
  doc.setFontSize(9);
  doc.text(business?.name || 'Rafiki Business', 48, 148);
  doc.setFont('helvetica', 'normal');
  doc.text([business?.email, business?.phone, business?.website].filter(Boolean).join('  |  ') || 'Business profile details', 48, 164);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Bill To', 48, 205);
  doc.setFont('helvetica', 'normal');
  doc.text(invoice.client_name, 48, 222);
  doc.text(invoice.client_id, 48, 238);

  doc.setFont('helvetica', 'bold');
  doc.text('Invoice Details', pageWidth - 210, 205);
  doc.setFont('helvetica', 'normal');
  doc.text(`Issue: ${invoice.issue_date}`, pageWidth - 210, 222);
  doc.text(`Due: ${invoice.due_date}`, pageWidth - 210, 238);
  doc.text(`Status: ${invoice.status.toUpperCase()}`, pageWidth - 210, 254);

  let y = 304;
  doc.setFillColor(244, 246, 248);
  doc.rect(48, y - 22, pageWidth - 96, 34, 'F');
  doc.setFont('helvetica', 'bold');
  doc.text('Description', 62, y);
  doc.text('Qty', pageWidth - 190, y, { align: 'right' });
  doc.text('Amount', pageWidth - 62, y, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  y += 34;
  items.forEach(item => {
    doc.text(doc.splitTextToSize(item.description, 310), 62, y);
    doc.text(String(item.quantity), pageWidth - 190, y, { align: 'right' });
    doc.text(money(item.total, currency), pageWidth - 62, y, { align: 'right' });
    y += 34;
  });

  y += 20;
  doc.setFont('helvetica', 'bold');
  doc.text('Subtotal', pageWidth - 210, y);
  doc.text(money(invoice.subtotal, currency), pageWidth - 62, y, { align: 'right' });
  y += 18;
  doc.text(`VAT Tax (${invoice.tax_rate || 0}%)`, pageWidth - 210, y);
  doc.text(money(invoice.tax_amount, currency), pageWidth - 62, y, { align: 'right' });
  y += 26;
  doc.setFontSize(14);
  doc.text('Total Due', pageWidth - 210, y);
  doc.text(money(invoice.total, currency), pageWidth - 62, y, { align: 'right' });

  if (invoice.notes) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(doc.splitTextToSize(invoice.notes, pageWidth - 96), 48, y + 55);
  }

  doc.save(`${invoice.invoice_number}.pdf`);
}
