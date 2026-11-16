/* 좌표 (2026-11-14 대표님 '구글지도로 할께') - 매물지도 · 손님 조건의 반경 · 역 · 단지에 쓴다.
 *
 * 서버 열쇠 GOOGLE_MAPS_SERVER_KEY(Geocoding API 만 켠 열쇠)로 도로명 주소 → 위도 · 경도.
 * 화면 열쇠 GOOGLE_MAPS_KEY(Maps JavaScript API · 사이트 주소로 묶은 열쇠)는 브라우저가 지도를 그릴 때만 쓴다 - 공개값이다.
 * 열쇠가 없으면 아무것도 하지 않는다(지도 화면이 '준비 중' 으로 남는다).
 *
 * 좌표는 bk_listing.lat · lng · geo_at 에 둔다(0042). 칸이 없으면 조용히 넘어간다. */
import { sbHeaders, sbUrl } from './_auth.js';

export const 지도켜짐 = () => !!String(process.env.GOOGLE_MAPS_SERVER_KEY || '').trim();
const 캐시 = new Map();

/* 주소 하나 → { v: {lat,lng}|null, sure }. sure = 구글이 확실히 답했다(OK · ZERO_RESULTS).
 * 시간 초과 · 열쇠 거절 · 사용량 초과처럼 잠깐 생긴 실패는 sure=false - 기록하지 않고 다음에 다시 찾는다 */
export async function 좌표찾기(주소) {
  const q = String(주소 || '').replace(/\s*\(.*$/, '').replace(/\s+/g, ' ').trim().slice(0, 160);
  if (!q || !지도켜짐()) return { v: null, sure: false };
  if (캐시.has(q)) return { v: 캐시.get(q), sure: true };
  try {
    const u = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&region=kr&language=ko&components=country:KR&key=${encodeURIComponent(process.env.GOOGLE_MAPS_SERVER_KEY.trim())}`;
    const r = await fetch(u, { signal: AbortSignal.timeout(6000) });
    const j = r.ok ? await r.json() : null;
    const st = j && j.status;
    const p = st === 'OK' && j.results && j.results[0] && j.results[0].geometry && j.results[0].geometry.location;
    const v = p && p.lat > 33 && p.lat < 39 && p.lng > 124 && p.lng < 132 ? { lat: +(+p.lat).toFixed(6), lng: +(+p.lng).toFixed(6) } : null;
    const sure = st === 'OK' || st === 'ZERO_RESULTS';
    if (!sure && st) console.error('[geo]', st, String(j.error_message || '').slice(0, 120));
    if (캐시.size > 500) 캐시.clear();
    if (sure) 캐시.set(q, v);
    return { v, sure };
  } catch { return { v: null, sure: false }; }
}
export const 좌표 = async 주소 => (await 좌표찾기(주소)).v;

/* 물건 하나의 좌표를 채운다 - 도로명(없으면 동 + 이름).
 * 찾음 → 좌표 + geo_at. 확실히 없음 → 좌표 지우고 geo_at(다시 안 찾음 - 주소를 고치면 다시 찾는다).
 * 잠깐 실패 → 좌표 · geo_at 모두 비움(주소가 바뀐 경우 옛 좌표가 남지 않게, 지도를 열 때 다시 찾는다).
 * 돌려줌: { v, sure } */
export async function 물건좌표채우기(row) {
  if (!row || !row.id || !지도켜짐()) return { v: null, sure: false };
  const 주소 = row.road || [row.dong, row.name].filter(Boolean).join(' ');
  const z = await 좌표찾기(주소);
  const 칸 = z.v ? { lat: z.v.lat, lng: z.v.lng, geo_at: new Date().toISOString() }
    : z.sure ? { lat: null, lng: null, geo_at: new Date().toISOString() } : { lat: null, lng: null, geo_at: null };
  const r = await fetch(sbUrl('bk_listing', `id=eq.${row.id}`), { method: 'PATCH', headers: { ...sbHeaders(), Prefer: 'return=minimal' }, body: JSON.stringify(칸) }).catch(() => null);
  return r && r.ok ? z : { v: null, sure: false };
}

/* 물건 저장 응답이 좌표를 오래 기다리지 않게 - 2.5초 안에 끝나면 좌표를 싣고, 아니면 그냥 돌려준다.
 * 늦게 끝나도 기록은 그대로 되고, 끊기면 geo_at 이 비어 있어 지도를 열 때 다시 찾는다 */
export async function 물건좌표잠깐(row, ms = 2500) {
  let t;
  const 늦음 = new Promise(ok => { t = setTimeout(() => ok(null), ms); });
  const z = await Promise.race([물건좌표채우기(row).catch(() => null), 늦음]);
  clearTimeout(t);
  return z && z.v ? z.v : null;
}

/* 좌표 없는 내 물건을 한 번에 몇 개씩 채운다(지도를 열 때 부른다).
 * 다섯 개씩 함께 찾고, 잠깐 실패가 나오면(사용량 · 열쇠 문제) 그 자리에서 멈춘다 */
export async function 내물건좌표(agentId, 몇 = 10) {
  if (!지도켜짐()) return { ok: true, off: true, done: 0 };
  const r = await fetch(sbUrl('bk_listing', `select=id,road,dong,name&agent_id=eq.${agentId}&status=neq.closed&lat=is.null&geo_at=is.null&limit=${몇}`), { headers: sbHeaders() });
  if (!r.ok) { const t = await r.text().catch(() => ''); return /lat|geo_at|42703|PGRST204/.test(t) ? { ok: false, need: '0042' } : { ok: false }; }
  const rows = await r.json();
  let done = 0, 멈춤 = false;
  for (let i = 0; i < rows.length && !멈춤; i += 5) {
    const zs = await Promise.all(rows.slice(i, i + 5).map(x => 물건좌표채우기(x).catch(() => ({ v: null, sure: false }))));
    for (const z of zs) { if (z.v) done++; if (!z.sure) 멈춤 = true; }
  }
  return { ok: true, done, left: !멈춤 && rows.length >= 몇 };
}

/* 두 점 사이 거리(m) */
export function 거리(a, b) {
  const R = 6371e3, t = x => x * Math.PI / 180;
  const dLat = t(b.lat - a.lat), dLng = t(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
