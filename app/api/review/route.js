import { auth } from '../../../lib/server';
export async function POST(req) {
  const { sb, user } = await auth(req);
  if (!user) return Response.json({ error: 'Please sign in again.' }, { status: 401 });
  const { workspaceId: w } = await req.json();
  const { data: st } = await sb.rpc('review_state', { w });
  if (st !== 'ready') return Response.json({ error: 'Finish reading and pass the quiz first.' }, { status: 403 });
  const key = process.env.DAILY_API_KEY;
  if (!key) return Response.json({ error: 'Video is not set up yet (DAILY_API_KEY is missing).' }, { status: 500 });
  const { data: s } = await sb.from('sessions').select('id,review_minutes').eq('workspace_id', w).single();
  const room = 'sh' + w.replace(/-/g, '').slice(0, 16) + s.id.replace(/-/g, '').slice(0, 8);
  const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key };
  const now = Math.floor(Date.now() / 1000);
  let r = await fetch('https://api.daily.co/v1/rooms/' + room, { headers: H });
  if (r.status === 404) r = await fetch('https://api.daily.co/v1/rooms', { method: 'POST', headers: H, body: JSON.stringify({ name: room, privacy: 'private', properties: { exp: now + 4 * 3600, enable_chat: true, enable_screenshare: true, max_participants: 12 } }) });
  const rm = await r.json();
  if (!rm.url) return Response.json({ error: 'Could not open the review room.' }, { status: 502 });
  const { data: p } = await sb.from('profiles').select('name').eq('id', user.id).single();
  const t = await fetch('https://api.daily.co/v1/meeting-tokens', { method: 'POST', headers: H, body: JSON.stringify({ properties: { room_name: room, user_name: p?.name || 'Student', exp: now + s.review_minutes * 60, eject_at_token_exp: true } }) });
  const tk = await t.json();
  if (!tk.token) return Response.json({ error: 'Could not create your room pass.' }, { status: 502 });
  return Response.json({ url: rm.url + '?t=' + tk.token, minutes: s.review_minutes });
}
