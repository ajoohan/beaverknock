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

/* 주택임대차 · 상가건물 임대차 · 부동산 매매 · 중개대상물 확인·설명서(주거용) (화면의 CT_FORMS 와 같은 이름) */
export const CT_FORMS = ['home-lease', 'shop-lease', 'sale', 'explain-home', 'explain-biz', 'explain-land', 'explain-etc'];
export const CT_SCHEMA = 'bk-contract/1';
const CT_MAX = 64 * 1024;                     /* 계약서 한 장 - 조항·특약을 넉넉히 적어도 이 안이다 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIST_COLS = 'id,created_at,updated_at,form,title,status,sealed_at,sha256,prev_id,proposal_id,reported_at';
/* 신고가 있는 양식 - 매매(거래신고) · 주택임대차(임대차 신고). 상가 임대차·확인·설명서는 신고가 없다 */
export const CT_REPORT_FORMS = ['sale', 'home-lease'];

const noTable = t => /does not exist|PGRST205|bk_contract/i.test(t);
const 준비중 = res => res.status(503).json({ error: '계약서 기능을 준비 중입니다 (0031 마이그레이션 필요)', need: '0031' });

/* 주민등록번호(외국인등록번호 포함) 모양 - 앞 6자리 생년월일 + 성별 숫자 1~8 + 6자리.
   구분자가 무엇이든(하이픈·점·공백·en dash, 숫자 사이 0~3글자 - '900101 - 5234567' 처럼) 전각 숫자든 잡는다.
   숫자 13개를 모은 뒤 생년월일·성별 자리가 말이 되는지 본다 - 금액·전화번호를 잘못 잡지 않게.
   생년월일 6자리만 적은 것은 잡지 않는다. */
const 열세자리 = /(?<!\d)\d(?:[^\p{L}\p{N}]{0,3}\d){12}(?!\d)/gu;
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
      default: res.status(400).json({ error: '알 수 없는 요청입니다' });
    }
  } catch (e) {
    res.status(502).json({ error: 'DB에 닿지 못했습니다' });
  }
  return true;
}

async function list(res, agent) {
  const { r, t, rows } = await db('bk_contract',
    `select=${LIST_COLS}&agent_id=eq.${agent.id}&order=updated_at.desc&limit=200`);
  if (!r.ok) return noTable(t) ? 준비중(res) : res.status(502).json({ error: '계약서 목록을 불러오지 못했습니다' });
  return res.status(200).json({ ok: true, rows });
}

async function one(res, agent, b) {
  const id = String(b.id || '');
  if (!UUID.test(id)) return res.status(400).json({ error: '어느 계약서인지 알 수 없습니다' });
  const { r, t, rows } = await db('bk_contract', `select=${LIST_COLS},doc&id=eq.${id}&agent_id=eq.${agent.id}&limit=1`);
  if (!r.ok) return noTable(t) ? 준비중(res) : res.status(502).json({ error: '계약서를 불러오지 못했습니다' });
  if (!rows.length) return res.status(404).json({ error: '내 계약서가 아니거나 지워진 계약서입니다' });
  return res.status(200).json({ ok: true, row: rows[0] });
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

  /* 연결된 제안은 내 제안일 때만 잇는다 - 남의 제안 번호를 적어 와도 그 손님과 엮이지 않게 */
  let proposal = null;
  if (UUID.test(String(b.proposal_id || ''))) {
    const p = await db('bk_proposal', `select=id&id=eq.${b.proposal_id}&agent_id=eq.${agent.id}&limit=1`);
    if (p.r.ok && p.rows.length) proposal = b.proposal_id;
  }
  const { r, t, rows } = await db('bk_contract', '', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ ...body, agent_id: agent.id, agent_user: user.id, proposal_id: proposal }),
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
export const 알릴날 = [7, 3, 1, 0];

/* 매일 아침 신고 기한 알림 (Vercel 예약 실행이 GET 으로 부른다 - vercel.json crons).
   CRON_SECRET 이 없으면 돌지 않는다 - 아무나 불러 메일을 쏘게 두지 않는다.
   신고 안 한(reported_at 없음) 매매·주택임대차 날인본 중 기한이 7·3·1·0일 남은 것만, 중개사별로 한 통씩. */
export async function reportDueCron(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: '예약 실행만 부를 수 있습니다' });
  /* 알릴 날(0~7일 남음)에 걸리는 계약일만 DB 에서 고른다 - 기한 = 계약일 + 30일이므로
     계약일이 오늘-30 ~ 오늘-23 인 것. 신고 안 한 날인본이 쌓여도 이번 주 대상이 잘리지 않게, 쪽으로 나눠 다 읽는다. */
  const 오늘 = 한국오늘(), 사람별 = new Map();
  const 전 = n => new Date(Date.parse(오늘 + 'T00:00:00Z') - n * 864e5).toISOString().slice(0, 10);
  const 쪽 = 1000, rows = [];
  for (let 처음 = 0; ; 처음 += 쪽) {
    const { r, t, rows: 받은 } = await db('bk_contract',
      `select=id,agent_user,form,title,doc&status=eq.sealed&reported_at=is.null&form=in.(${CT_REPORT_FORMS.join(',')})`
      + `&doc->>contractDate=gte.${전(30)}&doc->>contractDate=lte.${전(23)}&order=id&limit=${쪽}&offset=${처음}`);
    if (!r.ok) return noTable(t) ? 준비중(res) : res.status(502).json({ error: '계약서를 읽지 못했습니다' });
    rows.push(...받은);
    if (받은.length < 쪽) break;
  }
  for (const c of rows) {
    const d = 신고남은날(c.doc && c.doc.contractDate, 오늘);
    if (!d || !알릴날.includes(d.남음) || !c.agent_user) continue;
    if (!사람별.has(c.agent_user)) 사람별.set(c.agent_user, []);
    사람별.get(c.agent_user).push({ ...d, title: c.title || '소재지 미입력', form: c.form });
  }
  const 메일 = [], 사람 = [...사람별];
  const 주소 = [];
  for (let i = 0; i < 사람.length; i += 10) 주소.push(...await Promise.all(사람.slice(i, i + 10).map(([uid]) => emailOf(uid))));
  for (const [n, [, 목록]] of 사람.entries()) {
    const to = 주소[n];
    if (!to) continue;
    const 급한 = Math.min(...목록.map(x => x.남음));
    메일.push({ to, subject: 급한 === 0 ? '오늘이 신고 기한인 계약이 있습니다' : `신고 기한이 ${급한}일 남은 계약이 있습니다`,
      rows: 목록.map(x => [x.form === 'sale' ? '거래신고' : '임대차 신고', `${x.title} · 기한 ${x.기한} (${x.남음 ? `${x.남음}일 남음` : '오늘'})`]),
      link: '/#/partner/contracts', cta: '계약서 열기',
      note: '신고를 마쳤으면 계약서의 신고 도우미에서 ‘신고 마침’ 을 눌러 주세요 - 이 알림이 멈춥니다.' });
  }
  /* notifyMany 는 한 번에 100통까지다(Resend 묶음 상한) - 100통씩 나눠 보낸다 */
  let 보냄 = 0;
  for (let i = 0; i < 메일.length; i += 100) 보냄 += (await notifyMany(req, 메일.slice(i, i + 100))).sent || 0;
  return res.status(200).json({ ok: true, 대상: rows.length, 보냄 });
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
