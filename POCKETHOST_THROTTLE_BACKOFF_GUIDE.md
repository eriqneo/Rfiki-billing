# PocketHost Throttle/Backoff Implementation Guide

This guide explains how to protect a PocketBase/PocketHost frontend from `429 Too Many Requests` errors while keeping the app responsive through local-first storage such as IndexedDB.

The core idea:

- Show data from local storage immediately.
- Send PocketBase requests through one shared gate.
- Space requests slightly so app startup and realtime refreshes do not burst.
- When PocketHost returns `429`, pause cloud requests for the requested wait time.
- Let the user keep working locally while sync retries later.

## When To Use This

Use this pattern when:

- The app talks directly to PocketBase/PocketHost from the browser.
- You have PWA/offline-first behavior.
- Multiple screens or hooks fetch collections automatically.
- Users may open the app in multiple tabs/devices.
- You see errors like `Too many requests, wait X seconds`.

## Architecture

Recommended layers:

```txt
UI / modules
  -> local database first, e.g. IndexedDB
  -> sync queue
  -> PocketBase throttle/backoff layer
  -> PocketBase/PocketHost
```

Do not make every module manage rate limits separately. Put the throttle/backoff at the PocketBase client boundary so every `pb.collection(...)` call benefits.

## 1. Create The Rate Limit Helper

Create `src/lib/pocketbaseRateLimit.ts`.

```ts
const COOLDOWN_STORAGE_KEY = 'app_pb_cooldown_until';
const RATE_LIMIT_EVENT = 'app:pb-rate-limit';
const MIN_REQUEST_GAP_MS = 240;
const DEFAULT_RATE_LIMIT_WAIT_MS = 15_000;
const MAX_RATE_LIMIT_WAIT_MS = 90_000;

type PocketBaseRateLimitState = {
  isPaused: boolean;
  waitMs: number;
  cooldownUntil: number;
  message: string;
};

let requestGate = Promise.resolve();
let lastRequestAt = 0;
let cooldownUntil = readStoredCooldown();
let consecutiveRateLimits = 0;

function readStoredCooldown() {
  if (typeof localStorage === 'undefined') return 0;
  const value = Number(localStorage.getItem(COOLDOWN_STORAGE_KEY) || 0);
  return Number.isFinite(value) ? value : 0;
}

function writeStoredCooldown(value: number) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (value > Date.now()) {
      localStorage.setItem(COOLDOWN_STORAGE_KEY, String(value));
    } else {
      localStorage.removeItem(COOLDOWN_STORAGE_KEY);
    }
  } catch {
    // Local storage may be unavailable; in-memory cooldown still works.
  }
}

function sleep(ms: number) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function emitRateLimitState() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(RATE_LIMIT_EVENT, { detail: getPocketBaseRateLimitState() }));
}

function parseWaitMs(response?: Response, data?: any) {
  const retryAfter = response?.headers?.get('Retry-After');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;

    const retryDate = Date.parse(retryAfter);
    if (Number.isFinite(retryDate)) return Math.max(0, retryDate - Date.now());
  }

  const message = String(data?.message || data?.error || '');
  const match = message.match(/(?:wait|retry(?:\s+after)?)[^\d]*(\d+)/i) || message.match(/(\d+)\s*seconds?/i);
  if (match) return Number(match[1]) * 1000;

  return Math.min(DEFAULT_RATE_LIMIT_WAIT_MS * Math.max(1, consecutiveRateLimits + 1), MAX_RATE_LIMIT_WAIT_MS);
}

export function getPocketBaseRateLimitState(): PocketBaseRateLimitState {
  cooldownUntil = Math.max(cooldownUntil, readStoredCooldown());
  const waitMs = Math.max(0, cooldownUntil - Date.now());
  return {
    isPaused: waitMs > 0,
    waitMs,
    cooldownUntil,
    message: waitMs > 0
      ? `Cloud sync paused. PocketHost will resume in ${Math.ceil(waitMs / 1000)}s.`
      : 'Cloud sync available.',
  };
}

export function isPocketBaseRateLimited(error?: any) {
  return error?.status === 429 || error?.response?.code === 429;
}

export function notePocketBaseRateLimit(response?: Response, data?: any) {
  consecutiveRateLimits += 1;
  const waitMs = Math.min(Math.max(parseWaitMs(response, data), 1000), MAX_RATE_LIMIT_WAIT_MS);
  cooldownUntil = Math.max(cooldownUntil, Date.now() + waitMs);
  writeStoredCooldown(cooldownUntil);
  emitRateLimitState();
}

export function notePocketBaseRequestSuccess() {
  if (Date.now() > cooldownUntil) {
    consecutiveRateLimits = 0;
    writeStoredCooldown(0);
  }
}

export async function waitForPocketBaseTurn() {
  const previousGate = requestGate;
  let releaseGate: () => void = () => {};
  requestGate = previousGate.then(() => new Promise<void>(resolve => {
    releaseGate = resolve;
  }));

  await previousGate;

  try {
    const state = getPocketBaseRateLimitState();
    if (state.waitMs > 0) await sleep(state.waitMs);

    const gap = Date.now() - lastRequestAt;
    if (gap < MIN_REQUEST_GAP_MS) await sleep(MIN_REQUEST_GAP_MS - gap);

    lastRequestAt = Date.now();
  } finally {
    releaseGate();
  }
}

export function subscribeToPocketBaseRateLimit(listener: (state: PocketBaseRateLimitState) => void) {
  if (typeof window === 'undefined') return () => {};

  const handleEvent = (event: Event) => {
    listener((event as CustomEvent<PocketBaseRateLimitState>).detail || getPocketBaseRateLimitState());
  };
  const handleStorage = (event: StorageEvent) => {
    if (event.key === COOLDOWN_STORAGE_KEY) listener(getPocketBaseRateLimitState());
  };

  window.addEventListener(RATE_LIMIT_EVENT, handleEvent);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(RATE_LIMIT_EVENT, handleEvent);
    window.removeEventListener('storage', handleStorage);
  };
}
```

## 2. Wire It Into PocketBase

In your PocketBase client file, usually `src/lib/pocketbase.ts`:

```ts
import PocketBase from 'pocketbase';
import {
  notePocketBaseRateLimit,
  notePocketBaseRequestSuccess,
  waitForPocketBaseTurn,
} from './pocketbaseRateLimit';

const url = import.meta.env.VITE_POCKETBASE_URL;
export const pb = new PocketBase(url);

pb.autoCancellation(false);

pb.beforeSend = async (requestUrl, options) => {
  await waitForPocketBaseTurn();
  return { url: requestUrl, options };
};

pb.afterSend = (response, data) => {
  if (response.status === 429) {
    notePocketBaseRateLimit(response, data);
  } else if (response.ok) {
    notePocketBaseRequestSuccess();
  }

  return data;
};
```

This is the most important step. It means normal calls like this are now protected:

```ts
await pb.collection('clients').getFullList();
await pb.collection('billing').create(payload);
await pb.collection('users').authWithPassword(email, password);
```

## 3. Make Sync Respect Cooldown

Your sync worker should skip cloud work while PocketHost is cooling down.

```ts
import {
  getPocketBaseRateLimitState,
  isPocketBaseRateLimited,
  notePocketBaseRateLimit,
} from './pocketbaseRateLimit';

async function processSyncQueue() {
  if (!navigator.onLine) return;
  if (getPocketBaseRateLimitState().isPaused) return;

  for (const item of queue) {
    try {
      await pb.collection(item.collection).create(item.payload);
      markSynced(item);
    } catch (error: any) {
      if (isPocketBaseRateLimited(error)) {
        notePocketBaseRateLimit(undefined, error?.response);
        break;
      }

      markFailed(item);
    }
  }
}
```

Also add single-flight protection so multiple events cannot start sync at the same time:

```ts
let syncInFlight = false;

async function processSyncQueue() {
  if (syncInFlight) return;
  syncInFlight = true;

  try {
    // sync work here
  } finally {
    syncInFlight = false;
  }
}
```

## 4. Reduce Auto-Refresh Bursts

If you have hooks that refetch collections on focus, online, pageshow, auth change, and intervals, throttle them too.

```ts
const AUTO_REFETCH_INTERVAL_MS = 60_000;
const COLLECTION_REFRESH_COOLDOWN_MS = 20_000;
const collectionRefreshTimes = new Map<string, number>();

async function refetchCollection(collectionName: string, silent = false) {
  if (getPocketBaseRateLimitState().isPaused) return [];

  const now = Date.now();
  const lastRefresh = collectionRefreshTimes.get(collectionName) || 0;
  if (silent && now - lastRefresh < COLLECTION_REFRESH_COOLDOWN_MS) {
    return [];
  }

  try {
    const records = await pb.collection(collectionName).getFullList();
    collectionRefreshTimes.set(collectionName, Date.now());
    return records;
  } catch (error: any) {
    if (isPocketBaseRateLimited(error)) {
      notePocketBaseRateLimit(undefined, error?.response);
    }
    return [];
  }
}
```

## 5. Keep Login Stable

If `authRefresh()` fails because of `429`, do not immediately clear the user session. Keep the cached profile and let the app retry later.

```ts
try {
  const authData = await pb.collection('users').authRefresh();
  setCurrentUser(authData.record);
} catch (error: any) {
  if (isPocketBaseRateLimited(error)) {
    notePocketBaseRateLimit(undefined, error?.response);
    setCurrentUser(loadCachedUserProfile());
  } else {
    pb.authStore.clear();
    setCurrentUser(null);
  }
}
```

For login:

```ts
try {
  await pb.collection('users').authWithPassword(email, password);
} catch (error: any) {
  if (isPocketBaseRateLimited(error)) {
    notePocketBaseRateLimit(undefined, error?.response);
  }

  // Optional: fall back to local offline authentication if your app supports it.
}
```

## 6. Show A Small UI Status

Users should not see raw `429` errors. Show a calm status.

```tsx
const [cloudBackoff, setCloudBackoff] = useState(getPocketBaseRateLimitState());

useEffect(() => {
  const unsubscribe = subscribeToPocketBaseRateLimit(setCloudBackoff);
  const timer = window.setInterval(() => {
    setCloudBackoff(getPocketBaseRateLimitState());
  }, 1000);

  return () => {
    unsubscribe();
    window.clearInterval(timer);
  };
}, []);

return cloudBackoff.isPaused ? (
  <div>
    Cloud paused. Sync resumes in {Math.ceil(cloudBackoff.waitMs / 1000)}s.
  </div>
) : null;
```

Suggested wording:

```txt
Cloud paused
PocketHost is limiting requests. Sync resumes in 24s.
```

## 7. How IndexedDB Fits

IndexedDB should remain the fast user-facing layer.

Recommended flow:

```txt
Read screen data -> IndexedDB first
Create/edit/delete -> save locally first
Queue cloud sync -> send through throttle/backoff
429 received -> keep local work pending
Cooldown ends -> retry sync automatically
```

This prevents the app from feeling slow. PocketHost can pause, but the UI remains usable.

## 8. Tuning Values

Good defaults:

```ts
MIN_REQUEST_GAP_MS = 200 to 300;
DEFAULT_RATE_LIMIT_WAIT_MS = 10_000 to 20_000;
MAX_RATE_LIMIT_WAIT_MS = 60_000 to 120_000;
AUTO_SYNC_INTERVAL_MS = 30_000 to 60_000;
AUTO_REFETCH_INTERVAL_MS = 60_000;
COLLECTION_REFRESH_COOLDOWN_MS = 15_000 to 30_000;
```

If your app has many users in one office sharing the same public IP, use slower values.

## 9. Production Checklist

Before shipping:

- All PocketBase calls use the shared `pb` instance.
- Sync queue has single-flight protection.
- Realtime updates do not refetch entire collections unnecessarily.
- Focus/online/pageshow handlers are debounced or cooled down.
- Login/session refresh handles `429` gracefully.
- UI shows cloud pause status.
- Local writes continue while cloud sync is paused.
- Failed sync items remain queued for retry.
- Admin repair/rebuild tools are throttled and not run automatically too often.

## 10. Common Mistakes

Avoid these:

- Retrying immediately after `429`.
- Clearing auth session on every network/rate-limit error.
- Fetching every collection on every screen mount.
- Running sync from multiple hooks without a global lock.
- Polling too frequently.
- Opening many tabs and letting each tab run full sync independently.

## Summary

The pattern is simple:

```txt
Local-first UI
+ shared PocketBase request gate
+ cooldown after 429
+ sync queue retry
+ small user-facing cloud status
= production-friendly PocketHost behavior
```

This will not remove PocketHost limits, but it makes the app behave professionally inside those limits.
