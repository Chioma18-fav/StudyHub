'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { sb } from '../lib/supabase';
export default function Home() {
  const r = useRouter();
  const [mode, setMode] = useState('in');
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { sb.auth.getSession().then(({ data }) => data.session && r.replace('/dashboard')); }, []);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault(); setBusy(true); setMsg(null);
    if (mode === 'up') {
      const { data, error } = await sb.auth.signUp({ email: f.email, password: f.password, options: { data: { name: f.name.trim() || 'Student' } } });
      if (error) setMsg({ e: error.message });
      else if (data.session) r.push('/dashboard');
      else setMsg({ ok: 'Account created. Check your email to confirm, then sign in.' });
    } else {
      const { error } = await sb.auth.signInWithPassword({ email: f.email, password: f.password });
      if (error) setMsg({ e: error.message }); else r.push('/dashboard');
    }
    setBusy(false);
  }
  return (
    <main className="wrap">
      <div className="top"><span className="logo">Study<b>Hub</b></span></div>
      <div className="auth">
        <div>
          <h1>Study together. Stay on the page.</h1>
          <p className="mute" style={{ fontSize: 18 }}>Upload your slides, ask the AI when something does not make sense, and lock in a timed session with your reading partners.</p>
          <ul>
            <li>Your own workspace, shared only with people you give a code to</li>
            <li>A timer that pauses the moment you leave the tab</li>
            <li>AI chat that reads your actual course slides</li>
          </ul>
        </div>
        <form className="card" onSubmit={submit}>
          <h2>{mode === 'in' ? 'Welcome back' : 'Create your account'}</h2>
          {mode === 'up' && (<><label htmlFor="n">Your name</label><input id="n" value={f.name} onChange={set('name')} required maxLength={40} /></>)}
          <label htmlFor="e">Email</label><input id="e" type="email" value={f.email} onChange={set('email')} required autoComplete="email" />
          <label htmlFor="p">Password</label><input id="p" type="password" value={f.password} onChange={set('password')} required minLength={8} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} />
          <p className="mute" style={{ fontSize: 13, marginTop: 6 }}>{mode === 'up' && 'Use at least 8 characters.'}</p>
          <button className="btn" style={{ width: '100%' }} disabled={busy}>{busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : 'Create account'}</button>
          {msg?.e && <div className="err">{msg.e}</div>}{msg?.ok && <div className="ok">{msg.ok}</div>}
          <p style={{ marginTop: 14 }}><button type="button" className="chip" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(null); }}>{mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in'}</button></p>
        </form>
      </div>
    </main>
  );
}
