import { db, type Meeting } from '../db/db';

const safeFetch = async (url: string, options: RequestInit = {}, retries = 1): Promise<Response> => {
  try {
    const authRecord = await db.auth_tokens.get('google_calendar');
    if (authRecord?.tokens) {
      options.headers = {
        ...options.headers,
        'x-google-tokens': JSON.stringify(authRecord.tokens)
      };
    }
    const response = await fetch(url, options);
    
    // Auto-update tokens if server refreshed them
    const newTokens = response.headers.get('x-new-google-tokens');
    if (newTokens) {
      try {
        await db.auth_tokens.put({ key: 'google_calendar', tokens: JSON.parse(newTokens) });
        console.log('[RAFIKI] Google token auto-refreshed and saved.');
      } catch (e) {
        console.error('[RAFIKI ERROR] Failed to save refreshed tokens:', e);
      }
    }

    return response;
  } catch (error: any) {
    // Retry on transport errors
    if (retries > 0 && (error.message === 'Failed to fetch' || error.name === 'TypeError')) {
      console.warn(`[RAFIKI] Network error detected, retrying... (${retries} left)`);
      await new Promise(resolve => setTimeout(resolve, 800));
      return safeFetch(url, options, retries - 1);
    }

    // Standardize transport errors
    if (error.message === 'Failed to fetch' || error.name === 'TypeError') {
      const isProxyError = error.message.includes('407');
      console.warn(`[NETWORK] ${isProxyError ? 'Proxy Error' : 'Transport Error'}: Failed to reach server. Check connection.`);
      throw new Error(isProxyError ? 'PROXY_AUTH_REQUIRED' : 'NETWORK_ERROR');
    }
    throw error;
  }
};

export const googleCalendarService = {
  // Broadcaster for auth errors
  broadcastAuthError(msg: string | null) {
    window.dispatchEvent(new CustomEvent('google-auth-error', { detail: msg }));
  },

  async saveTokens(tokens: any) {
    if (!tokens || Object.keys(tokens).length === 0) {
      console.warn('[RAFIKI] Attempted to save empty tokens, aborted.');
      return;
    }
    await db.auth_tokens.put({ key: 'google_calendar', tokens });
  },

  async getAuthUrl() {
    const response = await safeFetch('/api/auth/google/url');
    const { url } = await response.json();
    return url;
  },

  async fetchMeetings() {
    try {
      const response = await safeFetch('/api/google-calendar/meetings');
      if (response.status === 401) {
        console.warn('Authentication error. User must reconnect to Google.');
        this.broadcastAuthError('Authentication Expired.');
        return await db.meetings.toArray();
      }
      if (response.status === 407) {
        console.error('Network Proxy Error (407). Check your local network settings.');
        this.broadcastAuthError('Network Proxy Error (407).');
        return await db.meetings.toArray();
      }
      if (!response.ok) throw new Error(`Sync Error: ${response.status}`);
      
      this.broadcastAuthError(null); // Clear errors on success
      const googleMeetings = await response.json();
      
      const formattedMeetings = googleMeetings.map((m: any) => ({
        google_id: m.id,
        summary: m.summary,
        description: m.description,
        start_time: m.start.dateTime || m.start.date,
        end_time: m.end.dateTime || m.end.date,
        type: this.determineMeetingType(m.summary),
        synced: true,
      }));

      if (formattedMeetings.length > 0) {
        await db.meetings.where('google_id').anyOf(formattedMeetings.map((m: any) => m.google_id)).delete();
        await db.meetings.bulkAdd(formattedMeetings);
      }
      
      return formattedMeetings;
    } catch (error: any) {
      if (error.message === 'NETWORK_ERROR') {
        this.broadcastAuthError('Network instability detected. Check uplink.');
      } else if (error.message === 'PROXY_AUTH_REQUIRED') {
        this.broadcastAuthError('Network Proxy Error (407).');
      }
      console.warn('Google Calendar fetch fail, using local data:', error);
      return await db.meetings.toArray();
    }
  },

  async scheduleMeeting(meeting: Omit<Meeting, 'id' | 'synced'>, existingId?: number) {
    if (!navigator.onLine) {
      if (existingId) return { id: existingId, synced: false };
      const id = await db.meetings.add({ ...meeting, synced: false });
      await db.pending_sync.add({
        entity: 'meetings',
        entity_id: id as number,
        operation: 'CREATE',
        timestamp: Date.now(),
        payload: JSON.stringify(meeting)
      });
      return { id, synced: false };
    }

    try {
      const response = await safeFetch('/api/google-calendar/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: meeting.summary,
          description: meeting.description,
          start_time: meeting.start_time,
          end_time: meeting.end_time,
        }),
      });

      if (response.status === 401) {
        this.broadcastAuthError('Authentication Expired.');
        throw new Error('GOOGLE_AUTH_REQUIRED');
      }

      if (response.status === 407) {
        this.broadcastAuthError('Network Proxy Error (407).');
        throw new Error('PROXY_AUTH_REQUIRED');
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded with ${response.status}`);
      }
      
      const created = await response.json();
      let finalId = existingId;
      if (existingId) {
        await db.meetings.update(existingId, { 
          google_id: created.id, 
          synced: true 
        });
      } else {
        finalId = await db.meetings.add({ 
          ...meeting, 
          google_id: created.id, 
          synced: true 
        }) as number;
      }
      
      return { id: finalId, synced: true };
    } catch (error: any) {
      if (error.message === 'NETWORK_ERROR') {
        this.broadcastAuthError('Network instability detected. Check uplink.');
      } else if (error.message === 'PROXY_AUTH_REQUIRED') {
        this.broadcastAuthError('Network Proxy Error (407).');
      }
      
      const errorMsg = error.message === 'NETWORK_ERROR' ? 'Network lost' : 
                       error.message === 'PROXY_AUTH_REQUIRED' ? 'Proxy auth' : 
                       error.message === 'GOOGLE_AUTH_REQUIRED' ? 'Authorization expired' :
                       (error.message || 'Unknown Transport Error');
                       
      if (error.message === 'GOOGLE_AUTH_REQUIRED' || error.message === 'NETWORK_ERROR') {
        console.warn(`[RAFIKI Sync] Handled non-fatal disruption: ${errorMsg}`);
      } else {
        console.error(`Failed to schedule with Google, saving locally: ${errorMsg}`);
      }
      
      if (existingId) return { id: existingId, synced: false };

      const id = await db.meetings.add({ ...meeting, synced: false });
      await db.pending_sync.add({
        entity: 'meetings',
        entity_id: id as number,
        operation: 'CREATE',
        timestamp: Date.now(),
        payload: JSON.stringify(meeting)
      });
      return { id, synced: false };
    }
  },

  determineMeetingType(summary: string): 'Payment Review' | 'Client Agreement' | 'Other' {
    const s = summary.toLowerCase();
    if (s.includes('payment') || s.includes('billing')) return 'Payment Review';
    if (s.includes('agreement') || s.includes('contract')) return 'Client Agreement';
    return 'Other';
  }
};
