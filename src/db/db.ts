import Dexie, { type Table } from 'dexie';

export interface Expense {
  id?: number;
  date: string;
  category: string;
  sub_tag?: string;
  amount: number;
  tax_amount?: number;
  client_id?: string; // Tied to specific client node_id
  description: string;
  receipt_img?: string;
  pb_id?: string;
  synced: boolean;
}

export interface Payment {
  id?: number;
  client_id: string;
  quote_id?: string;
  quote_number?: string;
  billing_promise_id?: string;
  billing_milestone_title?: string;
  amount: number;
  method: 'Cash' | 'Mpesa' | 'Bank';
  status: 'pending' | 'completed' | 'failed';
  date: string;
  transaction_id: string;
  idempotency_key: string;
  pb_id?: string;
  synced: boolean;
}

export interface Agreement {
  id?: number;
  client_id: string;
  client_name: string;
  project_details: string;
  file_path: string; // Path to local blob or server file
  file_blob?: Blob; // Store file directly for offline access
  signed_date: string;
  created_date?: string;
  expiry_date?: string; // Timeline metadata
  status: 'active' | 'expired' | 'pending';
  pb_id?: string;
  synced: boolean;
}

export interface Client {
  id?: number;
  node_id: string; // e.g. '1067.01'
  name: string;
  entity_type: 'INDIVIDUAL' | 'COMPANY';
  email: string;
  phone: string;
  agreed_price: number;
  deposit_paid: boolean;
  initial_meeting: string; // ISO Date (Kick-off)
  target_payment: string; // ISO Date (Payment Date)
  project_tag: string;
  app_built: string; // New field: System or App Built
  project_desc: string; // The "What we built" or project summary
  contact_json: string; // Structured JSON for email, phone, social, etc.
  notes: string;
  pb_id?: string;
  synced: boolean;
}

export interface PaymentPromise {
  id?: number;
  amount_due: number;
  due_date: string;
  client_id: string;
  quote_id?: string;
  quote_number?: string;
  milestone_title?: string;
  notes?: string;
  created_at?: string;
  payment_method?: 'Mpesa' | 'Bank' | 'Cash';
  status: 'fulfilled' | 'pending' | 'broken';
  pb_id?: string;
  synced: boolean;
}

export interface TeamMember {
  id?: number;
  name: string;
  email: string;
  role: 'Admin' | 'Editor' | 'Viewer';
  password_hash?: string; // Stored plaintext now; hashed on deployment
  must_change_password?: boolean;
  module_permissions?: string[];
  pb_id?: string;
  synced: boolean;
}

export interface AuthSession {
  key: string;
  user_id: number;
  expires_at: string;
  token: string;
}

export interface BusinessProfile {
  id?: number;
  name: string;
  till_number: string;
  currency: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  logo_base64?: string;
  pb_id?: string;
  synced: boolean;
}

export interface QuoteLineItem {
  id: string;
  category?: string;
  description: string;
  scope_summary?: string;
  quantity: number;
  unit_price: number;
  unit?: string;
  total: number;
  notes?: string;
}

export interface Quotation {
  id?: number;
  quote_number: string;
  client_id?: string;
  prospect_name: string;
  prospect_email?: string;
  prospect_phone?: string;
  project_title: string;
  project_summary?: string;
  issue_date: string;
  valid_until?: string;
  currency: string;
  items_json: string;
  terms_json: string;
  subtotal: number;
  discount_amount: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  status: 'draft' | 'sent' | 'accepted' | 'declined' | 'expired';
  billing_plan_created?: boolean;
  notes?: string;
  pb_id?: string;
  synced: boolean;
}

export interface QuotationTemplate {
  id?: number;
  title: string;
  category?: string;
  description: string;
  scope_summary?: string;
  unit_price: number;
  unit?: string;
  tax_rate?: number;
  is_active: boolean;
  pb_id?: string;
  synced: boolean;
}

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  notes?: string;
}

export interface Invoice {
  id?: number;
  invoice_number: string;
  client_id: string;
  client_name: string;
  quote_id?: string;
  quote_number?: string;
  billing_promise_id?: string;
  milestone_title?: string;
  issue_date: string;
  due_date: string;
  currency: string;
  items_json: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  status: 'draft' | 'sent' | 'paid' | 'void';
  notes?: string;
  paid_at?: string;
  pb_id?: string;
  synced: boolean;
}

export interface SyncQueue {
  id?: number;
  entity: 'expenses' | 'payments' | 'agreements' | 'billing_promises' | 'meetings' | 'team_members' | 'business' | 'clients' | 'pocket_host_instances' | 'quotations' | 'quotation_templates' | 'invoices';
  entityId: number;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  timestamp: number;
}

export interface Meeting {
  id?: number;
  google_id?: string;
  gcal_link?: string; // Direct link to the Google Calendar event
  client_id?: string;
  summary: string;
  description?: string;
  minutes?: string; // New field: Meeting minutes/discussions
  start_time: string;
  end_time: string;
  location?: string;
  type: 'Discovery' | 'Agreement Signing' | 'Payment Follow-up' | 'Other';
  pb_id?: string;
  synced: boolean;
}

export interface Budget {
  id?: number;
  votehead: string;
  monthly_limit: number;
  synced: boolean;
}

export interface PocketHostInstance {
  id?: number;
  instance_name: string;
  client_id?: string;
  monthly_fee: number;
  billing_cycle: 'monthly' | 'quarterly' | 'semi-annual' | 'yearly';
  status: 'active' | 'suspended' | 'trial';
  created_at: string;
  next_billing_date: string;
  pb_id?: string;
  synced: boolean;
}

export interface PendingSync {
  id?: number;
  entity: 'meetings' | 'expenses' | 'payments' | 'agreements' | 'billing_promises' | 'team_members' | 'business' | 'clients' | 'pocket_host_instances' | 'quotations' | 'quotation_templates' | 'invoices';
  entity_id: number;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  payload?: string; // JSON string for full data if needed
  timestamp: number;
}

export class NexusDatabase extends Dexie {
  expenses!: Table<Expense>;
  payments!: Table<Payment>;
  agreements!: Table<Agreement>;
  billing_promises!: Table<PaymentPromise>;
  syncQueue!: Table<SyncQueue>;
  meetings!: Table<Meeting>;
  pending_sync!: Table<PendingSync>;
  team_members!: Table<TeamMember>;
  business!: Table<BusinessProfile>;
  clients!: Table<Client>;
  budgets!: Table<Budget>;
  pocket_host_instances!: Table<PocketHostInstance>;
  quotations!: Table<Quotation>;
  quotation_templates!: Table<QuotationTemplate>;
  invoices!: Table<Invoice>;
  auth_tokens!: Table<{ key: string; tokens: any }>;
  auth_session!: Table<AuthSession>;

  constructor() {
    super('NexusDatabase');
    this.version(22).stores({
      expenses: '++id, pb_id, date, category, sub_tag, amount, client_id',
      payments: '++id, pb_id, client_id, quote_id, quote_number, billing_promise_id, amount, method, status, date, transaction_id, idempotency_key',
      agreements: '++id, pb_id, client_id, file_path, status',
      billing_promises: '++id, pb_id, amount_due, due_date, client_id, quote_id, quote_number, milestone_title, status',
      syncQueue: '++id, entity, operation, timestamp',
      meetings: '++id, pb_id, google_id, client_id, start_time, type',
      pending_sync: '++id, entity, operation, timestamp',
      team_members: '++id, pb_id, name, email, role, password_hash, must_change_password',
      business: '++id, pb_id, name, email, phone, website',
      clients: '++id, pb_id, node_id, name, email, entity_type, project_tag, app_built',
      budgets: '++id, votehead',
      pocket_host_instances: '++id, pb_id, instance_name, client_id, status',
      quotations: '++id, pb_id, quote_number, client_id, prospect_name, project_title, status, billing_plan_created, issue_date, valid_until',
      quotation_templates: '++id, pb_id, title, category, is_active',
      invoices: '++id, pb_id, invoice_number, client_id, quote_number, billing_promise_id, status, issue_date, due_date',
      auth_tokens: 'key',
      auth_session: 'key, user_id, expires_at'
    });
  }
}

export const db = new NexusDatabase();
