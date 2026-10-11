import { auth, slide, gemini } from '../../../lib/server';
const LEVELS = ['Primary school', 'Secondary school', 'University'];
const ANIM = `You make short animated explainer diagrams as ONE SVG. Reply with ONLY the <svg>...</svg>, no markdown. Use viewBox="0 0 800 480". No scripts, no external images or fonts, font-family sans-serif, font size at least 16. Put a <style> inside the SVG. The diagram must draw itself step by step: give every shape, arrow and label the class "s" and an inline style animation-delay in seconds (0s, 1s, 2s...), with .s{opacity:0;animation:show .6s forwards} @keyframes show{to{opacity:1}}. Total animation 10 to 20 seconds. Start with a white background rect. At most 25 elements, clear labels, accurate. Use correct notation for the diagram type: ER (rectangles, diamonds, ovals), UML (boxes with compartments, standard arrows), biology (labelled schematic parts with arrows showing the process). When slides are attached, follow them.`;
export const maxDuration = 60;
export async function POST(req) {
  const { sb, user } = await auth(req);
  if (!user) return Response.json({ error: 'Please sign in again.' }, { status: 401 });
  const { workspaceId, docId, message, level, course: c, anim } = await req.json();
  const course = String(c || 'General').slice(0, 40);
  if (!message || message.length > 2000) return Response.json({ error: 'Message is empty or too long.' }, { status: 400 });
  let contents = [];
  if (!anim) {
    const { data: hist } = await sb.from('ai_chats').select('role,content').eq('workspace_id', workspaceId).eq('user_id', user.id).eq('course', course).order('id', { ascending: false }).limit(10);
    contents = (hist || []).reverse().map(h => ({ role: h.role, parts: [{ text: h.content }] }));
  }
  const parts = [{ text: message }];
  const sp = await slide(sb, workspaceId, docId); if (sp) parts.unshift(sp);
  contents.push({ role: 'user', parts });
  const lvl = LEVELS.includes(level) ? level : 'University';
  const sys = anim ? ANIM : `You are a patient study tutor for a ${lvl} student. Follow any style the student asks for (for example simpler words, examples, or step by step). When slides are attached, base answers on them and say if something is not in them. Be accurate and say when you are unsure.`;
  const r = await gemini(sys, contents);
  if (r.error) return Response.json({ error: r.error }, { status: 502 });
  if (anim) {
    const t = r.text, i = t.indexOf('<svg'), j = t.lastIndexOf('</svg>');
    if (i < 0 || j < 0) return Response.json({ error: 'The AI did not return a drawing. Try again with a simpler request.' }, { status: 502 });
    return Response.json({ svg: t.slice(i, j + 6).replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '') });
  }
  await sb.from('ai_chats').insert([{ workspace_id: workspaceId, user_id: user.id, role: 'user', content: message, course }, { workspace_id: workspaceId, user_id: user.id, role: 'model', content: r.text, course }]);
  return Response.json({ text: r.text });
}
