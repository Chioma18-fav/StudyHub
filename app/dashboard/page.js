'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { sb } from '../../lib/supabase';
import { useUser } from '../../lib/useUser';
export default function Dashboard() {
  const r = useRouter();
  const { user, name, ready } = useUser();
  const [ws, setWs] = useState([]);
  const [n, setN] = useState('');
  const [c, setC] = useState('');
  const [err, setErr] = useState('');
  const [online, setOnline] = useState([]);
  async function load() {
    const { data } = await sb.from('members').select('workspaces(id,name,code)').eq('user_id', user.id);
    setWs((data || []).map(x => x.workspaces).filter(Boolean));
  }
  useEffect(() => {
    if (!ready) return;
    load();
    const ch = sb.channel('lobby', { config: { presence: { key: user.id } } });
    ch.on('presence', { event: 'sync' }, () => setOnline(Object.values(ch.presenceState()).map(a => a[0].name)));
    ch.subscribe(s => { if (s === 'SUBSCRIBED') ch.track({ name }); });
    return () => { sb.removeChannel(ch); };
  }, [ready]);
  async function create(e) {
    e.preventDefault(); setErr('');
    const { data, error } = await sb.rpc('create_workspace', { n });
    if (error) return setErr(error.message); r.push('/w/' + data);
  }
  async function join(e) {
    e.preventDefault(); setErr('');
    const { data, error } = await sb.rpc('join_workspace', { c });
    if (error) return setErr(error.message); r.push('/w/' + data);
  }
  if (!ready) return <div className="wrap empty">Loading…</div>;
  return (
    <main className="wrap">
      <div className="top"><span className="logo">Study<b>Hub</b></span>
        <span className="row"><span className="mute">{name}</span><button className="btn ghost" onClick={() => sb.auth.signOut()}>Sign out</button></span></div>
      <h2>Your workspaces</h2>
      {ws.length === 0 ? <div className="card empty">You are not in a workspace yet. Create one below, or join with a code from a friend.</div> :
        <div className="grid3">{ws.map(w => (
          <Link key={w.id} href={'/w/' + w.id} className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <h3>{w.name}</h3><p className="mute" style={{ margin: 0 }}>Invite code: {w.code}</p>
          </Link>))}</div>}
      <div className="grid2" style={{ marginTop: 22, gridTemplateColumns: '1fr 1fr' }}>
        <form className="card" onSubmit={create}><h3>Start a workspace</h3>
          <label htmlFor="wn">Name (a course, a group, an exam)</label><input id="wn" value={n} onChange={e => setN(e.target.value)} required maxLength={60} />
          <p /><button className="btn">Create workspace</button></form>
        <form className="card" onSubmit={join}><h3>Join with a code</h3>
          <label htmlFor="wc">Invite code</label><input id="wc" value={c} onChange={e => setC(e.target.value)} required maxLength={12} />
          <p /><button className="btn">Join workspace</button></form>
      </div>
      {err && <div className="err">{err}</div>}
      <div className="card" style={{ marginTop: 22 }}><h3>Studying right now</h3>
        <div className="pills">{[...new Set(online)].map((o, i) => <span key={i} className="chip"><span className="dot" />{o}</span>)}</div>
        <p className="mute" style={{ margin: 0, fontSize: 14 }}>You can see who is online, but you can only enter a workspace with its invite code.</p></div>
    </main>
  );
}
