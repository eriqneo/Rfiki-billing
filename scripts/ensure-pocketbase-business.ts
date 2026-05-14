import 'dotenv/config';

const pbUrl = process.env.POCKETBASE_URL || process.env.VITE_POCKETBASE_URL || 'https://code-rafiki.pockethost.io';
const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL;
const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD;

const collectionName = 'business';
const authRule = '@request.auth.id != ""';

const requiredFields = [
  { name: 'name', type: 'text', required: true },
  { name: 'till_number', type: 'text', required: false },
  { name: 'currency', type: 'text', required: false },
  { name: 'email', type: 'email', required: false },
  { name: 'phone', type: 'text', required: false },
  { name: 'website', type: 'url', required: false },
  { name: 'address', type: 'text', required: false },
  { name: 'logo_base64', type: 'text', required: false },
];

function assertAdminCredentials() {
  if (!adminEmail || !adminPassword) {
    throw new Error('Missing POCKETBASE_ADMIN_EMAIL or POCKETBASE_ADMIN_PASSWORD in .env.');
  }
}

function mergeFields(existingFields: any[] = []) {
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

async function ensurePocketBaseBusiness() {
  assertAdminCredentials();

  console.log(`[PB] Connecting to ${pbUrl}`);
  const authData = await pbRequest('/api/collections/_superusers/auth-with-password', {
    method: 'POST',
    body: JSON.stringify({ identity: adminEmail, password: adminPassword }),
  });

  try {
    const existing = await pbRequest(`/api/collections/${collectionName}`, {
      headers: { authorization: `Bearer ${authData.token}` },
    });
    const { fields, changed } = mergeFields(existing.fields || []);

    await pbRequest(`/api/collections/${existing.id}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${authData.token}` },
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
      ? '[PB] Updated schema and rules for business'
      : '[PB] business already exists; rules refreshed');
  } catch (error: any) {
    if (error?.status !== 404) throw error;

    await pbRequest('/api/collections', {
      method: 'POST',
      headers: { authorization: `Bearer ${authData.token}` },
      body: JSON.stringify({
        name: collectionName,
        type: 'base',
        fields: requiredFields,
        listRule: authRule,
        viewRule: authRule,
        createRule: authRule,
        updateRule: authRule,
        deleteRule: authRule,
      }),
    });

    console.log('[PB] Created business with authenticated user rules');
  }

  console.log('[PB] Business profile collection is ready.');
}

ensurePocketBaseBusiness().catch((error) => {
  console.error('[PB] Business setup failed');
  console.error('[PB] Status:', error?.status ?? 'unknown');
  console.error('[PB] URL:', error?.url || 'unknown');
  console.error('[PB] Response:', error?.response ? JSON.stringify(error.response, null, 2) : 'empty');
  console.error('[PB] Message:', error?.message || 'unknown error');
  process.exit(1);
});
