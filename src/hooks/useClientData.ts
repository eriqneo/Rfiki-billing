import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';

export function useClientData(clientId?: number) {
  const client = useLiveQuery(
    () => (clientId ? db.clients.get(clientId) : null),
    [clientId]
  );

  const meetings = useLiveQuery(
    () => (clientId ? db.meetings.where('client_id').equals(clientId.toString()).toArray() : []),
    [clientId]
  );

  const agreements = useLiveQuery(
    () => (clientId ? db.agreements.where('client_id').equals(clientId.toString()).toArray() : []),
    [clientId]
  );
  
  const payments = useLiveQuery(
    () => (clientId ? db.payments.where('client_id').equals(clientId.toString()).toArray() : []),
    [clientId]
  );
  
  const promises = useLiveQuery(
    () => (clientId ? db.billing_promises.where('client_id').equals(clientId.toString()).toArray() : []),
    [clientId]
  );

  const totalPaid = payments?.reduce((sum, p) => p.status === 'completed' ? sum + p.amount : sum, 0) || 0;
  const totalPromises = promises?.reduce((sum, p) => sum + p.amount_due, 0) || 0;

  return {
    client,
    meetings,
    agreements,
    billing: {
      totalPaid,
      totalPromises
    },
    isLoading: clientId !== undefined && client === undefined
  };
}
