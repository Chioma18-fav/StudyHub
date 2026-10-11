'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { sb } from '../../lib/supabase';
import { useUser } from '../../lib/useUser';
import { isLocked } from '../../lib/lock';

const today = () => new Date().toISOString().slice(0, 10);
const Lock = ({ text }) => <div className="card lock"><div className="big">🔒</div><h3>Locked</h3><p className="mute">{text}</p></div>;

export default function Lounge() {
  const u = useUser();
  if (!u.ready) return <div className="wrap empty">Loading…</div>;
  return <Inner user={u.user} name={u.name} />;
}

function Inner({ user, name }) {
  const [tab, setTab] = useState('people');
  const [online, setOnline] = useState([]);
  const [info, setInfo] = useState({});
  const [peer, setPeer] = useState(null);
  const [sent, setSent] = useState({});
  const [done, setDone] = useState(false);
  const [srv, setSrv] = useState(false);
  useEffect(() => { Promise.resolve(sb.rpc('chat_open')).then(({ data }) => setSrv(data === false)); }, []);
  const locked = isLocked() || srv;
  const ids = online.map(p => p.id).join();
  useEffect(() => {
    const on = e => setOnline(e.detail);
    window.addEventListener('sh:online', on); setOnline(window.__online || []);
    sb.from('study_days').select('day').eq('user_id', user.id).eq('day', today()).then(({ data }) => setDone((data || []).length > 0));
    return () => window.removeEventListener('sh:online', on);
  }, []);
  useEffect(() => { if (!ids) return; sb.from('profiles').select('id,bio,university').in('id', ids.split(',')).then(({ data }) => setInfo(Object.fromEntries((data || []).map(x => [x.id, x])))); }, [ids]);
  async function ask(p) { const { error } = await sb.rpc('request_join', { w: p.ws }); setSent(s => ({ ...s, [p.id]: error ? error.message : 'sent' })); }
  const others = online.filter(p => p.id !== user.id);
  return (
    <>
      <div className="hdr"><div className="hdr-in">
        <Link href="/dashboard" className="back" aria-label="Back">‹</Link>
        <h1 className="wtitle">Student lounge</h1>
        <p style={{ margin: 0, opacity: .8 }}>Meet people who are studying right now.</p>
      </div></div>
      <main className="sheet">
        <div className="tabs" role="tablist">{[['people', 'People'], ['all', 'Everyone'], ['me', 'My profile']].map(([k, l]) => <button key={k} role="tab" className={'tab' + (tab === k ? ' on' : '')} onClick={() => { setTab(k); setPeer(null); }}>{l}</button>)}</div>
        {tab === 'people' && (peer
          ? (locked ? <Lock text="Messages are locked while your reading timer is running. Go back to your workspace and finish." /> : <Dm me={user.id} peer={peer} onBack={() => setPeer(null)} />)
          : <div className="card"><h3>Online now</h3>
            {others.length === 0 && <div className="empty">Nobody else is online right now.</div>}
            {others.map(p => (
              <div key={p.id} className="person"><span className="av">{(p.name || '?')[0].toUpperCase()}</span>
                <div><b>{p.name}</b>{info[p.id]?.university ? <span className="mute"> · {info[p.id].university}</span> : null}<br />
                  {info[p.id]?.bio && <span style={{ fontSize: 14 }}>{info[p.id].bio}<br /></span>}
                  <span className="mute" style={{ fontSize: 14 }}>{p.course ? 'Reading ' + p.course + ' in ' + p.wsName : p.ws ? 'In ' + p.wsName : 'In the lounge'}</span>
                  {sent[p.id] && sent[p.id] !== 'sent' && <div className="err" style={{ margin: 0 }}>{sent[p.id]}</div>}</div>
                <span className="row" style={{ flexWrap: 'wrap' }}>
                  <button className="btn" disabled={locked} onClick={() => setPeer(p)}>Message</button>
                  {p.ws && <button className="btn ghost" disabled={sent[p.id] === 'sent'} onClick={() => ask(p)}>{sent[p.id] === 'sent' ? 'Request sent' : 'Request to join'}</button>}
                </span>
              </div>))}
            {locked && <p className="mute" style={{ fontSize: 13, margin: '12px 0 0' }}>Messaging is locked while your reading timer is running.</p>}
          </div>)}
        {tab === 'all' && <Everyone user={user} name={name} locked={locked} done={done} />}
        {tab === 'me' && <Profile user={user} />}
      </main>
    </>
  );
}

function Dm({ me, peer, onBack }) {
  const [m, setM] = useState([]);
  const [t, setT] = useState('');
  const end = useRef(null);
  useEffect(() => {
    sb.from('dms').select('*').or(`and(from_id.eq.${me},to_id.eq.${peer.id}),and(from_id.eq.${peer.id},to_id.eq.${me})`).order('id').limit(100).then(({ data }) => setM(data || []));
    const ch = sb.channel('dm-' + me).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dms', filter: 'to_id=eq.' + me }, p => { if (p.new.from_id === peer.id) setM(x => [...x, p.new]); }).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [peer.id]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [m]);
  async function send(e) { e.preventDefault(); const body = t.trim(); if (!body) return; setT(''); const { data } = await sb.from('dms').insert({ from_id: me, to_id: peer.id, body }).select().single(); if (data) setM(x => [...x, data]); }
  return (
    <div className="card chat">
      <div className="row" style={{ marginBottom: 10 }}><button className="chip" onClick={onBack}>‹ Back</button><h3 style={{ margin: 0 }}>{peer.name}</h3></div>
      <div className="msgs">{m.length === 0 && <div className="empty">Say hi to {peer.name}.</div>}
        {m.map(x => <div key={x.id} className={'b ' + (x.from_id === me ? 'me' : 'them')}>{x.body}</div>)}<div ref={end} /></div>
      <form className="row" onSubmit={send}><input aria-label="Message" value={t} onChange={e => setT(e.target.value)} placeholder={'Message ' + peer.name} maxLength={2000} /><button className="btn">Send</button></form>
    </div>
  );
}

function Everyone({ user, name, locked, done }) {
  const [m, setM] = useState([]);
  const [t, setT] = useState('');
  const end = useRef(null);
  useEffect(() => {
    sb.from('lounge_msgs').select('*').order('id', { ascending: false }).limit(100).then(({ data }) => setM((data || []).reverse()));
    const ch = sb.channel('everyone').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lounge_msgs' }, p => setM(x => [...x, p.new])).subscribe();
    return () => { sb.removeChannel(ch); };
  }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [m]);
  async function send(e) { e.preventDefault(); const body = t.trim(); if (!body) return; setT(''); await sb.from('lounge_msgs').insert({ user_id: user.id, name, body }); }
  if (locked) return <Lock text="Everyone chat is locked while your reading timer is running." />;
  if (!done) return <Lock text="Finish a reading session today to unlock the everyone chat." />;
  return (
    <div className="card chat">
      <div className="msgs">{m.length === 0 && <div className="empty">Be the first to say something.</div>}
        {m.map(x => <div key={x.id} className={'b ' + (x.user_id === user.id ? 'me' : 'them')}><div className="who">{x.name}</div>{x.body}</div>)}<div ref={end} /></div>
      <form className="row" onSubmit={send}><input aria-label="Message everyone" value={t} onChange={e => setT(e.target.value)} placeholder="Message everyone" maxLength={2000} /><button className="btn">Send</button></form>
    </div>
  );
}

function Profile({ user }) {
  const [bio, setBio] = useState('');
  const [uni, setUni] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => { sb.from('profiles').select('bio,university').eq('id', user.id).single().then(({ data }) => { setBio(data?.bio || ''); setUni(data?.university || ''); }); }, []);
  async function save(e) { e.preventDefault(); await sb.from('profiles').update({ bio: bio.slice(0, 200), university: uni.slice(0, 60) }).eq('id', user.id); setSaved(true); setTimeout(() => setSaved(false), 1800); }
  return (
    <form className="card" onSubmit={save}><h3>My profile</h3>
      <label htmlFor="u">University</label><input id="u" value={uni} onChange={e => setUni(e.target.value)} maxLength={60} />
      <label htmlFor="b">Bio (what you study, what exam you are preparing for)</label><input id="b" value={bio} onChange={e => setBio(e.target.value)} maxLength={200} placeholder="300L CS, preparing for finals" />
      <p /><button className="btn">{saved ? 'Saved' : 'Save profile'}</button></form>
  );
}
