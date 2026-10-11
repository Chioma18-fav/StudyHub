import { auth, slide, gemini } from '../../../lib/server';
export async function POST(req) {
  const { sb, user } = await auth(req);
  if (!user) return Response.json({ error: 'Please sign in again.' }, { status: 401 });
  const b = await req.json();
  if (b.action === 'grade') {
    const { data, error } = await sb.rpc('grade_quiz', { q: b.quizId, picks: (b.picks || []).map(n => Number.isInteger(n) ? n : -1) });
    return error ? Response.json({ error: error.message }, { status: 400 }) : Response.json(data);
  }
  const { data: st } = await sb.rpc('review_state', { w: b.workspaceId });
  if (st !== 'quiz') return Response.json({ error: st === 'ready' ? 'You already passed the quiz.' : 'Finish your reading time first.' }, { status: 403 });
  const sp = await slide(sb, b.workspaceId, b.docId);
  if (!sp) return Response.json({ error: 'Upload slides to this workspace first so the quiz has something to ask about.' }, { status: 400 });
  const r = await gemini('You write fair exam questions from the attached slides.', [{ role: 'user', parts: [sp, { text: 'Write 5 multiple-choice questions from these slides. Reply with ONLY a JSON array like [{"q":"...","options":["A","B","C","D"],"answer":0}] with exactly 4 options and answer as the index (0-3) of the correct one. No other text.' }] }]);
  if (r.error) return Response.json({ error: r.error }, { status: 502 });
  let qs;
  try { qs = JSON.parse(r.text.replace(/```json|```/g, '').trim()); } catch { return Response.json({ error: 'The AI did not return a valid quiz. Try again.' }, { status: 502 }); }
  qs = (Array.isArray(qs) ? qs : []).slice(0, 5).filter(q => q && q.q && Array.isArray(q.options) && q.options.length === 4 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4);
  if (qs.length < 3) return Response.json({ error: 'The quiz came out incomplete. Try again.' }, { status: 502 });
  const { data: id, error } = await sb.rpc('save_quiz', { w: b.workspaceId, a: qs.map(q => q.answer) });
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ id, questions: qs.map(({ q, options }) => ({ q, options })) });
}
