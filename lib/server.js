import { createClient } from '@supabase/supabase-js';
export async function auth(req) {
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '');
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user } } = await sb.auth.getUser(token);
  return { sb, user };
}
export async function slide(sb, workspaceId, docId) {
  if (!docId) return null;
  const { data: d } = await sb.from('docs').select('path').eq('id', docId).eq('workspace_id', workspaceId).single();
  if (!d) return null;
  const { data: f } = await sb.storage.from('slides').download(d.path);
  return f ? { inlineData: { mimeType: 'application/pdf', data: Buffer.from(await f.arrayBuffer()).toString('base64') } } : null;
}
export async function gemini(sys, contents) {
  const models = [process.env.GEMINI_MODEL || 'gemini-3.8-flash', process.env.GEMINI_FALLBACK_MODEL].filter(Boolean);
  let last = 'no answer returned';
  for (const model of models) {
    for (let i = 0; i < 3; i++) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents }),
      });
      const j = await r.json();
      const text = j.candidates?.[0]?.content?.parts?.map(p => p.text).join('');
      if (text) return { text };
      last = 'AI error (' + r.status + '): ' + (j.error?.message || j.promptFeedback?.blockReason || 'no answer returned');
      if (![429, 500, 503].includes(r.status)) return { error: last };
      await new Promise(ok => setTimeout(ok, 1500 * (i + 1)));
    }
  }
  return { error: last + ' (Google is busy. Wait a minute and try again.)' };
}
