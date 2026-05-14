import 'dotenv/config';

const pbUrl = process.env.POCKETBASE_URL || process.env.VITE_POCKETBASE_URL || 'https://code-rafiki.pockethost.io';
const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL;
const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD;

const authRule = '@request.auth.id != ""';

const collections = [
  {
    name: 'quotations',
    fields: [
      { name: 'quote_number', type: 'text', required: true },
      { name: 'client_id', type: 'text', required: false },
      { name: 'prospect_name', type: 'text', required: true },
      { name: 'prospect_email', type: 'email', required: false },
      { name: 'prospect_phone', type: 'text', required: false },
      { name: 'project_title', type: 'text', required: true },
      { name: 'project_summary', type: 'text', required: false },
      { name: 'issue_date', type: 'text', required: true },
      { name: 'valid_until', type: 'text', required: false },
      { name: 'currency', type: 'text', required: true },
      { name: 'items_json', type: 'json', required: true },
      { name: 'terms_json', type: 'json', required: false },
      { name: 'subtotal', type: 'number', required: true },
      { name: 'discount_amount', type: 'number', required: false },
      { name: 'tax_rate', type: 'number', required: false },
      { name: 'tax_amount', type: 'number', required: false },
      { name: 'total', type: 'number', required: true },
      { name: 'status', type: 'select', required: true, values: ['draft', 'sent', 'accepted', 'declined', 'expired'] },
      { name: 'billing_plan_created', type: 'bool', required: false },
      { name: 'notes', type: 'text', required: false },
    ],
  },
  {
    name: 'quotation_templates',
    fields: [
      { name: 'title', type: 'text', required: true },
      { name: 'category', type: 'text', required: false },
      { name: 'description', type: 'text', required: true },
      { name: 'scope_summary', type: 'text', required: false },
      { name: 'unit_price', type: 'number', required: true },
      { name: 'unit', type: 'text', required: false },
      { name: 'tax_rate', type: 'number', required: false },
      { name: 'is_active', type: 'bool', required: false },
    ],
  },
];

function assertAdminCredentials() {
  if (!adminEmail || !adminPassword) {
    throw new Error('Missing POCKETBASE_ADMIN_EMAIL or POCKETBASE_ADMIN_PASSWORD in .env.');
  }
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

async function ensureCollection(collection: { name: string; fields: any[] }, token: string) {
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

    console.log(changed
      ? `[PB] Updated schema and rules for ${collection.name}`
      : `[PB] ${collection.name} already exists; rules refreshed`);
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

    console.log(`[PB] Created ${collection.name} with authenticated user rules`);
  }
}

async function ensurePocketBaseQuotations() {
  assertAdminCredentials();

  console.log(`[PB] Connecting to ${pbUrl}`);
  const authData = await pbRequest('/api/collections/_superusers/auth-with-password', {
    method: 'POST',
    body: JSON.stringify({ identity: adminEmail, password: adminPassword }),
  });

  for (const collection of collections) {
    await ensureCollection(collection, authData.token);
  }

  console.log('[PB] Quotation collections are ready.');
}

ensurePocketBaseQuotations().catch((error) => {
  console.error('[PB] Quotation setup failed');
  console.error('[PB] Status:', error?.status ?? 'unknown');
  console.error('[PB] URL:', error?.url || 'unknown');
  console.error('[PB] Response:', error?.response ? JSON.stringify(error.response, null, 2) : 'empty');
  console.error('[PB] Message:', error?.message || 'unknown error');
  process.exit(1);
});
