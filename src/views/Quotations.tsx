import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Calculator, CheckCircle2, ChevronLeft, ChevronRight, CopyPlus, CreditCard, Download, Edit2, FileSpreadsheet, FileText, Plus, Save, Search, Trash2, Upload, X } from 'lucide-react';
import jsPDF from 'jspdf';
import { db, type BusinessProfile, type Client, type QuoteLineItem, type Quotation, type QuotationTemplate } from '../db/db';
import { useUnifiedCollection } from '../hooks/useUnifiedCollection';
import { useSync } from '../hooks/useSync';
import { useToast } from '../contexts/ToastContext';
import { cn } from '../lib/utils';
import { pb } from '../lib/pocketbase';
import {
  buildQuotationPayload,
  calculateQuotationTotals,
  DEFAULT_QUOTATION_TERMS,
  generateQuoteNumber,
  normalizeQuoteItem,
  parseQuotationTerms,
  parseQuoteItems,
} from '../services/quotationService';

const DEFAULT_VAT_RATE = 16;
const QUOTATION_TEMPLATE_HEADERS = ['description', 'scope_summary', 'category', 'quantity', 'unit_price', 'unit', 'notes'];
const CARD_STATUS_OPTIONS: Array<Quotation['status']> = ['draft', 'sent', 'accepted'];

const blankItem = (): QuoteLineItem => normalizeQuoteItem({
  description: '',
  scope_summary: '',
  quantity: 1,
  unit_price: 0,
  unit: 'item',
});

function csvEscape(value: string | number) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadQuotationTemplate() {
  const sampleRows = [
    QUOTATION_TEMPLATE_HEADERS,
    ['UI/UX Design', 'Wireframes, product flow, polished UI screens, and responsive design direction.', 'Design', 1, 25000, 'phase', 'Discovery and design execution'],
    ['Web App Development', 'Frontend, backend, database integration, authentication, and deployment support.', 'Development', 1, 120000, 'project', 'Core implementation'],
    ['PocketHost Setup', 'Provisioning, DNS coordination, and runtime configuration.', 'Hosting', 1, 0, 'item', 'Internal accountability item if needed'],
  ];
  const csv = sampleRows.map(row => row.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'Rafiki_Quotation_Template.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

function parseQuotationCsv(csv: string) {
  const rows = csv
    .split(/\r?\n/)
    .map(row => row.trim())
    .filter(Boolean)
    .map(parseCsvLine);
  if (rows.length < 2) return [];

  const headers = rows[0].map(header => header.toLowerCase().trim());
  const indexOf = (header: string) => headers.indexOf(header);

  return rows.slice(1)
    .map(row => normalizeQuoteItem({
      description: row[indexOf('description')] || '',
      scope_summary: row[indexOf('scope_summary')] || '',
      category: row[indexOf('category')] || '',
      quantity: Number(row[indexOf('quantity')]) || 1,
      unit_price: Number(row[indexOf('unit_price')]) || 0,
      unit: row[indexOf('unit')] || 'item',
      notes: row[indexOf('notes')] || '',
    }))
    .filter(item => item.description.trim());
}

function formatMoney(amount: number, currency = 'KSh') {
  return `${currency} ${(Number(amount) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function todayDate() {
  return new Date().toISOString().split('T')[0];
}

function defaultExpiry() {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return date.toISOString().split('T')[0];
}

function normalizeDateInput(value?: string) {
  if (!value) return '';
  return value.includes('T') ? value.split('T')[0] : value;
}

function getQuoteId(quote: any) {
  return String(quote.id || quote.pb_id || quote.quote_number);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next.toISOString().split('T')[0];
}

type BillingMilestoneDraft = {
  title: string;
  percent: number;
  amount: number;
  due_date: string;
};

export function Quotations() {
  const { data: quotations } = useUnifiedCollection<Quotation>('quotations', () => db.quotations.orderBy('id').reverse().toArray());
  const { data: templates } = useUnifiedCollection<QuotationTemplate>('quotation_templates', () => db.quotation_templates.toArray());
  const { data: business } = useUnifiedCollection<BusinessProfile>('business', () => db.business.toArray());
  const { addEntity, updateEntity, deleteEntity, isOnline } = useSync();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Quotation['status']>('all');
  const [editingQuote, setEditingQuote] = useState<Quotation | null>(null);
  const [quotePendingDelete, setQuotePendingDelete] = useState<Quotation | null>(null);
  const [billingPlanQuote, setBillingPlanQuote] = useState<Quotation | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const filteredQuotes = useMemo(() => {
    return (quotations || [])
      .filter((quote: any) => {
        const haystack = `${quote.quote_number} ${quote.prospect_name} ${quote.project_title}`.toLowerCase();
        const matchesSearch = haystack.includes(search.toLowerCase());
        const matchesStatus = statusFilter === 'all' || quote.status === statusFilter;
        return matchesSearch && matchesStatus;
      })
      .sort((a: any, b: any) => String(b.issue_date || '').localeCompare(String(a.issue_date || '')));
  }, [quotations, search, statusFilter]);

  const totals = useMemo(() => {
    const all = quotations || [];
    return {
      draft: all.filter((q: any) => q.status === 'draft').length,
      sent: all.filter((q: any) => q.status === 'sent').length,
      accepted: all.filter((q: any) => q.status === 'accepted').length,
      value: all.reduce((sum: number, q: any) => sum + (Number(q.total) || 0), 0),
    };
  }, [quotations]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter]);

  const getPageRange = (page: number) => {
    if (page === 1) return { start: 0, end: 5 };
    const start = 5 + (page - 2) * 10;
    return { start, end: start + 10 };
  };
  const { start, end } = getPageRange(currentPage);
  const paginatedQuotes = filteredQuotes.slice(start, end);
  const totalPages = filteredQuotes.length <= 5 ? 1 : 1 + Math.ceil((filteredQuotes.length - 5) / 10);

  const openCreate = () => {
    setEditingQuote(null);
    setIsModalOpen(true);
  };

  const openEdit = (quote: Quotation) => {
    setEditingQuote(quote);
    setIsModalOpen(true);
  };

  const handleDelete = async () => {
    if (!quotePendingDelete) return;
    setIsDeleting(true);
    try {
      const quote = quotePendingDelete;
      if (typeof quote.id === 'number') {
        await deleteEntity('quotations', quote.id);
      } else if (import.meta.env.VITE_AUTH_MODE === 'pocketbase' && isOnline) {
        await pb.collection('quotations').delete(quote.id as any);
      }
      setQuotePendingDelete(null);
      showToast('Quotation deleted', 'success');
    } catch (error: any) {
      console.error('Quotation delete failed:', error);
      showToast(error?.message || 'Failed to delete quotation', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handlePdf = (quote: Quotation) => {
    exportQuotationPdf(quote, business?.[0]);
  };

  const handleCardStatusChange = async (quote: Quotation, nextStatus: Quotation['status']) => {
    if (quote.status === nextStatus) return;
    const quoteId = getQuoteId(quote);
    setUpdatingStatusId(quoteId);

    try {
      if (typeof quote.id === 'number') {
        await updateEntity('quotations', quote.id, { status: nextStatus });
      } else if (import.meta.env.VITE_AUTH_MODE === 'pocketbase' && isOnline) {
        await pb.collection('quotations').update(quote.id as any, { status: nextStatus });
      } else if (quote.pb_id) {
        const local = await db.quotations.where('pb_id').equals(quote.pb_id).first();
        if (local?.id) await updateEntity('quotations', local.id, { status: nextStatus });
      }
      showToast(`Quotation marked ${nextStatus}`, 'success');
    } catch (error: any) {
      console.error('Quotation status update failed:', error);
      showToast(error?.message || 'Failed to update quotation status', 'error');
    } finally {
      setUpdatingStatusId(null);
    }
  };

  return (
    <div className="space-y-10 pb-20">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tighter text-text-main">Quotations</h1>
          <p className="mt-2 text-xs font-bold uppercase tracking-[0.2em] text-accent-green drop-shadow-[0_0_8px_rgba(57,255,20,0.5)]">
            Prospect pricing and PDF estimates
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center justify-center gap-2 rounded-xl bg-accent-green px-6 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-bg-deep neon-glow transition-all active:scale-95"
        >
          <Plus className="h-4 w-4" />
          New Quotation
        </button>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {[
          { label: 'Pipeline Value', value: formatMoney(totals.value), icon: Calculator },
          { label: 'Drafts', value: totals.draft, icon: FileText },
          { label: 'Sent', value: totals.sent, icon: Download },
          { label: 'Accepted', value: totals.accepted, icon: CheckCircle2 },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="glass-panel rounded-2xl p-5">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-text-dim">{stat.label}</p>
                <Icon className="h-4 w-4 text-accent-green" />
              </div>
              <p className="text-2xl font-black text-text-main">{stat.value}</p>
            </div>
          );
        })}
      </section>

      <section className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative md:w-[360px]">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dim" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search quotes"
            className="w-full rounded-2xl border border-white/10 bg-white/[0.03] py-3 pl-11 pr-4 text-sm font-bold text-text-main outline-none transition-all focus:border-accent-green/40"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {(['all', 'draft', 'sent', 'accepted', 'declined', 'expired'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={cn(
                'rounded-xl border px-4 py-2 text-[9px] font-black uppercase tracking-[0.16em] transition-all',
                statusFilter === status
                  ? 'border-accent-green/40 bg-accent-green/10 text-accent-green'
                  : 'border-white/10 bg-white/[0.02] text-text-dim hover:text-text-main'
              )}
            >
              {status}
            </button>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {paginatedQuotes.map((quote: any) => (
          <article key={getQuoteId(quote)} className="glass-panel rounded-3xl p-6 transition-all hover:border-accent-green/30">
            <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.025] p-1">
              <div className="grid grid-cols-3 gap-1">
                {CARD_STATUS_OPTIONS.map((status) => {
                  const isActive = quote.status === status;
                  const isBusy = updatingStatusId === getQuoteId(quote);
                  return (
                    <button
                      key={status}
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleCardStatusChange(quote, status)}
                      className={cn(
                        'min-h-10 rounded-xl px-3 text-[9px] font-black uppercase tracking-[0.16em] transition-all disabled:cursor-wait disabled:opacity-60',
                        isActive
                          ? 'bg-accent-green text-bg-deep shadow-[0_0_18px_rgba(57,255,20,0.22)]'
                          : 'text-text-dim hover:bg-white/5 hover:text-text-main'
                      )}
                    >
                      {isBusy && isActive ? 'Saving' : status}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-accent-green/25 bg-accent-green/10 px-3 py-1 text-[8px] font-black uppercase tracking-[0.18em] text-accent-green">
                    {quote.quote_number}
                  </span>
                  <span className={cn(
                    'rounded-full border px-3 py-1 text-[8px] font-black uppercase tracking-[0.18em]',
                    quote.status === 'accepted' && 'border-accent-green/30 bg-accent-green/10 text-accent-green',
                    quote.status === 'sent' && 'border-blue-400/30 bg-blue-400/10 text-blue-300',
                    quote.status === 'draft' && 'border-white/10 bg-white/5 text-text-dim',
                    (quote.status === 'declined' || quote.status === 'expired') && 'border-red-500/30 bg-red-500/10 text-red-400'
                  )}>
                    {quote.status}
                  </span>
                </div>
                <h2 className="truncate text-xl font-black uppercase tracking-tight text-text-main">{quote.project_title}</h2>
                <p className="mt-1 text-xs font-bold uppercase tracking-widest text-text-dim">{quote.prospect_name}</p>
              </div>
              <p className="shrink-0 text-right text-xl font-black text-accent-green">{formatMoney(Number(quote.total) || 0, quote.currency)}</p>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4 border-y border-white/5 py-4">
              <div>
                <p className="text-[8px] font-black uppercase tracking-[0.18em] text-text-dim">Issued</p>
                <p className="mt-1 text-xs font-bold text-text-main">{normalizeDateInput(quote.issue_date) || 'N/A'}</p>
              </div>
              <div>
                <p className="text-[8px] font-black uppercase tracking-[0.18em] text-text-dim">Valid Until</p>
                <p className="mt-1 text-xs font-bold text-text-main">{normalizeDateInput(quote.valid_until) || 'Open'}</p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button onClick={() => openEdit(quote)} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-[9px] font-black uppercase tracking-widest text-text-dim transition-all hover:text-accent-green">
                <Edit2 className="h-3.5 w-3.5" />
                Edit
              </button>
              <button onClick={() => handlePdf(quote)} className="flex items-center gap-2 rounded-xl border border-accent-green/30 bg-accent-green/10 px-4 py-2 text-[9px] font-black uppercase tracking-widest text-accent-green transition-all hover:bg-accent-green hover:text-bg-deep">
                <Download className="h-3.5 w-3.5" />
                PDF
              </button>
              {quote.status === 'accepted' && (
                <button
                  onClick={() => !quote.billing_plan_created && setBillingPlanQuote(quote)}
                  disabled={quote.billing_plan_created}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-4 py-2 text-[9px] font-black uppercase tracking-widest transition-all",
                    quote.billing_plan_created
                      ? "cursor-default border-accent-green/20 bg-accent-green/10 text-accent-green"
                      : "border-blue-400/30 bg-blue-400/10 text-blue-300 hover:bg-blue-400 hover:text-bg-deep"
                  )}
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  {quote.billing_plan_created ? 'Milestones Set' : 'Set Billable Milestones'}
                </button>
              )}
              <button onClick={() => setQuotePendingDelete(quote)} className="ml-auto flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-2 text-[9px] font-black uppercase tracking-widest text-red-400 transition-all hover:bg-red-500/10">
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </div>
          </article>
        ))}

        {filteredQuotes.length === 0 && (
          <div className="glass-panel rounded-3xl border-dashed border-white/10 p-12 text-center lg:col-span-2">
            <FileText className="mx-auto h-12 w-12 text-accent-green/50" />
            <h2 className="mt-5 text-xl font-black uppercase tracking-widest text-text-main">No Quotations Yet</h2>
            <p className="mx-auto mt-3 max-w-md text-xs font-medium leading-relaxed text-text-dim">
              Create your first prospect quotation, add line items, save templates, then export a branded PDF.
            </p>
          </div>
        )}
      </section>

      {totalPages > 1 && (
        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          start={start}
          end={end}
          totalItems={filteredQuotes.length}
          onPageChange={setCurrentPage}
        />
      )}

      <AnimatePresence>
        {isModalOpen && (
          <QuotationModal
            quote={editingQuote}
            templates={templates || []}
            existingQuoteNumbers={(quotations || []).map(quote => quote.quote_number)}
            onClose={() => setIsModalOpen(false)}
            addEntity={addEntity}
            updateEntity={updateEntity}
            isOnline={isOnline}
            showToast={showToast}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {quotePendingDelete && (
          <DeleteQuoteNotice
            quote={quotePendingDelete}
            isDeleting={isDeleting}
            onCancel={() => setQuotePendingDelete(null)}
            onConfirm={handleDelete}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {billingPlanQuote && (
          <BillingPlanModal
            quote={billingPlanQuote}
            onClose={() => setBillingPlanQuote(null)}
            addEntity={addEntity}
            updateEntity={updateEntity}
            isOnline={isOnline}
            showToast={showToast}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function BillingPlanModal({
  quote,
  onClose,
  addEntity,
  updateEntity,
  isOnline,
  showToast,
}: {
  quote: Quotation;
  onClose: () => void;
  addEntity: any;
  updateEntity: any;
  isOnline: boolean;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}) {
  const { data: clients } = useUnifiedCollection<Client>('clients', () => db.clients.toArray());
  const existingClient = (clients || []).find(client => client.node_id === quote.client_id);
  const [clientId, setClientId] = useState(quote.client_id || '');
  const [clientName, setClientName] = useState(existingClient?.name || quote.prospect_name || '');
  const [saving, setSaving] = useState(false);
  const [milestones, setMilestones] = useState<BillingMilestoneDraft[]>(() => {
    const total = Number(quote.total) || 0;
    const base = new Date();
    return [
      { title: 'Project Kickoff Deposit', percent: 40, amount: Math.round(total * 0.4), due_date: addDays(base, 0) },
      { title: 'Build Progress Milestone', percent: 40, amount: Math.round(total * 0.4), due_date: addDays(base, 21) },
      { title: 'Deployment & Handover', percent: 20, amount: Math.round(total * 0.2), due_date: addDays(base, 45) },
    ];
  });

  const plannedTotal = milestones.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const selectedClient = (clients || []).find(client => client.node_id === clientId);

  const updateMilestone = (index: number, patch: Partial<BillingMilestoneDraft>) => {
    setMilestones(prev => prev.map((item, idx) => idx === index ? { ...item, ...patch } : item));
  };

  const ensureClient = async () => {
    if (selectedClient) {
      if (typeof selectedClient.id === 'number') {
        await updateEntity('clients', selectedClient.id, {
          agreed_price: Math.max(Number(selectedClient.agreed_price) || 0, Number(quote.total) || 0),
          project_tag: selectedClient.project_tag || quote.project_title,
          project_desc: selectedClient.project_desc || quote.project_summary || '',
        });
      } else if (import.meta.env.VITE_AUTH_MODE === 'pocketbase' && isOnline) {
        await pb.collection('clients').update(selectedClient.id as any, {
          agreed_price: Math.max(Number(selectedClient.agreed_price) || 0, Number(quote.total) || 0),
          project_tag: selectedClient.project_tag || quote.project_title,
          project_desc: selectedClient.project_desc || quote.project_summary || '',
        });
      }
      return selectedClient.node_id;
    }

    const nodeId = clientId || `CL-${Math.floor(Math.random() * 9000 + 1000)}`;
    await addEntity('clients', {
      node_id: nodeId,
      name: clientName || quote.prospect_name,
      entity_type: 'COMPANY',
      email: quote.prospect_email || '',
      phone: quote.prospect_phone || '+254',
      agreed_price: Number(quote.total) || 0,
      deposit_paid: false,
      initial_meeting: new Date().toISOString(),
      target_payment: milestones[0]?.due_date || new Date().toISOString(),
      project_tag: quote.project_title,
      app_built: quote.project_title,
      project_desc: quote.project_summary || '',
      contact_json: JSON.stringify({ email: quote.prospect_email || '', phone: quote.prospect_phone || '' }),
      notes: `Converted from quotation ${quote.quote_number}`,
    });
    return nodeId;
  };

  const handleCreatePlan = async () => {
    const validMilestones = milestones.filter(item => item.title.trim() && Number(item.amount) > 0 && item.due_date);
    if (!clientName.trim() || validMilestones.length === 0) {
      showToast('Add a client name and at least one milestone', 'warning');
      return;
    }

    setSaving(true);
    try {
      const resolvedClientId = await ensureClient();
      for (const milestone of validMilestones) {
        await addEntity('billing_promises', {
          amount_due: Number(milestone.amount),
          due_date: milestone.due_date,
          client_id: resolvedClientId,
          quote_id: getQuoteId(quote),
          quote_number: quote.quote_number,
          milestone_title: milestone.title,
          notes: `Billing milestone from quotation ${quote.quote_number}`,
          payment_method: 'Mpesa',
          status: 'pending',
          created_at: new Date().toISOString(),
        });
      }

      const quotePatch = { client_id: resolvedClientId, billing_plan_created: true, status: 'accepted' as const };
      if (typeof quote.id === 'number') {
        await updateEntity('quotations', quote.id, quotePatch);
      } else if (import.meta.env.VITE_AUTH_MODE === 'pocketbase' && isOnline) {
        await pb.collection('quotations').update(quote.id as any, quotePatch);
      }

      showToast('Billable milestones set from accepted quote', 'success');
      onClose();
    } catch (error: any) {
      console.error('Billing plan creation failed:', error);
      showToast(error?.message || 'Failed to create billing plan', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-bg-deep/80 backdrop-blur-xl" />
      <motion.div initial={{ opacity: 0, y: 18, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: 0.96 }} className="relative max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-white/10 bg-bg-deep p-7 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
        <div className="mb-7 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-accent-green">Accepted Quote Billing</p>
            <h2 className="mt-2 text-3xl font-black uppercase tracking-tight text-text-main">Set Billable Milestones</h2>
            <p className="mt-2 text-sm font-medium text-text-dim">{quote.quote_number} · {formatMoney(Number(quote.total) || 0, quote.currency)}</p>
          </div>
          <button onClick={onClose} className="rounded-xl bg-white/5 p-3 text-text-dim hover:text-text-main"><X className="h-5 w-5" /></button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input label="Client Node ID" value={clientId} onChange={setClientId} placeholder="Auto-created if empty" />
          <Input label="Client Name" value={clientName} onChange={setClientName} required />
        </div>

        <div className="mt-7 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black uppercase tracking-widest text-text-main">Invoice Milestones</h3>
            <p className={cn("text-xs font-black", Math.abs(plannedTotal - (Number(quote.total) || 0)) < 1 ? "text-accent-green" : "text-amber-400")}>
              Planned: {formatMoney(plannedTotal, quote.currency)}
            </p>
          </div>
          {milestones.map((milestone, index) => (
            <div key={index} className="grid grid-cols-1 gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:grid-cols-[1fr_110px_140px_40px]">
              <input value={milestone.title} onChange={event => updateMilestone(index, { title: event.target.value })} className="rounded-xl border border-white/10 bg-bg-deep px-3 py-2 text-sm font-bold text-text-main outline-none" />
              <input type="number" value={milestone.amount} onChange={event => updateMilestone(index, { amount: Number(event.target.value), percent: ((Number(event.target.value) || 0) / (Number(quote.total) || 1)) * 100 })} className="rounded-xl border border-white/10 bg-bg-deep px-3 py-2 text-sm font-bold text-text-main outline-none" />
              <input type="date" value={milestone.due_date} onChange={event => updateMilestone(index, { due_date: event.target.value })} className="rounded-xl border border-white/10 bg-bg-deep px-3 py-2 text-sm font-bold text-text-main outline-none" />
              <button type="button" onClick={() => setMilestones(prev => prev.filter((_, idx) => idx !== index))} className="rounded-xl bg-red-500/10 p-2 text-red-400"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <button type="button" onClick={() => setMilestones(prev => [...prev, { title: 'Custom Milestone', percent: 0, amount: 0, due_date: addDays(new Date(), 30) }])} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[10px] font-black uppercase tracking-widest text-accent-green">
            <Plus className="h-4 w-4" />
            Add Billable Milestone
          </button>
        </div>

        <button disabled={saving} onClick={handleCreatePlan} className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-accent-green px-5 py-4 text-[10px] font-black uppercase tracking-[0.18em] text-bg-deep transition-all disabled:opacity-50">
          <CreditCard className="h-4 w-4" />
          {saving ? 'Saving Milestones...' : 'Save Billable Milestones'}
        </button>
      </motion.div>
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

function DeleteQuoteNotice({
  quote,
  isDeleting,
  onCancel,
  onConfirm,
}: {
  quote: Quotation;
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
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-red-400">Delete Quotation</p>
              <h2 className="mt-2 text-2xl font-black uppercase tracking-tight text-text-main">Confirm Removal</h2>
              <p className="mt-3 text-sm font-medium leading-relaxed text-text-dim">
                This will permanently remove quotation <span className="font-black text-text-main">{quote.quote_number}</span> for <span className="font-black text-text-main">{quote.prospect_name}</span>.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-text-dim">Project</p>
            <p className="mt-1 truncate text-sm font-black text-text-main">{quote.project_title}</p>
            <p className="mt-2 text-xl font-black text-accent-green">{formatMoney(Number(quote.total) || 0, quote.currency)}</p>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={isDeleting}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-text-main transition-all hover:bg-white/10 disabled:opacity-50"
            >
              Keep Quote
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

function QuotationModal({
  quote,
  templates,
  existingQuoteNumbers,
  onClose,
  addEntity,
  updateEntity,
  isOnline,
  showToast,
}: {
  quote: Quotation | null;
  templates: QuotationTemplate[];
  existingQuoteNumbers: string[];
  onClose: () => void;
  addEntity: any;
  updateEntity: any;
  isOnline: boolean;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}) {
  const { data: clients } = useUnifiedCollection<Client>('clients', () => db.clients.toArray());
  const [quoteNumber] = useState(() => quote?.quote_number || generateQuoteNumber(new Date(), existingQuoteNumbers));
  const [clientId, setClientId] = useState(quote?.client_id || '');
  const [prospectName, setProspectName] = useState(quote?.prospect_name || '');
  const [prospectEmail, setProspectEmail] = useState(quote?.prospect_email || '');
  const [prospectPhone, setProspectPhone] = useState(quote?.prospect_phone || '');
  const [projectTitle, setProjectTitle] = useState(quote?.project_title || '');
  const [projectSummary, setProjectSummary] = useState(quote?.project_summary || '');
  const [issueDate, setIssueDate] = useState(normalizeDateInput(quote?.issue_date) || todayDate());
  const [validUntil, setValidUntil] = useState(normalizeDateInput(quote?.valid_until) || defaultExpiry());
  const [status, setStatus] = useState<Quotation['status']>(quote?.status || 'draft');
  const [currency, setCurrency] = useState(quote?.currency || 'KSh');
  const [discountAmount, setDiscountAmount] = useState(String(quote?.discount_amount || 0));
  const [taxRate, setTaxRate] = useState(String(quote?.tax_rate ?? DEFAULT_VAT_RATE));
  const [notes, setNotes] = useState(quote?.notes || '');
  const [termsText, setTermsText] = useState(parseQuotationTerms(quote?.terms_json).join('\n'));
  const [items, setItems] = useState<QuoteLineItem[]>(() => {
    const parsed = parseQuoteItems(quote?.items_json);
    return parsed.length ? parsed : [blankItem()];
  });
  const [templateTitle, setTemplateTitle] = useState('');
  const [saving, setSaving] = useState(false);

  const totals = useMemo(() => calculateQuotationTotals(items, {
    discountAmount: Number(discountAmount) || 0,
    taxRate: Number(taxRate) || 0,
  }), [discountAmount, items, taxRate]);

  const applyClient = (value: string) => {
    setClientId(value);
    const client = (clients || []).find(c => c.node_id === value);
    if (client) {
      setProspectName(client.name);
      setProspectEmail(client.email);
      setProspectPhone(client.phone);
      if (!projectTitle) setProjectTitle(client.project_tag || client.app_built || '');
      if (!projectSummary) setProjectSummary(client.project_desc || '');
    }
  };

  const updateItem = (index: number, patch: Partial<QuoteLineItem>) => {
    setItems(prev => prev.map((item, idx) => idx === index ? normalizeQuoteItem({ ...item, ...patch }) : item));
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== index) : [blankItem()]);
  };

  const addTemplateItem = (template: QuotationTemplate) => {
    setItems(prev => [
      ...prev,
      normalizeQuoteItem({
        category: template.category || '',
        description: template.description,
        scope_summary: template.scope_summary || '',
        quantity: 1,
        unit_price: template.unit_price,
        unit: template.unit || 'item',
      })
    ]);
  };

  const saveCurrentTemplate = async () => {
    const firstCompleteItem = items.find(item => item.description.trim() && item.unit_price > 0);
    if (!firstCompleteItem || !templateTitle.trim()) {
      showToast('Add a template title and at least one priced item', 'warning');
      return;
    }

    await addEntity('quotation_templates', {
      title: templateTitle.trim(),
      category: firstCompleteItem.category || '',
      description: firstCompleteItem.description,
      scope_summary: firstCompleteItem.scope_summary || '',
      unit_price: firstCompleteItem.unit_price,
      unit: firstCompleteItem.unit || 'item',
      tax_rate: Number(taxRate) || 0,
      is_active: true,
    });
    setTemplateTitle('');
    showToast('Quotation item template saved', 'success');
  };

  const handleTemplateUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      showToast('Please upload the CSV template exported from Excel', 'warning');
      return;
    }

    const csv = await file.text();
    const importedItems = parseQuotationCsv(csv);
    if (importedItems.length === 0) {
      showToast('No valid quotation items found in the uploaded file', 'error');
      return;
    }

    setItems(prev => {
      const hasBlankOnly = prev.length === 1 && !prev[0].description.trim() && prev[0].unit_price === 0;
      return hasBlankOnly ? importedItems : [...prev, ...importedItems];
    });
    showToast(`Imported ${importedItems.length} quotation items`, 'success');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!prospectName.trim() || !projectTitle.trim() || totals.items.length === 0 || totals.total <= 0) {
      showToast('Add prospect, project title, and at least one priced item', 'warning');
      return;
    }

    setSaving(true);
    try {
      const payload = buildQuotationPayload({
        quoteNumber,
        clientId,
        prospectName,
        prospectEmail,
        prospectPhone,
        projectTitle,
        projectSummary,
        issueDate,
        validUntil,
        currency,
        items,
        terms: termsText.split('\n'),
        discountAmount: Number(discountAmount) || 0,
        taxRate: Number(taxRate) || 0,
        notes,
        status,
      });

      if (quote) {
        if (typeof quote.id === 'number') {
          await updateEntity('quotations', quote.id, payload);
        } else if (import.meta.env.VITE_AUTH_MODE === 'pocketbase' && isOnline) {
          await pb.collection('quotations').update(quote.id as any, {
            ...payload,
            items_json: JSON.parse(payload.items_json),
            terms_json: JSON.parse(payload.terms_json),
          });
        }
        showToast('Quotation updated', 'success');
      } else {
        await addEntity('quotations', payload);
        showToast('Quotation saved', 'success');
      }

      onClose();
    } catch (error: any) {
      console.error('Quotation save failed:', error);
      showToast(error?.message || 'Failed to save quotation', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-bg-deep/80 backdrop-blur-xl"
      />

      <motion.form
        onSubmit={handleSubmit}
        initial={{ scale: 0.96, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 16 }}
        className="relative max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-bg-deep shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/5 p-6">
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tighter text-text-main">{quote ? 'Edit Quotation' : 'New Quotation'}</h2>
            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.24em] text-accent-green">{quoteNumber}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl bg-white/5 p-3 text-text-dim hover:text-text-main">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid max-h-[calc(92vh-92px)] grid-cols-1 overflow-y-auto lg:grid-cols-[1fr_340px]">
          <div className="space-y-8 p-6">
            <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-[9px] font-black uppercase tracking-[0.18em] text-text-dim">Existing Client</span>
                <select value={clientId} onChange={event => applyClient(event.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-bold text-text-main outline-none">
                  <option value="">Prospect / Not yet a client</option>
                  {(clients || []).map(client => (
                    <option key={client.node_id} value={client.node_id}>{client.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-[9px] font-black uppercase tracking-[0.18em] text-text-dim">Status</span>
                <select value={status} onChange={event => setStatus(event.target.value as Quotation['status'])} className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-bold text-text-main outline-none">
                  {(['draft', 'sent', 'accepted', 'declined', 'expired'] as const).map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <Input label="Prospect Name" value={prospectName} onChange={setProspectName} required />
              <Input label="Project Title" value={projectTitle} onChange={setProjectTitle} required />
              <Input label="Email" value={prospectEmail} onChange={setProspectEmail} />
              <Input label="Phone" value={prospectPhone} onChange={setProspectPhone} />
              <Input label="Issue Date" type="date" value={issueDate} onChange={setIssueDate} />
              <Input label="Valid Until" type="date" value={validUntil} onChange={setValidUntil} />
            </section>

            <label className="block space-y-2">
              <span className="text-[9px] font-black uppercase tracking-[0.18em] text-text-dim">Project Summary</span>
              <textarea value={projectSummary} onChange={event => setProjectSummary(event.target.value)} rows={3} className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-text-main outline-none" />
            </label>

            <section className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <h3 className="text-sm font-black uppercase tracking-widest text-text-main">Line Items</h3>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={downloadQuotationTemplate} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-[9px] font-black uppercase tracking-widest text-text-dim transition-all hover:text-accent-green">
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    Excel Template
                  </button>
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-[9px] font-black uppercase tracking-widest text-text-dim transition-all hover:text-accent-green">
                    <Upload className="h-3.5 w-3.5" />
                    Upload CSV
                    <input type="file" accept=".csv,text/csv" onChange={handleTemplateUpload} className="hidden" />
                  </label>
                  <button type="button" onClick={() => setItems(prev => [...prev, blankItem()])} className="flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2 text-[9px] font-black uppercase tracking-widest text-accent-green">
                    <Plus className="h-3.5 w-3.5" />
                    Add Item
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {items.map((item, index) => (
                  <div key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_90px_130px_90px_40px]">
                      <input value={item.description} onChange={event => updateItem(index, { description: event.target.value })} placeholder="Item description" className="rounded-xl border border-white/10 bg-bg-deep px-3 py-2 text-sm font-bold text-text-main outline-none" />
                      <input value={item.quantity} type="number" min="0" step="0.01" onChange={event => updateItem(index, { quantity: Number(event.target.value) })} className="rounded-xl border border-white/10 bg-bg-deep px-3 py-2 text-sm font-bold text-text-main outline-none" />
                      <input value={item.unit_price} type="number" min="0" step="0.01" onChange={event => updateItem(index, { unit_price: Number(event.target.value) })} className="rounded-xl border border-white/10 bg-bg-deep px-3 py-2 text-sm font-bold text-text-main outline-none" />
                      <div className="rounded-xl border border-white/10 bg-bg-deep px-3 py-2 text-right text-sm font-black text-accent-green">{formatMoney(item.total, currency)}</div>
                      <button type="button" onClick={() => removeItem(index)} className="rounded-xl bg-red-500/10 p-2 text-red-400">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <textarea
                      value={item.scope_summary || ''}
                      onChange={event => updateItem(index, { scope_summary: event.target.value })}
                      placeholder="Scope summary"
                      rows={2}
                      className="mt-3 w-full rounded-xl border border-white/10 bg-bg-deep px-3 py-2 text-xs font-medium leading-relaxed text-text-main outline-none"
                    />
                  </div>
                ))}
              </div>
            </section>

            <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Input label="Currency" value={currency} onChange={setCurrency} />
              <Input label="Discount" type="number" value={discountAmount} onChange={setDiscountAmount} />
              <Input label="VAT Tax (16%)" type="number" value={taxRate} onChange={setTaxRate} />
            </section>

            <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-[9px] font-black uppercase tracking-[0.18em] text-text-dim">Terms</span>
                <textarea value={termsText} onChange={event => setTermsText(event.target.value)} rows={6} className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs font-medium leading-relaxed text-text-main outline-none" />
              </label>
              <label className="space-y-2">
                <span className="text-[9px] font-black uppercase tracking-[0.18em] text-text-dim">Notes</span>
                <textarea value={notes} onChange={event => setNotes(event.target.value)} rows={6} className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs font-medium leading-relaxed text-text-main outline-none" />
              </label>
            </section>
          </div>

          <aside className="space-y-6 border-t border-white/5 bg-white/[0.02] p-6 lg:border-l lg:border-t-0">
            <div className="rounded-2xl border border-accent-green/20 bg-accent-green/5 p-5">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-text-dim">Quote Total</p>
              <p className="mt-2 text-3xl font-black text-accent-green">{formatMoney(totals.total, currency)}</p>
              <div className="mt-5 space-y-2 text-xs font-bold text-text-dim">
                <div className="flex justify-between"><span>Subtotal</span><span>{formatMoney(totals.subtotal, currency)}</span></div>
                <div className="flex justify-between"><span>Discount</span><span>{formatMoney(totals.discount_amount, currency)}</span></div>
                <div className="flex justify-between"><span>VAT Tax (16%)</span><span>{formatMoney(totals.tax_amount, currency)}</span></div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-main">Saved Items</h3>
              <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {templates.filter(t => t.is_active !== false).map(template => (
                  <button key={String(template.id || template.pb_id || template.title)} type="button" onClick={() => addTemplateItem(template)} className="w-full rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left transition-all hover:border-accent-green/30">
                    <p className="text-xs font-black text-text-main">{template.title}</p>
                    <p className="mt-1 line-clamp-2 text-[10px] font-medium text-text-dim">{template.description}</p>
                    {template.scope_summary && <p className="mt-1 line-clamp-2 text-[10px] font-medium text-text-dim/70">{template.scope_summary}</p>}
                    <p className="mt-2 text-[10px] font-black text-accent-green">{formatMoney(template.unit_price, currency)}</p>
                  </button>
                ))}
                {templates.length === 0 && <p className="rounded-xl border border-dashed border-white/10 p-4 text-xs text-text-dim">No saved item templates yet.</p>}
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-white/10 p-4">
              <Input label="Template Title" value={templateTitle} onChange={setTemplateTitle} placeholder="Save first priced item" />
              <button type="button" onClick={saveCurrentTemplate} className="flex w-full items-center justify-center gap-2 rounded-xl border border-accent-green/30 bg-accent-green/10 px-4 py-3 text-[9px] font-black uppercase tracking-widest text-accent-green">
                <CopyPlus className="h-4 w-4" />
                Save Template
              </button>
            </div>

            <button disabled={saving} type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent-green px-5 py-4 text-[10px] font-black uppercase tracking-[0.18em] text-bg-deep transition-all disabled:opacity-50">
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Quotation'}
            </button>
          </aside>
        </div>
      </motion.form>
    </div>
  );
}

function Input({ label, value, onChange, type = 'text', required = false, placeholder = '' }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="space-y-2">
      <span className="text-[9px] font-black uppercase tracking-[0.18em] text-text-dim">{label}</span>
      <input
        required={required}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={event => onChange(event.target.value)}
        className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-bold text-text-main outline-none transition-all focus:border-accent-green/40"
      />
    </label>
  );
}

function getImageType(dataUrl: string) {
  if (dataUrl.includes('image/jpeg') || dataUrl.includes('image/jpg')) return 'JPEG';
  if (dataUrl.includes('image/webp')) return 'WEBP';
  return 'PNG';
}

function drawPdfFooter(doc: jsPDF, quoteNumber: string) {
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setDrawColor(230, 230, 230);
  doc.line(14, pageHeight - 15, 196, pageHeight - 15);
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.text(`Quotation ${quoteNumber}`, 14, pageHeight - 9);
  doc.text('Generated by Rafiki Business Manager', 196, pageHeight - 9, { align: 'right' });
  doc.setTextColor(0, 0, 0);
}

function drawLogoMark(doc: jsPDF, business?: BusinessProfile) {
  const badge = { x: 146, y: 11, radius: 8 };
  const centerX = badge.x + badge.radius;
  const centerY = badge.y + badge.radius;
  doc.setFillColor(18, 18, 18);
  doc.circle(centerX, centerY, badge.radius, 'F');

  if (business?.logo_base64) {
    try {
      const image = doc.getImageProperties(business.logo_base64);
      const maxSize = badge.radius * 1.25;
      const ratio = Math.min(maxSize / image.width, maxSize / image.height);
      const width = image.width * ratio;
      const height = image.height * ratio;
      doc.addImage(business.logo_base64, getImageType(business.logo_base64), centerX - width / 2, centerY - height / 2, width, height);
      return;
    } catch {
      // Fall back to business initials below.
    }
  }

  doc.setTextColor(57, 255, 20);
  doc.setFontSize(6);
  doc.text((business?.name || 'RB').slice(0, 2).toUpperCase(), centerX, centerY + 2, { align: 'center' });
  doc.setTextColor(0, 0, 0);
}

function drawInfoCard(doc: jsPDF, title: string, lines: string[], x: number, y: number, width: number, height: number) {
  doc.setDrawColor(238, 241, 245);
  doc.setFillColor(247, 249, 251);
  doc.roundedRect(x, y, width, height, 2, 2, 'FD');
  doc.setFontSize(8.5);
  doc.setTextColor(20, 20, 20);
  doc.setFont('helvetica', 'bold');
  doc.text(title, x + 4, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(28, 28, 28);

  let lineY = y + 13;
  for (const line of lines.filter(Boolean).slice(0, 6)) {
    doc.text(line, x + 4, lineY, { maxWidth: width - 8 });
    lineY += 4.4;
  }
  doc.setTextColor(0, 0, 0);
}

function drawQuotationHeader(doc: jsPDF, quote: Quotation, business?: BusinessProfile) {
  doc.setTextColor(20, 20, 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(16);
  doc.text('Quotation', 14, 16);

  doc.setTextColor(120, 120, 120);
  doc.setFontSize(7.5);
  doc.text('Quotation #', 14, 27);
  doc.text('Quotation Date', 14, 36);
  doc.setTextColor(28, 28, 28);
  doc.setFontSize(7.8);
  doc.text(quote.quote_number, 42, 27);
  doc.text(normalizeDateInput(quote.issue_date), 42, 36);

  drawLogoMark(doc, business);
  doc.setTextColor(18, 18, 18);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(business?.name || 'Rafiki Business Manager', 170, 15, { maxWidth: 26 });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  if (business?.website) doc.text(business.website, 170, 26, { maxWidth: 26 });
  doc.setTextColor(0, 0, 0);

  const byLines = [
    business?.name || 'Rafiki Business Manager',
    business?.address || '',
    business?.phone || '',
    business?.email || '',
    business?.website || '',
    business?.till_number ? `Till/Paybill: ${business.till_number}` : '',
  ];
  const toLines = [
    quote.prospect_name || 'Prospect',
    quote.prospect_email || '',
    quote.prospect_phone || '',
    quote.project_title ? `Project: ${quote.project_title}` : '',
    quote.valid_until ? `Valid until: ${normalizeDateInput(quote.valid_until)}` : '',
  ];

  drawInfoCard(doc, 'Quotation by', byLines, 14, 51, 84, 36);
  drawInfoCard(doc, 'Quotation to', toLines, 108, 51, 88, 36);
}

function exportQuotationPdf(quote: Quotation, business?: BusinessProfile) {
  const doc = new jsPDF();
  const currency = quote.currency || 'KSh';
  const items = parseQuoteItems(quote.items_json);
  const terms = parseQuotationTerms(quote.terms_json);
  let y = 96;

  drawQuotationHeader(doc, quote, business);

  doc.setFillColor(20, 20, 20);
  doc.setTextColor(255, 255, 255);
  doc.roundedRect(14, y, 182, 10, 2, 2, 'F');
  doc.setFontSize(8);
  doc.text('DESCRIPTION', 18, y + 6.5);
  doc.text('QTY', 122, y + 6.5);
  doc.text('UNIT PRICE', 140, y + 6.5);
  doc.text('TOTAL', 181, y + 6.5, { align: 'right' });
  doc.setTextColor(0, 0, 0);
  y += 16;

  items.forEach((item, index) => {
    if (y > 242) {
      drawPdfFooter(doc, quote.quote_number);
      doc.addPage();
      y = 24;
    }
    const descriptionLines = doc.splitTextToSize(item.description || 'Item', 88);
    const scopeLines = item.scope_summary ? doc.splitTextToSize(item.scope_summary, 88) : [];
    const rowHeight = Math.max(14, descriptionLines.length * 4.8 + scopeLines.length * 4.2 + 7);
    if (index % 2 === 0) {
      doc.setFillColor(250, 250, 250);
      doc.rect(14, y - 5, 182, rowHeight, 'F');
    }
    doc.setTextColor(20, 20, 20);
    doc.setFontSize(9.5);
    doc.text(descriptionLines, 18, y);
    if (scopeLines.length > 0) {
      doc.setTextColor(95, 95, 95);
      doc.setFontSize(7.6);
      doc.text(scopeLines, 18, y + descriptionLines.length * 4.8 + 1);
    }
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(9);
    doc.text(String(item.quantity), 122, y);
    doc.text(formatMoney(item.unit_price, currency), 140, y);
    doc.setTextColor(20, 20, 20);
    doc.text(formatMoney(item.total, currency), 190, y, { align: 'right' });
    y += rowHeight;
  });

  y += 8;
  const totalsY = y;
  doc.setDrawColor(230, 230, 230);
  doc.setFillColor(248, 248, 248);
  doc.roundedRect(118, totalsY - 6, 78, 38, 2.5, 2.5, 'FD');
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  doc.text('Subtotal', 124, y);
  doc.text(formatMoney(Number(quote.subtotal) || 0, currency), 190, y, { align: 'right' });
  y += 7;
  doc.text('Discount', 130, y);
  doc.text(formatMoney(Number(quote.discount_amount) || 0, currency), 190, y, { align: 'right' });
  y += 7;
  doc.text('VAT Tax (16%)', 124, y);
  doc.text(formatMoney(Number(quote.tax_amount) || 0, currency), 190, y, { align: 'right' });
  y += 9;
  doc.setDrawColor(210, 210, 210);
  doc.line(124, y - 5, 190, y - 5);
  doc.setFontSize(13);
  doc.setTextColor(20, 20, 20);
  doc.text('Total', 124, y);
  doc.text(formatMoney(Number(quote.total) || 0, currency), 190, y, { align: 'right' });

  y += 18;
  if (y > 230) {
    drawPdfFooter(doc, quote.quote_number);
    doc.addPage();
    y = 20;
  }
  doc.setFillColor(20, 20, 20);
  doc.circle(16, y - 1, 1.2, 'F');
  doc.setTextColor(20, 20, 20);
  doc.setFontSize(11);
  doc.text('Terms', 21, y);
  y += 7;
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  for (const term of terms.length ? terms : DEFAULT_QUOTATION_TERMS) {
    if (y > 266) {
      drawPdfFooter(doc, quote.quote_number);
      doc.addPage();
      y = 20;
    }
    doc.text(`- ${term}`, 14, y, { maxWidth: 178 });
    y += 6;
  }
  if (quote.notes) {
    y += 5;
    if (y > 252) {
      drawPdfFooter(doc, quote.quote_number);
      doc.addPage();
      y = 20;
    }
    doc.setTextColor(20, 20, 20);
    doc.setFontSize(11);
    doc.text('Notes', 14, y);
    y += 7;
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.text(quote.notes, 14, y, { maxWidth: 178 });
  }

  drawPdfFooter(doc, quote.quote_number);
  doc.save(`${quote.quote_number || 'quotation'}.pdf`);
}
