/* 중개사 계약서 (2026-10-29).
 *
 * 중개사가 양식을 골라 고치고 기본 정보를 채워 **인쇄**한다. 만나서 수기·날인하는 것이 지금
 * 현실이라 전자서명은 하지 않는다. 날인받은 판은 '날인본' 으로 확정해 잠근다 - 나중에 거래신고를
 * 그 판에서 출발시키려는 것이다(01_기획/계약서_거래신고_방향.md).
 *
 * 파트너 API(feed.js) 안에서 부른다. 함수 상한(12개) 때문에 새 경로를 만들지 않는다.
 * api/ 안에서 _ 로 시작하므로 라우트가 되지 않는다.
 *
 * 원칙 셋.
 *  ① 회사는 양식·작성 도구만 준다. 내용과 신고 책임은 작성한 중개사에게 있다(약관 제N조).
 *  ② 주민등록번호·계좌번호는 담지 않는다. 그 칸은 인쇄할 때 빈칸으로 나가 손으로 적는다.
 *     화면이 안 보내도 바로 찔러 넣는 길이 있으므로 여기서 한 번 더 막는다.
 *  ③ 날인본은 고치지도 지우지도 않는다. 고치려면 새 판을 만든다(DB 트리거도 막는다, 0031).
 *
 * 내부 표준은 스키마 버전이 붙은 JSON 하나다(bk-contract/1). 소재지는 주소 검색 결과
 * (법정동코드·본번·부번·산)를 그대로 담는다 - 나중에 어디로 보내더라도 보낼 때 바꿀 것이 없게.
 */
import crypto from 'node:crypto';
import { sbHeaders, sbUrl, emailOf } from './_auth.js';
import { notifyMany } from './_notify.js';
import { alimtalk } from './_kakao.js';

/* 주택임대차 · 상가건물 임대차 · 부동산 매매 · 중개대상물 확인·설명서(주거용) (화면의 CT_FORMS 와 같은 이름) */
/* 2026-10-30 계약서 종류 - 부동산 임대차(전세·월세·연세) · 전대차 · 분양권 · 조합원입주권 · 권리양도양수 · 상가 권리금 */
export const CT_FORMS = ['home-lease', 'shop-lease', 'sale', 'lease', 'sublease', 'presale', 'union', 'rights', 'premium',
  'explain-home', 'explain-biz', 'explain-land', 'explain-etc'];
export const CT_SCHEMA = 'bk-contract/1';
const CT_MAX = 64 * 1024;                     /* 계약서 한 장 - 조항·특약을 넉넉히 적어도 이 안이다 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/* 목록에서 찾고(당사자 이름) 문서 이름을 짓는 데(세부 종류·거래유형) 쓰는 값은 doc 에서 꺼내 같이 준다 - doc 통째로는 무겁다 */
const LIST_COLS = 'id,created_at,updated_at,form,title,status,sealed_at,sha256,prev_id,proposal_id,reported_at,'
  + 'cat:doc->>cat,sub:doc->>sub,dt:doc->deal->>type,parties:doc->parties,renew:doc->renewOf';
/* 신고가 있는 양식 - 매매(거래신고) · 주택임대차(임대차 신고). 상가 임대차·확인·설명서는 신고가 없다 */
export const CT_REPORT_FORMS = ['sale', 'home-lease', 'lease'];
/* 부동산 임대차('lease')는 주거 세부 종류일 때만 임대차 신고 대상이다 - 화면의 ct신고 와 같은 규칙 */
const 주거종류 = ['아파트','주상복합','연립주택','다세대주택','다가구주택','다중주택','도시형생활주택','주택','오피스텔','원룸'];
export const 신고대상 = (form, doc) => {
  if (form !== 'lease') return CT_REPORT_FORMS.includes(form);
  const s = String((doc && doc.sub) || '').trim();
  return 주거종류.includes(s) || (/주택|아파트|빌라|원룸|오피스텔|주상복합/.test(s) && !/상가/.test(s));
};

const noTable = t => /does not exist|PGRST205|bk_contract/i.test(t);
const 준비중 = res => res.status(503).json({ error: '계약서 기능을 준비 중입니다 (0031 마이그레이션 필요)', need: '0031' });

/* 주민등록번호(외국인등록번호 포함) 모양 - 앞 6자리 생년월일 + 성별 숫자 1~8 + 6자리.
   앞 6자리는 붙어 있어야 하고, 6자리와 7자리 사이에만 구분자(하이픈·대시·점·밑줄·빗금, 앞뒤 공백 허용)를 둔다.
   뒤 7자리 안에는 한 칸 띄어쓰기만 허용한다('900101-1 234567'). 전각 숫자는 NFKC 로 바꿔 본다.
   아무 구분자나 허용하면 '010-1234-5678, 25일' 처럼 전화번호 뒤 숫자가 이어져 잘못 잡혔다(2026-10-29 리뷰).
   그 뒤 생년월일·성별 자리가 말이 되는지 본다. 생년월일 6자리만 적은 것은 잡지 않는다. */
const 열세자리 = /(?<!\d)\d{6}\s*[-‐‑‒–—―.·_/]?\s*[1-8](?: ?\d){6}(?!\d)/gu;
function 주민모양(s) {
  const t = String(s).normalize('NFKC');
  for (const m of t.matchAll(열세자리)) {
    const d = m[0].replace(/\D/g, '');
    const 월 = +d.slice(2, 4), 일 = +d.slice(4, 6), 성 = +d[6];
    if (월 >= 1 && 월 <= 12 && 일 >= 1 && 일 <= 31 && 성 >= 1 && 성 <= 8) return true;
  }
  return false;
}

/* 값 전부를 훑는다 - 어느 칸에 적었든(특약 글 안이든, 숫자로든, 키로든) 잡는다 */
export function 주민번호있나(v) {
  if (typeof v === 'string') return 주민모양(v);
  if (typeof v === 'number' || typeof v === 'bigint') return 주민모양(String(v));
  if (Array.isArray(v)) return v.some(주민번호있나);
  if (v && typeof v === 'object') return Object.keys(v).some(주민모양) || Object.values(v).some(주민번호있나);
  return false;
}

/* 지문을 낼 때 키 순서가 달라 지문이 달라지면 안 된다 - 키를 정렬해 적는다 */
export function 정렬JSON(v) {
  if (Array.isArray(v)) return '[' + v.map(정렬JSON).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + 정렬JSON(v[k])).join(',') + '}';
  }
  return JSON.stringify(v ?? null);
}
export const 지문 = doc => crypto.createHash('sha256').update(정렬JSON(doc)).digest('hex');

/* 받은 doc 을 확인한다. 고쳐 주지 않고 틀리면 돌려보낸다 - 무엇이 저장됐는지 중개사가 알아야 한다. */
export function docCheck(form, doc) {
  if (!CT_FORMS.includes(form)) return '어떤 양식인지 알 수 없습니다';
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return '계약서 내용이 비어 있습니다';
  if (doc.schema !== CT_SCHEMA) return '계약서 형식이 맞지 않습니다 - 화면을 새로고침해 주세요';
  if (doc.form !== form) return '양식과 내용이 맞지 않습니다';
  if (Buffer.byteLength(JSON.stringify(doc), 'utf8') > CT_MAX) return '계약서가 너무 깁니다 - 특약을 줄여 주세요';
  if (주민번호있나(doc)) return '주민등록번호는 적지 않습니다 - 인쇄한 뒤 손으로 적어 주세요';
  return null;
}

const titleOf = (b, doc) => String(b.title || (doc.property && doc.property.road) || '').trim().slice(0, 80);

async function db(path, q, init = {}) {
  const r = await fetch(sbUrl(path, q), { ...init, headers: { ...sbHeaders(), ...(init.headers || {}) } });
  const t = r.ok ? null : await r.text();
  return { r, t, rows: r.ok ? await r.json().catch(() => []) : [] };
}

/* 돌려주는 값: 처리했으면 true. feed.js 는 false 면 다음 갈래로 넘어간다. */
export async function contractRoute(req, res, agent, user, b) {
  if (!String(b.what || '').startsWith('contract')) return false;
  /* 공인중개사만. 소유자·시행사는 계약서를 쓰는 사람이 아니다. 승인 전이어도 쓴다(대표님 10/29). */
  if (agent.role !== 'agent') { res.status(403).json({ error: '공인중개사만 쓸 수 있습니다' }); return true; }
  try {
    switch (b.what) {
      case 'contracts':        await list(res, agent); break;
      case 'contract':         await one(res, agent, b); break;
      case 'contract-save':    await save(res, agent, user, b); break;
      case 'contract-seal':    await seal(res, agent, b); break;
      case 'contract-revise':  await revise(res, agent, user, b); break;
      case 'contract-del':     await del(res, agent, b); break;
      case 'contract-reported': await reported(res, agent, b); break;
      case 'contract-track':   await track(res, agent, b); break;
      case 'contract-scan':    await scan(res, b); break;
      default: res.status(400).json({ error: '알 수 없는 요청입니다' });
    }
  } catch (e) {
    res.status(502).json({ error: 'DB에 닿지 못했습니다' });
  }
  return true;
}

async function list(res, agent) {
  const { r, t, rows, no32 } = await 읽기(`select=${LIST_COLS}${일정열}{track}&agent_id=eq.${agent.id}&order=updated_at.desc&limit=200`);
  if (!r.ok) return noTable(t) ? 준비중(res) : res.status(502).json({ error: '계약서 목록을 불러오지 못했습니다' });
  return res.status(200).json({ ok: true, rows, ...(no32 ? { need32: true } : {}) });
}

async function one(res, agent, b) {
  const id = String(b.id || '');
  if (!UUID.test(id)) return res.status(400).json({ error: '어느 계약서인지 알 수 없습니다' });
  const { r, t, rows, no32 } = await 읽기(`select=${LIST_COLS},doc{track}&id=eq.${id}&agent_id=eq.${agent.id}&limit=1`);
  if (!r.ok) return noTable(t) ? 준비중(res) : res.status(502).json({ error: '계약서를 불러오지 못했습니다' });
  if (!rows.length) return res.status(404).json({ error: '내 계약서가 아니거나 지워진 계약서입니다' });
  return res.status(200).json({ ok: true, row: rows[0], ...(no32 ? { need32: true } : {}) });
}

async function save(res, agent, user, b) {
  const form = String(b.form || '');
  const doc = b.doc;
  const why = docCheck(form, doc);
  if (why) return res.status(400).json({ error: why });
  const body = { form, schema: CT_SCHEMA, title: titleOf(b, doc), doc };

  if (b.id) {
    const id = String(b.id);
    if (!UUID.test(id)) return res.status(400).json({ error: '어느 계약서인지 알 수 없습니다' });
    /* 작성 중인 내 계약서만 고친다. 날인본이면 0행이 나온다 */
    const { r, t, rows } = await db('bk_contract', `id=eq.${id}&agent_id=eq.${agent.id}&status=eq.draft`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body),
    });
    if (!r.ok) return noTable(t) ? 준비중(res) : res.status(502).json({ error: '저장하지 못했습니다' });
    if (!rows.length) return res.status(409).json({ error: '날인본이거나 지워진 계약서라 고칠 수 없습니다 - 새 판을 만드세요' });
    return res.status(200).json({ ok: true, id, updated_at: rows[0].updated_at });
  }

  /* 갱신계약 - 앞 계약서는 내 것일 때만 잇는다. 앞 계약서는 건드리지 않는다(새 행) */
  let prev = null;
  if (UUID.test(String(b.prev_id || ''))) {
    const p = await db('bk_contract', `select=id&id=eq.${b.prev_id}&agent_id=eq.${agent.id}&limit=1`);
    if (p.r.ok && p.rows.length) prev = b.prev_id;
  }
  /* 연결된 제안은 내 제안일 때만 잇는다 - 남의 제안 번호를 적어 와도 그 손님과 엮이지 않게 */
  let proposal = null;
  if (UUID.test(String(b.proposal_id || ''))) {
    const p = await db('bk_proposal', `select=id&id=eq.${b.proposal_id}&agent_id=eq.${agent.id}&limit=1`);
    if (p.r.ok && p.rows.length) proposal = b.proposal_id;
  }
  const { r, t, rows } = await db('bk_contract', '', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ ...body, agent_id: agent.id, agent_user: user.id, proposal_id: proposal, ...(prev ? { prev_id: prev } : {}) }),
  });
  if (!r.ok) return noTable(t) ? 준비중(res) : res.status(502).json({ error: '저장하지 못했습니다' });
  return res.status(200).json({ ok: true, id: rows[0] && rows[0].id, updated_at: rows[0] && rows[0].updated_at });
}

/* 날인본으로 확정 - 지금 저장된 doc 의 지문을 서버가 내고 잠근다.
   화면이 보낸 지문을 믿지 않는다. 저장되지 않은 고침이 있으면 화면이 먼저 저장한다. */
async function seal(res, agent, b) {
  const id = String(b.id || '');
  if (!UUID.test(id)) return res.status(400).json({ error: '어느 계약서인지 알 수 없습니다' });
  const got = await db('bk_contract', `select=id,status,doc,updated_at&id=eq.${id}&agent_id=eq.${agent.id}&limit=1`);
  if (!got.r.ok) return noTable(got.t) ? 준비중(res) : res.status(502).json({ error: '계약서를 불러오지 못했습니다' });
  const row = got.rows[0];
  if (!row) return res.status(404).json({ error: '내 계약서가 아니거나 지워진 계약서입니다' });
  if (row.status === 'sealed') return res.status(409).json({ error: '이미 날인본입니다' });
  const why = docCheck(row.doc && row.doc.form, row.doc);
  if (why) return res.status(400).json({ error: why });

  /* 읽은 뒤 다른 창에서 저장이 들어오면 지문과 잠기는 doc 이 어긋난다 -
     읽었을 때의 updated_at 그대로일 때만 잠근다(저장하면 트리거가 updated_at 을 바꾼다) */
  const sha256 = 지문(row.doc);
  const { r, rows } = await db('bk_contract',
    `id=eq.${id}&agent_id=eq.${agent.id}&status=eq.draft&updated_at=eq.${encodeURIComponent(row.updated_at || '')}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ status: 'sealed', sealed_at: new Date().toISOString(), sha256 }),
  });
  if (!r.ok) return res.status(502).json({ error: '날인본으로 확정하지 못했습니다' });
  if (!rows.length) return res.status(409).json({ error: '그 사이 다른 곳에서 고쳐졌거나 확정·삭제됐습니다 - 다시 열어 확인해 주세요' });
  return res.status(200).json({ ok: true, sealed_at: rows[0].sealed_at, sha256 });
}

/* 날인본을 고쳐야 하면 그 판을 그대로 두고 새 판(작성 중)을 만든다 */
async function revise(res, agent, user, b) {
  const id = String(b.id || '');
  if (!UUID.test(id)) return res.status(400).json({ error: '어느 계약서인지 알 수 없습니다' });
  const got = await db('bk_contract', `select=id,form,title,doc,proposal_id&id=eq.${id}&agent_id=eq.${agent.id}&limit=1`);
  if (!got.r.ok) return noTable(got.t) ? 준비중(res) : res.status(502).json({ error: '계약서를 불러오지 못했습니다' });
  const old = got.rows[0];
  if (!old) return res.status(404).json({ error: '내 계약서가 아니거나 지워진 계약서입니다' });
  const { r, rows } = await db('bk_contract', '', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ form: old.form, schema: CT_SCHEMA, title: old.title, doc: old.doc,
      agent_id: agent.id, agent_user: user.id, prev_id: old.id, proposal_id: old.proposal_id }),
  });
  if (!r.ok) return res.status(502).json({ error: '새 판을 만들지 못했습니다' });
  return res.status(200).json({ ok: true, id: rows[0] && rows[0].id });
}

/* '신고 마침' - 날인본에서 바꿀 수 있는 유일한 칸(0031 트리거가 이것만 통과시킨다).
   on:false 면 되돌린다(잘못 눌렀을 때). 이 표시가 있으면 기한 알림이 멈춘다. */
async function reported(res, agent, b) {
  const id = String(b.id || '');
  if (!UUID.test(id)) return res.status(400).json({ error: '어느 계약서인지 알 수 없습니다' });
  const at = b.on === false ? null : new Date().toISOString();
  const { r, t, rows } = await db('bk_contract',
    `id=eq.${id}&agent_id=eq.${agent.id}&status=eq.sealed&form=in.(${CT_REPORT_FORMS.join(',')})`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ reported_at: at }),
    });
  if (!r.ok) return noTable(t) ? 준비중(res) : res.status(502).json({ error: '표시하지 못했습니다' });
  if (!rows.length) return res.status(409).json({ error: '날인본으로 확정한 매매·주택임대차 계약서만 표시할 수 있습니다' });
  return res.status(200).json({ ok: true, reported_at: at });
}

/* 신고 기한 - 계약일 다음 날부터 세어 30일째(초일 불산입). 날짜는 한국 날짜로 센다 */
export const 한국오늘 = (now = Date.now()) => new Date(now + 9 * 3600e3).toISOString().slice(0, 10);
export function 신고남은날(contractDate, 오늘 = 한국오늘()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(contractDate || ''))) return null;
  const 기한 = Date.parse(contractDate + 'T00:00:00Z') + 30 * 864e5;
  return { 기한: new Date(기한).toISOString().slice(0, 10), 남음: Math.round((기한 - Date.parse(오늘 + 'T00:00:00Z')) / 864e5) };
}
/* ── 계약 일정·알림 (2026-10-30 대표님 '카카오 알림설정') ──────────────────────────────
   일정: 토지거래허가 약정일 · 토지거래허가 승인 예정일(신청일 포함 15영업일) · 계약일 · 중도금 · 잔금 ·
         실거래(임대차) 신고 기한(계약일 + 30일) · 법무사 예약(잔금일 7~10영업일 전 - 중개사마다 바꿀 수 있다).
   체크: 잔금안내(이체한도·준비서류) · 토지거래허가 신청 · 신고 마침(reported_at).
   일정·체크는 계약서 본문(doc)이 아니라 track 칸에 둔다 - 날인본이어도 날짜는 바뀌고 체크는 늘어난다
   (0032 트리거가 날인본에서도 track 만은 통과시킨다).
   화면(비버노크_프로토타입.html)에 같은 규칙이 한 벌 더 있다 - 검사(계약서.mjs)가 둘을 맞춰 본다. */

/* 관공서 공휴일 - 「관공서의 공휴일에 관한 규정」, 대체공휴일 포함. 노동절(5/1)·제헌절(7/17)은 2026년부터 들어갔다.
   2028년은 월력요항 발표 전이라 잠정이다(국회의원 선거일 4/12 포함). 해마다 다음 해 월력요항(6월께)과
   임시공휴일 지정 때 고친다 - 남은 기간이 석 달 아래로 줄면 검사가 알린다. */
export const 공휴일 = new Set([
  '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-03-01', '2026-03-02', '2026-05-01', '2026-05-05',
  '2026-05-24', '2026-05-25', '2026-06-03', '2026-06-06', '2026-07-17', '2026-08-15', '2026-08-17', '2026-09-24',
  '2026-09-25', '2026-09-26', '2026-10-03', '2026-10-05', '2026-10-09', '2026-12-25',
  '2027-01-01', '2027-02-06', '2027-02-07', '2027-02-08', '2027-02-09', '2027-03-01', '2027-05-01', '2027-05-03',
  '2027-05-05', '2027-05-13', '2027-06-06', '2027-07-17', '2027-07-19', '2027-08-15', '2027-08-16', '2027-09-14',
  '2027-09-15', '2027-09-16', '2027-10-03', '2027-10-04', '2027-10-09', '2027-10-11', '2027-12-25', '2027-12-27',
  '2028-01-01', '2028-01-26', '2028-01-27', '2028-01-28', '2028-03-01', '2028-04-12', '2028-05-01', '2028-05-02',
  '2028-05-05', '2028-06-06', '2028-07-17', '2028-08-15', '2028-10-02', '2028-10-03', '2028-10-04', '2028-10-05',
  '2028-10-09', '2028-12-25',
]);
export const 공휴일끝 = '2028-12-31';
const 날꼴 = /^\d{4}-\d{2}-\d{2}$/;
const 날만 = v => 날꼴.test(String(v || '')) ? String(v) : '';
export const 날더하기 = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
export const 날차 = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
export const 영업일인가 = d => { const w = new Date(d + 'T00:00:00Z').getUTCDay(); return w !== 0 && w !== 6 && !공휴일.has(d); };
/* 민원 처리기간처럼 센다 - 첫날을 넣고 토요일·공휴일은 뺀다(민원 처리에 관한 법률 제19조). 신청일이 쉬는 날이면 다음 영업일이 첫날 */
export function 영업일째(시작, n) {
  let d = 시작, k = 0;
  for (let i = 0; i < 400; i++, d = 날더하기(d, 1)) if (영업일인가(d) && ++k === n) return d;
  return '';
}
/* 기준일 n영업일 전 - 기준일 자체는 세지 않는다 */
export function 영업일전(기준, n) {
  let d = 기준, k = 0;
  for (let i = 0; i < 400 && k < n; i++) { d = 날더하기(d, -1); if (영업일인가(d)) k++; }
  return d;
}
export const 날짜글 = d => { const t = new Date(d + 'T00:00:00Z');
  return `${t.getUTCFullYear()}. ${t.getUTCMonth() + 1}. ${t.getUTCDate()}.(${'일월화수목금토'[t.getUTCDay()]})`; };

export const 알림종류 = { permitDue: '토지거래허가 약정일', permitExpect: '토지거래허가 승인 예정일', contract: '계약일', mid: '중도금',
  balance: '잔금', report: '실거래신고 기한', lawyer: '법무사 예약' };
/* 며칠 전 아침에 알리는가 - 0 은 당일. 법무사 예약은 예약할 때가 시작되는 날(잔금 b영업일 전) 한 번 */
export const 알림날 = { permitDue: [3, 0], permitExpect: [0], contract: [1, 0], mid: [3, 0], balance: [7, 3, 0], report: [7, 3, 1, 0], lawyer: [0] };
/* 중개사 알림 설정 - 받는 곳(카카오톡·메일) · 끈 항목 · 법무사 예약 시점(잔금 a~b영업일 전, 기본 7~10) */
export function 알림설정(x) {
  const o = x && typeof x === 'object' ? x : {};
  const 범위 = v => { const n = Math.round(+v); return n >= 1 && n <= 20 ? n : 0; };
  let [a, b] = Array.isArray(o.lawyer) ? [범위(o.lawyer[0]), 범위(o.lawyer[1])] : [7, 10];
  if (!a || !b) [a, b] = [7, 10];
  if (a > b) [a, b] = [b, a];
  return { kakao: o.kakao !== false, mail: o.mail !== false,
    off: [...new Set((Array.isArray(o.off) ? o.off : []).filter(k => Object.hasOwn(알림종류, k)))], lawyer: [a, b] };
}
/* 계약 하나의 일정·체크(track). 날짜 칸은 ISO 날짜만, 나머지는 켜짐/꺼짐만 받는다 - 다른 것은 버린다 */
const TRACK_DATES = ['permitDue', 'permitApplied', 'midDate', 'balanceDate', 'guideAt'];
export function trackCheck(t) {
  if (!t || typeof t !== 'object' || Array.isArray(t)) return null;
  const out = {};
  for (const k of TRACK_DATES) {
    const v = t[k] == null ? '' : String(t[k]);
    if (v && !날꼴.test(v)) return null;
    if (v) out[k] = v;
  }
  if (t.permit === true) out.permit = true;
  if (t.off === true) out.off = true;
  return out;
}

/* 내 특약 문구함 (2026-10-30 대표님 - 자주 쓰는 특약을 매매·임대차·갱신계약 등으로 나눠 저장해 두고 불러 쓴다) - bk_agent.settings.phrases.
   [{ id, g(묶음), t(문구), tag(저장한 계약서의 세부 종류 - '아파트') }]. 화면의 CT_특약묶음 과 같은 묶음.
   주민등록번호가 든 문구는 받지 않는다 - 저장한 문구는 다른 계약서에 그대로 옮겨 가기 때문이다 */
export const 특약묶음 = { sale: '매매', lease: '임대차', renew: '갱신계약', etc: '기타' };
export const 특약문구최대 = 200, 특약글최대 = 1000;
const 문구번호 = /^[0-9a-f]{12}$/;
const 문구글 = v => String(v == null ? '' : v).replace(/\r\n?/g, '\n').trim();
const 문구종류 = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, 20);
/* 저장된 목록 다듬기 - 번호·글이 없거나 겹치는 것은 버리고, 모르는 묶음은 '기타' 로 */
export function 특약문구들(x) {
  const 본 = new Set(), out = [];
  for (const p of Array.isArray(x) ? x : []) {
    if (!p || typeof p !== 'object' || !문구번호.test(String(p.id)) || 본.has(p.id)) continue;
    const t = 문구글(p.t).slice(0, 특약글최대);
    if (!t) continue;
    본.add(p.id);
    out.push({ id: p.id, g: Object.hasOwn(특약묶음, p.g) ? p.g : 'etc', t, tag: 문구종류(p.tag) });
    if (out.length >= 특약문구최대) break;
  }
  return out;
}
/* 넣기(add) · 고치기(set - 묶음·문구) · 지우기(del) 하나. 목록을 통째로 받아 덮으면 다른 기기에서 넣은 것이 사라진다 - 서버가 지금 목록에 하나씩 반영한다.
   돌려주는 값: { list, id } 또는 { error, code } */
export function 특약문구고침(list, b) {
  const 지금 = 특약문구들(list), op = b && b.op;
  const 글틀림 = t => !t ? '문구가 비어 있습니다' : t.length > 특약글최대 ? `특약 한 개는 ${특약글최대}자까지 저장합니다`
    : 주민번호있나(t) ? '주민등록번호가 든 문구는 저장하지 않습니다 - 다른 계약서에도 그대로 들어갑니다' : '';
  if (op === 'add') {
    const t = 문구글(b.t), g = Object.hasOwn(특약묶음, b.g) ? b.g : 'etc', 틀림 = 글틀림(t);
    if (틀림) return { error: 틀림, code: 400 };
    if (지금.some(p => p.g === g && p.t === t)) return { error: `이미 내 특약(${특약묶음[g]})에 있는 문구입니다`, code: 409 };
    if (지금.length >= 특약문구최대) return { error: `내 특약은 ${특약문구최대}개까지 저장합니다 - 안 쓰는 문구를 지워 주세요`, code: 400 };
    const id = crypto.randomBytes(6).toString('hex');
    return { list: [...지금, { id, g, t, tag: 문구종류(b.tag) }], id };
  }
  if (op !== 'del' && op !== 'set') return { error: '알 수 없는 요청입니다', code: 400 };
  const 그것 = 지금.find(p => p.id === String(b.id == null ? '' : b.id));
  if (!그것) return { error: '이미 지운 문구입니다', code: 404 };
  if (op === 'del') return { list: 지금.filter(p => p !== 그것) };
  const 새것 = { ...그것 };
  if (b.g != null) {
    if (!Object.hasOwn(특약묶음, b.g)) return { error: '어느 묶음인지 알 수 없습니다', code: 400 };
    새것.g = b.g;
  }
  if (b.t != null) {
    const t = 문구글(b.t), 틀림 = 글틀림(t);
    if (틀림) return { error: 틀림, code: 400 };
    새것.t = t;
  }
  return { list: 지금.map(p => p === 그것 ? 새것 : p), id: 새것.id };
}

/* 계약 하나의 일정. c = { form, sub, status, reported_at, cd(계약일), mid(중도금액), md(중도금일), bd(잔금일), track } */
export function 일정목록(c, 설정 = 알림설정()) {
  const t = c.track && typeof c.track === 'object' ? c.track : {};
  const cd = 날만(c.cd), md = 날만(t.midDate) || 날만(c.md), bd = 날만(t.balanceDate) || 날만(c.bd);
  const 신청 = 날만(t.permitApplied), out = [];
  if (날만(t.permitDue)) out.push({ k: 'permitDue', 날: 날만(t.permitDue), 메모: 신청 ? `${신청} 신청함` : '아직 신청 전입니다' });
  if (신청) out.push({ k: 'permitExpect', 날: 영업일째(신청, 15), 메모: `${신청} 신청 · 신청일 포함 15영업일` });
  if (cd) out.push({ k: 'contract', 날: cd, 메모: '계약서 내용을 마지막으로 확인하세요' });
  if (md && +c.mid > 0) out.push({ k: 'mid', 날: md, 바뀜: !!날만(t.midDate), 메모: '중도금 금액과 입금 계좌를 확인하세요' });
  if (bd) out.push({ k: 'balance', 날: bd, 바뀜: !!날만(t.balanceDate),
    메모: 날만(t.guideAt) ? '잔금안내 마침 · 준비서류를 확인하세요' : '잔금안내(이체한도·준비서류) 전입니다' });
  if (cd && 신고대상(c.form, { sub: c.sub })) out.push({ k: 'report', 이름: c.form === 'sale' ? '실거래신고 기한' : '임대차 신고 기한',
    날: 날더하기(cd, 30), 마침: !!c.reported_at, 메모: c.reported_at ? '신고 마침' : '부동산거래관리시스템에서 신고하세요' });
  if (bd && ['sale', 'union'].includes(c.form)) {
    const [a, b] = 설정.lawyer;
    out.push({ k: 'lawyer', 날: 영업일전(bd, b), 끝: 영업일전(bd, a), 메모: `잔금 ${bd} 기준 ${a}~${b}영업일 전에 예약하세요` });
  }
  return out.map(e => ({ 이름: 알림종류[e.k], ...e })).sort((x, y) => (x.날 > y.날) - (x.날 < y.날));
}
/* 오늘 아침 알릴 것 - 이 계약 알림을 껐거나 그 항목을 껐으면 빼고, 신고 기한은 날인본에서 신고 전일 때만 */
export function 오늘알림(c, 설정, 오늘) {
  if (c.track && c.track.off) return [];
  return 일정목록(c, 설정)
    .filter(e => !설정.off.includes(e.k) && !(e.k === 'report' && (c.status !== 'sealed' || c.reported_at)))
    .map(e => ({ ...e, 남음: 날차(오늘, e.날) }))
    .filter(e => (알림날[e.k] || []).includes(e.남음));
}
export const 알림제목 = e => e.k === 'lawyer' ? '법무사 예약할 때입니다'
  : `${e.이름} ${e.남음 === 0 ? '당일' : e.남음 === 1 ? '전날' : `${e.남음}일 전`}`;

/* 목록·한 장 읽기 - 일정 계산에 쓰는 날짜를 doc 에서 꺼내 같이 준다. track 칸이 아직 없으면(0032 전) 빼고 다시 읽는다 */
const 일정열 = ',cd:doc->>contractDate,mid:doc->deal->>mid,md:doc->deal->>midDate,bd:doc->deal->>balanceDate';
async function 읽기(q) {
  const x = await db('bk_contract', q.replace('{track}', ',track'));
  if (x.r.ok || !/track/.test(x.t || '')) return x;
  return { ...(await db('bk_contract', q.replace('{track}', ''))), no32: true };
}
const 준비중32 = res => res.status(503).json({ error: '일정·알림 기능을 준비 중입니다 (0032 마이그레이션 필요)', need: '0032' });

/* 일정·체크 저장 - 날인본도 된다(트리거가 track 만 통과시킨다). 내 계약서만 */
async function track(res, agent, b) {
  const id = String(b.id || '');
  if (!UUID.test(id)) return res.status(400).json({ error: '어느 계약서인지 알 수 없습니다' });
  const t = trackCheck(b.track);
  if (!t) return res.status(400).json({ error: '날짜 모양이 맞지 않습니다' });
  const { r, t: 글, rows } = await db('bk_contract', `id=eq.${id}&agent_id=eq.${agent.id}&select=id`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ track: t }),
  });
  if (!r.ok) return /track/.test(글 || '') ? 준비중32(res) : noTable(글) ? 준비중(res) : res.status(502).json({ error: '일정을 저장하지 못했습니다' });
  if (!rows.length) return res.status(404).json({ error: '내 계약서가 아니거나 지워진 계약서입니다' });
  return res.status(200).json({ ok: true, track: t });
}

/* 매일 아침 계약 일정 알림 (Vercel 예약 실행이 GET 으로 부른다 - vercel.json crons, 주소는 예전 이름 그대로).
   CRON_SECRET 이 없으면 돌지 않는다 - 아무나 불러 알림을 쏘게 두지 않는다.
   중개사 설정에 따라 카카오 알림톡은 일정 하나에 한 통, 메일은 중개사별로 하루 한 통(모아서). */
export async function reportDueCron(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: '예약 실행만 부를 수 있습니다' });
  const 오늘 = 한국오늘();
  /* 확인·설명서를 뺀 계약서 - 400일 안에 만든 것(그보다 멀리 가는 일정은 없다). 쪽으로 나눠 다 읽는다 */
  const 열 = 'id,agent_id,agent_user,form,title,status,reported_at,prev_id,sub:doc->>sub' + 일정열;
  const 쪽 = 1000, rows = [];
  let 트랙 = true;
  for (let 처음 = 0; ; 처음 += 쪽) {
    const { r, t, rows: 받은 } = await db('bk_contract',
      `select=${열}${트랙 ? ',track' : ''}&form=not.like.explain*&created_at=gte.${날더하기(오늘, -400)}&order=id&limit=${쪽}&offset=${처음}`);
    if (!r.ok && 트랙 && /track/.test(t || '')) { 트랙 = false; 처음 -= 쪽; continue; }
    if (!r.ok) return noTable(t) ? 준비중(res) : res.status(502).json({ error: '계약서를 읽지 못했습니다' });
    rows.push(...받은);
    if (받은.length < 쪽) break;
  }
  /* 고쳐 새 판을 만들었거나 갱신계약으로 이어 간 앞 계약서는 뺀다 - 같은 일정이 두 번 가지 않게 */
  const 앞판 = new Set(rows.map(c => c.prev_id).filter(Boolean));
  const 살아있음 = rows.filter(c => c.agent_id && !앞판.has(c.id));
  /* 중개사 - 이름·전화·알림 설정. 0032 전이면 설정 없이(모두 켬).
     settings 통째가 아니라 알림 설정만 꺼낸다 - 같은 칸에 내 특약 문구(최대 200개)가 쌓인다 */
  const ids = [...new Set(살아있음.map(c => c.agent_id))], 중개사 = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const 묶음 = ids.slice(i, i + 100).join(',');
    let x = await db('bk_agent', `select=id,name,phone,alert:settings->alert&id=in.(${묶음})`);
    if (!x.r.ok && /settings/.test(x.t || '')) x = await db('bk_agent', `select=id,name,phone&id=in.(${묶음})`);
    if (x.r.ok) for (const a of x.rows) 중개사.set(a.id, a);
  }
  const 사람별 = new Map();
  for (const c of 살아있음) {
    const a = 중개사.get(c.agent_id);
    if (!a) continue;
    const 설정 = 알림설정(a.alert);
    const 오늘것 = 오늘알림(c, 설정, 오늘);
    if (!오늘것.length) continue;
    if (!사람별.has(a.id)) 사람별.set(a.id, { a, 설정, uid: c.agent_user, 목록: [] });
    사람별.get(a.id).목록.push(...오늘것.map(e => ({ ...e, title: c.title || '소재지 미입력' })));
  }
  const 사람 = [...사람별.values()];
  for (const p of 사람) p.목록.sort((x, y) => x.남음 - y.남음 || (x.날 > y.날) - (x.날 < y.날));

  /* 카카오 알림톡 - 심사를 통과한 '계약 일정 알림' 템플릿이 있을 때만(SOLAPI_TPL_SCHEDULE). 다섯 통씩 함께 보낸다 */
  const 템플릿 = process.env.SOLAPI_TPL_SCHEDULE, 카톡 = [];
  if (템플릿) for (const { a, 설정, 목록 } of 사람) if (설정.kakao && a.phone) for (const e of 목록) {
    카톡.push({ to: a.phone, template: 템플릿, vars: { 이름: a.name || '중개사', 일정: 알림제목(e), 날짜: 날짜글(e.날), 물건: e.title.slice(0, 40), 확인: e.메모 } });
  }
  let 카톡보냄 = 0;
  for (let i = 0; i < 카톡.length; i += 5) 카톡보냄 += (await Promise.all(카톡.slice(i, i + 5).map(alimtalk))).filter(x => x && x.ok).length;

  /* 메일 - 중개사별로 하루 한 통 */
  const 받을 = 사람.filter(p => p.설정.mail && p.uid), 주소 = [];
  for (let i = 0; i < 받을.length; i += 10) 주소.push(...await Promise.all(받을.slice(i, i + 10).map(p => emailOf(p.uid))));
  const 메일 = [];
  for (const [n, p] of 받을.entries()) {
    const to = 주소[n];
    if (!to) continue;
    const 급한 = Math.min(...p.목록.map(x => x.남음)), 건 = p.목록.length;
    메일.push({ to, subject: 급한 === 0 ? `오늘 챙기실 계약 일정이 ${건}건 있습니다` : `계약 일정 ${건}건 - 가장 가까운 일정이 ${급한}일 남았습니다`,
      rows: p.목록.map(x => [알림제목(x), `${x.title} · ${날짜글(x.날)} · ${x.메모}`]),
      link: '/#/partner/contracts', cta: '계약서 열기',
      note: '받을 항목과 받는 곳(카카오톡·메일)은 계약서 › 일정·알림의 ‘알림 설정’ 에서 바꿀 수 있습니다. 신고를 마쳤으면 ‘신고 마침’ 을, 잔금안내를 했으면 체크해 주세요 - 그 알림이 멈춥니다.' });
  }
  /* notifyMany 는 한 번에 100통까지다(Resend 묶음 상한) - 100통씩 나눠 보낸다 */
  let 보냄 = 0;
  for (let i = 0; i < 메일.length; i += 100) 보냄 += (await notifyMany(req, 메일.slice(i, i + 100))).sent || 0;
  return res.status(200).json({ ok: true, 대상: 살아있음.length, 알림: 사람.reduce((s, p) => s + p.목록.length, 0), 보냄, 카톡: 카톡보냄 });
}

/* 서류 판독 - 등기부등본·건축물대장·토지이용계획확인서를 읽어 칸 값을 돌려준다(_scan.js).
   서류는 저장하지 않는다 - 읽고 버린다. 값은 화면이 계약서에 옮겨 적고, 저장할 때 다시 docCheck 를 거친다 */
async function scan(res, b) {
  const { scanDocs, ScanError } = await import('./_scan.js');
  try {
    const out = await scanDocs(b.files);
    return res.status(200).json({ ok: true, scan: out });
  } catch (e) {
    if (e instanceof ScanError) return res.status(e.status).json({ error: e.message, code: e.code, ...(e.code === 'no_key' ? { need: 'key' } : {}) });
    throw e;
  }
}

/* 작성 중인 것만 지운다. 날인본은 지우지 않는다(트리거도 막는다) */
async function del(res, agent, b) {
  const id = String(b.id || '');
  if (!UUID.test(id)) return res.status(400).json({ error: '어느 계약서인지 알 수 없습니다' });
  const { r, t, rows } = await db('bk_contract', `id=eq.${id}&agent_id=eq.${agent.id}&status=eq.draft`, {
    method: 'DELETE', headers: { Prefer: 'return=representation' },
  });
  if (!r.ok) return noTable(t) ? 준비중(res) : res.status(502).json({ error: '지우지 못했습니다' });
  if (!rows.length) return res.status(409).json({ error: '날인본은 지울 수 없습니다' });
  return res.status(200).json({ ok: true });
}
