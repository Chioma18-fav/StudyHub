'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { sb } from './supabase';
export function useUser() {
  const r = useRouter();
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => {
      if (!data.session) r.replace('/'); else { setSession(data.session); setReady(true); }
    });
    const { data: l } = sb.auth.onAuthStateChange((ev, s) => { if (ev === 'SIGNED_OUT') r.replace('/'); else if (s) setSession(s); });
    return () => l.subscription.unsubscribe();
  }, []);
  return { session, user: session?.user, name: session?.user?.user_metadata?.name || 'Student', ready };
}
