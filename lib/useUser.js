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
    const { data: l } = sb.auth.onAuthStateChange((_e, s) => { if (!s) r.replace('/'); else setSession(s); });
    return () => l.subscription.unsubscribe();
  }, []);
  return { session, user: session?.user, name: session?.user?.user_metadata?.name || 'Student', ready };
}
