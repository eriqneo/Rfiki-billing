import 'dotenv/config';

const pbUrl = process.env.POCKETBASE_URL || process.env.VITE_POCKETBASE_URL || 'https://code-rafiki.pockethost.io';
const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL;
const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD;
const authRule = '@request.auth.id != ""';

const collection = {
  name: 'invoices',
  fields: [
    { name: 'invoice_number', type: 'text', required: true },
    { name: 'client_id', type: 'text', required: true },
    { name: 'client_name', type: 'text', required: true },
    { name: 'quote_id', type: 'text', required: false },
    { name: 'quote_number', type: 'text', required: false },
    { name: 'billing_promise_id', type: 'text', required: false },
    { name: 'milestone_title', type: 'text', required: false },
    { name: 'issue_date', type: 'text', required: true },
    { name: 'due_date', type: 'text', required: true },
    { name: 'currency', type: 'text', required: true },
    { name: 'items_json', type: 'json', required: true },
    { name: 'subtotal', type: 'number', required: true },
    { name: 'tax_rate', type: 'number', required: false },
    { name: 'tax_amount', type: 'number', required: false },
    { name: 'total', type: 'number', required: true },
    { name: 'status', type: 'select', required: true, values: ['draft', 'sent', 'paid', 'void'] },
    { name: 'notes', type: 'text', required: false },
    { name: 'paid_at', type: 'text', required: false },
  ],
};

function assertAdminCredentials() {
  if (!adminEmail || !adminPassword) {
    throw new Error('Missing POCKETBASE_ADMIN_EMAIL or POCKETBASE_ADMIN_PASSWORD in .env.');
  }
}

async function pbRequest(path: string, options: RequestInit = {}) {
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
}

function mergeFields(existingFields: any[] = [], requiredFields: any[]) {
  const appFields = existingFields.filter(field => !field.system);
  const existingByName = new Map(appFields.map(field => [field.name, field]));
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

async function ensureCollection(token: string) {
  try {
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
    console.log(changed ? '[PB] Updated invoices schema' : '[PB] invoices already ready; rules refreshed');
  } catch (error: any) {
    if (error?.status !== 404) throw error;
    await pbRequest('/api/collections', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: collection.name,
        type: 'base',
        fields: collection.fields,
        listRule: authRule,
        viewRule: authRule,
        createRule: authRule,
        updateRule: authRule,
        deleteRule: authRule,
      }),
    });
    console.log('[PB] Created invoices collection');
  }
}

async function ensurePocketBaseInvoices() {
  assertAdminCredentials();
  console.log(`[PB] Connecting to ${pbUrl}`);
  const authData = await pbRequest('/api/collections/_superusers/auth-with-password', {
    method: 'POST',
    body: JSON.stringify({ identity: adminEmail, password: adminPassword }),
  });
  await ensureCollection(authData.token);
  console.log('[PB] Invoice collection is ready.');
}

ensurePocketBaseInvoices().catch((error) => {
  console.error('[PB] Invoice setup failed');
  console.error('[PB] Status:', error?.status ?? 'unknown');
  console.error('[PB] URL:', error?.url || 'unknown');
  console.error('[PB] Response:', error?.response ? JSON.stringify(error.response, null, 2) : 'empty');
  console.error('[PB] Message:', error?.message || 'unknown error');
  process.exit(1);
});
