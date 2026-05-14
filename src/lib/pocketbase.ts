import PocketBase from 'pocketbase';
import { notePocketBaseRateLimit, notePocketBaseRequestSuccess, waitForPocketBaseTurn } from './pocketbaseRateLimit';

const url = import.meta.env.VITE_POCKETBASE_URL || 'https://code-rafiki.pockethost.io';
export const pb = new PocketBase(url);

// Auto-cancellation is disabled to prevent issues with rapid navigation
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
