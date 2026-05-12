import PocketBase from 'pocketbase';

const url = import.meta.env.VITE_POCKETBASE_URL || 'https://code-rafiki.pockethost.io';
export const pb = new PocketBase(url);

// Auto-cancellation is disabled to prevent issues with rapid navigation
pb.autoCancellation(false);
