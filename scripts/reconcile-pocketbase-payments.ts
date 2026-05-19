import 'dotenv/config';

const pbUrl = process.env.POCKETBASE_URL || process.env.VITE_POCKETBASE_URL || 'https://code-rafiki.pockethost.io';
const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL;
const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD;
const shouldApply = process.argv.includes('--apply');
const shouldList = process.argv.includes('--list');

function assertAdminCredentials() {
  if (!adminEmail || !adminPassword) {
    throw new Error('Missing POCKETBASE_ADMIN_EMAIL or POCKETBASE_ADMIN_PASSWORD in .env.');
  }
}

function normalize(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function amountKey(value: unknown) {
  return Number(value || 0).toFixed(2);
}

function paymentKey(record: any) {
  const idempotencyKey = normalize(record.idempotency_key);
  if (idempotencyKey) return `idempotency:${idempotencyKey}`;

  const transactionId = normalize(record.transaction_id);
  if (transactionId) return `transaction:${transactionId}`;

  const clientId = normalize(record.client_id);
  const date = normalize(record.date);
  const amount = amountKey(record.amount);
  const quoteNumber = normalize(record.quote_number);
  const milestone = normalize(record.billing_milestone_title);

  if (clientId && date && amount) {
    return `fallback:${clientId}:${date}:${amount}:${quoteNumber}:${milestone}`;
  }

  return '';
}

function score(record: any) {
  let value = 0;
  if (record.status === 'completed') value += 10;
  if (record.pb_id) value += 1;
  if (record.updated) value += Date.parse(record.updated) / 1_000_000_000_000;
  if (record.created) value += Date.parse(record.created) / 1_000_000_000_000;
  return value;
}

async function pbRequest(path: string, options: RequestInit = {}) {
  let lastError: any;

  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const response = await fetch(`${pbUrl}${path}`, {
        ...options,
        headers: {
          'content-type': 'application/json',
          ...(options.headers || {}),
        },
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};

      if (!response.ok) {
        const error: any = new Error(data?.message || `PocketBase request failed with ${response.status}`);
        error.response = data;
        throw error;
      }

      return data;
    } catch (error) {
      lastError = error;
      if (attempt < 5) {
        console.warn(`[PB] Request failed (${attempt}/5), retrying... ${(error as any)?.message || error}`);
        await new Promise(resolve => setTimeout(resolve, attempt * 1500));
      }
    }
  }

  throw lastError;
}

async function getToken() {
  assertAdminCredentials();
  const data = await pbRequest('/api/collections/_superusers/auth-with-password', {
    method: 'POST',
    body: JSON.stringify({ identity: adminEmail, password: adminPassword }),
  });
  return data.token;
}

async function getAllPayments(token: string) {
  const records: any[] = [];
  let page = 1;

  while (true) {
    const data = await pbRequest(`/api/collections/payments/records?page=${page}&perPage=500`, {
      headers: { authorization: `Bearer ${token}` },
    });
    records.push(...(data.items || []));
    if (page >= data.totalPages) break;
    page++;
  }

  return records;
}

async function reconcilePayments() {
  console.log(`[PB] Connecting to ${pbUrl}`);
  const token = await getToken();
  const records = await getAllPayments(token);
  const grouped = new Map<string, any[]>();
  const recordsWithoutKey: any[] = [];

  for (const record of records) {
    const key = paymentKey(record);
    if (!key) {
      recordsWithoutKey.push(record);
      continue;
    }
    grouped.set(key, [...(grouped.get(key) || []), record]);
  }

  const duplicatesToDelete: any[] = [];
  for (const group of grouped.values()) {
    if (group.length <= 1) continue;
    const sorted = [...group].sort((a, b) => score(b) - score(a));
    duplicatesToDelete.push(...sorted.slice(1));
  }

  const completedRevenueBefore = records
    .filter(record => record.status === 'completed')
    .reduce((sum, record) => sum + (Number(record.amount) || 0), 0);
  const completedRevenueAfter = records
    .filter(record => record.status === 'completed' && !duplicatesToDelete.some(duplicate => duplicate.id === record.id))
    .reduce((sum, record) => sum + (Number(record.amount) || 0), 0);

  console.log(`[PB] Remote payments: ${records.length}`);
  console.log(`[PB] Duplicate payments to delete: ${duplicatesToDelete.length}`);
  console.log(`[PB] Payments without a stable key: ${recordsWithoutKey.length}`);
  console.log(`[PB] Completed revenue before dedupe: ${completedRevenueBefore}`);
  console.log(`[PB] Completed revenue after dedupe: ${completedRevenueAfter}`);

  if (shouldList) {
    console.log('[PB] Payment records:');
    records
      .sort((a, b) => normalize(a.date).localeCompare(normalize(b.date)))
      .forEach(record => {
        console.log([
          record.id,
          record.client_id || 'no-client',
          record.date || 'no-date',
          record.amount || 0,
          record.status || 'no-status',
          record.transaction_id || 'no-transaction',
          record.quote_number || '',
          record.billing_milestone_title || '',
        ].join(' | '));
      });
  }

  if (!shouldApply) {
    console.log('[PB] Dry run only. Re-run with -- --apply to delete duplicate payment records.');
    return;
  }

  for (let i = 0; i < duplicatesToDelete.length; i++) {
    await pbRequest(`/api/collections/payments/records/${duplicatesToDelete[i].id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    });
    console.log(`[PB] Deleted duplicate payment ${i + 1}/${duplicatesToDelete.length}`);
  }

  console.log('[PB] Payment duplicates reconciled.');
}

reconcilePayments().catch(error => {
  console.error('[PB] Payment reconciliation failed:', error?.response || error);
  process.exit(1);
});
