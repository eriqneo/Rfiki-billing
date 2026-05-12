import 'dotenv/config';

const pbUrl = process.env.POCKETBASE_URL || process.env.VITE_POCKETBASE_URL || 'https://code-rafiki.pockethost.io';
const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL;
const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD;

const adminRule = '@request.auth.role = "Admin"';
const selfOrAdminRule = '@request.auth.id = id || @request.auth.role = "Admin"';

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

async function ensurePocketBaseUsers() {
  assertAdminCredentials();

  console.log(`[PB] Connecting to ${pbUrl}`);
  const authData = await pbRequest('/api/collections/_superusers/auth-with-password', {
    method: 'POST',
    body: JSON.stringify({ identity: adminEmail, password: adminPassword }),
  });

  const users = await pbRequest('/api/collections/users', {
    headers: { authorization: `Bearer ${authData.token}` },
  });

  await pbRequest(`/api/collections/${users.id}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${authData.token}` },
    body: JSON.stringify({
      listRule: adminRule,
      viewRule: selfOrAdminRule,
      createRule: adminRule,
      updateRule: selfOrAdminRule,
      deleteRule: adminRule,
      manageRule: adminRule,
    }),
  });

  console.log('[PB] Users collection rules updated. Frontend Admins can now list, create, edit, remove, and manage users.');
}

ensurePocketBaseUsers().catch((error) => {
  console.error('[PB] Users setup failed:', error?.response || error);
  process.exit(1);
});
