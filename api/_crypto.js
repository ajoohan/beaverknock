/* ── 개인정보 칸 암호화 (2026-11-12 대표님 '개인정보가 많아서 암호화해서 저장해야 한다') ──
   AES-256-GCM 으로 칸 하나씩 암호화한다. 저장값 = 'e1:' + base64url(iv 12 | tag 16 | 암호문).
   - 열쇠는 환경변수 BK_DATA_KEY(32바이트를 base64 로). 없으면 평문 그대로 둔다 - 서비스가 멈추지 않게.
     열쇠가 들어오면 그 뒤로 저장하는 값부터 암호화되고, 예전 평문은 읽을 때 그대로 읽힌다(점진 전환).
   - 열쇠를 바꿀 때는 BK_DATA_KEY_OLD 에 옛 열쇠를 두면 옛 값도 풀린다(새로 저장할 때 새 열쇠로).
   - 같은 값인지 찾아야 하는 칸(전화번호 등)은 평문 대신 색인값(HMAC-SHA256, 'h1:' + 32자)을 따로 둔다.
   - 열쇠는 DB 에 두지 않는다. DB 백업 · 대시보드 화면이 새도 이 칸들은 읽히지 않는다.
   주의: 열쇠를 잃으면 암호화된 칸은 되살릴 수 없다 - 대표님이 안전한 곳에 따로 보관한다. */
import crypto from 'node:crypto';

const 머리 = 'e1:';
function 열쇠(이름 = 'BK_DATA_KEY') {
  const v = String(process.env[이름] || '').trim();
  if (!v) return null;
  let b; try { b = Buffer.from(v, 'base64'); } catch { return null; }
  return b.length === 32 ? b : null;
}
export const 암호켜짐 = () => !!열쇠();

/** 문자열 하나를 암호화한다. 빈 값 · 이미 암호화된 값 · 열쇠 없음은 그대로 */
export function 잠그기(v) {
  if (v == null || v === '') return v;
  const s = String(v);
  if (s.startsWith(머리)) return s;
  const k = 열쇠(); if (!k) return s;
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const 몸 = Buffer.concat([c.update(s, 'utf8'), c.final()]);
  return 머리 + Buffer.concat([iv, c.getAuthTag(), 몸]).toString('base64url');
}
/** 푼다. 평문(예전 값)은 그대로.
    풀지 못하면(열쇠가 틀림 · 바뀜) 암호문을 그대로 돌려준다 - 빈 글을 주면 읽어서 고쳐 다시 쓰는 곳(settings 통째 저장 등)이
    그 빈 글로 원래 값을 덮어 영영 잃는다(리뷰 11-12). 잠그기()는 이미 잠긴 값을 건너뛰므로 다시 저장해도 원래 암호문이 지켜진다 */
let 실패알림 = 0;
export function 풀기(v) {
  if (v == null || typeof v !== 'string' || !v.startsWith(머리)) return v;
  const b = Buffer.from(v.slice(머리.length), 'base64url');
  if (b.length < 29) return v;
  for (const 이름 of ['BK_DATA_KEY', 'BK_DATA_KEY_OLD']) {
    const k = 열쇠(이름); if (!k) continue;
    try {
      const d = crypto.createDecipheriv('aes-256-gcm', k, b.subarray(0, 12));
      d.setAuthTag(b.subarray(12, 28));
      return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
    } catch { /* 다음 열쇠 */ }
  }
  if (Date.now() - 실패알림 > 60e3) { 실패알림 = Date.now(); console.error('[crypto] 풀지 못한 값이 있습니다 - BK_DATA_KEY · BK_DATA_KEY_OLD 를 확인하세요'); }
  return v;
}
export const 잠긴값인가 = v => typeof v === 'string' && v.startsWith(머리);

/** 같은 값 찾기용 색인 - 전화번호는 숫자만, 메일은 소문자로 맞춘 뒤. 열쇠가 없으면 null.
    색인 열쇠는 BK_INDEX_KEY(없으면 BK_DATA_KEY). 암호화 열쇠를 바꿀 때는 BK_INDEX_KEY 에 지금 값을 남겨 두면 색인이 그대로 맞는다(리뷰 11-12) */
const 색인열쇠 = () => 열쇠('BK_INDEX_KEY') || 열쇠();
export function 색인(v, 종류 = 'text', k = 색인열쇠()) {
  if (!k || v == null || v === '') return null;
  let s = String(v).trim();
  if (종류 === 'phone') s = s.replace(/\D/g, '');
  if (종류 === 'email') s = s.toLowerCase();
  if (!s) return null;
  return 'h1:' + crypto.createHmac('sha256', k).update('idx:' + 종류 + ':' + s).digest('base64url').slice(0, 32);
}
/** 찾을 때 쓸 색인들 - 지금 열쇠 + 옛 열쇠(BK_DATA_KEY_OLD) */
export function 색인들(v, 종류 = 'text') {
  return [...new Set([색인(v, 종류), 색인(v, 종류, 열쇠('BK_DATA_KEY_OLD'))].filter(Boolean))];
}

/** 객체에서 정한 칸들만 잠근다/푼다 - 얕은 칸 이름 목록 또는 'a.b.c' 경로 */
const 경로 = p => String(p).split('.');
function 고치기(o, 칸들, fn) {
  if (!o || typeof o !== 'object') return o;
  const out = Array.isArray(o) ? [...o] : { ...o };
  for (const p of 칸들) {
    const 길 = 경로(p);
    let 부모 = out;
    for (let i = 0; i < 길.length - 1; i++) {
      const 키 = 길[i];
      if (!부모[키] || typeof 부모[키] !== 'object') { 부모 = null; break; }
      부모[키] = Array.isArray(부모[키]) ? [...부모[키]] : { ...부모[키] };
      부모 = 부모[키];
    }
    if (!부모) continue;
    const 끝 = 길[길.length - 1];
    if (끝 === '*') { for (const k of Object.keys(부모)) if (typeof 부모[k] === 'string') 부모[k] = fn(부모[k]); }
    else if (typeof 부모[끝] === 'string') 부모[끝] = fn(부모[끝]);
  }
  return out;
}
export const 칸잠그기 = (o, 칸들) => 고치기(o, 칸들, 잠그기);
export const 칸풀기 = (o, 칸들) => 고치기(o, 칸들, 풀기);

/* ══════════ DB 길목 (2026-11-12) ══════════
   서버가 Supabase REST(/rest/v1/표)로 보내는 쓰기(POST · PATCH)에서 아래 표의 칸을 잠그고,
   돌아오는 JSON 에서 'e1:' 로 시작하는 값은 어디 있든 푼다. 칸마다 읽는 곳을 하나하나 고치지 않아도 되고,
   앞으로 새로 만드는 기능도 저절로 보호된다. 열쇠가 없으면 아무것도 하지 않는다.
   ⚠ 같은 값으로 찾는(eq. 필터 · 유일 색인) 칸은 여기 넣지 않는다 - 암호문은 매번 달라 찾을 수 없다.
     전화번호는 phone_idx(색인)를 함께 적어 그것으로 찾는다(agent.js 겹친신청). 직원 메일(settings.staff)은 cs. 로 찾아서 평문 그대로 둔다. */
const 깊이잠금 = (v, d = 0) => d > 6 ? v : typeof v === 'string' ? 잠그기(v)
  : Array.isArray(v) ? v.map(x => 깊이잠금(x, d + 1))
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, 깊이잠금(x, d + 1)])) : v;
const 깊이풀기 = (v, d = 0) => d > 12 ? v : typeof v === 'string' ? (v.startsWith(머리) ? 풀기(v) : v)
  : Array.isArray(v) ? v.map(x => 깊이풀기(x, d + 1))
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, 깊이풀기(x, d + 1)])) : v;
const 칸만 = (o, 칸들) => { for (const k of 칸들) if (typeof o[k] === 'string') o[k] = 잠그기(o[k]); };
export const 표칸 = {
  bk_demand: o => 칸만(o, ['name', 'phone', 'birth', 'cur_addr', 'memo', 'must_free', 'manager', 'contact_pref', 'contact_times']),
  bk_agent: o => {
    if (typeof o.phone === 'string' && !o.phone.startsWith(머리)) { const h = 색인(o.phone, 'phone'); if (h) o.phone_idx = h; }
    칸만(o, ['name', 'phone', 'email', 'addr', 'memo', 'corp_no']);
    if (o.settings && typeof o.settings === 'object') {
      const s = o.settings = { ...o.settings };
      if (typeof s.memo === 'string') s.memo = 잠그기(s.memo);
      /* 물건마다 의뢰인 · 연락처 · 조정 금액 · 특이사항 (feed.js lmemo) */
      if (s.lmemo && typeof s.lmemo === 'object') s.lmemo = Object.fromEntries(Object.entries(s.lmemo).map(([k, m]) => [k, 깊이잠금(m)]));
      /* 계약체결 문자 기록의 채운 값(당사자 이름 · 번호가 들어간다) */
      if (Array.isArray(s.smsLog)) s.smsLog = s.smsLog.map(x => x && typeof x === 'object' && x.vals ? { ...x, vals: 깊이잠금(x.vals) } : x);
    }
  },
  bk_contract: o => {
    if (o.doc && typeof o.doc === 'object' && o.doc.parties) o.doc = { ...o.doc, parties: 깊이잠금(o.doc.parties) };
    if (o.track && typeof o.track === 'object' && Array.isArray(o.track.notes))
      o.track = { ...o.track, notes: o.track.notes.map(n => n && typeof n === 'object' ? { ...n, name: 잠그기(n.name), text: 잠그기(n.text) } : n) };
  },
  bk_contract_msg: o => { 칸만(o, ['name', 'body']); if (o.file && typeof o.file === 'object' && typeof o.file.name === 'string') o.file = { ...o.file, name: 잠그기(o.file.name) }; },
  bk_proposal: o => 칸만(o, ['contact_pref', 'report_detail', 'report_note', 'msg', 'note']),
  /* 호수는 손님에게도 안 보이는 값 · 특징 글에는 연락처가 섞일 수 있다(리뷰 11-12) */
  bk_listing: o => 칸만(o, ['ho', 'note']),
  bk_ops_log: o => 칸만(o, ['detail']),
};
/** 요청 본문 하나(객체 또는 배열)를 표에 맞게 잠근다 - 시험에서도 쓴다 */
export function 본문잠그기(표, body) {
  const f = 표칸[표]; if (!f || !암호켜짐()) return body;
  const 하나 = x => { if (!x || typeof x !== 'object') return x; const o = { ...x }; f(o); return o; };
  return Array.isArray(body) ? body.map(하나) : 하나(body);
}
export const 응답풀기 = 깊이풀기;

let 깔림 = false;
export function 길목깔기() {
  if (깔림 || typeof globalThis.fetch !== 'function') return; 깔림 = true;
  const 원래 = globalThis.fetch;
  globalThis.fetch = async function (input, init) {
    const url = String((input && input.url) || input || '');
    const base = String(process.env.BK_URL || '').replace(/\/+$/, '');
    if (!base || !url.startsWith(base + '/rest/v1/')) return 원래(input, init);
    const 표 = decodeURIComponent(url.slice(base.length + 9).split(/[?/]/)[0] || '');
    const m = String((init && init.method) || 'GET').toUpperCase();
    /* 'x-bk-raw' 를 단 요청은 풀지 않고 저장된 그대로 돌려준다(암호화 전환이 평문 · 암호문을 가를 때) */
    const 원문 = !!(init && init.headers && (init.headers['x-bk-raw'] || init.headers['X-Bk-Raw']));
    if (원문) { const h = { ...init.headers }; delete h['x-bk-raw']; delete h['X-Bk-Raw']; init = { ...init, headers: h }; }
    let 보낼 = init;
    if (암호켜짐() && (m === 'POST' || m === 'PATCH') && 표칸[표] && init && typeof init.body === 'string') {
      try { 보낼 = { ...init, body: JSON.stringify(본문잠그기(표, JSON.parse(init.body))) }; } catch { /* JSON 이 아니면 그대로 */ }
    }
    let r = await 원래(input, 보낼);
    /* 0041 SQL 전이라 phone_idx 칸이 없으면 색인 없이 한 번 더 - 접수가 막히지 않게 */
    if (!r.ok && 보낼 !== init && 표 === 'bk_agent' && /phone_idx/.test(await r.clone().text().catch(() => ''))) {
      try { const b = JSON.parse(보낼.body); const 빼기 = x => { if (x && typeof x === 'object') delete x.phone_idx; return x; };
        r = await 원래(input, { ...보낼, body: JSON.stringify(Array.isArray(b) ? b.map(빼기) : 빼기(b)) }); } catch { /* 그대로 */ }
    }
    if (원문 || [101, 204, 205, 304].includes(r.status) || !/json/i.test(r.headers.get('content-type') || '')) return r;
    const 글 = await r.text();
    if (!글.includes(머리)) return new Response(글, { status: r.status, statusText: r.statusText, headers: r.headers });
    let 풀림 = 글; try { 풀림 = JSON.stringify(깊이풀기(JSON.parse(글))); } catch { /* 그대로 */ }
    const h = new Headers(r.headers); h.delete('content-length'); h.delete('content-encoding');
    return new Response(풀림, { status: r.status, statusText: r.statusText, headers: h });
  };
}
길목깔기();
