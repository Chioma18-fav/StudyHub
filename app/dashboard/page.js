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
  const [online, setOnline] = useState(0);
  useEffect(() => {
    if (!ready) return;
    sb.from('members').select('workspaces(id,name,code)').eq('user_id', user.id).then(({ data }) => setWs((data || []).map(x => x.workspaces).filter(Boolean)));
    const on = e => setOnline(e.detail.length);
    window.addEventListener('sh:online', on); setOnline((window.__online || []).length);
    return () => window.removeEventListener('sh:online', on);
  }, [ready]);
  async function act(e, fn, args) {
    e.preventDefault(); setErr('');
    const { data, error } = await sb.rpc(fn, args);
    if (error) return setErr(error.message); r.push('/w/' + data);
  }
  if (!ready) return <div className="wrap empty">Loading…</div>;
  return (
    <>
      <div className="hdr"><div className="hdr-in">
        <div className="row between"><span className="logo">Study<b>Hub</b></span><button className="chip" onClick={() => sb.auth.signOut()}>Sign out</button></div>
        <h1 className="wtitle">Welcome, {name.split(' ')[0]}!</h1>
        <Link href="/lounge" className="chip"><span className="dot" />{online} online · Open lounge</Link>
      </div></div>
      <main className="sheet">
        <div className="card"><h2>My workspaces</h2>
          {ws.length === 0 ? <p className="mute">No workspace yet. Start one below or join with a code.</p> :
            <div className="tiles">{ws.map((w, i) => <Link key={w.id} href={'/w/' + w.id} className={'tile t' + (i % 3)}><span>{w.name}<br /><small>Code {w.code}</small></span><span>›</span></Link>)}</div>}
        </div>
        <div className="card"><h3>Start a new workspace</h3>
          <form className="row" onSubmit={e => act(e, 'create_workspace', { n })}><input aria-label="Workspace name" placeholder="e.g. 300L CS Squad" value={n} onChange={e => setN(e.target.value)} required maxLength={60} /><button className="btn">Create</button></form>
          <p className="mute" style={{ fontSize: 13, margin: '8px 0 0' }}>You can create as many as you want.</p></div>
        <div className="card"><h3>Join with a code</h3>
          <form className="row" onSubmit={e => act(e, 'join_workspace', { c })}><input aria-label="Invite code" placeholder="Invite code" value={c} onChange={e => setC(e.target.value)} required maxLength={12} /><button className="btn">Join</button></form></div>
        {err && <div className="err">{err}</div>}
      </main>
    </>
  );
}
