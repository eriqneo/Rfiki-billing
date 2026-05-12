import 'dotenv/config';

const pbUrl = process.env.POCKETBASE_URL || process.env.VITE_POCKETBASE_URL || 'https://code-rafiki.pockethost.io';
const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL;
const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD;

const collectionName = 'pocket_host_instances';
const authRule = '@request.auth.id != ""';

const requiredFields = [
  { name: 'instance_name', type: 'text', required: true },
  { name: 'client_id', type: 'text', required: false },
  { name: 'monthly_fee', type: 'number', required: false },
  { name: 'billing_cycle', type: 'select', required: false, values: ['monthly', 'quarterly', 'semi-annual', 'yearly'] },
  { name: 'status', type: 'select', required: false, values: ['active', 'suspended', 'trial'] },
  { name: 'created_at', type: 'text', required: false },
  { name: 'next_billing_date', type: 'text', required: false },
];

function assertAdminCredentials() {
  if (!adminEmail || !adminPassword) {
    throw new Error(
      'Missing PocketBase admin credentials. Set POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD in .env before running this script.'
    );
  }
}

function mergeFields(existingFields: any[] = []) {
  const appFields = existingFields.filter((field) => !field.system);
  const existingByName = new Map(appFields.map((field) => [field.name, field]));
  let changed = false;

  const mergedFields = [...appFields];

  for (const field of requiredFields) {
    const existing = existingByName.get(field.name);
    if (!existing) {
      mergedFields.push(field);
      changed = true;
    }
  }

  return { fields: mergedFields, changed };
}

async function pbRequest(path: string, options: RequestInit = {}) {
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
}

async function ensurePocketHostCollection() {
  assertAdminCredentials();

  console.log(`[PB] Connecting to ${pbUrl}`);
  console.log(`[PB] Admin email loaded: ${adminEmail}`);
  console.log(`[PB] Admin password loaded: ${adminPassword ? `${adminPassword.length} characters` : 'missing'}`);

  const authData = await pbRequest('/api/collections/_superusers/auth-with-password', {
    method: 'POST',
    body: JSON.stringify({ identity: adminEmail, password: adminPassword }),
  });
  const token = authData.token;
  console.log('[PB] Admin authenticated');

  try {
    const existing = await pbRequest(`/api/collections/${collectionName}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const { fields, changed } = mergeFields(existing.fields || []);

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
      ? `[PB] Updated schema and rules for ${collectionName}`
      : `[PB] ${collectionName} already exists; rules refreshed`);
  } catch (error: any) {
    if (error?.status !== 404) {
      throw error;
    }

    await pbRequest('/api/collections', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
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

    console.log(`[PB] Created ${collectionName} with authenticated user rules`);
  }

  console.log('[PB] PocketHost inventory collection is ready. Open Settings and run Repair Cloud Integrity to upload local nodes.');
}

ensurePocketHostCollection().catch((error) => {
  console.error('[PB] Inventory setup failed');
  console.error('[PB] Status:', error?.status ?? 'unknown');
  console.error('[PB] URL:', error?.url || error?.data?.url || 'unknown');
  console.error('[PB] Response:', error?.response ? JSON.stringify(error.response, null, 2) : 'empty');
  console.error('[PB] Message:', error?.message || 'unknown error');
  if (error?.originalError) {
    console.error('[PB] Original error:', JSON.stringify(error.originalError, null, 2));
  }
  process.exit(1);
});
