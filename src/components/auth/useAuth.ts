import { useEffect, useState } from 'react';
import { getSession, subscribeSession, type Session } from '../../scripts/session';

export type AuthView = Session & { ready: boolean; signedIn: boolean };

/** Login state for React islands. Starts as "loading" so the server and the first client frame match. */
export function useAuth(): AuthView {
  const [s, setS] = useState<Session>({ status: 'loading', email: null, mode: 'off', sync: 'idle' });
  useEffect(() => {
    setS(getSession());
    return subscribeSession(() => setS(getSession()));
  }, []);
  return { ...s, ready: s.status !== 'loading', signedIn: s.status === 'signedIn' };
}
