import type { QuoteLineItem, Quotation } from '../db/db';

export const DEFAULT_QUOTATION_TERMS = [
  'Quotation is valid until the stated expiry date.',
  'Project commencement requires written approval of this quotation.',
  'Any scope changes requested after approval may attract a revised quotation.',
  'Hosting, third-party tools, SMS, email, payment gateway, or domain costs are billed separately unless listed above.',
];

function monthStamp(date: Date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function generateQuoteNumber(date = new Date(), existingQuoteNumbers: string[] = []) {
  const stamp = monthStamp(date);
  const nextSequence = existingQuoteNumbers.reduce((max, quoteNumber) => {
    const match = String(quoteNumber || '').match(new RegExp(`^RFQ-${stamp}(\\d+)$`));
    return match ? Math.max(max, Number(match[1]) || 0) : max;
  }, 0) + 1;
  return `RFQ-${stamp}${nextSequence}`;
}

export function normalizeQuoteItem(item: Partial<QuoteLineItem>): QuoteLineItem {
  const quantity = Math.max(Number(item.quantity) || 1, 0);
  const unitPrice = Math.max(Number(item.unit_price) || 0, 0);

  return {
    id: item.id || crypto.randomUUID(),
    category: item.category || '',
    description: item.description || '',
    scope_summary: item.scope_summary || '',
    quantity,
    unit_price: unitPrice,
    unit: item.unit || 'item',
    total: quantity * unitPrice,
    notes: item.notes || '',
  };
}

export function calculateQuotationTotals(
  items: Array<Partial<QuoteLineItem>>,
  options: { discountAmount?: number; taxRate?: number } = {}
) {
  const normalizedItems = items.map(normalizeQuoteItem);
  const subtotal = normalizedItems.reduce((sum, item) => sum + item.total, 0);
  const discountAmount = Math.min(Math.max(Number(options.discountAmount) || 0, 0), subtotal);
  const taxableAmount = subtotal - discountAmount;
  const taxRate = Math.max(Number(options.taxRate) || 0, 0);
  const taxAmount = taxableAmount * (taxRate / 100);
  const total = taxableAmount + taxAmount;

  return {
    items: normalizedItems,
    subtotal,
    discount_amount: discountAmount,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    total,
  };
}

export function serializeQuoteItems(items: QuoteLineItem[]) {
  return JSON.stringify(items);
}

export function parseQuoteItems(itemsJson?: unknown): QuoteLineItem[] {
  if (!itemsJson) return [];

  try {
    const parsed = typeof itemsJson === 'string' ? JSON.parse(itemsJson) : itemsJson;
    return Array.isArray(parsed) ? parsed.map(normalizeQuoteItem) : [];
  } catch {
    return [];
  }
}

export function serializeQuotationTerms(terms: string[]) {
  return JSON.stringify(terms.filter(term => term.trim()));
}

export function parseQuotationTerms(termsJson?: unknown): string[] {
  if (!termsJson) return DEFAULT_QUOTATION_TERMS;

  try {
    const parsed = typeof termsJson === 'string' ? JSON.parse(termsJson) : termsJson;
    return Array.isArray(parsed)
      ? parsed.map(term => String(term)).filter(term => term.trim())
      : DEFAULT_QUOTATION_TERMS;
  } catch {
    return DEFAULT_QUOTATION_TERMS;
  }
}

export function buildQuotationPayload(input: {
  quoteNumber?: string;
  clientId?: string;
  prospectName: string;
  prospectEmail?: string;
  prospectPhone?: string;
  projectTitle: string;
  projectSummary?: string;
  issueDate?: string;
  validUntil?: string;
  currency?: string;
  items: Array<Partial<QuoteLineItem>>;
  terms?: string[];
  discountAmount?: number;
  taxRate?: number;
  notes?: string;
  status?: Quotation['status'];
}): Omit<Quotation, 'id' | 'pb_id' | 'synced'> {
  const totals = calculateQuotationTotals(input.items, {
    discountAmount: input.discountAmount,
    taxRate: input.taxRate,
  });

  return {
    quote_number: input.quoteNumber || generateQuoteNumber(),
    client_id: input.clientId || '',
    prospect_name: input.prospectName,
    prospect_email: input.prospectEmail || '',
    prospect_phone: input.prospectPhone || '',
    project_title: input.projectTitle,
    project_summary: input.projectSummary || '',
    issue_date: input.issueDate || new Date().toISOString(),
    valid_until: input.validUntil || '',
    currency: input.currency || 'KSh',
    items_json: serializeQuoteItems(totals.items),
    terms_json: serializeQuotationTerms(input.terms || DEFAULT_QUOTATION_TERMS),
    subtotal: totals.subtotal,
    discount_amount: totals.discount_amount,
    tax_rate: totals.tax_rate,
    tax_amount: totals.tax_amount,
    total: totals.total,
    status: input.status || 'draft',
    notes: input.notes || '',
  };
}
