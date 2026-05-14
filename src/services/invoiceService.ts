import type { Invoice, InvoiceLineItem } from '../db/db';

function monthStamp(date: Date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function generateInvoiceNumber(date = new Date(), existingInvoiceNumbers: string[] = []) {
  const stamp = monthStamp(date);
  const nextSequence = existingInvoiceNumbers.reduce((max, invoiceNumber) => {
    const match = String(invoiceNumber || '').match(new RegExp(`^RFI-${stamp}(\\d+)$`));
    return match ? Math.max(max, Number(match[1]) || 0) : max;
  }, 0) + 1;
  return `RFI-${stamp}${String(nextSequence).padStart(2, '0')}`;
}

export function normalizeInvoiceItem(item: Partial<InvoiceLineItem>): InvoiceLineItem {
  const quantity = Math.max(Number(item.quantity) || 1, 0);
  const unitPrice = Math.max(Number(item.unit_price) || 0, 0);
  return {
    id: item.id || crypto.randomUUID(),
    description: item.description || '',
    quantity,
    unit_price: unitPrice,
    total: quantity * unitPrice,
    notes: item.notes || '',
  };
}

export function parseInvoiceItems(itemsJson?: unknown): InvoiceLineItem[] {
  if (!itemsJson) return [];
  try {
    const parsed = typeof itemsJson === 'string' ? JSON.parse(itemsJson) : itemsJson;
    return Array.isArray(parsed) ? parsed.map(normalizeInvoiceItem) : [];
  } catch {
    return [];
  }
}

export function calculateInvoiceTotals(items: Array<Partial<InvoiceLineItem>>, taxRate = 0) {
  const normalizedItems = items.map(normalizeInvoiceItem);
  const subtotal = normalizedItems.reduce((sum, item) => sum + item.total, 0);
  const cleanTaxRate = Math.max(Number(taxRate) || 0, 0);
  const taxAmount = subtotal * (cleanTaxRate / 100);
  return {
    items: normalizedItems,
    subtotal,
    tax_rate: cleanTaxRate,
    tax_amount: taxAmount,
    total: subtotal + taxAmount,
  };
}

export function buildInvoicePayload(input: {
  invoiceNumber?: string;
  clientId: string;
  clientName: string;
  quoteId?: string;
  quoteNumber?: string;
  billingPromiseId?: string;
  milestoneTitle?: string;
  issueDate?: string;
  dueDate: string;
  currency?: string;
  items: Array<Partial<InvoiceLineItem>>;
  taxRate?: number;
  notes?: string;
  status?: Invoice['status'];
}): Omit<Invoice, 'id' | 'pb_id' | 'synced'> {
  const totals = calculateInvoiceTotals(input.items, input.taxRate);
  return {
    invoice_number: input.invoiceNumber || generateInvoiceNumber(),
    client_id: input.clientId,
    client_name: input.clientName,
    quote_id: input.quoteId || '',
    quote_number: input.quoteNumber || '',
    billing_promise_id: input.billingPromiseId || '',
    milestone_title: input.milestoneTitle || '',
    issue_date: input.issueDate || new Date().toISOString().split('T')[0],
    due_date: input.dueDate,
    currency: input.currency || 'KSh',
    items_json: JSON.stringify(totals.items),
    subtotal: totals.subtotal,
    tax_rate: totals.tax_rate,
    tax_amount: totals.tax_amount,
    total: totals.total,
    status: input.status || 'draft',
    notes: input.notes || '',
    paid_at: '',
  };
}
