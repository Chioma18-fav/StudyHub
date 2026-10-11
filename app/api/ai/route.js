import { createClient } from '@supabase/supabase-js';
const LEVELS = ['Primary school', 'Secondary school', 'University'];
export async function POST(req) {
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '');
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) return Response.json({ error: 'Please sign in again.' }, { status: 401 });
  const { workspaceId, docId, message, level, course: c } = await req.json();
  const course = String(c || 'General').slice(0, 40);
  if (!message || message.length > 2000) return Response.json({ error: 'Message is empty or too long.' }, { status: 400 });
  const { data: hist } = await sb.from('ai_chats').select('role,content').eq('workspace_id', workspaceId).eq('user_id', user.id).eq('course', course).order('id', { ascending: false }).limit(10);
  const contents = (hist || []).reverse().map(h => ({ role: h.role, parts: [{ text: h.content }] }));
  const parts = [{ text: message }];
  if (docId) {
    const { data: d } = await sb.from('docs').select('path').eq('id', docId).eq('workspace_id', workspaceId).single();
    if (d) {
      const { data: f } = await sb.storage.from('slides').download(d.path);
      if (f) parts.unshift({ inlineData: { mimeType: 'application/pdf', data: Buffer.from(await f.arrayBuffer()).toString('base64') } });
    }
  }
  contents.push({ role: 'user', parts });
  const lvl = LEVELS.includes(level) ? level : 'University';
  const sys = `You are a patient study tutor for a ${lvl} student. Follow any style the student asks for (for example simpler words, examples, or step by step). When slides are attached, base answers on them and say if something is not in them. Be accurate and say when you are unsure.`;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents }),
  });
  const j = await r.json();
  const text = j.candidates?.[0]?.content?.parts?.map(p => p.text).join('');
  if (!text) return Response.json({ error: 'AI error (' + r.status + '): ' + (j.error?.message || j.promptFeedback?.blockReason || 'no answer returned') }, { status: 502 });
  await sb.from('ai_chats').insert([{ workspace_id: workspaceId, user_id: user.id, role: 'user', content: message, course }, { workspace_id: workspaceId, user_id: user.id, role: 'model', content: text, course }]);
  return Response.json({ text });
}
