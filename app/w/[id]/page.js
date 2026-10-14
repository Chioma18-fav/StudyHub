'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { sb } from '../../../lib/supabase';
import { useUser } from '../../../lib/useUser';
import { setLock, clearLock } from '../../../lib/lock';

const fmt = s => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0'); };

export default function Workspace() {
  const { id } = useParams();
  const u = useUser();
  if (!u.ready) return <div className="wrap empty">Loading…</div>;
  return <Room id={id} session={u.session} user={u.user} name={u.name} />;
}

function useFocus(id, user) {
  const [sess, setSess] = useState(null);
  const [phase, setPhase] = useState('wait');
  const [left, setLeft] = useState(0);
  const [strikes, setStrikes] = useState(0);
  const [paused, setPaused] = useState(false);
  const [brk, setBrk] = useState(0);
  const last = useRef(Date.now());
  const brkEnd = useRef(0);
  const phaseRef = useRef('wait'), leftRef = useRef(0), strikesRef = useRef(0), sessRef = useRef(null);
  const go = p => { phaseRef.current = p; setPhase(p); };
  const refresh = () => Promise.resolve(sb.from('sessions').select('*').eq('workspace_id', id).maybeSingle()).then(({ data }) => setSess(data));
  const save = () => sessRef.current ? Promise.resolve(sb.rpc('save_progress', { w: id, l: leftRef.current, k: strikesRef.current })) : Promise.resolve();
  useEffect(() => {
    const get = () => sb.from('sessions').select('*').eq('workspace_id', id).maybeSingle().then(({ data }) => setSess(data));
    get();
    const ch = sb.channel('sess-' + id).on('postgres_changes', { event: '*', schema: 'public', table: 'sessions', filter: 'workspace_id=eq.' + id }, get).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [id]);
  useEffect(() => {
    const iv = setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(iv); window.removeEventListener('focus', refresh); };
  }, [id]);
  useEffect(() => {
    if (phase !== 'break') return;
    const iv = setInterval(() => {
      const r = Math.max(0, Math.round((brkEnd.current - Date.now()) / 1000)); setBrk(r);
      if (r <= 0) { last.current = Date.now(); setLock(leftRef.current); go('run'); }
    }, 1000);
    return () => clearInterval(iv);
  }, [phase]);
  useEffect(() => {
    sessRef.current = sess;
    if (!sess) { go('wait'); clearLock(); return; }
    sb.from('progress').select('*').eq('workspace_id', id).eq('user_id', user.id).maybeSingle().then(({ data }) => {
      const same = data && data.session_id === sess.id;
      if (!same) clearLock(); leftRef.current = same ? data.left_s : sess.minutes * 60; strikesRef.current = same ? data.strikes : 0;
      setLeft(leftRef.current); setStrikes(strikesRef.current);
      go(leftRef.current <= 0 ? 'done' : 'ready');
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
      const active = !document.hidden && document.hasFocus() && Date.now() - last.current < 60000;
      setPaused(!active); if (!active) return;
      leftRef.current -= 1; setLeft(leftRef.current);
      if (leftRef.current <= 0) { leftRef.current = 0; save().then(() => sb.rpc('mark_done', { w: id })); clearLock(); go('done'); return; }
      const S = sessRef.current, be = (S?.break_every || 0) * 60, bm = S?.break_minutes || 0, studied = (S?.minutes || 0) * 60 - leftRef.current;
      if (be > 0 && bm > 0 && studied > 0 && studied % be === 0) { brkEnd.current = Date.now() + bm * 60000; setBrk(bm * 60); clearLock(); save().then(() => sb.rpc('start_break', { w: id })); go('break'); return; }
      if (++n % 5 === 0) { save(); setLock(leftRef.current); }
    }, 1000);
    return () => clearInterval(iv);
  }, [phase]);
  return {
    sess, phase, left, brk, strikes, paused, refresh,
    resume: () => { last.current = Date.now(); setLock(leftRef.current); Promise.resolve(sb.rpc('end_break', { w: id })); go('run'); },
    start: async () => {
      const { data } = await sb.rpc('begin_reading', { w: id });
      if (!data) return;
      leftRef.current = data.left; setLeft(data.left);
      setSess(x => x ? { ...x, minutes: data.minutes, break_every: data.be, break_minutes: data.bm } : x);
      last.current = Date.now(); setLock(data.left); go('run');
    },
  };
}

function Room({ id, session, user, name }) {
  const f = useFocus(id, user);
  const [level, setLevel] = useLevel();
  const [w, setW] = useState(null);
  const [people, setPeople] = useState([]);
  const [docs, setDocs] = useState([]);
  const [courses, setCourses] = useState([]);
  const [tab, setTab] = useState('study');
  const [course, setCourse] = useState(null);
  const [doc, setDoc] = useState(null);
  const [mins, setMins] = useState(60);
  const [nc, setNc] = useState('');
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const [be, setBe] = useState(30);
  const [bm, setBm] = useState(7);
  const loadPeople = async () => { const { data } = await sb.from('members').select('user_id,profiles(name)').eq('workspace_id', id); setPeople((data || []).map(x => ({ id: x.user_id, name: x.profiles?.name || 'Student' }))); };
  const reload = async () => {
    const a = await sb.from('docs').select('id,title,course,path').eq('workspace_id', id).order('created_at', { ascending: false }); setDocs(a.data || []);
    const b = await sb.from('courses').select('name').eq('workspace_id', id); setCourses((b.data || []).map(x => x.name));
  };
  useEffect(() => { sb.from('workspaces').select('name,code,owner').eq('id', id).single().then(({ data }) => setW(data || false)); loadPeople(); reload(); }, [id]);
  useEffect(() => { if (w) window.dispatchEvent(new CustomEvent('sh:ctx', { detail: { ws: id, wsName: w.name, owner: w.owner, course: doc ? doc.course : null } })); }, [w, doc]);
  useEffect(() => () => window.dispatchEvent(new CustomEvent('sh:ctx', { detail: {} })), []);
  if (w === null) return <div className="wrap empty">Loading…</div>;
  if (w === false) return <div className="wrap empty">This workspace does not exist, or you are not a member. <Link href="/dashboard">Back</Link></div>;
  const isOwner = w.owner === user.id;
  const names = [...new Set([...courses, ...docs.map(d => d.course)])];
  const running = f.phase === 'run';
  const qd = doc || docs.find(d => d.course === course) || docs[0];
  async function remove(p) { if (!confirm('Remove ' + p.name + ' from this workspace?')) return; await sb.from('members').delete().eq('workspace_id', id).eq('user_id', p.id); loadPeople(); }
  async function begin() { setErr(''); const { error } = await sb.rpc('start_session', { w: id, m: Math.max(1, Math.min(600, +mins || 60)), be: Math.max(0, Math.min(120, +be || 0)), bm: Math.max(0, Math.min(30, +bm || 0)) }); if (error) setErr(error.message); else f.refresh(); }
  async function addCourse(e) { e.preventDefault(); const n = nc.trim(); if (!n) return; await sb.from('courses').insert({ workspace_id: id, name: n.slice(0, 40) }); setNc(''); reload(); }
  const open = d => { setCourse(d.course); setDoc(d); setTab('study'); };
  const total = f.sess ? f.sess.minutes * 60 : 1;
  return (
    <>
      <div className="hdr"><div className="hdr-in">
        <div className="row between"><Link href="/dashboard" className="back" aria-label="Back" onClick={e => { if (f.phase === 'run') { e.preventDefault(); alert('Finish your reading time first.'); } }}>‹</Link>
          <div className="timer">{running ? <><b>{fmt(f.left)}</b><span>{f.paused ? 'paused' : 'running'}</span></> : f.phase === 'break' ? <><b>{fmt(f.brk)}</b><span>break</span></> : <span>{f.phase === 'done' ? 'Reading done' : 'No session running'}</span>}</div></div>
        <h1 className="wtitle">{w.name}</h1>
        <div className="pills">
          <button className="chip" onClick={() => { navigator.clipboard.writeText(w.code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? 'Copied' : 'Code ' + w.code}</button>
          {people.map(p => <span key={p.id} className="chip">{p.name}{p.id === w.owner ? ' (creator)' : ''}{isOwner && p.id !== user.id && <button aria-label={'Remove ' + p.name} onClick={() => remove(p)} style={{ background: 'none', border: 0, color: '#fff', cursor: 'pointer', marginLeft: 6 }}>✕</button>}</span>)}
        </div>
      </div></div>
      <main className="sheet">
        <div className="tabs" role="tablist">
          {[['study', 'Study'], ['chat', 'Chat'], ['slides', 'Slides'], ['history', 'AI history'], ['review', 'Review']].map(([k, l]) => <button key={k} role="tab" className={'tab' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{l}</button>)}
        </div>

        <section hidden={tab !== 'study'}>
          <div className="card"><h3>Study session</h3>
            {f.phase === 'wait' && <p className="mute">{isOwner ? 'Set the reading time for everyone in this workspace.' : 'Waiting for the workspace creator to set the reading time.'}</p>}
            {f.phase === 'ready' && <><p className="mute">Reading time: {f.sess.minutes} min.{f.sess.break_every > 0 && f.sess.break_minutes > 0 ? ' A ' + f.sess.break_minutes + '-minute break every ' + f.sess.break_every + ' minutes; chat opens during breaks.' : ''}{f.left < total ? ' You have ' + fmt(f.left) + ' left.' : ''}</p><button className="btn" style={{ width: '100%' }} onClick={f.start}>{f.left < total ? 'Resume reading' : 'Start reading'}</button></>}
            {running && <><div className="clock"><span>{fmt(f.left)}</span></div><div className="bar"><i style={{ width: ((total - f.left) / total * 100) + '%' }} /></div>
              {f.paused && <div className="pause" role="alert">Paused. Come back to this page and keep reading to continue.</div>}
              <p className="mute" style={{ margin: 0 }}>Times you left the page: {f.strikes}. Chat is locked until the timer ends.</p></>}
            {f.phase === 'break' && <><div className="clock"><span>{fmt(f.brk)}</span></div><p className="mute">Break time. Chat is open now. Reading resumes by itself when the break ends.</p><button className="btn ghost" onClick={f.resume}>Resume now</button></>}
            {f.phase === 'done' && <><Confetti /><div className="ok" style={{ marginTop: 0 }}>Reading time complete. Chat is now unlocked. You left the page {f.strikes} {f.strikes === 1 ? 'time' : 'times'}.</div><p><button className="btn" style={{ marginTop: 12 }} onClick={() => setTab('review')}>Go to review</button></p></>}
            {isOwner && (f.phase === 'run' || f.phase === 'break' || (f.phase === 'ready' && f.left < total)) && <p className="mute" style={{ marginTop: 12, fontSize: 14 }}>You can set a new session after you finish this one.</p>}
            {isOwner && !(f.phase === 'run' || f.phase === 'break' || (f.phase === 'ready' && f.left < total)) && <div style={{ marginTop: 14 }}><label htmlFor="m">{f.sess ? 'Start a new session for everyone (minutes)' : 'Reading time for everyone (minutes)'}</label>
              <div className="row"><input id="m" type="number" min="1" max="600" value={mins} onChange={e => setMins(e.target.value)} /></div><label htmlFor="be">Break every (minutes, 0 for no breaks)</label><div className="row"><input id="be" type="number" min="0" max="120" value={be} onChange={e => setBe(e.target.value)} /></div><label htmlFor="bm">Break length (minutes)</label><div className="row"><input id="bm" type="number" min="0" max="30" value={bm} onChange={e => setBm(e.target.value)} /><button className="btn" onClick={begin}>Set</button></div></div>}
            {err && <div className="err">{err}</div>}
          </div>
          
          {!course && <div className="card"><h3>Course modules</h3>
            {names.length === 0 && <p className="mute">No modules yet. Add one, for example CSC 201.</p>}
            <div className="tiles">{names.map((c, i) => <button key={c} className={'tile t' + (i % 3)} onClick={() => setCourse(c)}><span>{c}<br /><small>{docs.filter(d => d.course === c).length} slides</small></span><span>›</span></button>)}</div>
            <form className="row" onSubmit={addCourse}><input aria-label="New module" placeholder="New module name" value={nc} onChange={e => setNc(e.target.value)} maxLength={40} /><button className="btn">Add</button></form></div>}
          {course && !doc && <div className="card"><button className="chip" onClick={() => setCourse(null)}>‹ All modules</button><h3 style={{ marginTop: 12 }}>{course}</h3>
            {docs.filter(d => d.course === course).length === 0 && <p className="mute">No slides here yet. Add some in the Slides tab.</p>}
            <div className="tiles">{docs.filter(d => d.course === course).map((d, i) => <button key={d.id} className={'tile t' + (i % 3)} onClick={() => setDoc(d)}><span>{d.title}</span><span>›</span></button>)}</div></div>}
          {doc && <><div className="card"><div className="row between"><button className="chip" onClick={() => setDoc(null)}>‹ {doc.course}</button><span className="mute">{doc.title}</span></div><PdfView path={doc.path} /></div>
            <Animate id={id} session={session} docId={doc.id} course={doc.course} level={level} setLevel={setLevel} /><Tutor id={id} session={session} user={user} course={doc.course} docId={doc.id} level={level} setLevel={setLevel} /></>}
        </section>

        <section hidden={tab !== 'chat'}><Chat key={String(running)} id={id} user={user} name={name} locked={running} left={f.left} /></section>
        <section hidden={tab !== 'slides'}><Library id={id} user={user} names={names} docs={docs} reload={reload} onOpen={open} /></section>
        <section hidden={tab !== 'history'}><History id={id} session={session} user={user} active={tab === 'history'} level={level} setLevel={setLevel} /></section>
        <section hidden={tab !== 'review'}><Review id={id} session={session} active={tab === 'review'} phase={f.phase} qd={qd} /></section>
      </main>
    </>
  );
}

function PdfView({ path }) {
  const box = useRef(null);
  const [st, setSt] = useState('Loading slides…');
  useEffect(() => {
    let dead = false;
    (async () => {
      const { data } = await sb.storage.from('slides').createSignedUrl(path, 3600); if (!data) throw 0;
      if (!window.pdfjsLib) await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
      const L = window.pdfjsLib; L.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const pdf = await L.getDocument(data.signedUrl).promise; box.current.innerHTML = '';
      for (let i = 1; i <= pdf.numPages && !dead; i++) {
        const pg = await pdf.getPage(i); const v = pg.getViewport({ scale: 1.5 });
        const c = document.createElement('canvas'); c.width = v.width; c.height = v.height; c.className = 'pg'; box.current.appendChild(c);
        await pg.render({ canvasContext: c.getContext('2d'), viewport: v }).promise;
      }
      setSt('');
    })().catch(() => setSt('Could not display this PDF.'));
    return () => { dead = true; };
  }, [path]);
  return <div className="pdf">{st && <div className="empty">{st}</div>}<div ref={box} /></div>;
}

function Tutor({ id, session, user, course, docId, level, setLevel }) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const end = useRef(null);
  useEffect(() => { sb.from('ai_chats').select('role,content').eq('workspace_id', id).eq('user_id', user.id).eq('course', course).order('id').limit(100).then(({ data }) => setMsgs(data || [])); }, [id, course]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs]);
  async function send(e) {
    e.preventDefault(); const text = input.trim(); if (!text || busy) return;
    setInput(''); setErr(''); setBusy(true); setMsgs(m => [...m, { role: 'user', content: text }]);
    try {
      const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token }, body: JSON.stringify({ workspaceId: id, docId: docId || null, message: text, level, course }) });
      const j = await r.json();
      if (j.error) setErr(j.error); else setMsgs(m => [...m, { role: 'model', content: j.text }]);
    } catch { setErr('No connection. Check your data and try again.'); }
    setBusy(false);
  }
  return (
    <div className="card chat">
      <div className="row" style={{ marginBottom: 10 }}><h3 style={{ margin: 0, flex: 1 }}>Ask AI tutor · {course}</h3>
        <select aria-label="Level" value={level} onChange={e => setLevel(e.target.value)} style={{ maxWidth: 150 }}><option>Primary school</option><option>Secondary school</option><option>University</option></select></div>
      <div className="msgs">
        {msgs.length === 0 && <div className="empty">Ask anything about your slides. You can tell the AI how to explain, for example "use a Nigerian example".</div>}
        {msgs.map((m, i) => <div key={i} className={'b ' + (m.role === 'user' ? 'me' : 'them')}>{m.content}</div>)}
        {busy && <div className="b them">Thinking…</div>}<div ref={end} />
      </div>
      {err && <div className="err" style={{ margin: '0 0 8px' }}>{err}</div>}
      <form className="row" onSubmit={send}><input aria-label="Ask the AI" value={input} onChange={e => setInput(e.target.value)} placeholder="Ask AI tutor" maxLength={2000} /><button className="btn" disabled={busy}>Ask</button></form>
    </div>
  );
}

function History({ id, session, user, active, level, setLevel }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(null);
  useEffect(() => {
    if (!active || open) return;
    sb.from('ai_chats').select('course,content').eq('workspace_id', id).eq('user_id', user.id).order('id', { ascending: false }).limit(200).then(({ data }) => { const m = {}; (data || []).forEach(x => { if (!m[x.course]) m[x.course] = x; }); setItems(Object.values(m)); });
  }, [id, active, open]);
  if (open) return <div><button className="chip" style={{ marginBottom: 10 }} onClick={() => setOpen(null)}>‹ All chats</button><Tutor id={id} session={session} user={user} course={open} docId="" level={level} setLevel={setLevel} /></div>;
  return <div className="card"><h3>AI chat history</h3>
    {items.length === 0 && <p className="mute">No AI chats yet. Open a slide and ask the tutor something.</p>}
    <div className="tiles">{items.map((x, i) => <button key={x.course} className={'tile t' + (i % 3)} onClick={() => setOpen(x.course)}><span>{x.course}<br /><small>{x.content.slice(0, 60)}</small></span><span>›</span></button>)}</div></div>;
}

function Chat({ id, user, name, locked, left }) {
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
  if (locked) return <div className="card lock"><div className="big">🔒</div><h3>Group chat is locked</h3><p className="mute">It opens when your reading time ends. {fmt(left)} left.</p></div>;
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

function Library({ id, user, names, docs, reload, onOpen }) {
  const [course, setCourse] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function up(e) {
    e.preventDefault(); setErr('');
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) return setErr('That file is over 15 MB. Split it or compress it first.');
    setBusy(true);
    const cname = (course.trim() || 'General').slice(0, 40);
    const path = id + '/' + crypto.randomUUID() + '.pdf';
    const a = await sb.storage.from('slides').upload(path, file, { contentType: 'application/pdf' });
    if (a.error) { setErr(a.error.message); setBusy(false); return; }
    const b = await sb.from('docs').insert({ workspace_id: id, title: file.name.replace(/\.pdf$/i, ''), course: cname, path, created_by: user.id });
    if (b.error) setErr(b.error.message); else { await sb.from('courses').insert({ workspace_id: id, name: cname }); setFile(null); e.target.reset(); reload(); }
    setBusy(false);
  }
  return (
    <>
      <form className="card" onSubmit={up}><h3>Add slides</h3>
        <label htmlFor="c">Course module</label><input id="c" list="cs" value={course} onChange={e => setCourse(e.target.value)} placeholder="CSC 201" maxLength={40} /><datalist id="cs">{names.map(n => <option key={n} value={n} />)}</datalist>
        <label htmlFor="f">PDF file</label><input id="f" type="file" accept="application/pdf" onChange={e => setFile(e.target.files[0])} required />
        <p /><button className="btn" disabled={busy}>{busy ? 'Uploading…' : 'Upload'}</button>
        {err && <div className="err">{err}</div>}</form>
      {names.map((c, i) => <div key={c} className="card"><h3>{c}</h3><div className="tiles">{docs.filter(d => d.course === c).map((d, j) => <button key={d.id} className={'tile t' + ((i + j) % 3)} onClick={() => onOpen(d)}><span>{d.title}</span><span>Read ›</span></button>)}</div></div>)}
    </>
  );
}

function Confetti() {
  return <div className="confetti" aria-hidden="true">{Array.from({ length: 28 }, (_, i) => <i key={i} style={{ left: (i * 37 % 100) + '%', animationDelay: (i % 7) * 0.15 + 's', background: ['#f5c542', '#0b7a52', '#e5533d', '#7a69ff'][i % 4] }} />)}</div>;
}

function Quiz({ id, session, doc, onDone }) {
  const [q, setQ] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState({});
  const [res, setRes] = useState(null);
  const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token };
  async function make() {
    setErr(''); setBusy(true); setRes(null); setPick({});
    try { const r = await fetch('/api/quiz', { method: 'POST', headers: H, body: JSON.stringify({ workspaceId: id, docId: doc?.id }) }); const j = await r.json(); if (j.error) throw new Error(j.error); setQ(j); }
    catch (e) { setErr(e.message || 'Could not make the quiz.'); }
    setBusy(false);
  }
  async function grade() {
    const picks = q.questions.map((_, i) => pick[i] ?? -1);
    const r = await fetch('/api/quiz', { method: 'POST', headers: H, body: JSON.stringify({ action: 'grade', quizId: q.id, picks }) }); const j = await r.json();
    if (j.error) setErr(j.error); else setRes(j);
  }
  return (
    <div className="card"><h3>Review quiz</h3>
      <p className="mute">Score at least 60% to enter the review room. Questions come from {doc ? doc.title : 'your slides'}.</p>
      {!q && <button className="btn" disabled={busy} onClick={make}>{busy ? 'Making your questions…' : 'Start quiz'}</button>}
      {err && <div className="err">{err}</div>}
      {q && q.questions.map((x, i) => <div key={i} style={{ marginTop: 14 }}><b>{i + 1}. {x.q}</b>
        <div className="tiles">{x.options.map((o, j) => <button key={j} disabled={!!res} className={'tile t0' + (pick[i] === j ? ' sel' : '') + (res && j === res.answers[i] ? ' good' : '') + (res && pick[i] === j && j !== res.answers[i] ? ' bad' : '')} onClick={() => setPick(p => ({ ...p, [i]: j }))}><span>{o}</span></button>)}</div></div>)}
      {q && !res && <button className="btn" onClick={grade}>Submit answers</button>}
      {res && <><div className={res.passed ? 'ok' : 'err'}>You got {res.score} out of {res.total}. {res.passed ? 'You passed.' : 'Not quite. Try again.'}</div>
        <p>{res.passed ? <button className="btn" style={{ marginTop: 10 }} onClick={onDone}>Enter review room</button> : <button className="btn" style={{ marginTop: 10 }} onClick={() => { setQ(null); setRes(null); make(); }}>Try again</button>}</p></>}
    </div>
  );
}

function Review({ id, session, active, phase, qd }) {
  const [st, setSt] = useState('');
  const [room, setRoom] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const check = () => Promise.resolve(sb.rpc('review_state', { w: id })).then(({ data }) => setSt(data || ''));
  useEffect(() => { if (active) check(); }, [active, phase]);
  async function join(mode) {
    setErr(''); setBusy(true);
    const r = await fetch('/api/review', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token }, body: JSON.stringify({ workspaceId: id, mode }) });
    const j = await r.json(); setBusy(false);
    if (j.error) setErr(j.error); else setRoom(j);
  }
  if (room) return <div className="card"><p className="mute">Review room · stay as long as you like.</p>
    <iframe title="Review room" src={room.url} allow="camera; microphone; fullscreen; display-capture; autoplay" style={{ width: '100%', height: '72vh', border: 0, borderRadius: 14 }} /></div>;
  if (st === 'quiz') return <Quiz id={id} session={session} doc={qd} onDone={check} />;
  return (
    <div className="card lock">
      {st === 'ready' ? <><div className="big">🎥</div><h3>Review room is open</h3><p className="mute">Talk through what you read with your study partners.</p>
        <span className="row" style={{ justifyContent: 'center', flexWrap: 'wrap' }}><button className="btn" disabled={busy} onClick={() => join('video')}>{busy ? 'Opening…' : 'Join with video'}</button><button className="btn ghost" disabled={busy} onClick={() => join('voice')}>Join voice only</button></span>{err && <div className="err">{err}</div>}</>
        : <><div className="big">🔒</div><h3>Review room is locked</h3><p className="mute">{st === 'reading' ? 'Finish your reading time, then pass a short quiz to enter.' : st === 'wait' ? 'The workspace creator has not set a session yet.' : 'Checking…'}</p></>}
    </div>
  );
}

function Animate({ id, session, docId, course, level, setLevel }) {
  const [t, setT] = useState('');
  const [svg, setSvg] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [k, setK] = useState(0);
  async function go(e) {
    e.preventDefault(); if (!t.trim() || busy) return; setBusy(true); setErr(''); setSvg('');
    try {
      const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token }, body: JSON.stringify({ workspaceId: id, docId, course, anim: true, level, message: 'Animate step by step: ' + t.trim() }) });
      const j = await r.json(); if (j.error) setErr(j.error); else { setSvg(j.svg); setK(x => x + 1); }
    } catch { setErr('No connection. Check your data and try again.'); }
    setBusy(false);
  }
  return (
    <div className="card"><h3>Animate a diagram</h3>
      <p className="mute" style={{ fontSize: 14 }}>Describe it, for example "ER diagram for a hospital" or "how mitosis works". The AI draws it step by step using this slide for context. Check the result against your notes.</p>
      <div className="row" style={{ marginBottom: 8 }}><span className="mute" style={{ fontSize: 14 }}>Style for</span><select aria-label="Level" value={level} onChange={e => setLevel(e.target.value)}><option>Primary school</option><option>Secondary school</option><option>University</option></select></div>
      <form className="row" onSubmit={go}><input aria-label="What to animate" value={t} onChange={e => setT(e.target.value)} placeholder="What should I draw?" maxLength={300} /><button className="btn" disabled={busy}>{busy ? 'Drawing…' : 'Animate'}</button></form>
      {err && <div className="err">{err}</div>}
      {svg && <><iframe key={k} title="Animated diagram" sandbox="" srcDoc={'<!doctype html><style>body{margin:0;background:#fff}svg{width:100%;height:auto;display:block}</style>' + svg} style={{ width: '100%', height: 380, border: '1px solid #e1e8e2', borderRadius: 14, marginTop: 12, background: '#fff' }} /><p><button className="chip" onClick={() => setK(x => x + 1)}>Replay</button></p></>}
    </div>
  );
}

function useLevel() {
  const [l, setL] = useState('University');
  useEffect(() => { try { const v = localStorage.getItem('sh:level'); if (v) setL(v); } catch {} }, []);
  return [l, v => { setL(v); try { localStorage.setItem('sh:level', v); } catch {} }];
}
