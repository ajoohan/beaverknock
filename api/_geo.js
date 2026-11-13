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

/* 주소 하나 → { lat, lng } 또는 null. 한국 안의 좌표만 받는다 */
export async function 좌표(주소) {
  const q = String(주소 || '').replace(/\s*\(.*$/, '').replace(/\s+/g, ' ').trim().slice(0, 160);
  if (!q || !지도켜짐()) return null;
  if (캐시.has(q)) return 캐시.get(q);
  try {
    const u = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&region=kr&language=ko&components=country:KR&key=${encodeURIComponent(process.env.GOOGLE_MAPS_SERVER_KEY.trim())}`;
    const r = await fetch(u, { signal: AbortSignal.timeout(6000) });
    const j = r.ok ? await r.json() : null;
    const p = j && j.status === 'OK' && j.results && j.results[0] && j.results[0].geometry && j.results[0].geometry.location;
    const v = p && p.lat > 33 && p.lat < 39 && p.lng > 124 && p.lng < 132 ? { lat: +(+p.lat).toFixed(6), lng: +(+p.lng).toFixed(6) } : null;
    if (!p && j && j.status && !['ZERO_RESULTS', 'OK'].includes(j.status)) console.error('[geo]', j.status, String(j.error_message || '').slice(0, 120));
    if (캐시.size > 500) 캐시.clear();
    if (v || (j && j.status === 'ZERO_RESULTS')) 캐시.set(q, v);
    return v;
  } catch { return null; }
}

/* 물건 하나의 좌표를 채운다 - 도로명(없으면 동 + 이름) */
export async function 물건좌표채우기(row) {
  if (!row || !row.id || !지도켜짐()) return null;
  const 주소 = row.road || [row.dong, row.name].filter(Boolean).join(' ');
  const v = await 좌표(주소);
  const r = await fetch(sbUrl('bk_listing', `id=eq.${row.id}`), { method: 'PATCH', headers: { ...sbHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify(v ? { lat: v.lat, lng: v.lng, geo_at: new Date().toISOString() } : { geo_at: new Date().toISOString() }) }).catch(() => null);
  return r && r.ok ? v : null;
}

/* 좌표 없는 내 물건을 한 번에 몇 개씩 채운다(지도를 열 때 부른다) */
export async function 내물건좌표(agentId, 몇 = 15) {
  if (!지도켜짐()) return { ok: true, off: true, done: 0 };
  const r = await fetch(sbUrl('bk_listing', `select=id,road,dong,name&agent_id=eq.${agentId}&status=neq.closed&lat=is.null&geo_at=is.null&limit=${몇}`), { headers: sbHeaders() });
  if (!r.ok) { const t = await r.text().catch(() => ''); return /lat|geo_at|42703|PGRST204/.test(t) ? { ok: false, need: '0042' } : { ok: false }; }
  const rows = await r.json();
  let done = 0;
  for (const x of rows) if (await 물건좌표채우기(x)) done++;
  return { ok: true, done, left: rows.length >= 몇 };
}

/* 두 점 사이 거리(m) */
export function 거리(a, b) {
  const R = 6371e3, t = x => x * Math.PI / 180;
  const dLat = t(b.lat - a.lat), dLng = t(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
