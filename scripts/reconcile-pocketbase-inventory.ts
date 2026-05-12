import 'dotenv/config';

const pbUrl = process.env.POCKETBASE_URL || process.env.VITE_POCKETBASE_URL || 'https://code-rafiki.pockethost.io';
const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL;
const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD;
const shouldApply = process.argv.includes('--apply');
const expectedTotal = Number(process.env.POCKET_HOST_EXPECTED_TOTAL || 250);
const stockPrefix = process.env.POCKET_HOST_STOCK_PREFIX || 'rafiki-host';

function assertAdminCredentials() {
  if (!adminEmail || !adminPassword) {
    throw new Error('Missing POCKETBASE_ADMIN_EMAIL or POCKETBASE_ADMIN_PASSWORD in .env.');
  }
}

function hostKey(record: any) {
  return String(record.instance_name || record.name || '').trim().toLowerCase();
}

function isAssigned(record: any) {
  return Boolean(String(record.client_id || '').trim());
}

function canonicalScore(record: any) {
  let score = 0;
  if (record.instance_name) score += 4;
  if (record.client_id) score += 8;
  if (record.next_billing_date) score += 2;
  if (record.created_at) score += 1;
  if (record.updated) score += Date.parse(record.updated) / 1_000_000_000_000;
  return score;
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
        error.status = response.status;
        error.response = data;
        throw error;
      }

      return data;
    } catch (error: any) {
      lastError = error;
      if (error?.status && error.status < 500) throw error;
      if (attempt < 5) {
        console.warn(`[PB] Request failed (${attempt}/5), retrying... ${error?.message || error}`);
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

async function getAllRecords(token: string) {
  const records: any[] = [];
  let page = 1;

  while (true) {
    const data = await pbRequest(`/api/collections/pocket_host_instances/records?page=${page}&perPage=500`, {
      headers: { authorization: `Bearer ${token}` },
    });
    records.push(...(data.items || []));
    if (page >= data.totalPages) break;
    page++;
  }

  return records;
}

async function reconcilePocketHostInventory() {
  console.log(`[PB] Connecting to ${pbUrl}`);
  const token = await getToken();
  const records = await getAllRecords(token);
  const byHost = new Map<string, any[]>();
  const blanks: any[] = [];

  for (const record of records) {
    const key = hostKey(record);
    if (!key) {
      blanks.push(record);
      continue;
    }
    byHost.set(key, [...(byHost.get(key) || []), record]);
  }

  const duplicatesToDelete: any[] = [...blanks];
  const canonicalRecords: any[] = [];

  for (const group of byHost.values()) {
    const sorted = [...group].sort((a, b) => canonicalScore(b) - canonicalScore(a));
    canonicalRecords.push(sorted[0]);
    duplicatesToDelete.push(...sorted.slice(1));
  }

  const totalAfterDedupe = canonicalRecords.length;
  const assignedAfterDedupe = canonicalRecords.filter(isAssigned).length;
  const availableAfterDedupe = totalAfterDedupe - assignedAfterDedupe;
  const existingNumericHosts = new Set(
    canonicalRecords
      .map((record) => hostKey(record).match(new RegExp(`^${stockPrefix.toLowerCase()}(\\d+)$`))?.[1])
      .filter(Boolean)
      .map(Number)
  );
  const stockToCreate: number[] = [];

  for (let i = 1; totalAfterDedupe + stockToCreate.length < expectedTotal; i++) {
    if (!existingNumericHosts.has(i)) {
      stockToCreate.push(i);
    }
  }

  console.log(`[PB] Current remote records: ${records.length}`);
  console.log(`[PB] Unique named instances after dedupe: ${totalAfterDedupe}`);
  console.log(`[PB] Assigned after dedupe: ${assignedAfterDedupe}`);
  console.log(`[PB] Available after dedupe: ${availableAfterDedupe}`);
  console.log(`[PB] Duplicate/blank records to delete: ${duplicatesToDelete.length}`);
  console.log(`[PB] Missing stock records to create: ${stockToCreate.length}`);
  console.log(`[PB] Final planned total: ${totalAfterDedupe + stockToCreate.length}`);

  if (totalAfterDedupe + stockToCreate.length !== expectedTotal) {
    console.warn(`[PB] Expected final total ${expectedTotal}, planned ${totalAfterDedupe + stockToCreate.length}. No records will be changed.`);
    process.exit(2);
  }

  if (!shouldApply) {
    console.log('[PB] Dry run only. Re-run with -- --apply to delete duplicates and create missing stock.');
    return;
  }

  for (let i = 0; i < duplicatesToDelete.length; i++) {
    const record = duplicatesToDelete[i];
    await pbRequest(`/api/collections/pocket_host_instances/records/${record.id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    });
    if ((i + 1) % 25 === 0 || i === duplicatesToDelete.length - 1) {
      console.log(`[PB] Deleted ${i + 1}/${duplicatesToDelete.length}`);
    }
  }

  const now = new Date().toISOString();
  for (let i = 0; i < stockToCreate.length; i++) {
    const stockNumber = stockToCreate[i];
    await pbRequest('/api/collections/pocket_host_instances/records', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({
        instance_name: `${stockPrefix}${stockNumber}`,
        name: `${stockPrefix}${stockNumber}`,
        monthly_fee: 1500,
        billing_cycle: 'monthly',
        status: 'active',
        created_at: now,
        next_billing_date: now,
      }),
    });
    if ((i + 1) % 25 === 0 || i === stockToCreate.length - 1) {
      console.log(`[PB] Created ${i + 1}/${stockToCreate.length}`);
    }
  }

  console.log('[PB] Inventory reconciled to expected total.');
}

reconcilePocketHostInventory().catch((error) => {
  console.error('[PB] Inventory reconciliation failed:', error?.response || error);
  process.exit(1);
});
