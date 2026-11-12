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
import { sbHeaders, sbUrl, emailOf, sameSecret, overLimit, ipOf } from './_auth.js';
import { notifyMany } from './_notify.js';
import { logOps } from './_opslog.js';
import { alimtalk } from './_kakao.js';
import { 건축물대장, 포털오류 } from './_bld.js';

/* 주택임대차 · 상가건물 임대차 · 부동산 매매 · 중개대상물 확인·설명서(주거용) (화면의 CT_FORMS 와 같은 이름) */
/* 2026-10-30 계약서 종류 - 부동산 임대차(전세·월세·연세) · 전대차 · 분양권 · 조합원입주권 · 권리양도양수 · 상가 권리금 */
export const CT_FORMS = ['home-lease', 'shop-lease', 'sale', 'lease', 'sublease', 'presale', 'union', 'rights', 'premium',
  'explain-home', 'explain-biz', 'explain-land', 'explain-etc'];
export const CT_SCHEMA = 'bk-contract/1';
const CT_MAX = 64 * 1024;                     /* 계약서 한 장 - 조항·특약을 넉넉히 적어도 이 안이다 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/* 목록에서 찾고(당사자 이름) 문서 이름을 짓는 데(세부 종류·거래유형) 쓰는 값은 doc 에서 꺼내 같이 준다 - doc 통째로는 무겁다 */
const LIST_COLS = 'id,created_at,updated_at,form,title,status,sealed_at,sha256,prev_id,proposal_id,reported_at,'
  + 'cat:doc->>cat,sub:doc->>sub,dt:doc->deal->>type,parties:doc->parties,renew:doc->renewOf,ci:doc->>contractId,staff:doc->broker->>staff,'
  /* 계약현황 표 · 실적 (2026-11-10 파트너 기획) - 대금 · 계약금 · 형태(신규/갱신) · 중개보수(확인·설명서) */
  + 'price:doc->deal->>price,deposit:doc->deal->>deposit,down:doc->deal->>down,kind:doc->>kind,fee:doc->ex->>fee';
/* 신고가 있는 양식 - 매매(거래신고) · 주택임대차(임대차 신고). 상가 임대차·확인·설명서는 신고가 없다 */
export const CT_REPORT_FORMS = ['sale', 'presale', 'union', 'home-lease', 'lease'];
/* 매매 쪽 신고 - 분양권·입주권 전매도 거래신고 대상(부동산 거래신고법 제3조, 2026-11-05) */
const 매매신고 = f => f === 'sale' || f === 'presale' || f === 'union';
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

/* 주소로 건축물대장 (2026-11-06) - api/_bld.js */
async function 대장(req, res, agent, b) {
  /* 공공데이터 키는 사이트 전체가 같이 쓴다 - 한 계정 하루 200번 · 한 곳(IP) 400번 */
  if (overLimit('bld:a:' + agent.id, 200, 864e5) || overLimit('bld:ip:' + ipOf(req), 400, 864e5))
    return res.status(429).json({ ok: false, error: '오늘 건축물대장 조회를 많이 하셨습니다 - 내일 다시 하거나 건축물대장을 올려 주세요' });
  try {
    const o = await 건축물대장(b);
    if (o.error) return res.status(200).json({ ok: false, error: o.error });
    return res.status(200).json({ ok: true, scan: o.scan, kinds: o.kinds });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e instanceof 포털오류 ? e.message : '건축물대장을 불러오지 못했습니다' });
  }
}

/* 날인본 확정 전 필수 항목 (2026-11-06 대표님) - 화면(ct필수)이 먼저 막고, 서버는 핵심 다섯 가지를 다시 본다.
   확인·설명서는 계약서가 아니라 보지 않는다 */
export function 확정필수(form, doc) {
  /* 확인·설명서는 소재지만 본다 */
  if (String(form || '').startsWith('explain')) return String((doc && doc.property && doc.property.road) || '').trim() ? null : '필수 항목이 비어 있어 확정할 수 없습니다 - 소재지';
  const d = (doc && doc.deal) || {}, 빈 = [];
  if (!String((doc && doc.property && doc.property.road) || '').trim()) 빈.push('소재지');
  if (!(+(d.price != null ? d.price : d.deposit) > 0)) 빈.push(임대차양식.includes(form) ? '보증금' : '대금');
  if (!(+d.down > 0)) 빈.push('계약금');
  if (!d.balanceDate) 빈.push('잔금 지급일');
  if (!(doc && doc.contractDate)) 빈.push('계약일');
  return 빈.length ? `필수 항목이 비어 있어 확정할 수 없습니다 - ${빈.join(' · ')}` : null;
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
      case 'contract-bin':     await bin(res, agent, b); break;
      case 'contract-state':   await state(res, agent, b); break;
      case 'contract-bld':     await 대장(req, res, agent, b); break;
      case 'contract-reported': await reported(res, agent, b); break;
      case 'contract-track':   await track(res, agent, b); break;
      case 'contract-note':    await note(res, agent, b); break;
      case 'contract-scan':    await scan(req, res, b, user); break;
      case 'contract-share':   await share(res, agent, b); break;
      case 'contract-share-cut': await shareCut(res, agent, b); break;
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
  const why = docCheck(row.doc && row.doc.form, row.doc) || 확정필수(row.doc && row.doc.form, row.doc);
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
/* ── 확정 전 초안 공유 (2026-11-05 파트너 리뷰) ── 보기 전용 링크. 표 = 계약서 번호 · 기한(7일) · 서명.
   서명 열쇠는 서버 비밀값에서 나온다(BK_SECRET_KEY 가 바뀌면 나간 링크가 모두 죽는다). 전화번호는 가려서 보인다.
   날인본은 공유하지 않는다 - 초안을 미리 보여 주는 길이다 */
const 초안열쇠 = () => crypto.createHash('sha256').update('bk-draft|' + String(process.env.BK_SECRET_KEY || ''), 'utf8').digest();
/* 표 = D2.번호.기한.링크번호.서명 - 링크번호(track.shareN)를 올리면 그 계약서의 나간 링크만 끊긴다(2026-11-05 리뷰) */
const 초안서명 = (id, until, n) => crypto.createHmac('sha256', 초안열쇠()).update(`${id}.${until}.${n}`).digest('base64url');
export function 초안표(id, n = 0, 지금 = Date.now()) { const until = 지금 + 7 * 864e5; return `D2.${id}.${until}.${n}.${초안서명(id, until, n)}`; }
export function 초안표읽기(tok, 지금 = Date.now()) {
  const m = /^D2\.([0-9a-f-]{36})\.(\d{13})\.(\d{1,6})\.([A-Za-z0-9_-]{43})$/.exec(String(tok || ''));
  if (!m || !UUID.test(m[1]) || +m[2] < 지금) return null;
  return sameSecret(m[4], 초안서명(m[1], m[2], m[3])) ? { id: m[1], until: +m[2], n: +m[3] } : null;
}
const 번호가림 = v => { const d = String(v || '').replace(/[^0-9]/g, ''); return d.length >= 7 ? `${d.slice(0, 3)}-****-${d.slice(-4)}` : (v ? '****' : ''); };
/* 글 안의 휴대전화 번호도 가린다(특약에 적은 연락처 등) */
/* 휴대전화 · 일반전화 · 계좌처럼 보이는 긴 숫자(숫자 9자리 이상, 사이에 - 나 빈칸)는 끝 4자리만 남긴다. 금액(쉼표)은 건드리지 않는다 */
const 글번호가림 = s => String(s)
  .replace(/01[016789][\s.-]?\d{3,4}[\s.-]?\d{4}/g, m => 번호가림(m))
  .replace(/\d[\d -]{7,}\d/g, m => { const d = m.replace(/\D/g, ''); return d.length >= 9 && /[\s-]|^\d{9,}$/.test(m) ? `****${d.slice(-4)}` : m; });
export function 초안가림(doc) {
  const d = JSON.parse(JSON.stringify(doc || {}));
  const 가림 = p => { if (!p || typeof p !== 'object') return; if ('phone' in p) p.phone = 번호가림(p.phone);
    delete p.birth; (p.co || []).forEach(가림); if (p.proxy) 가림(p.proxy); };
  Object.values(d.parties || {}).forEach(가림);
  if (Array.isArray(d.specials)) d.specials = d.specials.map(t => 글번호가림(t));
  delete d.src; delete d.edited;
  return d;
}
async function share(res, agent, b) {
  const id = String(b.id || '');
  if (!UUID.test(id)) return res.status(400).json({ error: '어느 계약서인지 알 수 없습니다' });
  const got = await 읽기(`select=id,status,form{track}&id=eq.${id}&agent_id=eq.${agent.id}&limit=1`);
  if (!got.r.ok) return noTable(got.t) ? 준비중(res) : res.status(502).json({ error: '계약서를 불러오지 못했습니다' });
  if (!got.rows.length) return res.status(404).json({ error: '내 계약서가 아니거나 지워진 계약서입니다' });
  if (got.rows[0].status === 'sealed') return res.status(409).json({ error: '날인본은 인쇄해서 드리세요 - 초안 공유는 작성 중인 계약서만 됩니다' });
  /* 확인·설명서는 당사자 생년월일·권리관계가 많이 든다 - 링크로 내보내지 않는다(2026-11-05 리뷰) */
  if (String(got.rows[0].form || '').startsWith('explain')) return res.status(409).json({ error: '확인·설명서는 초안 링크로 보내지 않습니다 - 만나서 설명하고 교부해 주세요' });
  const n = (trackCheck((got.rows[0] || {}).track || {}) || {}).shareN || 0;
  const tok = 초안표(id, n);
  return res.status(200).json({ ok: true, token: tok, until: +tok.split('.')[2] });
}
/* 나간 초안 링크 끊기 - 서버가 지금 링크 번호를 읽어 하나 올린다. 성공해야 화면이 '끊었습니다' 라고 한다 */
async function shareCut(res, agent, b) {
  const id = String(b.id || '');
  if (!UUID.test(id)) return res.status(400).json({ error: '어느 계약서인지 알 수 없습니다' });
  const z = await 링크번호지켜쓰기(id, agent, (n, 지금) => ({ ...지금, shareN: n + 1 }));
  if (z.res) return z.res(res, '링크를 끊지 못했습니다');
  return res.status(200).json({ ok: true, track: z.track });
}
/* 공개 읽기 - 로그인 없이 표만으로. IP 마다 10분에 60번 */
export async function draftRead(req, res) {
  if (overLimit('draft:' + ipOf(req), 60, 600e3)) return res.status(429).json({ error: '잠시 뒤 다시 열어 주세요' });
  const t = 초안표읽기(req.query && req.query.draft);
  if (!t) return res.status(404).json({ error: '링크가 맞지 않거나 기한(7일)이 지났습니다 - 중개사무소에 다시 받아 주세요' });
  const got = await 읽기(`select=id,form,title,status,updated_at,doc{track}&id=eq.${t.id}&limit=1`);
  if (!got.r.ok || !got.rows.length) return res.status(404).json({ error: '계약서를 찾지 못했습니다 - 지워졌을 수 있습니다' });
  const row = got.rows[0];
  const 지금번호 = (trackCheck(row.track || {}) || {}).shareN || 0;
  if (지금번호 !== t.n || String(row.form || '').startsWith('explain')) return res.status(404).json({ error: '중개사무소가 이 링크를 끊었습니다 - 새 링크를 받아 주세요' });
  /* 확정됐으면 내용은 내보내지 않는다 - 최종본은 중개사무소가 인쇄해서 준다 */
  if (row.status === 'sealed') return res.status(200).json({ ok: true, until: t.until, form: row.form, status: 'sealed' });
  return res.status(200).json({ ok: true, until: t.until, form: row.form, status: row.status, updated_at: row.updated_at, doc: 초안가림(row.doc) });
}

/* 초안 의견 남기기 (2026-11-06 · 파트너 기획 [111]) - 초안 링크를 받은 손님 · 공동중개 사무소가 로그인 없이.
   표(서명 · 기한 · 링크 번호)가 맞고 작성 중일 때만. IP 마다 10분에 10번, 한 계약서에 50개까지. 서로의 의견은 보여 주지 않는다 */
export async function draftNote(req, res, b) {
  if (overLimit('draftnote:' + ipOf(req), 10, 600e3)) return res.status(429).json({ error: '잠시 뒤 다시 보내 주세요' });
  const t = 초안표읽기(req.query && req.query.draft);
  if (!t) return res.status(404).json({ error: '링크가 맞지 않거나 기한(7일)이 지났습니다 - 중개사무소에 다시 받아 주세요' });
  const who = String(b.who || ''), text = String(b.text || '').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim().slice(0, 500), name = String(b.name || '').trim().slice(0, 20);
  if (!의견누구.includes(who)) return res.status(400).json({ error: '어느 분이신지 골라 주세요' });
  if (!text) return res.status(400).json({ error: '의견을 적어 주세요' });
  if (주민번호있나(text) || 주민번호있나(name)) return res.status(400).json({ error: '주민등록번호는 적지 말아 주세요' });
  const 새 = { i: crypto.randomBytes(5).toString('hex'), at: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 19), who, name, text };
  const z = await 링크번호지켜쓰기(t.id, null, (n, 지금, row) => {
    if (n !== t.n) return { 거절: '중개사무소가 이 링크를 끊었습니다 - 새 링크를 받아 주세요', code: 404 };
    if (row && row.status === 'sealed') return { 거절: '이미 날인본으로 확정된 계약서입니다 - 중개사무소에 직접 말씀해 주세요', code: 409 };
    const 있던 = 지금.notes || [];
    if (있던.length >= 의견최대) return { 거절: '의견이 많이 쌓였습니다 - 중개사무소에 직접 말씀해 주세요', code: 409 };
    return { ...지금, notes: [...있던, 새] };
  });
  if (z.res) return z.res(res, '의견을 보내지 못했습니다');
  return res.status(200).json({ ok: true });
}
/* 받은 의견 - 모두 읽음(read-all) · 하나 지우기(del) */
async function note(res, agent, b) {
  const id = String(b.id || '');
  if (!UUID.test(id)) return res.status(400).json({ error: '어느 계약서인지 알 수 없습니다' });
  const op = b.op === 'del' ? 'del' : 'read-all', i = String(b.i || '');
  const z = await 링크번호지켜쓰기(id, agent, (n, 지금) => ({ ...지금,
    notes: (지금.notes || []).filter(x => op !== 'del' || x.i !== i).map(x => op === 'read-all' ? { ...x, read: true } : x) }));
  if (z.res) return z.res(res, '의견을 고치지 못했습니다');
  return res.status(200).json({ ok: true, track: z.track });
}

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
  balance: '잔금', report: '실거래신고 기한', lawyer: '법무사 예약', expiry: '임대차 만기 6개월 전', settle: '잔금 완료 확인', prep: '잔금 준비물 안내' };
/* 며칠 전 아침에 알리는가 - 0 은 당일. 법무사 예약은 예약할 때가 시작되는 날(잔금 b영업일 전) 한 번 */
export const 알림날 = { permitDue: [3, 0], permitExpect: [0], contract: [1, 0], mid: [3, 0], balance: [7, 3, 0], report: [7, 3, 1, 0], lawyer: [0], expiry: [0], settle: [0], prep: [0] };
/* 임대차 만기 6개월 전 - 갱신 의사를 물을 때(파트너 리뷰 2026-11-05). 임대차·전대차만, 한 번 */
export const 임대차양식 = ['home-lease', 'shop-lease', 'lease', 'sublease'];
export function 달빼기(d, n) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || '')); if (!m) return '';
  const t = new Date(Date.UTC(+m[1], +m[2] - 1 - n, 1));
  const 끝날 = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(+m[3], 끝날));
  return t.toISOString().slice(0, 10);
}
/* 중개사 알림 설정 - 받는 곳(카카오톡·메일) · 끈 항목 · 법무사 예약 시점(잔금 a~b영업일 전, 기본 7~10) */
export function 알림설정(x) {
  const o = x && typeof x === 'object' ? x : {};
  const 범위 = v => { const n = Math.round(+v); return n >= 1 && n <= 20 ? n : 0; };
  let [a, b] = Array.isArray(o.lawyer) ? [범위(o.lawyer[0]), 범위(o.lawyer[1])] : [7, 10];
  if (!a || !b) [a, b] = [7, 10];
  if (a > b) [a, b] = [b, a];
  /* 잔금 완료 확인 끝 시각(2026-11-10 파트너 기획 '종료 시각은 사무소별') - 16~23시, 기본 19시. 그때까지 완료가 아니면 잔금 지연 */
  const 끝 = Math.round(+o.settleEnd);
  return { kakao: o.kakao !== false, mail: o.mail !== false,
    off: [...new Set((Array.isArray(o.off) ? o.off : []).filter(k => Object.hasOwn(알림종류, k)))], lawyer: [a, b], settleEnd: 끝 >= 16 && 끝 <= 23 ? 끝 : 19,
    autoArch: o.autoArch === true };   /* 완료 · 취소 건 3개월 뒤 자동 보관함(2026-11-10 파트너 기획) */
}
/* 계약 하나의 일정·체크(track). 날짜 칸은 ISO 날짜만, 나머지는 켜짐/꺼짐만 받는다 - 다른 것은 버린다 */
/* arch · trash (2026-11-10 대표님 결정 1번) - 보관함으로 내린 날 · 휴지통에 넣은 날. 날인본은 휴지통까지만, 작성 중은 휴지통 30일 뒤 지운다 */
const TRACK_DATES = ['permitDue', 'permitApplied', 'midDate', 'balanceDate', 'guideAt', 'permitPaid', 'permitAgreed', 'permitOk', 'piAt', 'arch', 'trash'];
export const 진행상태 = { ready: '준비', doing: '진행중', done: '완료', hold: '보류', cancel: '취소' };
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
  /* 진행 상태(파트너 리뷰 '계약현황') - 준비 · 진행중 · 완료 · 보류 · 취소, 한방 입력 완료(기록용 체크) */
  if (Object.hasOwn(진행상태, t.state)) out.state = t.state;
  /* 초안 링크 번호 - 올리면 그 계약서의 나간 링크가 모두 끊긴다 */
  if (Number.isInteger(t.shareN) && t.shareN > 0 && t.shareN < 1e6) out.shareN = t.shareN;
  if (t.hb === true) out.hb = true;
  /* 전자계약으로 진행(파트너 기획 [137] - 금리 우대 대상 관리용 표시) */
  if (t.ec === true) out.ec = true;
  const x = 부속값(t.extra);
  if (x) out.extra = x;
  /* 판 번호 - track 을 쓸 때마다 하나 올린다. 읽은 판 그대로일 때만 쓴다(중개사 저장 · 초안 의견이 서로 지우지 않게) */
  if (Number.isInteger(t.tv) && t.tv > 0 && t.tv < 1e9) out.tv = t.tv;
  /* 초안 의견 (2026-11-06 · 파트너 기획 [111] '의견 남기기') - 초안 링크로 연 손님 · 공동중개 사무소가 남긴다 */
  const 의견 = 의견들(t.notes);
  if (의견.length) out.notes = 의견;
  /* 계약진행 대화방 (2026-11-06 · api/_room.js) - 링크 번호 n 과 자리마다 들어온 손님 계정 */
  const 방 = 방값(t.room);
  if (방) out.room = 방;
  return out;
}
const 방자리 = ['seller', 'buyer', 'lessor', 'lessee', 'sublessor', 'subtenant', 'assignor', 'assignee'];
export function 방값(x) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const out = { n: Number.isInteger(x.n) && x.n >= 0 && x.n < 1e6 ? x.n : 0 };
  for (const k of 방자리) { const v = x[k];
    if (v && /^[0-9a-f-]{36}$/.test(String(v.uid || ''))) out[k] = { uid: v.uid, at: String(v.at || '').slice(0, 19) }; }
  /* 자리마다 끊은 횟수(c) - 한 손님을 내보내도 다른 당사자의 초대 링크는 살아 있게 (2026-11-07) */
  if (x.c && typeof x.c === 'object' && !Array.isArray(x.c)) { const c = {};
    for (const k of 방자리) if (Number.isInteger(x.c[k]) && x.c[k] > 0 && x.c[k] < 1e6) c[k] = x.c[k];
    if (Object.keys(c).length) out.c = c; }
  /* 대리인 (2026-11-10 파트너 기획 '대화방에 손님 대리인 1명') - 자리마다 한 분(p), 대리인 링크만 끊은 횟수(pc) */
  if (x.p && typeof x.p === 'object' && !Array.isArray(x.p)) { const p = {};
    for (const k of 방자리) { const v = x.p[k]; if (v && /^[0-9a-f-]{36}$/.test(String(v.uid || ''))) p[k] = { uid: v.uid, at: String(v.at || '').slice(0, 19) }; }
    if (Object.keys(p).length) out.p = p; }
  if (x.pc && typeof x.pc === 'object' && !Array.isArray(x.pc)) { const c = {};
    for (const k of 방자리) if (Number.isInteger(x.pc[k]) && x.pc[k] > 0 && x.pc[k] < 1e6) c[k] = x.pc[k];
    if (Object.keys(c).length) out.pc = c; }
  return out;
}
export const 의견누구 = ['매도인', '매수인', '임대인', '임차인', '전대인', '전차인', '양도인', '양수인', '공동중개 사무소', '기타'];
export const 의견최대 = 50;
export function 의견들(x) {
  const out = [];
  for (const n of Array.isArray(x) ? x : []) {
    if (!n || !/^[0-9a-f]{10}$/.test(String(n.i)) || !의견누구.includes(n.who)) continue;
    const text = 부속글(n.text, 500); if (!text) continue;
    out.push({ i: n.i, at: String(n.at || '').slice(0, 19), who: n.who, name: 부속글(n.name, 20), text, ...(n.read === true ? { read: true } : {}) });
    if (out.length >= 의견최대) break;
  }
  return out;
}
/* 부속 서류(2026-11-05 파트너 리뷰) - 잔금정산서 금액 · 추가 항목 · 물품 인계 목록. 날인본이어도 적는다(track 안).
   금액은 0 초과 정수, 글은 짧게 자르고, 주민등록번호 모양이 든 글은 버린다 */
const 부속돈 = v => { const n = Math.round(+v); return Number.isFinite(n) && n > 0 && n < 1e13 ? n : 0; };
const 부속글 = (v, n) => { const s = String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n); return 주민번호있나(s) ? '' : s; };
export function 부속값(x) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const o = {};
  for (const k of ['fee', 'prepaid', 'ltm']) { const n = 부속돈(x[k]); if (n) o[k] = n; }
  if (x.dayOwner === 'a') o.dayOwner = 'a';
  if (x.dirs && typeof x.dirs === 'object') {
    const d = {};
    for (const k of ['prepaid', 'ltm']) if (x.dirs[k] === '-' || x.dirs[k] === '+') d[k] = x.dirs[k];
    if (Object.keys(d).length) o.dirs = d;
  }
  const adds = (Array.isArray(x.adds) ? x.adds : []).slice(0, 10)
    .map(a => ({ n: 부속글(a && a.n, 30), amt: 부속돈(a && a.amt), dir: a && a.dir === '-' ? '-' : '+' }));
  if (adds.length) o.adds = adds;
  if (x.itemsSet === true) {
    o.itemsSet = true;
    o.items = (Array.isArray(x.items) ? x.items : []).slice(0, 30)
      .map(a => ({ n: 부속글(a && a.n, 30), q: 부속글(a && a.q, 10), s: 부속글(a && a.s, 40) })).filter(a => a.n);
  }
  if (x.attach === true) o.attach = true;
  return Object.keys(o).length ? o : null;
}

/* 계약체결 문자 (2026-11-05 파트너 리뷰) - 사무소 문자 틀(settings.smsTpl)과 보낸 기록(settings.smsLog).
   틀: [{ id, name(14자), text(2000자), hidden }] 20개까지 - 통째로 받는다(한 사람이 고치는 작은 목록).
   기록: [{ id, at, tpl, vals, none, a, b }] 최근 30개 - 계좌 칸과 주민번호 모양 글은 버린다(계좌번호는 어디에도 저장하지 않는다) */
export const 문자틀최대 = 20, 문자기록최대 = 30;
const 문자번호 = /^[a-z0-9-]{1,24}$/;
export function 문자틀들(x) {
  const 본 = new Set(), out = [];
  for (const t of Array.isArray(x) ? x : []) {
    if (!t || typeof t !== 'object' || !문자번호.test(String(t.id)) || 본.has(t.id)) continue;
    const name = String(t.name == null ? '' : t.name).replace(/\s+/g, ' ').trim().slice(0, 14);
    const text = String(t.text == null ? '' : t.text).replace(/\r\n?/g, '\n').trim().slice(0, 2000);
    if (!name || !text || 주민번호있나(text)) continue;
    본.add(t.id);
    out.push({ id: t.id, name, text, ...(t.hidden === true ? { hidden: true } : {}) });
    if (out.length >= 문자틀최대) break;
  }
  return out;
}
const 문자값들 = v => {
  const o = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return o;
  for (const [k0, x] of Object.entries(v).slice(0, 40)) {
    const k = String(k0).slice(0, 20);
    if (!k || /계좌/.test(k)) continue;
    if (typeof x === 'number' && Number.isFinite(x) && x >= 0 && x < 1e13) o[k] = Math.round(x);
    else if (typeof x === 'string') { const s = x.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200); if (s && !주민번호있나(s)) o[k] = s; }
  }
  return o;
};
export function 문자기록들(x) {
  const out = [];
  for (const e of Array.isArray(x) ? x : []) {
    if (!e || typeof e !== 'object' || !/^[0-9a-f]{12}$/.test(String(e.id))) continue;
    out.push({ id: e.id, at: 날시꼴(e.at) ? e.at : '', tpl: String(e.tpl || '').slice(0, 14), vals: 문자값들(e.vals),
      none: (Array.isArray(e.none) ? e.none : []).map(k => String(k).slice(0, 20)).slice(0, 10), a: e.a === true, b: e.b === true });
    if (out.length >= 문자기록최대) break;
  }
  return out;
}
const 날시꼴 = v => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(v || ''));
/* 하나 고치기 - op: tpls(틀 통째) · log-add · log-set(동의 표시) · log-del. 돌려주는 값 { tpls, log } 또는 { error, code } */
export function 문자고침(settings, b, 지금 = new Date()) {
  const s = settings || {}, op = b && b.op;
  let tpls = 문자틀들(s.smsTpl), log = 문자기록들(s.smsLog);
  if (op === 'tpls') {
    if (!Array.isArray(b.tpls)) return { error: '문자 틀이 비어 있습니다', code: 400 };
    if (b.tpls.some(t => t && 주민번호있나(String(t.text || '')))) return { error: '주민등록번호가 든 문자 틀은 저장하지 않습니다', code: 400 };
    tpls = 문자틀들(b.tpls);
  } else if (op === 'log-add') {
    const e = b.entry || {}, vals = 문자값들(e.vals), tpl = String(e.tpl || '').slice(0, 14);
    const none = (Array.isArray(e.none) ? e.none : []).map(k => String(k).slice(0, 20)).slice(0, 10);
    const at = new Date(지금.getTime() + 9 * 3600e3).toISOString().slice(0, 19);
    /* 같은 틀·목적물을 10분 안에 다시 보내면 그 줄을 고친다 */
    const 앞 = log[0];
    if (앞 && 앞.tpl === tpl && (앞.vals.목적물 || '') === (vals.목적물 || '') && Date.parse(at + 'Z') - Date.parse(앞.at + 'Z') < 600e3)
      log = [{ ...앞, at, vals, none }, ...log.slice(1)];
    else log = [{ id: crypto.randomBytes(6).toString('hex'), at, tpl, vals, none, a: false, b: false }, ...log].slice(0, 문자기록최대);
  } else if (op === 'log-set' || op === 'log-del') {
    const id = String(b.id == null ? '' : b.id);
    if (!log.some(e => e.id === id)) return { error: '이미 지운 기록입니다', code: 404 };
    log = op === 'log-del' ? log.filter(e => e.id !== id) : log.map(e => e.id === id ? { ...e, a: b.a === true, b: b.b === true } : e);
  } else return { error: '알 수 없는 요청입니다', code: 400 };
  return { tpls, log };
}

/* 자주 쓰는 단지 (2026-11-05 파트너 리뷰) - 확인·설명서 입지·관리·비선호시설·환경조건 값(settings.complexes).
   [{ id, name(40자), road(120자), at, v:{ 칸: 글 | 수 | 글 목록 } }] 50곳까지. 칸 이름은 영문 낱말만, 글은 200자, 주민번호 모양은 버린다 */
export const 단지최대 = 50;
const 단지값 = v => {
  const o = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return o;
  for (const [k, x] of Object.entries(v).slice(0, 80)) {
    if (!/^[A-Za-z][A-Za-z0-9]{0,30}$/.test(k)) continue;
    if (typeof x === 'number' && Number.isFinite(x) && x >= 0 && x < 1e13) o[k] = x;
    else if (typeof x === 'string') { const s = x.trim().slice(0, 200); if (s && !주민번호있나(s)) o[k] = s; }
    else if (Array.isArray(x)) { const a = x.filter(y => typeof y === 'string').map(y => y.slice(0, 40)).slice(0, 12); if (a.length) o[k] = a; }
  }
  return o;
};
export function 단지들(x) {
  const out = [], 본 = new Set();
  for (const d of Array.isArray(x) ? x : []) {
    if (!d || !/^[0-9a-f]{12}$/.test(String(d.id)) || 본.has(d.id)) continue;
    const name = String(d.name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!name) continue;
    본.add(d.id);
    out.push({ id: d.id, name, road: String(d.road || '').replace(/\s+/g, ' ').trim().slice(0, 120), at: String(d.at || '').slice(0, 19), v: 단지값(d.v) });
    if (out.length >= 단지최대) break;
  }
  return out;
}
/* put - 같은 이름이면 덮어쓰고 맨 앞으로 · del */
export function 단지고침(list, b, 지금 = new Date()) {
  let L = 단지들(list);
  if (b && b.op === 'put') {
    const name = String(b.name || '').replace(/\s+/g, ' ').trim().slice(0, 40), v = 단지값(b.v);
    if (!name) return { error: '단지 이름이 비어 있습니다', code: 400 };
    if (!Object.keys(v).length) return { error: '저장할 칸이 없습니다', code: 400 };
    const 앞 = L.find(d => d.name === name);
    const at = new Date(지금.getTime() + 9 * 3600e3).toISOString().slice(0, 19);
    const 새 = { id: 앞 ? 앞.id : crypto.randomBytes(6).toString('hex'), name, road: String(b.road || '').replace(/\s+/g, ' ').trim().slice(0, 120), at, v };
    L = [새, ...L.filter(d => d.name !== name)].slice(0, 단지최대);
    return { list: L };
  }
  if (b && b.op === 'del') return { list: L.filter(d => d.id !== String(b.id || '')) };
  return { error: '알 수 없는 요청입니다', code: 400 };
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
    /* base - 새 계약서를 열면 기본 특약으로 들어가는 문구(2026-11-05 파트너 리뷰) */
    out.push({ id: p.id, g: Object.hasOwn(특약묶음, p.g) ? p.g : 'etc', t, tag: 문구종류(p.tag), ...(p.base === true ? { base: true } : {}) });
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
  if (b.base === true) 새것.base = true;
  else if (b.base === false) delete 새것.base;
  return { list: 지금.map(p => p === 그것 ? 새것 : p), id: 새것.id };
}

/* 계약 하나의 일정. c = { form, sub, status, reported_at, cd(계약일), mid(중도금액), md(중도금일), bd(잔금일), track } */
export function 일정목록(c, 설정 = 알림설정()) {
  const t = c.track && typeof c.track === 'object' ? c.track : {};
  const cd = 날만(c.cd), md = 날만(t.midDate) || 날만(c.md), bd = 날만(t.balanceDate) || 날만(c.bd);
  const 신청 = 날만(t.permitApplied), out = [];
  if (날만(t.permitDue)) out.push({ k: 'permitDue', 날: 날만(t.permitDue), 메모: 신청 ? `${신청} 신청함` : '아직 신청 전입니다' });
  if (신청 && !t.permitOk) out.push({ k: 'permitExpect', 날: 영업일째(신청, 15), 메모: `${신청} 신청 · 신청일 포함 15영업일` });
  if (cd) out.push({ k: 'contract', 날: cd, 메모: '계약서 내용을 마지막으로 확인하세요' });
  if (md && +c.mid > 0) out.push({ k: 'mid', 날: md, 바뀜: !!날만(t.midDate), 메모: '중도금 금액과 입금 계좌를 확인하세요' });
  /* 2차 중도금 (2026-11-10) - 1차가 있을 때만 */
  if (날만(c.md2) && +c.mid > 0 && +c.m2 > 0) out.push({ k: 'mid', 이름: '2차 중도금', 날: 날만(c.md2), 메모: '2차 중도금 금액과 입금 계좌를 확인하세요' });
  if (bd) out.push({ k: 'balance', 날: bd, 바뀜: !!날만(t.balanceDate),
    메모: 날만(t.guideAt) ? '잔금안내 마침 · 준비서류를 확인하세요' : '잔금안내(이체한도·준비서류) 전입니다' });
  if (cd && 신고대상(c.form, { sub: c.sub })) out.push({ k: 'report', 이름: 매매신고(c.form) ? '실거래신고 기한' : '임대차 신고 기한',
    날: 날더하기(cd, 30), 마침: !!c.reported_at, 메모: c.reported_at ? '신고 마침' : '부동산거래관리시스템에서 신고하세요' });
  /* 잔금 10일 전 - 매도인 · 매수인께 준비물 안내(2026-11-10 파트너 기획). 매매만, 잔금안내를 마쳤으면 마침 */
  if (bd && ['sale', 'presale', 'union'].includes(c.form)) out.push({ k: 'prep', 날: 날더하기(bd, -10), 마침: !!날만(t.guideAt),
    메모: 날만(t.guideAt) ? '잔금안내 마침' : '매도인 · 매수인께 잔금 준비물을 안내하세요 - 대화방이나 문자로' });
  if (bd && ['sale', 'union'].includes(c.form)) {
    const [a, b] = 설정.lawyer;
    out.push({ k: 'lawyer', 날: 영업일전(bd, b), 끝: 영업일전(bd, a), 메모: `잔금 ${bd} 기준 ${a}~${b}영업일 전에 예약하세요` });
  }
  /* 잔금 다음 날 아침 - 진행 상태를 '완료'로 바꾸지 않았으면 묻는다(파트너 리뷰 '잔금 완료 확인'. 예약 실행이 하루 한 번이라 시간마다는 못 한다) */
  if (bd && t.state !== 'done' && t.state !== 'cancel') out.push({ k: 'settle', 날: 날더하기(bd, 1), 메모: '잔금을 마쳤으면 진행 상태를 완료로 바꾸세요 - 안 끝났으면 잔금 지연입니다' });
  const ex = 날만(c.ex);
  if (ex && 임대차양식.includes(c.form)) out.push({ k: 'expiry', 날: 달빼기(ex, 6), 메모: `만기 ${ex} - 임대인·임차인의 갱신 의사를 확인하세요` });
  return out.map(e => ({ 이름: 알림종류[e.k], ...e })).sort((x, y) => (x.날 > y.날) - (x.날 < y.날));
}
/* 오늘 아침 알릴 것 - 이 계약 알림을 껐거나 그 항목을 껐으면 빼고, 신고 기한은 날인본에서 신고 전일 때만 */
export function 오늘알림(c, 설정, 오늘) {
  if (c.track && c.track.off) return [];
  return 일정목록(c, 설정)
    .filter(e => !설정.off.includes(e.k) && !(e.k === 'report' && (c.status !== 'sealed' || c.reported_at)) && !((e.k === 'expiry' || e.k === 'settle' || e.k === 'prep') && c.status !== 'sealed') && !(e.k === 'prep' && e.마침))
    .map(e => ({ ...e, 남음: 날차(오늘, e.날) }))
    .filter(e => (알림날[e.k] || []).includes(e.남음));
}
export const 알림제목 = e => e.k === 'lawyer' ? '법무사 예약할 때입니다'
  : `${e.이름} ${e.남음 === 0 ? '당일' : e.남음 === 1 ? '전날' : `${e.남음}일 전`}`;

/* 목록·한 장 읽기 - 일정 계산에 쓰는 날짜를 doc 에서 꺼내 같이 준다. track 칸이 아직 없으면(0032 전) 빼고 다시 읽는다 */
const 일정열 = ',cd:doc->>contractDate,mid:doc->deal->>mid,md:doc->deal->>midDate,m2:doc->deal->>mid2,md2:doc->deal->>mid2Date,bd:doc->deal->>balanceDate,ex:doc->period->>to';
async function 읽기(q) {
  const x = await db('bk_contract', q.replace('{track}', ',track'));
  if (x.r.ok || !/track/.test(x.t || '')) return x;
  return { ...(await db('bk_contract', q.replace('{track}', ''))), no32: true };
}
const 준비중32 = res => res.status(503).json({ error: '일정·알림 기능을 준비 중입니다 (0032 마이그레이션 필요)', need: '0032' });

/* 보관함 · 휴지통 (2026-11-10) - bin: '' (목록으로 되돌리기) · 'arch'(내리기) · 'trash'(휴지통). track 의 다른 값은 서버에 지금 있는 그대로 둔다 */
async function bin(res, agent, b) {
  const id = String(b.id || ''), 어디 = String(b.bin || '');
  if (!UUID.test(id)) return res.status(400).json({ error: '어느 계약서인지 알 수 없습니다' });
  if (!['', 'arch', 'trash'].includes(어디)) return res.status(400).json({ error: '알 수 없는 요청입니다' });
  const 오늘 = 한국오늘();
  const z = await 링크번호지켜쓰기(id, agent, (n, 지금) => { const t = { ...지금 }; delete t.arch; delete t.trash;
    if (어디) t[어디] = 오늘; if (어디 === 'trash' && 지금.arch) t.arch = 지금.arch; return t; });
  if (z.res) return z.res(res, '옮기지 못했습니다');
  return res.status(200).json({ ok: true, track: z.track });
}

/* 진행 상태만 바꾸기 (2026-11-10 대시보드 '잔금 완료하셨나요? → 완료') - track 의 다른 값은 서버에 있는 그대로 둔다 */
async function state(res, agent, b) {
  const id = String(b.id || ''), s = String(b.state || '');
  if (!UUID.test(id)) return res.status(400).json({ error: '어느 계약서인지 알 수 없습니다' });
  if (s && !Object.hasOwn(진행상태, s)) return res.status(400).json({ error: '알 수 없는 진행 상태입니다' });
  const z = await 링크번호지켜쓰기(id, agent, (n, 지금) => { const t = { ...지금 }; if (s) t.state = s; else delete t.state; return t; });
  if (z.res) return z.res(res, '진행 상태를 바꾸지 못했습니다');
  return res.status(200).json({ ok: true, track: z.track });
}

/* 일정·체크 저장 - 날인본도 된다(트리거가 track 만 통과시킨다). 내 계약서만 */
async function track(res, agent, b) {
  const id = String(b.id || '');
  if (!UUID.test(id)) return res.status(400).json({ error: '어느 계약서인지 알 수 없습니다' });
  const t = trackCheck(b.track);
  if (!t) return res.status(400).json({ error: '날짜 모양이 맞지 않습니다' });
  /* 링크 번호(shareN)는 끊기(contract-share-cut)만 올린다 - 다른 기기의 오래된 track 저장이 0 으로 되돌려
     끊은 링크가 다시 열리면 안 된다(2026-11-05 리뷰). 받은 값은 버리고 지금 값을 지킨다 */
  delete t.shareN;
  /* 초안 의견은 화면이 보낸 것으로 덮지 않는다 - 서버에 지금 있는 것을 그대로 둔다(읽음 · 지우기는 contract-note) */
  delete t.notes; delete t.tv; delete t.room;
  /* 읽은 링크 번호가 그대로일 때만 쓴다 - 그 사이 끊기가 번호를 올렸으면 다시 읽는다(2026-11-05 재검토) */
  const z = await 링크번호지켜쓰기(id, agent, (n, 지금) => ({ ...t, ...(지금.notes ? { notes: 지금.notes } : {}), ...(지금.room ? { room: 지금.room } : {}),
    ...(b.guideOff !== true && 지금.guideAt && !t.guideAt ? { guideAt: 지금.guideAt } : {}) }));   /* 잔금안내 체크를 끈 것은 guideOff 로 온다 */
  if (z.res) return z.res(res, '일정을 저장하지 못했습니다');
  return res.status(200).json({ ok: true, track: z.track });
}
/* track 을 고쳐 쓴다 - 고침(지금 링크 번호 n) 이 새 track 을 돌려준다. 링크 번호가 읽은 뒤 바뀌었으면 다시 읽어 3번까지.
   돌려주는 값: { track } 또는 { res: (res, 실패말) => 답 } */
export const track고치기 = (...a) => 링크번호지켜쓰기(...a);
async function 링크번호지켜쓰기(id, agent, 고침) {
  /* agent 가 null 이면 초안 의견(로그인 없는 쪽) - 계약서 번호만으로 찾는다 */
  const 내것 = agent ? `&agent_id=eq.${agent.id}` : '';
  for (let i = 0; i < 3; i++) {
    const got = await db('bk_contract', `select=track${agent ? '' : ',status'}&id=eq.${id}${내것}&limit=1`);
    if (!got.r.ok) { const 글 = got.t; return { res: (res, 말) => /track/.test(글 || '') ? 준비중32(res) : noTable(글) ? 준비중(res) : res.status(502).json({ error: 말 }) }; }
    if (!got.rows.length) return { res: res => res.status(404).json({ error: '내 계약서가 아니거나 지워진 계약서입니다' }) };
    const 지금 = trackCheck(got.rows[0].track || {}) || {};
    const 옛 = 지금.shareN || 0, 판 = 지금.tv || 0;
    const 받은 = 고침(옛, 지금, got.rows[0]);
    if (받은 && 받은.거절) return { res: res => res.status(받은.code || 400).json({ error: 받은.거절 }) };
    const 새 = { ...받은 };
    if (새.shareN == null && 옛) 새.shareN = 옛;
    if (!새.shareN) delete 새.shareN;
    if (!새.notes || !새.notes.length) delete 새.notes;
    새.tv = 판 + 1;
    /* 판 번호가 있으면 그것으로, 아직 없던 track(예전 것)은 링크 번호로 지킨다 */
    const 조건 = 판 ? `track->>tv=eq.${판}` : 옛 ? `track->>shareN=eq.${옛}&track->>tv=is.null` : 'or=(track.is.null,and(track->>shareN.is.null,track->>tv.is.null))';
    const { r, t: 글, rows } = await db('bk_contract', `id=eq.${id}${내것}&${조건}&select=id`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ track: 새 }),
    });
    if (!r.ok) return { res: (res, 말) => /track/.test(글 || '') ? 준비중32(res) : noTable(글) ? 준비중(res) : res.status(502).json({ error: 말 }) };
    if (rows.length) return { track: 새 };
  }
  return { res: res => res.status(409).json({ error: '다른 곳에서 같은 때 고쳐 저장하지 못했습니다 - 다시 눌러 주세요' }) };
}

/* 매일 아침 계약 일정 알림 (Vercel 예약 실행이 GET 으로 부른다 - vercel.json crons, 주소는 예전 이름 그대로).
   CRON_SECRET 이 없으면 돌지 않는다 - 아무나 불러 알림을 쏘게 두지 않는다.
   중개사 설정에 따라 카카오 알림톡은 일정 하나에 한 통, 메일은 중개사별로 하루 한 통(모아서). */
export async function reportDueCron(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !sameSecret(req.headers.authorization, `Bearer ${secret}`)) return res.status(401).json({ error: '예약 실행만 부를 수 있습니다' });
  const 오늘 = 한국오늘();
  /* 확인·설명서를 뺀 계약서 - 1200일 안에 만든 것. 가장 멀리 가는 일정은 임대차 만기 6개월 전(2년 계약이면 작성 뒤 약 550일,
     4년이어도 약 1300일 전후 - 갱신하면 새 계약서가 생긴다). 전에는 400일이라 2년 임대차의 만기 알림이 나가지 않았다(2026-11-05 리뷰). 쪽으로 나눠 다 읽는다 */
  const 열 = 'id,agent_id,agent_user,form,title,status,reported_at,prev_id,sub:doc->>sub' + 일정열;
  const 쪽 = 1000, rows = [];
  let 트랙 = true;
  for (let 처음 = 0; ; 처음 += 쪽) {
    const { r, t, rows: 받은 } = await db('bk_contract',
      `select=${열}${트랙 ? ',track' : ''}&form=not.like.explain*&created_at=gte.${날더하기(오늘, -1200)}&order=id&limit=${쪽}&offset=${처음}`);
    if (!r.ok && 트랙 && /track/.test(t || '')) { 트랙 = false; 처음 -= 쪽; continue; }
    if (!r.ok) return noTable(t) ? 준비중(res) : res.status(502).json({ error: '계약서를 읽지 못했습니다' });
    rows.push(...받은);
    if (받은.length < 쪽) break;
  }
  /* 고쳐 새 판을 만들었거나 갱신계약으로 이어 간 앞 계약서는 뺀다 - 같은 일정이 두 번 가지 않게 */
  const 앞판 = new Set(rows.map(c => c.prev_id).filter(Boolean));
  /* 보관함 · 휴지통에 넣은 계약서는 알리지 않는다(2026-11-10) */
  const 살아있음 = rows.filter(c => c.agent_id && !앞판.has(c.id) && !(c.track && (c.track.arch || c.track.trash)));
  /* 휴지통 30일이 지난 작성 중 계약서는 지운다 - 날인본은 휴지통에 남는다(지우지 않음) */
  if (트랙) await db('bk_contract', `status=eq.draft&track->>trash=lt.${날더하기(오늘, -30)}`, { method: 'DELETE' }).catch(() => {});
  /* 대화방 사진 · 파일 - 잔금 뒤 1년이 지난 것을 지운다(2026-11-10 파트너 기획 '잔금 후 1년 보관') */
  let 파일지움 = 0;
  try { 파일지움 = await (await import('./_room.js')).방파일정리(오늘); } catch { /* 0036 전이면 넘어간다 */ }
  /* 7일 동안 안 열린 제안은 만료로 바꾸고 자리를 돌려준다(2026-11-11) - 0038 전이면 need 만 남긴다 */
  let 제안만료 = { 만료: 0 };
  try { 제안만료 = await (await import('./proposal.js')).미열람만료(); } catch { /* 넘어간다 */ }
  /* 중개사 - 이름·전화·알림 설정. 0032 전이면 설정 없이(모두 켬).
     settings 통째가 아니라 알림 설정만 꺼낸다 - 같은 칸에 내 특약 문구(최대 200개)가 쌓인다 */
  const ids = [...new Set(살아있음.map(c => c.agent_id))], 중개사 = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const 묶음 = ids.slice(i, i + 100).join(',');
    let x = await db('bk_agent', `select=id,name,phone,alert:settings->alert&id=in.(${묶음})`);
    if (!x.r.ok && /settings/.test(x.t || '')) x = await db('bk_agent', `select=id,name,phone&id=in.(${묶음})`);
    if (x.r.ok) for (const a of x.rows) 중개사.set(a.id, a);
  }
  /* 자동 보관 (2026-11-10 파트너 기획 '완료 · 취소 건은 3개월 뒤 자동으로 보관함으로' - 사무소가 켠 경우만).
     완료는 잔금일, 취소는 계약일에서 90일 지난 것. 한 번에 200건까지 */
  const 석달전 = 날더하기(오늘, -90);
  const 보관할 = 살아있음.filter(c => { const a = 중개사.get(c.agent_id), t = c.track || {}; if (!a || !알림설정(a.alert).autoArch) return false;
    const 잔 = 날만(t.balanceDate) || 날만(c.bd), 계 = 날만(c.cd);
    return (t.state === 'done' && 잔 && 잔 < 석달전) || (t.state === 'cancel' && 계 && 계 < 석달전); }).slice(0, 200);
  for (const c of 보관할) await 링크번호지켜쓰기(c.id, { id: c.agent_id }, (n, 지금) => ({ ...지금, arch: 오늘 })).catch(() => {});
  const 보관됨 = new Set(보관할.map(c => c.id));
  const 사람별 = new Map();
  for (const c of 살아있음.filter(c => !보관됨.has(c.id))) {
    const a = 중개사.get(c.agent_id);
    if (!a) continue;
    const 설정 = 알림설정(a.alert);
    const 오늘것 = 오늘알림(c, 설정, 오늘);
    if (!오늘것.length) continue;
    if (!사람별.has(a.id)) 사람별.set(a.id, { a, 설정, uid: c.agent_user, 목록: [] });
    사람별.get(a.id).목록.push(...오늘것.map(e => ({ ...e, title: c.title || '소재지 미입력' })));
  }
  /* 다른 사무소가 쓴 계약서(공동중개 · 2026-11-10) - 사무소 설정의 목록. 계약일 · 중도금 · 잔금만 */
  {
    const x = await db('bk_agent', `select=id,name,phone,user_id,alert:settings->alert,ext:settings->ext&settings->ext=not.is.null&limit=1000`).catch(() => null);
    const { 외부들, 외부일정 } = await import('./_ext.js');
    for (const a of (x && x.r.ok ? x.rows : [])) {
      const 설정 = 알림설정(a.alert);
      const 오늘것 = 외부들(a.ext).flatMap(e => 외부일정(e).filter(v => !설정.off.includes(v.k)).map(v => ({ ...v, 남음: 날차(오늘, v.날), title: `${e.title} (공동중개)` })))
        .filter(v => (알림날[v.k] || []).includes(v.남음));
      if (!오늘것.length) continue;
      if (!사람별.has(a.id)) 사람별.set(a.id, { a, 설정, uid: a.user_id, 목록: [] });
      const p = 사람별.get(a.id); if (!p.uid) p.uid = a.user_id;
      p.목록.push(...오늘것);
    }
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
  return res.status(200).json({ ok: true, 대상: 살아있음.length, 알림: 사람.reduce((s, p) => s + p.목록.length, 0), 보냄, 카톡: 카톡보냄, 파일지움, 제안만료: 제안만료.만료 || 0, ...(제안만료.need ? { need: 제안만료.need } : {}) });
}

/* 서류 판독 - 등기부등본·건축물대장·토지이용계획확인서를 읽어 칸 값을 돌려준다(_scan.js).
   서류는 저장하지 않는다 - 읽고 버린다. 값은 화면이 계약서에 옮겨 적고, 저장할 때 다시 docCheck 를 거친다 */
/* 문자 캡처 읽기는 처리방침 개정(2026-11-05) 뒤 7일이 지나야 켠다 - 2026-11-12 0시(한국) */
let 문자사진부터 = Date.parse('2026-11-11T15:00:00Z');
export const __setSmsFrom = ms => { 문자사진부터 = ms; };
async function scan(req, res, b, user) {
  /* 판독 한 번이 Anthropic 요금이다 - 계정마다 하루 30번, 한 곳(IP)에서 하루 60번까지 (2026-11-03 보안점검).
     서버리스라 인스턴스마다 따로 세는 느슨한 상한이지만, 한 계정이 끝없이 돌리는 것은 막는다 */
  const 많음 = () => res.status(429).json({ error: '오늘 서류 판독을 많이 쓰셨습니다 - 내일 다시 해 주세요', code: 'too_many_scans' });
  /* 문자 캡처는 켜기 전이면 횟수를 세기 전에 막는다(막힌 시도가 하루 상한을 깎지 않게) */
  if (b && b.mode === 'sms' && Date.now() < 문자사진부터) return res.status(403).json({ error: '캡처 사진 읽기는 11월 12일부터 씁니다(개인정보 처리방침 개정 안내 기간) - 지금은 글을 붙여 넣어 주세요', code: 'not_yet' });
  if (overLimit('scan:u:' + (user && user.id), 30, 864e5) || overLimit('scan:ip:' + ipOf(req), 60, 864e5)) return 많음();
  /* 인스턴스마다 세는 위 상한은 느슨하다 - 운영 기록 표에 남긴 판독 수를 DB 에서 한 번 더 센다(새 표 없이) */
  if (user && user.id) {
    try {
      const q = new URLSearchParams({ select: 'id', action: 'eq.contract-scan', user_id: 'eq.' + user.id,
        at: 'gte.' + new Date(Date.now() - 864e5).toISOString(), limit: '31' });
      const r = await fetch(sbUrl('bk_ops_log', q.toString()), { headers: sbHeaders() });
      if (r.ok && (await r.json()).length >= 30) return 많음();
    } catch { /* 기록을 못 읽어도 판독은 막지 않는다 - 위 상한이 남아 있다 */ }
  }
  const { scanDocs, scanSms, ScanError } = await import('./_scan.js');
  try {
    /* 계약체결 문자 캡처 한 장 - 본문 글만 돌려준다(같은 하루 상한을 쓴다) */
    if (b.mode === 'sms') {
      const text = await scanSms(b.file);
      await logOps(req || { headers: {} }, user, { action: 'contract-scan', count: 1 });
      return res.status(200).json({ ok: true, text });
    }
    const out = await scanDocs(b.files);
    await logOps(req || { headers: {} }, user, { action: 'contract-scan', count: Array.isArray(b.files) ? b.files.length : null });
    return res.status(200).json({ ok: true, scan: out });
  } catch (e) {
    if (e instanceof ScanError) return res.status(e.status).json({ error: e.message, code: e.code, ...(e.code === 'no_key' ? { need: 'key' } : {}) });
    throw e;
  }
}

/* 매물 등록의 건축물대장 판독 (2026-11-12 대표님 '건축물대장도 사진이나 스캔본 인식해서 자동으로 채워').
   계약서 판독과 같은 하루 상한 · 같은 모델을 쓰고, 서류는 건축물대장(표제부 · 전유부)만 받는다. 직원 권한은 'listing'(feed.js 권한키) */
export async function listingScan(req, res, user, b) {
  const files = Array.isArray(b && b.files) ? b.files : [];
  if (!files.length || files.length > 2 || !files.every(f => f && ['bld', 'bldx'].includes(f.kind))) return res.status(400).json({ error: '건축물대장(표제부 · 전유부)만 올려 주세요' });
  return scan(req, res, { files }, user);
}

/* 작성 중인 것만 지운다(영구 삭제). 날인본은 지우지 않는다(트리거도 막는다).
   2026-11-10 - 휴지통에 들어간 것만, 대표만 지운다(직원은 feed.js 대표만에서 막힌다) */
async function del(res, agent, b) {
  const id = String(b.id || '');
  if (!UUID.test(id)) return res.status(400).json({ error: '어느 계약서인지 알 수 없습니다' });
  if (agent.staff) return res.status(403).json({ error: '영구 삭제는 대표만 할 수 있습니다' });
  const { r, t, rows } = await db('bk_contract', `id=eq.${id}&agent_id=eq.${agent.id}&status=eq.draft`, {
    method: 'DELETE', headers: { Prefer: 'return=representation' },
  });
  if (!r.ok) return noTable(t) ? 준비중(res) : res.status(502).json({ error: '지우지 못했습니다' });
  if (!rows.length) return res.status(409).json({ error: '날인본은 지울 수 없습니다' });
  return res.status(200).json({ ok: true });
}

/* ════════ 일정 달력 구독 (2026-11-10 파트너 기획 '구글 · 휴대폰 달력에 계약 일정') ════════
   사무소마다 서명한 주소(C1.사무소.번호.서명) - 휴대폰 · 구글 달력이 이 주소를 몇 시간마다 다시 읽는다.
   번호(settings.icsN)를 올리면 예전 주소는 끊긴다(대표가 '주소 바꾸기'). 로그인이 없으므로 주소를 아는 사람은 일정을 본다 - 화면이 그렇게 알린다 */
const 달력열쇠 = () => crypto.createHash('sha256').update('bk-ics|' + String(process.env.BK_SECRET_KEY || ''), 'utf8').digest();
const 달력서명 = (a, n) => crypto.createHmac('sha256', 달력열쇠()).update(`${a}.${n}`).digest('base64url').slice(0, 32);
export const 달력표 = (agentId, n = 0) => `C1.${agentId}.${n}.${달력서명(agentId, n)}`;
export function 달력표읽기(tok) {
  const m = /^C1\.([0-9a-f-]{36})\.(\d{1,6})\.([A-Za-z0-9_-]{32})$/.exec(String(tok || ''));
  if (!m || !UUID.test(m[1])) return null;
  return sameSecret(m[3], 달력서명(m[1], +m[2])) ? { a: m[1], n: +m[2] } : null;
}
const ics글 = v => String(v || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
/* 한 줄 75바이트 - 넘으면 접는다(RFC 5545). 한글은 3바이트라 글자 단위로 센다 */
function ics접기(줄) {
  const out = []; let 지금 = '', 길이 = 0;
  for (const ch of 줄) { const b = Buffer.byteLength(ch); if (길이 + b > (out.length ? 74 : 75)) { out.push(지금); 지금 = ''; 길이 = 0; } 지금 += ch; 길이 += b; }
  out.push(지금); return out.join('\r\n ');
}
const ics날 = d => d.replace(/-/g, '');
export function 달력글(이름, 일들, 지금 = new Date()) {
  const 찍 = 지금.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const 줄 = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BeaverKnock//Contract Schedule//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${ics글(이름)}`, 'X-WR-TIMEZONE:Asia/Seoul', 'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H'];
  for (const e of 일들) {
    줄.push('BEGIN:VEVENT', `UID:${e.uid}@beaverknock.co.kr`, `DTSTAMP:${찍}`, `DTSTART;VALUE=DATE:${ics날(e.날)}`,
      `DTEND;VALUE=DATE:${ics날(날더하기(e.끝 || e.날, 1))}`, `SUMMARY:${ics글(e.제목)}`, `DESCRIPTION:${ics글(e.설명)}`, 'TRANSP:TRANSPARENT', 'END:VEVENT');
  }
  줄.push('END:VCALENDAR');
  return 줄.map(ics접기).join('\r\n') + '\r\n';
}
export async function icsFeed(req, res) {
  const t = 달력표읽기(req.query.ics);
  const 없음 = () => res.status(404).json({ error: '구독 주소가 맞지 않거나 바뀌었습니다 - 비버노크에서 새 주소를 받아 주세요' });
  if (!t) return 없음();
  const a = await db('bk_agent', `select=id,office,alert:settings->alert,icsN:settings->icsN,ext:settings->ext&id=eq.${t.a}&limit=1`);
  const 사 = a.r.ok ? a.rows[0] : null;
  if (!사 || (Number.isInteger(사.icsN) ? 사.icsN : 0) !== t.n) return 없음();
  const 설정 = 알림설정(사.alert), 오늘 = 한국오늘(), 부터 = 날더하기(오늘, -90);
  const x = await 읽기(`select=id,form,title,status,reported_at,prev_id,sub:doc->>sub${일정열}{track}&agent_id=eq.${t.a}&form=not.like.explain*&created_at=gte.${날더하기(오늘, -1200)}&order=updated_at.desc&limit=1000`);
  if (!x.r.ok) return res.status(502).json({ error: '일정을 읽지 못했습니다' });
  const 앞판 = new Set(x.rows.map(c => c.prev_id).filter(Boolean));
  const 일들 = [];
  for (const c of x.rows) {
    if (앞판.has(c.id) || (c.track && (c.track.arch || c.track.trash || c.track.off))) continue;
    for (const e of 일정목록(c, 설정)) {
      if (e.날 < 부터 || (e.k === 'report' && (c.status !== 'sealed' || c.reported_at)) || (['expiry', 'settle', 'prep'].includes(e.k) && c.status !== 'sealed')) continue;
      if (e.k === 'settle' && c.track && ['done', 'cancel'].includes(c.track.state)) continue;
      일들.push({ uid: `${c.id}-${e.k}-${e.날}`, 날: e.날, 끝: e.끝 && e.끝 > e.날 ? e.끝 : '', 제목: `${e.마침 ? '[마침] ' : ''}${e.이름} · ${c.title || '소재지 미입력'}`,
        설명: `${e.메모}\n${c.status === 'sealed' ? '날인본' : '작성 중'} 계약서 - https://beaverknock.co.kr/#/partner/contract/${c.id}` });
    }
  }
  const { 외부들, 외부일정 } = await import('./_ext.js');
  for (const e of 외부들(사.ext)) for (const v of 외부일정(e)) if (v.날 >= 부터)
    일들.push({ uid: `x${e.id}-${v.k}-${v.날}`, 날: v.날, 끝: '', 제목: `${v.이름} · ${e.title} (공동중개)`, 설명: `${e.office ? e.office + ' 작성 · ' : ''}다른 사무소가 쓴 계약서` });
  일들.sort((p, q) => (p.날 > q.날) - (p.날 < q.날));
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="beaverknock.ics"');
  return res.status(200).send(달력글(`비버노크 계약 일정${사.office ? ' · ' + 사.office : ''}`, 일들.slice(0, 2000)));
}
