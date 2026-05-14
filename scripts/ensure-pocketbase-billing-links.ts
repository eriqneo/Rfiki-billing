import 'dotenv/config';

const pbUrl = process.env.POCKETBASE_URL || process.env.VITE_POCKETBASE_URL || 'https://code-rafiki.pockethost.io';
const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL;
const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD;
const authRule = '@request.auth.id != ""';

const collections = [
  {
    name: 'payments',
    fields: [
      { name: 'quote_id', type: 'text', required: false },
      { name: 'quote_number', type: 'text', required: false },
      { name: 'billing_promise_id', type: 'text', required: false },
      { name: 'billing_milestone_title', type: 'text', required: false },
    ],
  },
  {
    name: 'billing_promises',
    fields: [
      { name: 'quote_id', type: 'text', required: false },
      { name: 'quote_number', type: 'text', required: false },
      { name: 'milestone_title', type: 'text', required: false },
      { name: 'notes', type: 'text', required: false },
      { name: 'created_at', type: 'text', required: false },
    ],
  },
];

function assertAdminCredentials() {
  if (!adminEmail || !adminPassword) {
    throw new Error('Missing POCKETBASE_ADMIN_EMAIL or POCKETBASE_ADMIN_PASSWORD in .env.');
  }
}

async function pbRequest(path: string, options: RequestInit = {}) {
  let lastError: any;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const response = await fetch(`${pbUrl}${path}`, {
        ...options,
        headers: { 'content-type': 'application/json', ...(options.headers || {}) },
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) {
        const error: any = new Error(data?.message || `PocketBase request failed with ${response.status}`);
        error.status = response.status;
        error.response = data;
        error.url = `${pbUrl}${path}`;
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

function mergeFields(existingFields: any[] = [], requiredFields: any[]) {
  const appFields = existingFields.filter((field) => !field.system);
  const existingByName = new Map(appFields.map((field) => [field.name, field]));
  let changed = false;
  const mergedFields = [...appFields];
  for (const field of requiredFields) {
    if (!existingByName.has(field.name)) {
      mergedFields.push(field);
      changed = true;
    }
  }
  return { fields: mergedFields, changed };
}

async function ensureCollection(collection: { name: string; fields: any[] }, token: string) {
  const existing = await pbRequest(`/api/collections/${collection.name}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const { fields, changed } = mergeFields(existing.fields || [], collection.fields);
  await pbRequest(`/api/collections/${existing.id}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({
      fields,
      listRule: authRule,
      viewRule: authRule,
      createRule: authRule,
      updateRule: authRule,
      deleteRule: authRule,
    }),
  });
  console.log(changed ? `[PB] Updated ${collection.name}` : `[PB] ${collection.name} already ready`);
}

async function ensurePocketBaseBillingLinks() {
  assertAdminCredentials();
  console.log(`[PB] Connecting to ${pbUrl}`);
  const authData = await pbRequest('/api/collections/_superusers/auth-with-password', {
    method: 'POST',
    body: JSON.stringify({ identity: adminEmail, password: adminPassword }),
  });
  for (const collection of collections) {
    await ensureCollection(collection, authData.token);
  }
  console.log('[PB] Billing link fields are ready.');
}

ensurePocketBaseBillingLinks().catch((error) => {
  console.error('[PB] Billing link setup failed');
  console.error('[PB] Status:', error?.status ?? 'unknown');
  console.error('[PB] URL:', error?.url || 'unknown');
  console.error('[PB] Response:', error?.response ? JSON.stringify(error.response, null, 2) : 'empty');
  console.error('[PB] Message:', error?.message || 'unknown error');
  process.exit(1);
});
