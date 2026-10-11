'use client';
import { useEffect, useState } from 'react';
import { sb } from '../lib/supabase';
export default function Shell() {
  const [toasts, setToasts] = useState([]);
  useEffect(() => {
    let ch = null, me = null, ctx = {}, ok = false;
    const track = () => ok && ch.track({ id: me.id, name: me.name, ...ctx });
    const boot = s => {
      if (ch && s && me?.id === s.user.id) return;
      if (ch) { sb.removeChannel(ch); ch = null; ok = false; window.__online = []; }
      if (!s) { me = null; return; }
      me = { id: s.user.id, name: s.user.user_metadata?.name || 'Student' };
      const c = sb.channel('lounge', { config: { presence: { key: me.id } } }); ch = c;
      c.on('presence', { event: 'sync' }, () => { const l = Object.values(c.presenceState()).map(a => a[0]); window.__online = l; window.dispatchEvent(new CustomEvent('sh:online', { detail: l })); });
      c.on('broadcast', { event: 'req' }, ({ payload }) => { if (payload.to === me.id) setToasts(t => [...t.filter(x => x.from !== payload.from), payload]); });
      c.subscribe(st => { if (st === 'SUBSCRIBED') { ok = true; track(); } });
    };
    sb.auth.getSession().then(({ data }) => boot(data.session));
    const { data: l } = sb.auth.onAuthStateChange((ev, s) => { if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT') boot(s); });
    const onCtx = e => { ctx = e.detail || {}; track(); };
    const onReq = e => ok && ch.send({ type: 'broadcast', event: 'req', payload: e.detail });
    window.addEventListener('sh:ctx', onCtx); window.addEventListener('sh:req', onReq);
    return () => { l.subscription.unsubscribe(); window.removeEventListener('sh:ctx', onCtx); window.removeEventListener('sh:req', onReq); if (ch) sb.removeChannel(ch); };
  }, []);
  const drop = t => setToasts(x => x.filter(y => y !== t));
  async function accept(t) { await sb.rpc('add_member', { w: t.ws, u: t.from }); drop(t); }
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map(t => (
        <div key={t.from} className="toast"><span>{t.fromName} wants to join {t.wsName}</span>
          <span className="row"><button className="btn" onClick={() => accept(t)}>Accept</button><button className="btn ghost" onClick={() => drop(t)}>Decline</button></span></div>
      ))}
    </div>
  );
}
