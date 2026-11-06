/* 계약진행 대화방 (2026-11-06 · 파트너 기획 '확정하면 당사자에게 가입 초대 → 가입하면 계약진행 채팅방')
 *
 * ── 어떻게 ──
 *  ① 중개사가 날인본 계약서에서 당사자(매도인 · 매수인 · 임대인 · 임차인 …)마다 초대 링크를 만든다(14일).
 *     링크는 문자 · 카톡으로 보낸다(심사 통과한 알림톡 틀이 있으면 그것으로도 - SOLAPI_TPL_INVITE).
 *  ② 손님이 링크를 열고 로그인하면 그 자리(side)에 손님 계정이 묶인다 - 한 자리에 한 계정.
 *  ③ **방은 당사자마다 따로다** (2026-11-07 대표님 '나'). 매도인 방 · 매수인 방이 나뉘고, 중개사만 양쪽을 본다.
 *     손님은 자기 방에서 사무소와만 말한다 - 상대 당사자의 말 · 이름 · 연락처는 보이지 않는다.
 *  ④ 새 말이 오면 상대에게 메일(손님 → 사무소, 사무소 → 그 방의 손님 한 분). 알림톡 틀(SOLAPI_TPL_ROOM)이 있으면 손님에게 카톡도.
 *
 * ── 저장 ──
 *  방 구성(누가 어느 자리에 들어왔나 · 링크 번호)은 계약서 track.room 에, 대화는 bk_contract_msg 표(0034)에.
 *  말마다 thread(어느 당사자 방인지 - 0035)를 적는다. side 는 말한 쪽(agent 또는 당사자 자리).
 *  room.n 을 올리면 나간 초대 링크가 모두 끊기고, room.c[자리] 를 올리면 그 자리의 링크만 끊긴다(내보내기).
 *
 * 중개보조원도 대화는 한다(기획 '보조원은 매칭 관리 · 채팅 가능'). 초대 링크 만들기 · 내보내기는 공인중개사만. */
import crypto from 'node:crypto';
import { sbHeaders, sbUrl, emailOf, sameSecret, overLimit } from './_auth.js';
import { trackCheck, track고치기 } from './_contract.js';
import { notify } from './_notify.js';
import { alimtalk } from './_kakao.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const 자리이름 = { seller: '매도인', buyer: '매수인', lessor: '임대인', lessee: '임차인', sublessor: '전대인', subtenant: '전차인', assignor: '양도인', assignee: '양수인' };
const 자리들 = Object.keys(자리이름);
export const 말최대 = 1000;
const 지금 = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 19);

async function db(path, q, init = {}) {
  const r = await fetch(sbUrl(path, q), { ...init, headers: { ...sbHeaders(), ...(init.headers || {}) } });
  const t = r.ok ? null : await r.text();
  return { r, t, rows: r.ok ? await r.json().catch(() => []) : [] };
}
/* 표가 없으면 0034, thread 칸이 없으면 0035 */
const 표없음 = t => /bk_contract_msg|thread|relation .* does not exist|PGRST20[45]|42703/.test(String(t || ''));
const 준비중 = (res, t) => { const 칸 = /thread|42703|PGRST204/.test(String(t || '')) && !/relation .* does not exist|PGRST205/.test(String(t || ''));
  return res.status(503).json({ error: `대화방을 준비 중입니다 (${칸 ? '0035' : '0034'} 마이그레이션 필요)`, need: 칸 ? '0035' : '0034' }); };

/* ── 초대 표 ── R2.계약서.자리.기한.링크번호.자리끊김.서명 - 초안 표와 열쇠를 나누어 쓴다(서로 바꿔 쓸 수 없다) */
const 방열쇠 = () => crypto.createHash('sha256').update('bk-room|' + String(process.env.BK_SECRET_KEY || ''), 'utf8').digest();
const 방서명 = (id, side, until, n, c) => crypto.createHmac('sha256', 방열쇠()).update(`${id}.${side}.${until}.${n}.${c}`).digest('base64url');
export function 초대표(id, side, n = 0, c = 0, 때 = Date.now()) { const until = 때 + 14 * 864e5; return `R2.${id}.${side}.${until}.${n}.${c}.${방서명(id, side, until, n, c)}`; }
export function 초대표읽기(tok, 때 = Date.now()) {
  const m = /^R2\.([0-9a-f-]{36})\.([a-z]{3,10})\.(\d{13})\.(\d{1,6})\.(\d{1,6})\.([A-Za-z0-9_-]{43})$/.exec(String(tok || ''));
  if (!m || !UUID.test(m[1]) || !Object.hasOwn(자리이름, m[2]) || +m[3] < 때) return null;
  return sameSecret(m[6], 방서명(m[1], m[2], m[3], m[4], m[5])) ? { id: m[1], side: m[2], until: +m[3], n: +m[4], c: +m[5] } : null;
}
/* 링크가 아직 살아 있나 - 전체 링크 번호와 그 자리의 끊김 횟수가 둘 다 맞아야 */
const 자리끊김 = (방, side) => ((방.c || {})[side]) || 0;
const 링크맞음 = (방, t) => (방.n || 0) === t.n && 자리끊김(방, t.side) === t.c;

/* 말 다듬기 - 제어 문자를 걷고 1000자. 주민등록번호 모양은 받지 않는다(대화가 남는다) */
const 주민번호 = /\d{6}\s*-\s*[1-8]\d{6}/;
export function 말다듬기(v) {
  const t = String(v || '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').trim().slice(0, 말최대);
  if (!t) return { error: '보낼 말을 적어 주세요' };
  if (주민번호.test(t)) return { error: '주민등록번호는 대화에 적지 말아 주세요 - 계약서에만 적습니다' };
  return { text: t };
}

/* 계약서 한 장 - 방에 쓰는 것만 */
const 방열 = 'id,agent_id,agent_user,form,title,status,track,doc_parties:doc->parties,cd:doc->>contractDate,md:doc->deal->>midDate,bd:doc->deal->>balanceDate,road:doc->property->>road';
async function 계약(id, 조건 = '') {
  const x = await db('bk_contract', `select=${방열}&id=eq.${id}${조건}&limit=1`);
  return x.r.ok ? (x.rows[0] || null) : { 오류: x.t };
}
const 방값 = row => ((trackCheck(row.track || {}) || {}).room) || { n: 0 };
/* 손님에게 보이는 일정 - 계약서에 적힌 날짜와 사무소가 체크한 것 */
function 일정(row) {
  const t = trackCheck(row.track || {}) || {};
  const 오늘 = 지금().slice(0, 10);
  /* track 의 midDate · balanceDate 는 '치른 날' 이다(일정·체크 탭) - 있으면 끝난 단계 */
  return [['계약일', row.cd, row.cd && row.cd <= 오늘], ['중도금', row.md, !!t.midDate], ['잔금', row.bd, !!t.balanceDate || t.state === 'done']]
    .filter(([, d]) => d).map(([이름, 날, 됨]) => ({ 이름, 날, ...(됨 ? { 됨: true } : {}) }));
}
/* 당사자 이름(계약서에 적힌 것) - 중개사 화면의 방 이름에 쓴다. 손님에게는 내보내지 않는다 */
const 당사자이름 = (row, side) => String(((row.doc_parties || {})[side] || {}).name || '').slice(0, 20);
const 당사자번호 = (row, side) => String(((row.doc_parties || {})[side] || {}).phone || '');
const 당사자있음 = (row, side) => Object.hasOwn(자리이름, side) && !!(row.doc_parties || {})[side];

async function 사무소(agentId) {
  const x = await db('bk_agent', `select=id,office,phone,user_id&id=eq.${agentId}&limit=1`);
  return x.rows[0] || {};
}
/* 한 방(계약서 · 당사자)의 말. 처음 열 때는 최근 300개(오래된 것부터 보이게 뒤집는다), 다음부터는 마지막 번호 뒤만 */
async function 말읽기(id, thread, 뒤 = 0) {
  const 곳 = `select=id,side,name,body,created_at&contract_id=eq.${id}&thread=eq.${thread}`;
  if (뒤) return db('bk_contract_msg', `${곳}&id=gt.${뒤}&order=id.asc&limit=300`);
  const x = await db('bk_contract_msg', `${곳}&order=id.desc&limit=300`);
  return { ...x, rows: x.rows.slice().reverse() };
}
/* 알림 메일은 받는 사람마다 방 하나에 10분에 한 통 - 말을 여러 번 나눠 보내도 메일함이 넘치지 않게 */
const 메일때 = (방, 누구) => !overLimit(`roommail:${방}:${누구}`, 1, 600e3);
async function 말쓰기(row, thread, side, user, name, text) {
  return db('bk_contract_msg', '', { method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ contract_id: row.id, agent_id: row.agent_id, thread, side, user_id: user ? user.id : null, name: name || null, body: text }) });
}
const 줄인말 = v => ({ id: v.id, side: v.side, body: String(v.body || '').slice(0, 60), at: v.created_at });

/* ════════ 중개사 쪽 (feed.js 가 부른다 - 직원도 대표 사무소로 온다) ════════ */
export async function roomAgent(req, res, agent, user, b) {
  const id = String(b.id || '');
  const 보조원 = !!(agent.staff && agent.staff.role === 'assistant');
  if (b.what === 'rooms') {
    /* 방이 있는 계약서 - 초대했거나 누가 들어온 날인본. 계약서 한 장에 당사자 수만큼 방이 있다 */
    const x = await db('bk_contract', `select=id,title,form,status,track,doc_parties:doc->parties,road:doc->property->>road&agent_id=eq.${agent.id}&status=eq.sealed&track->room=not.is.null&order=updated_at.desc&limit=100`);
    if (!x.r.ok) return res.status(502).json({ error: '대화방 목록을 불러오지 못했습니다' });
    const ids = x.rows.map(r => r.id);
    const 마지막 = {};
    const 담기 = rows => { for (const v of rows) { const k = `${v.contract_id}:${v.thread}`; if (!마지막[k]) 마지막[k] = 줄인말(v); } };
    if (ids.length) {
      /* 사무소의 최근 말 1000개로 대부분 채우고, 그 안에 하나도 없는 계약서만 따로 묻는다(30장까지) - 뜸한 방의 마지막 말이 비지 않게 */
      const m = await db('bk_contract_msg', `select=contract_id,thread,id,side,body,created_at&agent_id=eq.${agent.id}&contract_id=in.(${ids.join(',')})&order=id.desc&limit=1000`);
      if (!m.r.ok) { if (표없음(m.t)) return 준비중(res, m.t); return res.status(502).json({ error: '대화방 목록을 불러오지 못했습니다' }); }
      담기(m.rows);
      if (m.rows.length >= 1000) {
        const 본 = new Set(m.rows.map(v => v.contract_id));
        const 더 = await Promise.all(ids.filter(c => !본.has(c)).slice(0, 30).map(c =>
          db('bk_contract_msg', `select=contract_id,thread,id,side,body,created_at&contract_id=eq.${c}&order=id.desc&limit=100`)));
        for (const y of 더) 담기(y.rows || []);
      }
    }
    const rows = [];
    for (const r of x.rows) { const 방 = 방값(r);
      for (const k of 자리들) if ((r.doc_parties || {})[k]) rows.push({ id: r.id, side: k, title: r.title || r.road || '', form: r.form,
        name: 당사자이름(r, k), joined: !!(방[k] && 방[k].uid), at: 방[k] ? 방[k].at : '', last: 마지막[`${r.id}:${k}`] || null }); }
    return res.status(200).json({ ok: true, rows });
  }
  if (!UUID.test(id)) return res.status(400).json({ error: '어느 계약서인지 알 수 없습니다' });
  const row = await 계약(id, `&agent_id=eq.${agent.id}`);
  if (row && row.오류) return res.status(502).json({ error: '계약서를 불러오지 못했습니다' });
  if (!row) return res.status(404).json({ error: '내 계약서가 아니거나 지워진 계약서입니다' });
  if (String(row.form || '').startsWith('explain')) return res.status(409).json({ error: '확인·설명서에는 대화방을 두지 않습니다 - 계약서에서 열어 주세요' });
  const 방 = 방값(row);
  const side = String(b.side || '');

  if (b.what === 'room') {
    if (!당사자있음(row, side)) return res.status(400).json({ error: '이 계약서에 없는 당사자입니다' });
    const m = await 말읽기(id, side, Math.max(0, +b.after || 0));
    if (!m.r.ok) return 표없음(m.t) ? 준비중(res, m.t) : res.status(502).json({ error: '대화를 불러오지 못했습니다' });
    return res.status(200).json({ ok: true, side, title: row.title || row.road || '계약', name: 당사자이름(row, side),
      joined: !!(방[side] && 방[side].uid), sealed: row.status === 'sealed', steps: 일정(row), rows: m.rows });
  }
  if (b.what === 'room-send') {
    if (!당사자있음(row, side)) return res.status(400).json({ error: '이 계약서에 없는 당사자입니다' });
    if (overLimit('room:a:' + user.id, 60, 600e3)) return res.status(429).json({ error: '잠시 뒤 다시 보내 주세요' });
    const 말 = 말다듬기(b.text); if (말.error) return res.status(400).json({ error: 말.error });
    const 손님 = 방[side] && 방[side].uid;
    if (!손님) return res.status(409).json({ error: `${자리이름[side]}이 아직 들어오지 않았습니다 - 먼저 초대 링크를 보내 주세요` });
    const 이름 = (agent.staff && agent.staff.name) || agent.name || agent.office || '중개사무소';
    const w = await 말쓰기(row, side, 'agent', user, 이름, 말.text);
    if (!w.r.ok) return 표없음(w.t) ? 준비중(res, w.t) : res.status(502).json({ error: '보내지 못했습니다' });
    /* 이 방의 손님 한 분에게만 메일(과 카톡) - 실패해도 말은 남는다 */
    if (메일때(`${row.id}:${side}`, 손님)) {
      const 메일 = await emailOf(손님).catch(() => null);
      if (메일) await notify(req, { to: 메일, subject: `${agent.office || '중개사무소'}에서 새 말이 왔습니다`,
        rows: [['계약', row.title || row.road || '계약'], ['보낸 곳', agent.office || '-']], link: `/#/room/${row.id}`, cta: '대화방 열기',
        note: '대화 내용은 비버노크에 로그인해서 보세요. 이 메일에는 담지 않습니다.' }).catch(() => null);
      if (process.env.SOLAPI_TPL_ROOM) await alimtalk({ to: 당사자번호(row, side), template: process.env.SOLAPI_TPL_ROOM,
        vars: { 사무소: agent.office || '중개사무소', 방: row.id } }).catch(() => null);   /* 버튼 주소 https://beaverknock.co.kr/#/room/#{방} - 소재지 · 말 내용은 싣지 않는다 */
    }
    return res.status(200).json({ ok: true, row: w.rows[0] || null });
  }
  /* 아래는 공인중개사만 - 보조원은 대화만 */
  if (보조원) return res.status(403).json({ error: '초대 · 내보내기는 공인중개사가 합니다' });
  if (b.what === 'room-invite') {
    if (row.status !== 'sealed') return res.status(409).json({ error: '날인본으로 확정한 뒤에 손님을 초대합니다' });
    if (!당사자있음(row, side)) return res.status(400).json({ error: '이 계약서에 없는 당사자입니다' });
    if (방[side] && 방[side].uid) return res.status(409).json({ error: `${자리이름[side]}은 이미 들어와 있습니다` });
    /* 방이 처음이면 track.room 을 만든다(목록에 '대화방' 이 생긴다) */
    let 지금방 = 방;
    if (!row.track || !(trackCheck(row.track) || {}).room) {
      const z = await track고치기(id, agent, (n, 지금값) => ({ ...지금값, room: { ...(지금값.room || { n: 0 }) } }));
      if (z.res) return z.res(res, '대화방을 만들지 못했습니다');
      지금방 = z.track.room || 방;
    }
    const tok = 초대표(id, side, 지금방.n || 0, 자리끊김(지금방, side));
    /* 알림톡 초대 - 심사 통과한 틀이 있고, 사무소가 보내라고 했을 때만(b.kakao). 없으면 화면이 문자 · 카톡 공유로 보낸다 */
    let kakao = null;
    if (b.kakao && process.env.SOLAPI_TPL_INVITE) {
      const 사 = await 사무소(agent.id);
      kakao = await alimtalk({ to: 당사자번호(row, side), template: process.env.SOLAPI_TPL_INVITE,
        vars: { 이름: 당사자이름(row, side) || '고객', 사무소: 사.office || agent.office || '중개사무소', 표: tok } }).catch(() => null);   /* 버튼 주소 https://beaverknock.co.kr/#/invite/#{표} */
    }
    return res.status(200).json({ ok: true, token: tok, until: +tok.split('.')[3], room: 지금방, kakaoReady: !!process.env.SOLAPI_TPL_INVITE, ...(b.kakao ? { kakao: !!(kakao && kakao.ok) } : {}) });
  }
  if (b.what === 'room-cut') {
    /* side 를 주면 그 자리만(손님을 내보내고 그 자리로 나간 링크를 끊는다), 없으면 나간 초대 링크를 모두 끊는다 */
    const 하나 = Object.hasOwn(자리이름, side);
    const z = await track고치기(id, agent, (n, 지금값) => { const r0 = { ...(지금값.room || { n: 0 }) };
      if (하나) { delete r0[side]; r0.c = { ...(r0.c || {}), [side]: 자리끊김(r0, side) + 1 }; }
      else r0.n = (r0.n || 0) + 1;
      return { ...지금값, room: r0 }; });
    if (z.res) return z.res(res, '링크를 끊지 못했습니다');
    return res.status(200).json({ ok: true, room: z.track.room });
  }
  return res.status(400).json({ error: '알 수 없는 요청입니다' });
}

/* ════════ 손님 쪽 (my.js 가 부른다 - 로그인한 손님) ════════ */
/* 초대 미리 보기 - 로그인 전에도(링크만으로). 사무소 이름 · 물건 · 내 자리만 보여 준다 */
export async function invitePeek(res, tok) {
  const t = 초대표읽기(tok);
  if (!t) return res.status(404).json({ error: '초대 링크가 맞지 않거나 기한(14일)이 지났습니다 - 중개사무소에 다시 받아 주세요' });
  const row = await 계약(t.id);
  if (!row || row.오류) return res.status(404).json({ error: '계약서를 찾지 못했습니다' });
  const 방 = 방값(row);
  if (!링크맞음(방, t)) return res.status(404).json({ error: '중개사무소가 이 링크를 끊었습니다 - 새 링크를 받아 주세요' });
  const 사 = await 사무소(row.agent_id);
  return res.status(200).json({ ok: true, office: 사.office || '중개사무소', title: row.title || row.road || '계약', side: t.side, role: 자리이름[t.side],
    joined: !!(방[t.side] && 방[t.side].uid), until: t.until });
}

export async function roomGuest(req, res, user, b) {
  if (b.what === 'invite-join') {
    if (overLimit('room:j:' + user.id, 20, 600e3)) return res.status(429).json({ error: '잠시 뒤 다시 해 주세요' });
    const t = 초대표읽기(b.token);
    if (!t) return res.status(404).json({ error: '초대 링크가 맞지 않거나 기한(14일)이 지났습니다 - 중개사무소에 다시 받아 주세요' });
    let 이미 = false;
    const z = await track고치기(t.id, null, (n, 지금값) => {
      const 방 = { ...(지금값.room || { n: 0 }) };
      if (!링크맞음(방, t)) return { 거절: '중개사무소가 이 링크를 끊었습니다 - 새 링크를 받아 주세요', code: 404 };
      if (방[t.side] && 방[t.side].uid) { if (방[t.side].uid === user.id) { 이미 = true; return { ...지금값 }; } return { 거절: '이 자리에는 이미 다른 분이 들어와 있습니다 - 중개사무소에 말씀해 주세요', code: 409 }; }
      방[t.side] = { uid: user.id, at: 지금() };
      return { ...지금값, room: 방 };
    });
    if (z.res) return z.res(res, '대화방에 들어가지 못했습니다');
    return res.status(200).json({ ok: true, id: t.id, already: 이미 });
  }
  if (b.what === 'my-rooms') {
    /* 내가 든 방 - track.room 의 어느 자리에 내 계정이 있는 계약서. 자리가 여덟 가지라 하나씩 물어 합친다 */
    const 찾기 = await Promise.all(자리들.map(k => db('bk_contract',
      `select=id,agent_id,title,form,status,track,cd:doc->>contractDate,md:doc->deal->>midDate,bd:doc->deal->>balanceDate,road:doc->property->>road&track->room->${k}->>uid=eq.${user.id}&limit=50`)));
    const 본 = new Map();
    for (const x of 찾기) for (const r of x.rows || []) 본.set(r.id, r);
    const rows = [...본.values()];
    const 사무소들 = Object.fromEntries(await Promise.all([...new Set(rows.map(r => r.agent_id))].map(async a => [a, await 사무소(a)])));
    return res.status(200).json({ ok: true, rows: rows.map(r => { const 방 = 방값(r); const side = 자리들.find(k => 방[k] && 방[k].uid === user.id);
      return { id: r.id, title: r.title || r.road || '계약', office: (사무소들[r.agent_id] || {}).office || '중개사무소', role: 자리이름[side], steps: 일정(r) }; }) });
  }
  const id = String(b.id || '');
  if (!UUID.test(id)) return res.status(400).json({ error: '어느 대화방인지 알 수 없습니다' });
  const row = await 계약(id);
  if (!row || row.오류) return res.status(404).json({ error: '대화방을 찾지 못했습니다' });
  const 방 = 방값(row);
  const side = 자리들.find(k => 방[k] && 방[k].uid === user.id);
  if (!side) return res.status(403).json({ error: '이 대화방에 초대받지 않았거나 중개사무소가 내보냈습니다', gone: true });
  if (b.what === 'my-room') {
    /* 내 방(내 자리)의 말만 - 상대 당사자의 방은 보이지 않는다 */
    const m = await 말읽기(id, side, Math.max(0, +b.after || 0));
    if (!m.r.ok) return 표없음(m.t) ? 준비중(res, m.t) : res.status(502).json({ error: '대화를 불러오지 못했습니다' });
    const 사 = await 사무소(row.agent_id);
    return res.status(200).json({ ok: true, me: side, role: 자리이름[side], title: row.title || row.road || '계약', office: 사.office || '중개사무소',
      officePhone: 사.phone || '', steps: 일정(row), rows: m.rows.map(v => ({ id: v.id, side: v.side, name: v.side === 'agent' ? v.name : 자리이름[v.side], body: v.body, created_at: v.created_at })) });
  }
  if (b.what === 'my-room-send') {
    if (overLimit('room:g:' + user.id, 30, 600e3)) return res.status(429).json({ error: '잠시 뒤 다시 보내 주세요' });
    const 말 = 말다듬기(b.text); if (말.error) return res.status(400).json({ error: 말.error });
    const w = await 말쓰기(row, side, side, user, 자리이름[side], 말.text);
    if (!w.r.ok) return 표없음(w.t) ? 준비중(res, w.t) : res.status(502).json({ error: '보내지 못했습니다' });
    /* 사무소에 메일 - 계약서를 쓴 계정과 대표 계정(같으면 한 번) */
    const 사 = await 사무소(row.agent_id);
    const 받을 = [...new Set([row.agent_user, 사.user_id].filter(Boolean))];
    await Promise.all(받을.map(async u => { if (!메일때(`${row.id}:${side}`, u)) return; const 메일 = await emailOf(u).catch(() => null);
      if (메일) await notify(req, { to: 메일, subject: `${자리이름[side]}님이 대화방에 말을 남겼습니다`,
        rows: [['계약', row.title || row.road || '계약'], ['보낸 분', `${자리이름[side]} ${당사자이름(row, side)}`.trim()]], link: `/#/partner/rooms/${row.id}/${side}`, cta: '대화방 열기',
        note: '대화 내용은 파트너 화면에서 보세요.' }).catch(() => null); }));
    return res.status(200).json({ ok: true, row: w.rows[0] || null });
  }
  return res.status(400).json({ error: '알 수 없는 요청입니다' });
}
