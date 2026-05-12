# Rafiki Business Manager — Production Deployment Plan

**Goal:** Take the app from local development to a live, production-grade system at `app.rafikicode.com`, backed by PocketBase at `code-rafiki.pockethost.io`.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│           app.rafikicode.com (Vercel)                │
│         React PWA  +  Vite  +  Service Worker        │
│         ─────────────────────────────────────        │
│   Local IndexedDB (Dexie) ──► sync ──► PocketBase   │
└──────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────▼────────────────┐
                    │  code-rafiki.pockethost.io      │
                    │  PocketBase (Auth + Database)   │
                    └────────────────────────────────┘
```

> [!IMPORTANT]
> **Key architectural insight:** Your app already works offline-first with Dexie (IndexedDB). PocketBase is the **sync target** — the cloud backup and multi-device/multi-user source of truth. The app runs fully without internet; data pushes to PocketBase when online.

---

## Phase 1 — Local Testing (Before Deployment)

Run these checks against your **local dev server** (`npm run dev`) before touching production.

### ✅ Functional Testing Checklist

| Module | Test | Pass? |
|---|---|---|
| **Auth** | Login with Admin / Viewer accounts | |
| **Auth** | Module permissions enforced in Sidebar | |
| **Auth** | Access Denied screen for restricted modules | |
| **Dashboard** | Stats load (revenue, servers, agreements) | |
| **Client Hub** | Add, edit, search, view a client | |
| **Billing** | Create a billing promise, mark as paid | |
| **Agreements** | Upload + save a contract, check status | |
| **Expenses** | Declare expense, filter by category | |
| **Meetings** | Schedule a meeting, see in calendar | |
| **Reports** | Monthly table renders, export CSV + PDF | |
| **Settings** | Upload logo → appears in sidebar | |
| **Settings** | Add team member, assign module permissions | |
| **PWA** | Install app on mobile (Chrome → "Add to Home Screen") | |
| **Offline** | Disconnect internet, create a record, reconnect → syncs | |

### ✅ Build Validation

```bash
# Ensure there are no TypeScript errors
npm run lint

# Build the production bundle — check for errors
npm run build

# Preview the production build locally before deploying
npm run preview
```

> [!WARNING]
> Do **not** deploy if `npm run lint` or `npm run build` produce errors. Fix them locally first.

---

## Phase 2 — PocketBase Schema Setup (Automated via JS SDK)

Instead of manually creating tables in the PocketBase dashboard, we run a **one-time migration script** that creates all collections, fields, and indexes automatically.

### Step 1 — Install PocketBase SDK

```bash
npm install pocketbase
```

### Step 2 — Create Migration Script

#### [NEW] `scripts/pb-migrate.ts`

Create this file at the root of your project. Run it **once** against your live PocketBase instance:

```typescript
import PocketBase from 'pocketbase';

const pb = new PocketBase('https://code-rafiki.pockethost.io');

// ── IMPORTANT: Use your PocketBase Admin credentials ──────────────────────
await pb.admins.authWithPassword('your-admin@email.com', 'your-admin-password');

const collections = [
  {
    name: 'clients',
    fields: [
      { name: 'node_id', type: 'text', required: true },
      { name: 'name', type: 'text', required: true },
      { name: 'entity_type', type: 'select', values: ['INDIVIDUAL', 'COMPANY'] },
      { name: 'email', type: 'email' },
      { name: 'phone', type: 'text' },
      { name: 'agreed_price', type: 'number' },
      { name: 'deposit_paid', type: 'bool' },
      { name: 'initial_meeting', type: 'text' },
      { name: 'target_payment', type: 'text' },
      { name: 'project_tag', type: 'text' },
      { name: 'app_built', type: 'text' },
      { name: 'project_desc', type: 'text' },
      { name: 'contact_json', type: 'json' },
      { name: 'notes', type: 'text' },
    ]
  },
  {
    name: 'payments',
    fields: [
      { name: 'client_id', type: 'text', required: true },
      { name: 'amount', type: 'number', required: true },
      { name: 'method', type: 'select', values: ['Cash', 'Mpesa', 'Bank'] },
      { name: 'status', type: 'select', values: ['pending', 'completed', 'failed'] },
      { name: 'date', type: 'text' },
      { name: 'transaction_id', type: 'text' },
      { name: 'idempotency_key', type: 'text' },
    ]
  },
  {
    name: 'expenses',
    fields: [
      { name: 'date', type: 'text', required: true },
      { name: 'category', type: 'text', required: true },
      { name: 'sub_tag', type: 'text' },
      { name: 'amount', type: 'number', required: true },
      { name: 'tax_amount', type: 'number' },
      { name: 'client_id', type: 'text' },
      { name: 'description', type: 'text' },
      { name: 'receipt_img', type: 'file' },
    ]
  },
  {
    name: 'agreements',
    fields: [
      { name: 'client_id', type: 'text', required: true },
      { name: 'client_name', type: 'text' },
      { name: 'project_details', type: 'text' },
      { name: 'file_path', type: 'text' },
      { name: 'signed_date', type: 'text' },
      { name: 'created_date', type: 'text' },
      { name: 'expiry_date', type: 'text' },
      { name: 'status', type: 'select', values: ['active', 'expired', 'pending'] },
    ]
  },
  {
    name: 'meetings',
    fields: [
      { name: 'google_id', type: 'text' },
      { name: 'gcal_link', type: 'url' },
      { name: 'client_id', type: 'text' },
      { name: 'summary', type: 'text', required: true },
      { name: 'description', type: 'text' },
      { name: 'minutes', type: 'text' },
      { name: 'start_time', type: 'text', required: true },
      { name: 'end_time', type: 'text', required: true },
      { name: 'location', type: 'text' },
      { name: 'type', type: 'select', values: ['Discovery', 'Agreement Signing', 'Payment Follow-up', 'Other'] },
    ]
  },
  {
    name: 'billing_promises',
    fields: [
      { name: 'amount_due', type: 'number', required: true },
      { name: 'due_date', type: 'text', required: true },
      { name: 'client_id', type: 'text', required: true },
      { name: 'payment_method', type: 'select', values: ['Mpesa', 'Bank', 'Cash'] },
      { name: 'status', type: 'select', values: ['fulfilled', 'pending', 'broken'] },
    ]
  },
  {
    name: 'team_members',
    fields: [
      { name: 'name', type: 'text', required: true },
      { name: 'email', type: 'email', required: true },
      { name: 'role', type: 'select', values: ['Admin', 'Editor', 'Viewer'] },
      { name: 'password_hash', type: 'text' },
      { name: 'must_change_password', type: 'bool' },
      { name: 'module_permissions', type: 'json' },
    ]
  },
  {
    name: 'business',
    fields: [
      { name: 'name', type: 'text', required: true },
      { name: 'till_number', type: 'text' },
      { name: 'currency', type: 'text' },
      { name: 'logo_base64', type: 'text' },
    ]
  },
  {
    name: 'pocket_host_instances',
    fields: [
      { name: 'instance_name', type: 'text', required: true },
      { name: 'client_id', type: 'text' },
      { name: 'monthly_fee', type: 'number' },
      { name: 'billing_cycle', type: 'select', values: ['monthly', 'quarterly', 'semi-annual', 'yearly'] },
      { name: 'status', type: 'select', values: ['active', 'suspended', 'trial'] },
      { name: 'created_at', type: 'text' },
      { name: 'next_billing_date', type: 'text' },
    ]
  },
];

for (const col of collections) {
  try {
    await pb.collections.create({ name: col.name, type: 'base', schema: col.fields });
    console.log(`✅ Created: ${col.name}`);
  } catch (e: any) {
    if (e.status === 400) {
      console.log(`⏭  Already exists: ${col.name}`);
    } else {
      console.error(`❌ Failed: ${col.name}`, e.message);
    }
  }
}

console.log('\n🎉 PocketBase schema setup complete.');
```

### Step 3 — Run the Migration

```bash
# Run once, targeting your live PocketBase URL
npx tsx scripts/pb-migrate.ts
```

> [!NOTE]
> **Simpler alternative:** PocketBase also lets you export/import a `pb_schema.json` directly from the Admin UI (Settings → Export Collections). Once you've verified the schema via the script, you can export it and check it into version control as a backup.

---

## Phase 3 — Wire the App to PocketBase (Auth + Sync)

Currently `VITE_AUTH_MODE=local`. In production, authentication and data sync must go through PocketBase.

### Changes Required

#### [MODIFY] `.env.example` → create `.env.production`

```env
VITE_AUTH_MODE=pocketbase
VITE_POCKETBASE_URL=https://code-rafiki.pockethost.io
VITE_GOOGLE_CLIENT_ID=your-google-client-id
VITE_GOOGLE_API_KEY=your-google-api-key
```

#### [MODIFY] `AuthContext.tsx`
- The `login()` function already has a PocketBase branch stubbed in. It needs to be activated to authenticate against `pb.collection('users').authWithPassword(email, password)`.
- Session management needs to use PocketBase's built-in auth store rather than the local Dexie `auth_session` table.

#### [MODIFY] `useSync.ts`
- Add a PocketBase sync layer that pushes `syncQueue` items to the corresponding PocketBase collections on network reconnect.

> [!IMPORTANT]
> **This is the most significant code change.** Plan for 1–2 days of focused development on the sync bridge. Everything else is configuration.

---

## Phase 4 — Vercel Deployment (Frontend)

**Vercel is the right choice** for this. It handles Vite/React perfectly, has free SSL, and integrates naturally with custom domains.

### Step 1 — Push to GitHub

```bash
git init
git add .
git commit -m "feat: production-ready Rafiki Business Manager"
git remote add origin https://github.com/your-org/rafiki-bm.git
git push -u origin main
```

### Step 2 — Connect to Vercel

1. Go to [vercel.com](https://vercel.com) → **New Project** → Import your GitHub repo
2. Framework preset: **Vite**
3. Build command: `npm run build`
4. Output directory: `dist`

### Step 3 — Environment Variables in Vercel

In the Vercel project dashboard → **Settings → Environment Variables**, add:

| Key | Value |
|---|---|
| `VITE_AUTH_MODE` | `pocketbase` |
| `VITE_POCKETBASE_URL` | `https://code-rafiki.pockethost.io` |
| `VITE_GOOGLE_CLIENT_ID` | *(your value)* |
| `VITE_GOOGLE_API_KEY` | *(your value)* |

### Step 4 — Custom Domain

In Vercel → **Settings → Domains** → add `app.rafikicode.com`.

Then in your domain registrar (wherever `rafikicode.com` DNS is managed), add a **CNAME record**:
```
CNAME   app   cname.vercel-dns.com
```
Vercel will auto-provision SSL. Takes 5–30 minutes.

---

## Phase 5 — Cleanup & Pilot Launch

Once the app is live and tested at `app.rafikicode.com`:

### Remove Seed Data

In `App.tsx`, the `seed()` function inside `useEffect` pre-populates the DB with demo clients, payments, and agreements. Before real use:

1. **Clear the seed block** — remove the `if (expenseCount === 0) { ... }` block, or gate it behind `import.meta.env.DEV` so it only runs locally.
2. **In PocketBase Admin UI** → Delete any test records that were synced.
3. **Train pilot users** → Admin creates their own login via Settings → Team Management.

### Pre-Launch Checklist

- [ ] `npm run build` succeeds with zero errors
- [ ] App loads at `app.rafikicode.com` with correct SSL
- [ ] Login with Admin credentials works via PocketBase
- [ ] Creating a client from the live app creates a record in PocketBase Admin UI
- [ ] Logo uploads and persists across page refresh
- [ ] Reports generate a PDF correctly
- [ ] PWA installable on Chrome mobile

---

## Open Questions

> [!IMPORTANT]
> **Google Calendar in production:** The current `server.ts` Express server handles the Google OAuth callback. On Vercel (serverless), `server.ts` **won't run**. The Google Calendar integration either needs to be migrated to **Vercel Serverless Functions** (`/api/` folder) or disabled for the initial launch with a note to re-enable post-launch.

> [!NOTE]
> **PocketBase free tier:** `pockethost.io` free plans have storage and bandwidth limits. The `logo_base64` field stores logos as full base64 strings which can be large. Consider switching to PocketBase's native `file` field type and uploading to PocketBase storage instead.

> [!NOTE]
> **Multi-user conflict resolution:** Currently the sync is one-directional (local → cloud). If two users edit the same client offline, the last sync wins. For the pilot phase this is acceptable. Post-pilot, consider a field-level merge strategy.
