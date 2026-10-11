'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser } from '../../lib/useUser';
export default function Lounge() {
  const { user, name, ready } = useUser();
  const [list, setList] = useState([]);
  const [sent, setSent] = useState({});
  useEffect(() => {
    const on = e => setList(e.detail);
    window.addEventListener('sh:online', on); setList(window.__online || []);
    return () => window.removeEventListener('sh:online', on);
  }, []);
  if (!ready) return <div className="wrap empty">Loading…</div>;
  const ask = p => { window.dispatchEvent(new CustomEvent('sh:req', { detail: { to: p.owner, from: user.id, fromName: name, ws: p.ws, wsName: p.wsName } })); setSent(s => ({ ...s, [p.id]: true })); };
  const others = list.filter(p => p.id !== user.id);
  return (
    <>
      <div className="hdr"><div className="hdr-in">
        <Link href="/dashboard" className="back" aria-label="Back">‹</Link>
        <h1 className="wtitle">Student lounge</h1>
        <p style={{ margin: 0, opacity: .8 }}>See who is online and what they are reading.</p>
      </div></div>
      <main className="sheet"><div className="card"><h3>Online study partners</h3>
        {others.length === 0 && <div className="empty">Nobody else is online right now.</div>}
        {others.map(p => (
          <div key={p.id} className="person"><span className="av">{(p.name || '?')[0].toUpperCase()}</span>
            <div><b>{p.name}</b><br /><span className="mute" style={{ fontSize: 14 }}>{p.course ? 'Reading ' + p.course + ' in ' + p.wsName : p.ws ? 'In ' + p.wsName : 'In the lounge'}</span></div>
            {p.ws && <button className="btn ghost" disabled={sent[p.id]} onClick={() => ask(p)}>{sent[p.id] ? 'Request sent' : 'Request to join'}</button>}
          </div>))}
        <p className="mute" style={{ fontSize: 13, margin: '12px 0 0' }}>Requests go to the workspace creator, who must be online to accept.</p>
      </div></main>
    </>
  );
}
