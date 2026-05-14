const COOLDOWN_STORAGE_KEY = 'rafiki_pb_cooldown_until';
const RATE_LIMIT_EVENT = 'rafiki:pb-rate-limit';
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
    // Local storage may be unavailable in private mode; the in-memory cooldown still works.
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
