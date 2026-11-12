/* ── 매물 사진 (2026-11-12 파트너 기획 C1 '사진 20장 · 실제 파일') ──
   비공개 저장소(bk-files)의 listing/<사무소>/<물건>/ 아래에 JPEG 로 둔다. 화면이 긴 변 1600px 로 줄여서 보낸다.
   물건 표의 pics(0040)에는 경로만 적고, 볼 때마다 한 시간짜리 서명 주소를 만들어 준다 - 주소가 새도 한 시간 뒤 닫힌다.
   함수 상한(12개) 때문에 api/feed.js · api/_match.js 가 불러 쓴다. */
import { sbHeaders, sbUrl } from './_auth.js';
import { 파일버킷, 버킷올리기, 버킷지우기 } from './_forms.js';

export const 사진최대 = 20, 사진크기 = 1200 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const 경로꼴 = /^listing\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[a-z0-9]{6,24}\.jpg$/;
export const 사진들 = x => (Array.isArray(x) ? x : []).map(v => String((v && v.p) || v || '')).filter(p => 경로꼴.test(p)).slice(0, 사진최대);

export async function 사진주소(paths, fetchFn = fetch) {
  if (!paths.length) return [];
  const r = await fetchFn(`${process.env.BK_URL}/storage/v1/object/sign/${파일버킷}`, { method: 'POST',
    headers: { apikey: process.env.BK_SECRET_KEY, Authorization: 'Bearer ' + process.env.BK_SECRET_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 3600, paths }) });
  const j = await r.json().catch(() => null);
  if (!r.ok || !Array.isArray(j)) return paths.map(() => '');
  return paths.map(p => { const x = j.find(v => v.path === p); const s = x && (x.signedURL || x.signedUrl);
    return s ? `${process.env.BK_URL}/storage/v1/${String(s).replace(/^\/+/, '')}` : ''; });
}
const 칸없음 = t => /does not exist|PGRST204|Could not find the '[a-z_]+' column|42703/i.test(t);
async function 내물건(agent, id) {
  const r = await fetch(sbUrl('bk_listing', `select=id,status,pics&id=eq.${id}&agent_id=eq.${agent.id}&limit=1`), { headers: sbHeaders() });
  if (!r.ok) { const t = await r.text(); return 칸없음(t) ? { need: '0040' } : { error: true }; }
  return { row: (await r.json())[0] || null };
}
const 답 = async (res, paths) => { const urls = await 사진주소(paths); return res.status(200).json({ ok: true, pics: paths.map((p, i) => ({ p, url: urls[i] })) }); };
const 적기 = (agent, id, paths) => fetch(sbUrl('bk_listing', `id=eq.${id}&agent_id=eq.${agent.id}`), { method: 'PATCH',
  headers: { ...sbHeaders(), Prefer: 'return=minimal' }, body: JSON.stringify({ pics: paths, photos: paths.length, updated_at: new Date().toISOString() }) });

export async function listingPics(res, agent, b) {
  const id = String(b.id || ''); if (!UUID.test(id)) return res.status(400).json({ error: '어느 물건인지 알 수 없습니다' });
  const x = await 내물건(agent, id);
  if (x.need) return res.status(200).json({ ok: true, pics: [], need: x.need });
  if (x.error || !x.row) return res.status(x.error ? 502 : 404).json({ error: '물건을 불러오지 못했습니다' });
  return 답(res, 사진들(x.row.pics));
}
export async function listingPicAdd(res, agent, b) {
  const id = String(b.id || ''); if (!UUID.test(id)) return res.status(400).json({ error: '어느 물건인지 알 수 없습니다' });
  let buf; try { buf = Buffer.from(String(b.data || ''), 'base64'); } catch { buf = null; }
  if (!buf || buf.length < 200) return res.status(400).json({ error: '사진이 비어 있습니다' });
  if (buf.length > 사진크기) return res.status(413).json({ error: '사진이 너무 큽니다 - 다시 골라 주세요' });
  if (!(buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF)) return res.status(400).json({ error: '사진 파일(JPEG)만 올릴 수 있습니다' });
  try {
    const x = await 내물건(agent, id);
    if (x.need) return res.status(503).json({ error: '아직 준비 중입니다 (0040 마이그레이션 필요)', need: x.need });
    if (x.error || !x.row || x.row.status === 'closed') return res.status(x.error ? 502 : 404).json({ error: '내 물건이 아니거나 지운 물건입니다' });
    const 지금 = 사진들(x.row.pics);
    if (지금.length >= 사진최대) return res.status(400).json({ error: `사진은 ${사진최대}장까지 올릴 수 있습니다` });
    const p = `listing/${agent.id}/${id}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.jpg`;
    const u = await 버킷올리기(파일버킷, p, 'jpg', buf);
    if (!u.ok) return res.status(u.need ? 503 : 502).json({ error: u.need ? '아직 준비 중입니다 (파일 저장소 필요)' : u.error, need: u.need });
    const 뒤 = [...지금, p];
    const r = await 적기(agent, id, 뒤);
    if (!r.ok) { await 버킷지우기(파일버킷, [p]); const t = await r.text(); return res.status(칸없음(t) ? 503 : 502).json({ error: 칸없음(t) ? '아직 준비 중입니다 (0040 마이그레이션 필요)' : '사진을 저장하지 못했습니다', need: 칸없음(t) ? '0040' : undefined }); }
    return 답(res, 뒤);
  } catch (e) { return res.status(502).json({ error: '사진을 올리지 못했습니다' }); }
}
/* 지우기 · 대표 사진으로(맨 앞으로) */
export async function listingPicSet(res, agent, b) {
  const id = String(b.id || ''), p = String(b.p || ''), op = b.op === 'first' ? 'first' : 'del';
  if (!UUID.test(id) || !경로꼴.test(p)) return res.status(400).json({ error: '어느 사진인지 알 수 없습니다' });
  try {
    const x = await 내물건(agent, id);
    if (x.need || x.error || !x.row) return res.status(404).json({ error: '물건을 불러오지 못했습니다' });
    const 지금 = 사진들(x.row.pics); if (!지금.includes(p)) return res.status(404).json({ error: '없는 사진입니다' });
    const 뒤 = op === 'first' ? [p, ...지금.filter(v => v !== p)] : 지금.filter(v => v !== p);
    const r = await 적기(agent, id, 뒤);
    if (!r.ok) return res.status(502).json({ error: '바꾸지 못했습니다' });
    if (op === 'del') await 버킷지우기(파일버킷, [p]);
    return 답(res, 뒤);
  } catch (e) { return res.status(502).json({ error: '바꾸지 못했습니다' }); }
}
