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
  const loadDocs = async () => { const { data } = await sb.from('docs').select('id,title,course,path').eq('workspace_id', id).order('created_at', { ascending: false }); setDocs(data || []); };
  const loadPeople = async () => { const { data } = await sb.from('members').select('user_id,profiles(name)').eq('workspace_id', id); setPeople((data || []).map(x => ({ id: x.user_id, name: x.profiles?.name || 'Student' }))); };
  useEffect(() => {
    if (!ready) return;
    sb.from('workspaces').select('name,code,owner').eq('id', id).single().then(({ data }) => setW(data || false));
    loadPeople(); loadDocs();
  }, [ready, id]);
  async function remove(p) { if (!confirm('Remove ' + p.name + ' from this workspace?')) return; await sb.from('members').delete().eq('workspace_id', id).eq('user_id', p.id); loadPeople(); }
  if (!ready || w === null) return <div className="wrap empty">Loading…</div>;
  if (w === false) return <div className="wrap empty">This workspace does not exist, or you are not a member. <Link href="/dashboard">Back to your workspaces</Link></div>;
  const isOwner = w.owner === user.id;
  return (
    <main className="wrap">
      <div className="top"><Link href="/dashboard" className="logo" onClick={e => locked && e.preventDefault()}>Study<b>Hub</b></Link><span className="mute">{name}</span></div>
      <div className="hero">
        <h2>{w.name}</h2>
        <div className="pills">
          <button className="chip" onClick={() => { navigator.clipboard.writeText(w.code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? 'Copied' : 'Invite code: ' + w.code}</button>
          {people.map(p => <span key={p.id} className="chip">{p.name}{p.id === w.owner ? ' (creator)' : ''}{isOwner && p.id !== user.id && <button aria-label={'Remove ' + p.name} onClick={() => remove(p)} style={{ background: 'none', border: 0, color: '#fff', cursor: 'pointer', marginLeft: 6 }}>✕</button>}</span>)}
        </div>
      </div>
      <div className="tabs" role="tablist">
        {[['study', 'Study'], ['chat', 'Group chat'], ['library', 'Slides']].map(([k, l]) =>
          <button key={k} role="tab" className={'tab' + (tab === k ? ' on' : '')} disabled={locked && tab !== k} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === 'study' && <Study id={id} session={session} user={user} docs={docs} isOwner={isOwner} onLock={setLocked} />}
      {tab === 'chat' && <Chat id={id} user={user} name={name} />}
      {tab === 'library' && <Library id={id} user={user} docs={docs} reload={loadDocs} />}
    </main>
  );
}

function PdfView({ url }) {
  const box = useRef(null);
  const [st, setSt] = useState('Loading slides…');
  useEffect(() => {
    let dead = false;
    (async () => {
      if (!window.pdfjsLib) await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
      const L = window.pdfjsLib; L.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const pdf = await L.getDocument(url).promise; box.current.innerHTML = '';
      for (let i = 1; i <= pdf.numPages && !dead; i++) {
        const pg = await pdf.getPage(i); const v = pg.getViewport({ scale: 1.5 });
        const c = document.createElement('canvas'); c.width = v.width; c.height = v.height; c.className = 'pg'; box.current.appendChild(c);
        await pg.render({ canvasContext: c.getContext('2d'), viewport: v }).promise;
      }
      setSt('');
    })().catch(() => setSt('Could not display this PDF.'));
    return () => { dead = true; };
  }, [url]);
  return <div className="pdf">{st && <div className="empty">{st}</div>}<div ref={box} /></div>;
}

function Study({ id, session, user, docs, isOwner, onLock }) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const [docId, setDocId] = useState('');
  const [url, setUrl] = useState('');
  const [level, setLevel] = useState('University');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sess, setSess] = useState(null);
  const [mins, setMins] = useState(60);
  const [phase, setPhase] = useState('wait');
  const [left, setLeft] = useState(0);
  const [strikes, setStrikes] = useState(0);
  const [paused, setPaused] = useState(false);
  const last = useRef(Date.now());
  const phaseRef = useRef('wait'), leftRef = useRef(0), strikesRef = useRef(0), sessRef = useRef(null), end = useRef(null);
  const go = p => { phaseRef.current = p; setPhase(p); };
  const save = () => { if (sessRef.current) sb.from('progress').upsert({ workspace_id: id, user_id: user.id, session_id: sessRef.current.id, left_s: leftRef.current, strikes: strikesRef.current }); };
  useEffect(() => { sb.from('ai_chats').select('role,content').eq('workspace_id', id).eq('user_id', user.id).order('id').limit(100).then(({ data }) => setMsgs(data || [])); }, [id]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs]);
  useEffect(() => {
    const get = () => sb.from('sessions').select('*').eq('workspace_id', id).maybeSingle().then(({ data }) => setSess(data));
    get();
    const ch = sb.channel('sess-' + id).on('postgres_changes', { event: '*', schema: 'public', table: 'sessions', filter: 'workspace_id=eq.' + id }, get).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [id]);
  useEffect(() => {
    sessRef.current = sess;
    if (!sess) { go('wait'); onLock(false); return; }
    sb.from('progress').select('*').eq('workspace_id', id).eq('user_id', user.id).maybeSingle().then(({ data }) => {
      const same = data && data.session_id === sess.id;
      leftRef.current = same ? data.left_s : sess.minutes * 60; strikesRef.current = same ? data.strikes : 0;
      setLeft(leftRef.current); setStrikes(strikesRef.current);
      go(leftRef.current <= 0 ? 'done' : 'ready'); onLock(false);
    });
  }, [sess?.id]);
  useEffect(() => {
    const act = () => { last.current = Date.now(); };
    const vis = () => { if (document.hidden && phaseRef.current === 'run') { strikesRef.current += 1; setStrikes(strikesRef.current); save(); } };
    const warn = e => { if (phaseRef.current === 'run') { e.preventDefault(); e.returnValue = ''; } };
    const evs = ['mousemove', 'keydown', 'touchstart', 'scroll', 'click'];
    evs.forEach(t => window.addEventListener(t, act, true));
    document.addEventListener('visibilitychange', vis); window.addEventListener('beforeunload', warn);
    return () => { evs.forEach(t => window.removeEventListener(t, act, true)); document.removeEventListener('visibilitychange', vis); window.removeEventListener('beforeunload', warn); };
  }, []);
  useEffect(() => {
    if (phase !== 'run') return;
    let n = 0;
    const iv = setInterval(() => {
      const active = !document.hidden && document.hasFocus() && Date.now() - last.current < 90000;
      setPaused(!active); if (!active) return;
      leftRef.current -= 1; setLeft(leftRef.current);
      if (leftRef.current <= 0) { leftRef.current = 0; save(); go('done'); onLock(false); return; }
      if (++n % 5 === 0) save();
    }, 1000);
    return () => clearInterval(iv);
  }, [phase]);
  useEffect(() => {
    setUrl(''); const d = docs.find(x => x.id === docId); if (!d) return;
    sb.storage.from('slides').createSignedUrl(d.path, 3600).then(({ data }) => setUrl(data?.signedUrl || ''));
  }, [docId]);
  async function begin() { setErr(''); const { error } = await sb.rpc('start_session', { w: id, m: Math.max(1, Math.min(600, +mins || 60)) }); if (error) setErr(error.message); }
  async function send(e) {
    e.preventDefault(); const text = input.trim(); if (!text || busy) return;
    setInput(''); setErr(''); setBusy(true); setMsgs(m => [...m, { role: 'user', content: text }]);
    try {
      const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token }, body: JSON.stringify({ workspaceId: id, docId: docId || null, message: text, level }) });
      const j = await r.json();
      if (j.error) setErr(j.error); else setMsgs(m => [...m, { role: 'model', content: j.text }]);
    } catch { setErr('No connection. Check your data and try again.'); }
    setBusy(false);
  }
  const total = sess ? sess.minutes * 60 : 1;
  return (
    <div className="study">
      <div className="card">
        <select aria-label="Slides to read" value={docId} onChange={e => setDocId(e.target.value)}><option value="">Choose slides to read</option>{docs.map(d => <option key={d.id} value={d.id}>{d.course}: {d.title}</option>)}</select>
        {url ? <PdfView url={url} /> : <div className="empty">{docs.length ? 'Pick a slide above and it opens here.' : 'No slides yet. Add some in the Slides tab.'}</div>}
      </div>
      <div className="side">
        <div className="card">
          <h3>Study session</h3>
          {phase === 'wait' && <p className="mute">{isOwner ? 'Set the reading time for everyone in this workspace.' : 'Waiting for the workspace creator to set the reading time.'}</p>}
          {phase === 'ready' && (<><p className="mute">Reading time: {sess.minutes} min. {left < total ? 'You are at ' + fmt(left) + ' left.' : ''}</p><button className="btn" style={{ width: '100%' }} onClick={() => { last.current = Date.now(); go('run'); onLock(true); }}>{left < total ? 'Resume reading' : 'Start reading'}</button></>)}
          {phase === 'run' && (<><div className="clock"><span>{fmt(left)}</span></div><div className="bar"><i style={{ width: ((total - left) / total * 100) + '%' }} /></div>
            {paused && <div className="pause" role="alert">Paused. Come back to this page and keep reading to continue.</div>}
            <p className="mute" style={{ margin: 0 }}>Times you left the page: {strikes}</p></>)}
          {phase === 'done' && <div className="ok" style={{ marginTop: 0 }}>Reading time complete. You left the page {strikes} {strikes === 1 ? 'time' : 'times'}.</div>}
          {isOwner && phase !== 'run' && (<div style={{ marginTop: 14 }}><label htmlFor="m">{sess ? 'Start a new session for everyone (minutes)' : 'Reading time for everyone (minutes)'}</label>
            <div className="row"><input id="m" type="number" min="1" max="600" value={mins} onChange={e => setMins(e.target.value)} /><button className="btn" onClick={begin}>Set</button></div></div>)}
        </div>
        <div className="card chat">
          <div className="row" style={{ marginBottom: 10 }}><h3 style={{ margin: 0, flex: 1 }}>Ask the AI</h3>
            <select aria-label="Level" value={level} onChange={e => setLevel(e.target.value)} style={{ maxWidth: 160 }}><option>Primary school</option><option>Secondary school</option><option>University</option></select></div>
          <div className="msgs">
            {msgs.length === 0 && <div className="empty">Pick your slides, then ask anything. You can tell the AI how to explain, for example "use a Nigerian example".</div>}
            {msgs.map((m, i) => <div key={i} className={'b ' + (m.role === 'user' ? 'me' : 'them')}>{m.content}</div>)}
            {busy && <div className="b them">Thinking…</div>}<div ref={end} />
          </div>
          {err && <div className="err" style={{ margin: '0 0 8px' }}>{err}</div>}
          <form className="row" onSubmit={send}><input aria-label="Ask the AI" value={input} onChange={e => setInput(e.target.value)} placeholder="Ask about your slides" maxLength={2000} /><button className="btn" disabled={busy}>Ask</button></form>
        </div>
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
