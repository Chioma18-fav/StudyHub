'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { sb } from '../../../lib/supabase';
import { useUser } from '../../../lib/useUser';

const fmt = s => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0'); };

export default function Workspace() {
  const { id } = useParams();
  const { session, user, name, ready } = useUser();
  const [w, setW] = useState(null);
  const [people, setPeople] = useState([]);
  const [docs, setDocs] = useState([]);
  const [tab, setTab] = useState('study');
  const [locked, setLocked] = useState(false);
  const [copied, setCopied] = useState(false);
  const loadDocs = async () => { const { data } = await sb.from('docs').select('id,title,course').eq('workspace_id', id).order('created_at', { ascending: false }); setDocs(data || []); };
  useEffect(() => {
    if (!ready) return;
    sb.from('workspaces').select('name,code').eq('id', id).single().then(({ data }) => setW(data || false));
    sb.from('members').select('profiles(name)').eq('workspace_id', id).then(({ data }) => setPeople((data || []).map(x => x.profiles?.name).filter(Boolean)));
    loadDocs();
  }, [ready, id]);
  if (!ready || w === null) return <div className="wrap empty">Loading…</div>;
  if (w === false) return <div className="wrap empty">This workspace does not exist, or you are not a member. <Link href="/dashboard">Back to your workspaces</Link></div>;
  return (
    <main className="wrap">
      <div className="top"><Link href="/dashboard" className="logo" onClick={e => locked && e.preventDefault()}>Study<b>Hub</b></Link>
        <span className="row"><button className="chip" onClick={() => { navigator.clipboard.writeText(w.code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? 'Copied' : 'Invite code: ' + w.code}</button></span></div>
      <h2>{w.name}</h2>
      <p className="mute">{people.join(', ')}</p>
      <div className="tabs" role="tablist">
        {[['study', 'Study'], ['chat', 'Group chat'], ['library', 'Slides']].map(([k, l]) =>
          <button key={k} role="tab" className={'tab' + (tab === k ? ' on' : '')} disabled={locked && tab !== k} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === 'study' && <Study id={id} session={session} user={user} docs={docs} onLock={setLocked} />}
      {tab === 'chat' && <Chat id={id} user={user} name={name} />}
      {tab === 'library' && <Library id={id} user={user} docs={docs} reload={loadDocs} />}
    </main>
  );
}

function Study({ id, session, user, docs, onLock }) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const [docId, setDocId] = useState('');
  const [level, setLevel] = useState('University');
  const [simple, setSimple] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [phase, setPhase] = useState('setup');
  const [mins, setMins] = useState(60);
  const [total, setTotal] = useState(0);
  const [left, setLeft] = useState(0);
  const [paused, setPaused] = useState(false);
  const [strikes, setStrikes] = useState(0);
  const last = useRef(Date.now());
  const phaseRef = useRef('setup');
  const end = useRef(null);
  useEffect(() => { sb.from('ai_chats').select('role,content').eq('workspace_id', id).eq('user_id', user.id).order('id').limit(100).then(({ data }) => setMsgs(data || [])); }, [id]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs]);
  useEffect(() => {
    const act = () => { last.current = Date.now(); };
    const vis = () => { if (document.hidden && phaseRef.current === 'run') setStrikes(s => s + 1); };
    const warn = e => { if (phaseRef.current === 'run') { e.preventDefault(); e.returnValue = ''; } };
    ['mousemove', 'keydown', 'touchstart', 'scroll', 'click'].forEach(t => window.addEventListener(t, act, true));
    document.addEventListener('visibilitychange', vis); window.addEventListener('beforeunload', warn);
    return () => { ['mousemove', 'keydown', 'touchstart', 'scroll', 'click'].forEach(t => window.removeEventListener(t, act, true)); document.removeEventListener('visibilitychange', vis); window.removeEventListener('beforeunload', warn); };
  }, []);
  useEffect(() => {
    if (phase !== 'run') return;
    const iv = setInterval(() => {
      const active = !document.hidden && document.hasFocus() && Date.now() - last.current < 90000;
      setPaused(!active);
      if (active) setLeft(l => { if (l <= 1) { phaseRef.current = 'done'; setPhase('done'); onLock(false); return 0; } return l - 1; });
    }, 1000);
    return () => clearInterval(iv);
  }, [phase]);
  function start() { const s = Math.max(1, Math.min(600, +mins || 60)) * 60; setTotal(s); setLeft(s); setStrikes(0); last.current = Date.now(); phaseRef.current = 'run'; setPhase('run'); onLock(true); }
  async function send(e) {
    e.preventDefault(); const text = input.trim(); if (!text || busy) return;
    setInput(''); setErr(''); setBusy(true); setMsgs(m => [...m, { role: 'user', content: text }]);
    try {
      const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token }, body: JSON.stringify({ workspaceId: id, docId: docId || null, message: text, level, simple }) });
      const j = await r.json();
      if (j.error) setErr(j.error); else setMsgs(m => [...m, { role: 'model', content: j.text }]);
    } catch { setErr('No connection. Check your data and try again.'); }
    setBusy(false);
  }
  return (
    <div className="grid2">
      <div className="card chat">
        <div className="row" style={{ marginBottom: 10 }}>
          <select aria-label="Slides to study" value={docId} onChange={e => setDocId(e.target.value)}><option value="">No slides selected</option>{docs.map(d => <option key={d.id} value={d.id}>{d.course}: {d.title}</option>)}</select>
          <select aria-label="Level" value={level} onChange={e => setLevel(e.target.value)} style={{ maxWidth: 160 }}><option>Primary school</option><option>Secondary school</option><option>University</option></select>
        </div>
        <label className="row" style={{ margin: '0 0 8px', fontWeight: 500 }}><input type="checkbox" checked={simple} onChange={e => setSimple(e.target.checked)} style={{ width: 'auto' }} />Explain like I am 15</label>
        <div className="msgs">
          {msgs.length === 0 && <div className="empty">Pick your slides, then ask about anything you did not understand.</div>}
          {msgs.map((m, i) => <div key={i} className={'b ' + (m.role === 'user' ? 'me' : 'them')}>{m.content}</div>)}
          {busy && <div className="b them">Thinking…</div>}<div ref={end} />
        </div>
        {err && <div className="err" style={{ margin: '0 0 8px' }}>{err}</div>}
        <form className="row" onSubmit={send}><input aria-label="Ask the AI" value={input} onChange={e => setInput(e.target.value)} placeholder="Ask about your slides" maxLength={2000} /><button className="btn" disabled={busy}>Ask</button></form>
      </div>
      <div className="card" style={{ alignSelf: 'start' }}>
        <h3>Study session</h3>
        {phase === 'setup' && (<>
          <label htmlFor="m">How many minutes will you read?</label>
          <div className="pills">{[30, 60, 120].map(x => <button key={x} type="button" className="chip" onClick={() => setMins(x)}>{x} min</button>)}</div>
          <input id="m" type="number" min="1" max="600" value={mins} onChange={e => setMins(e.target.value)} />
          <p className="mute" style={{ fontSize: 14, marginTop: 10 }}>Once you start, the timer only counts while you stay on this page and keep reading. You cannot switch tabs without it pausing.</p>
          <button className="btn" style={{ width: '100%' }} onClick={start}>Start session</button></>)}
        {phase === 'run' && (<>
          <div className="clock"><span>{fmt(left)}</span></div>
          <div className="bar"><i style={{ width: ((total - left) / total * 100) + '%' }} /></div>
          {paused && <div className="pause" role="alert">Paused. Come back to this page and keep reading to continue.</div>}
          <p className="mute" style={{ margin: 0 }}>Times you left the page: {strikes}</p></>)}
        {phase === 'done' && (<><div className="ok" style={{ marginTop: 0 }}>Session complete. You stayed focused for {Math.round(total / 60)} minutes with {strikes} tab {strikes === 1 ? 'switch' : 'switches'}.</div>
          <p><button className="btn ghost" style={{ marginTop: 12 }} onClick={() => { phaseRef.current = 'setup'; setPhase('setup'); }}>Start another</button></p></>)}
      </div>
    </div>
  );
}

function Chat({ id, user, name }) {
  const [m, setM] = useState([]);
  const [t, setT] = useState('');
  const end = useRef(null);
  useEffect(() => {
    sb.from('messages').select('*').eq('workspace_id', id).order('id').limit(100).then(({ data }) => setM(data || []));
    const ch = sb.channel('chat-' + id).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'workspace_id=eq.' + id }, p => setM(x => [...x, p.new])).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [id]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [m]);
  async function send(e) { e.preventDefault(); const body = t.trim(); if (!body) return; setT(''); await sb.from('messages').insert({ workspace_id: id, user_id: user.id, name, body }); }
  return (
    <div className="card chat">
      <div className="msgs">
        {m.length === 0 && <div className="empty">No messages yet. Say hello to your group.</div>}
        {m.map(x => <div key={x.id} className={'b ' + (x.user_id === user.id ? 'me' : 'them')}><div className="who">{x.name} · {new Date(x.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>{x.body}</div>)}
        <div ref={end} />
      </div>
      <form className="row" onSubmit={send}><input aria-label="Message" value={t} onChange={e => setT(e.target.value)} placeholder="Message your group" maxLength={2000} /><button className="btn">Send</button></form>
    </div>
  );
}

function Library({ id, user, docs, reload }) {
  const [course, setCourse] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function up(e) {
    e.preventDefault(); setErr('');
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) return setErr('That file is over 15 MB. Split it or compress it first.');
    setBusy(true);
    const path = id + '/' + crypto.randomUUID() + '.pdf';
    const a = await sb.storage.from('slides').upload(path, file, { contentType: 'application/pdf' });
    if (a.error) { setErr(a.error.message); setBusy(false); return; }
    const b = await sb.from('docs').insert({ workspace_id: id, title: file.name.replace(/\.pdf$/i, ''), course: course.trim() || 'General', path, created_by: user.id });
    if (b.error) setErr(b.error.message); else { setFile(null); e.target.reset(); reload(); }
    setBusy(false);
  }
  const groups = docs.reduce((g, d) => ((g[d.course] = g[d.course] || []).push(d), g), {});
  return (
    <div className="grid2">
      <div>{Object.keys(groups).length === 0 ? <div className="card empty">No slides yet. Upload a PDF to start.</div> :
        Object.entries(groups).map(([c, list]) => <div key={c} className="card" style={{ marginBottom: 14 }}><h3>{c}</h3>{list.map(d => <div key={d.id} className="doc"><span>{d.title}</span></div>)}</div>)}</div>
      <form className="card" style={{ alignSelf: 'start' }} onSubmit={up}><h3>Add slides</h3>
        <label htmlFor="c">Course</label><input id="c" value={course} onChange={e => setCourse(e.target.value)} placeholder="CSC 201" maxLength={40} />
        <label htmlFor="f">PDF file</label><input id="f" type="file" accept="application/pdf" onChange={e => setFile(e.target.files[0])} required />
        <p /><button className="btn" disabled={busy}>{busy ? 'Uploading…' : 'Upload'}</button>
        {err && <div className="err">{err}</div>}</form>
    </div>
  );
}
