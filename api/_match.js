/* ── 맞춤매물 (2026-11-12 파트너 기획 C1-2) ──
   손님이 걸어 둔 조건과 중개사가 '노출'한 물건(bk_listing vis=open · status=active)을 100점 만점으로 견준다.
   거래 방식 · 유형이 다르면 아예 견주지 않는다. 80점 이상만 손님에게 보인다.
     지역 30 · 예산 30 · 면적·방 20 · 입주 20
   손님에게 나가는 값은 공개 칸뿐이다 - 호수 · 의뢰인 메모 · 중개사 개인 연락처는 싣지 않는다.
   함수 상한(12개) 때문에 api/my.js 가 이 파일을 불러 쓴다(밑줄 = 주소 없음). */
import { sbHeaders, sbUrl, emailOf } from './_auth.js';
import { notify, won } from './_notify.js';

export const 일치기준 = 80;
const HAREA = [['~33㎡', 0, 33], ['33~66㎡', 33, 66], ['66~99㎡', 66, 99], ['99~132㎡', 99, 132], ['132㎡~', 132, 1e9]];
const 집아님 = k => k !== 'home';
const 동이름 = x => String(x || '').replace(/\s*(상권|전체)\s*/g, '').trim();
const 구간 = (값, 한도) => !(+한도 > 0) ? 1 : +값 <= +한도 ? 1 : +값 <= 한도 * 1.1 ? 2 / 3 : +값 <= 한도 * 1.2 ? 1 / 3 : 0;

export function 일치율(d, L) {
  if (!d || !L || d.kind !== L.kind) return null;
  if (!집아님(d.kind) && d.deal && L.deal && d.deal !== L.deal) return null;
  /* 지역 30 - 동이 같으면 만점. 조건에 동이 없으면(서울·경기 어디든) 만점 */
  const 동들 = (d.dongs || []).map(동이름).filter(Boolean);
  const 지역 = !동들.length || 동들.includes(동이름(L.dong)) ? 30 : 0;
  /* 예산 30 - 보증금(매매가)과 월세(관리비 포함)를 각각 보고 낮은 쪽. 10% 넘으면 20점, 20% 넘으면 10점 */
  const 월 = (+L.rent || 0) + (d.fee_included !== false ? (+L.fee || 0) : 0);
  const 예산 = Math.round(30 * Math.min(구간(L.dep, d.dep), +d.rent > 0 ? 구간(월, d.rent) : (+L.rent > 0 && !집아님(d.kind) && d.deal === '전세' ? 0 : 1)));
  /* 면적·방 20 */
  let 면적방 = 20;
  if (집아님(d.kind)) {
    const a = +L.area || 0, lo = +d.area_min || 0, hi = +d.area_max || 0;
    if (a && (lo || hi)) 면적방 = (!lo || a >= lo) && (!hi || a <= hi) ? 20 : (!lo || a >= lo * 0.9) && (!hi || a <= hi * 1.1) ? 10 : 0;
  } else {
    const n = parseInt(d.rooms, 10), 방 = !(n > 0) || d.rooms === '무관' ? 10 : /~/.test(String(d.rooms)) ? ((+L.rooms || 0) >= 1 && (+L.rooms || 0) <= 2 ? 10 : (+L.rooms === 3 ? 5 : 0)) : (+L.rooms || 0) >= n ? 10 : (+L.rooms || 0) === n - 1 ? 5 : 0;
    const A = d.area_bands || [], b = HAREA.find(x => +L.area >= x[1] && +L.area < x[2]);
    const 면 = !A.length || !(+L.area > 0) ? 10 : b && A.includes(b[0]) ? 10 : A.some(t => { const i = HAREA.findIndex(x => x[0] === t), j = HAREA.indexOf(b); return i >= 0 && j >= 0 && Math.abs(i - j) === 1; }) ? 5 : 0;
    면적방 = 방 + 면;
  }
  /* 입주 20 - 물건이 즉시·협의면 만점. 날짜가 박힌 물건은 손님이 시기를 적었을 때만 조금 깎는다(글로 적힌 시기라 날짜를 견주지 못한다) */
  const 언제 = String(d.open_when || d.when_text || '').trim(), 물건입주 = String(L.move_in || '');
  const 입주 = !언제 || /즉시|협의/.test(물건입주) || !물건입주 ? 20 : 14;
  return { 점: 지역 + 예산 + 면적방 + 입주, 지역, 예산, 면적방, 입주 };
}

/* 손님에게 보이는 물건 값 - 여기 없는 칸은 나가지 않는다 */
function 공개(L, 사무소) {
  return {
    id: L.id, kind: L.kind, name: L.name, dong: L.dong, deal: L.deal, dep: L.dep, rent: L.rent, fee: L.fee,
    fee_basis: L.fee_basis, fee_type: L.fee_type, fee_items: L.fee_items, area: L.area, area_sup: L.area_sup, rooms: L.rooms, baths: L.baths,
    band: L.band, floor_no: L.kind === 'home' ? null : L.floor_no, bdong: L.hide_unit === false ? L.bdong : null, htype: L.htype,
    dir: L.dir, dir_base: L.dir_base, move_in: L.move_in, musts: L.musts || [], one_line: L.one_line, note: L.note, approved: L.approved,
    photos: L.photos || 0, opened_at: L.opened_at, changed: Array.isArray(L.price_log) && L.price_log.length ? L.price_log[L.price_log.length - 1] : null,
    office: (사무소 && 사무소.office) || '공인중개사사무소',
  };
}
const 내조건 = async user => {
  const q = new URLSearchParams({ select: '*', user_id: 'eq.' + user.id, order: 'created_at.desc', limit: '20' });
  const r = await fetch(sbUrl('bk_demand', q.toString()), { headers: sbHeaders() });
  if (!r.ok) return null;
  return (await r.json()).filter(d => (!d.status || d.status === 'active') && !(d.expires_at && Date.parse(d.expires_at) < Date.now()));
};
const 노출물건 = async kinds => {
  const q = new URLSearchParams({ select: '*', vis: 'eq.open', status: 'eq.active', kind: `in.(${kinds.join(',')})`, order: 'opened_at.desc', limit: '500' });
  const r = await fetch(sbUrl('bk_listing', q.toString()), { headers: sbHeaders() });
  if (!r.ok) { const t = await r.text(); return /does not exist|PGRST204|42703|vis/i.test(t) ? { need: '0039' } : null; }
  return { rows: await r.json() };
};

/* 내 조건마다 80점 이상인 노출 물건 */
export async function matched(res, user) {
  try {
    const ds = await 내조건(user);
    if (!ds) return res.status(502).json({ error: '조건을 불러오지 못했습니다' });
    if (!ds.length) return res.status(200).json({ ok: true, groups: [] });
    const x = await 노출물건([...new Set(ds.map(d => d.kind))]);
    if (!x) return res.status(502).json({ error: '매물을 불러오지 못했습니다' });
    if (x.need) return res.status(200).json({ ok: true, groups: ds.map(d => ({ demand_id: d.id, rows: [] })), need: x.need });
    const 사무소 = {};
    const ids = [...new Set(x.rows.map(L => L.agent_id))];
    if (ids.length) {
      const ar = await fetch(sbUrl('bk_agent', `select=id,office,status&id=in.(${ids.join(',')})`), { headers: sbHeaders() });
      if (ar.ok) for (const a of await ar.json()) if (a.status === 'approved') 사무소[a.id] = a;
    }
    const groups = ds.map(d => ({ demand_id: d.id,
      rows: x.rows.filter(L => 사무소[L.agent_id]).map(L => ({ L, s: 일치율(d, L) })).filter(v => v.s && v.s.점 >= 일치기준)
        .sort((a, b) => b.s.점 - a.s.점).slice(0, 40).map(v => ({ ...공개(v.L, 사무소[v.L.agent_id]), score: v.s })) }));
    return res.status(200).json({ ok: true, groups, at: new Date().toISOString() });
  } catch (e) { return res.status(502).json({ error: 'DB에 닿지 못했습니다' }); }
}

/* '이 집 보고 싶어요' - 그 물건으로 제안 한 건을 만들어 손님을 지금의 연결 화면(연락처 제공 동의)으로 잇는다.
   자리(조건당 5곳)는 쓰지 않는다 - 손님이 먼저 고른 것이다. 중개사에게는 메일로 알린다(손님 이름 · 연락처는 연결 뒤에) */
export async function matchWant(req, res, user, b) {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const did = String(b.demand_id || ''), lid = String(b.listing_id || '');
  if (!UUID.test(did) || !UUID.test(lid)) return res.status(400).json({ error: '어느 매물인지 알 수 없습니다' });
  try {
    const dr = await fetch(sbUrl('bk_demand', `select=*&id=eq.${did}&user_id=eq.${user.id}&limit=1`), { headers: sbHeaders() });
    const d = dr.ok ? (await dr.json())[0] : null;
    if (!d) return res.status(404).json({ error: '내 조건이 아닙니다' });
    const lr = await fetch(sbUrl('bk_listing', `select=*&id=eq.${lid}&vis=eq.open&status=eq.active&limit=1`), { headers: sbHeaders() });
    const L = lr.ok ? (await lr.json())[0] : null;
    if (!L) return res.status(404).json({ error: '지금은 볼 수 없는 매물입니다 - 노출이 끝났을 수 있습니다' });
    const s = 일치율(d, L);
    if (!s) return res.status(400).json({ error: '조건과 맞지 않는 매물입니다' });
    const addr = String(L.road || [L.dong, L.name].filter(Boolean).join(' ')).replace(/[<>"'`]/g, '').slice(0, 200);
    const 있던 = await fetch(sbUrl('bk_proposal', `select=id,status&demand_id=eq.${did}&agent_id=eq.${L.agent_id}&addr=eq.${encodeURIComponent(addr)}&limit=1`), { headers: sbHeaders() });
    const 전 = 있던.ok ? (await 있던.json())[0] : null;
    if (전) return res.status(200).json({ ok: true, id: 전.id, again: true });
    const row = { demand_id: did, agent_id: L.agent_id, agent_user: L.agent_user, addr, bname: L.name,
      dep: L.dep, rent: L.rent, fee: L.fee, fee_type: L.fee_type, fee_items: L.fee_items, fee_basis: L.fee_basis, note: L.note,
      area_sup: L.area_sup, area: L.area, rooms: L.rooms != null ? String(L.rooms) : null, baths: L.kind === 'home' && L.baths != null ? String(L.baths) : '',
      dir: L.dir, dir_base: L.dir_base, floor_no: L.kind === 'home' ? null : L.floor_no, band: L.band, bdong: L.hide_unit === false ? L.bdong : null, htype: L.htype,
      duplex: L.duplex === true, move_in: L.move_in, approved: L.approved, photos: L.photos || 0,
      status: 'sent', msg: `맞춤매물에서 손님이 ‘보고 싶어요’를 눌렀습니다 (일치율 ${s.점}점)` };
    const ir = await fetch(sbUrl('bk_proposal'), { method: 'POST', headers: { ...sbHeaders(), Prefer: 'return=representation' }, body: JSON.stringify(row) });
    if (!ir.ok) { console.error('[match-want]', ir.status, (await ir.text()).slice(0, 200)); return res.status(502).json({ error: '요청을 남기지 못했습니다' }); }
    const saved = (await ir.json())[0] || {};
    emailOf(L.agent_user).then(to => to && notify(req, { to, subject: `‘${L.name}’을 보고 싶다는 손님이 있습니다`,
      rows: [['물건', L.name], ['가격', `보증금 ${won(L.dep)}${L.rent ? ` / 월 ${won(L.rent)}` : ''}`], ['일치율', `${s.점}점`]],
      link: '/#/partner/proposals', cta: '내 제안에서 보기', note: '손님이 연결을 누르면 이름과 연락처가 전달됩니다.' })).catch(() => {});
    return res.status(201).json({ ok: true, id: saved.id });
  } catch (e) { return res.status(502).json({ error: 'DB에 닿지 못했습니다' }); }
}
