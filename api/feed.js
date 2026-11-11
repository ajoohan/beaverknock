/* 중개사 화면 — 나에게 맞는 손님 조건.
 *
 * 승인된 파트너만 본다. 승인 전에는 아무것도 보이지 않는다 -
 * 손님 조건은 이름과 연락처가 붙은 자료이고, 아무나 열어볼 것이 아니다.
 *
 * 연락처는 여기서 절대 내보내지 않는다. 손님이 '연결' 을 누르기 전까지
 * 중개사는 지역·조건·메모까지만 본다.
 */

import crypto from 'node:crypto';
import { userFrom, sbHeaders, sbUrl, overLimit } from './_auth.js';
import { dbWhy } from './_dberr.js';
import { contractRoute, reportDueCron, draftRead, draftNote, icsFeed, 달력표, 알림설정, 특약문구들, 특약문구고침, 문자틀들, 문자기록들, 문자고침, 단지들, 단지고침 } from './_contract.js';
import { 날씨 } from './_weather.js';
import { 서식들, 서식확인, 서식올리기, 서식주소, 서식지우기, 서식최대, 파일버킷, 버킷올리기, 버킷주소, 버킷지우기 } from './_forms.js';
import { 외부들, 외부하나, 외부최대, 외부경로 } from './_ext.js';
import { 직원들, 직원고침, 직원사무소, 직원들어옴, 직원역할, 다른사무소직원 } from './_staff.js';
import { notify, mailWithFile } from './_notify.js';
import { roomAgent, invitePeek } from './_room.js';

const KIND_KO = { home: '주거', shop: '상가', office: '오피스', storage: '창고' };

/* '미사역 상권' 과 '미사역' 을 같은 곳으로 본다 */
const norm = x => String(x || '').replace(/\s*(상권|전체|어디든)\s*/g, '').trim();

/* ── 소유자가 볼 수 있는 수요 ──
   소유자와 시행사는 목록을 훑지 못한다. 올려둔 물건에 실제로 맞는 수요만 본다.

   중개사는 여러 물건을 다루니 목록을 보는 것이 일이지만, 소유자는 가진 물건이
   정해져 있다. 목록을 열어주면 맞지 않는 곳까지 일단 다 뿌리게 되고 -
   그러면 손님의 다섯 자리가 홍보로 차서, 정작 맞는 곳이 못 들어온다.
   이 서비스가 파는 것이 그 다섯 자리라서, 여기서 새면 파는 물건이 상한다.

   화면에서 감추는 것으로는 부족하다. 목록도 제안도 서버에서 막는다.

   맞는다는 것은 넷이 모두 맞는다는 뜻이다 - 지역 · 유형 · 거래방식 · 예산.
   손님이 적은 예산은 상한이므로, 물건 값이 그 안에 들어와야 한다. */
const normDeal = x => String(x || '').trim();

/* 손님이 고른 곳이 어느 시·군에 속하는지.
   지금 동 단위로 고를 수 있는 곳은 하남시뿐이라 표가 짧다. 서울은 구,
   경기는 시가 이미 시군구 단위여서 따로 옮길 것이 없다. */
const HANAM = ['미사1동','미사2동','미사3동','신장1동','신장2동','신장동','덕풍1동','덕풍2동','덕풍3동',
  '덕풍동','천현동','감일동','감북동','초이동','위례동','춘궁동','미사역','하남시청역','스타필드 인근'];
const DONG_TO_SI = {};
HANAM.forEach(d => { DONG_TO_SI[d] = '하남시'; });

/* '하남 어디든' · '서울 전체' 처럼 넓게 적은 것 */
const WIDE = /(어디든|전체)/;
const siOf = n => DONG_TO_SI[n] || (/(시|군|구)$/.test(n) ? n : (/^하남/.test(n) ? '하남시' : ''));

/* 두 지역이 같은 곳을 가리키는가.

   넓게 잡은 쪽이 있으면 시·군으로 견준다 - '하남시' 를 맡은 중개사에게
   '미사1동' 손님이 가야 하고, '하남 어디든' 손님에게 미사1동 물건이 가야 한다.
   어느 쪽이 넓은지는 미리 정해져 있지 않다. 활동 지역은 시·군이 넓은 쪽이고,
   손님이 '어디든' 을 고르면 손님 쪽이 넓은 쪽이다 - 그래서 양쪽 다 본다.

   둘 다 콕 집었으면 이름이 같아야 한다. '미사1동' 을 적은 손님에게 덕풍2동
   물건이 가면 안 된다 - 같은 하남시라도 그 손님이 고른 곳이 아니다. */
const isWide = raw => {
  const n = norm(raw);
  return WIDE.test(String(raw)) || /(시|군|구)$/.test(n);
};

function regionHit(mine, theirs) {
  const one = norm(mine);
  if (!one) return false;
  const myWide = isWide(mine), mySi = siOf(one);
  return (theirs || []).some(x => {
    const d = norm(x);
    if (!d) return false;
    if (d === one || d.includes(one) || one.includes(d)) return true;
    if (!myWide && !isWide(x)) return false;
    const si = siOf(d);
    return !!mySi && !!si && mySi === si;
  });
}

/* 손님이 안 적은 값으로는 막지 않는다 - 안 적은 것은 '아무거나' 라는 뜻이지
   '0원까지' 라는 뜻이 아니다. 없는 조건을 만들어 막으면 정상 거래가 사라진다. */
const withinCap = (mine, cap) => !(cap > 0) || !(mine > 0) || mine <= cap;

export function listingFits(L, d) {
  if (!L || !d) return false;
  if (L.kind !== d.kind) return false;
  if (!regionHit(L.dong, d.dongs)) return false;
  /* 거래방식은 주거에만 있다. 상가·오피스·창고는 이 칸이 비어 있다. */
  const a = normDeal(L.deal), b = normDeal(d.deal);
  if (a && b && a !== b) return false;
  if (!withinCap(L.dep, d.dep)) return false;
  if (!withinCap(L.rent, d.rent)) return false;
  return true;
}

/* 어느 물건 하나라도 맞으면 보여준다 - 그 물건으로 제안하면 되기 때문이다 */
export const anyFits = (list, d) => (list || []).some(L => listingFits(L, d));

/* 목록을 훑을 수 있는 사람인가. 중개사만이다. */
export const canBrowse = agent => (agent && agent.role) === 'agent';

export async function myListings(agentId) {
  const q = new URLSearchParams({
    select: 'id,kind,dong,deal,dep,rent,name,status',
    agent_id: 'eq.' + agentId, status: 'eq.active', limit: '200',
  });
  const r = await fetch(sbUrl('bk_listing', q.toString()), { headers: sbHeaders() });
  if (!r.ok) {
    const t = await r.text();
    /* 표가 아직 없으면 물건이 없는 것과 같다 - 없는 것으로 보고 막는다 */
    if (/does not exist|PGRST205/i.test(t)) return [];
    return null;
  }
  return await r.json();
}

/* 파트너 화면이 '내 정보' 로 보여줄 것. 자기 것이라 가리지 않는다 -
   가리면 잘못 적은 번호를 본인이 찾아낼 방법이 없다. */
export const meAgent = a => a && {
  id: a.id, office: a.office || null, role: a.role || null,
  owner_type: a.owner_type || null, status: a.status || null,
  name: a.name || null, phone: a.phone || null,
  reg_no: a.reg_no || null, addr: a.addr || null,
  created_at: a.created_at || null,
  /* 직원으로 든 계정 (2026-11-06) - 역할 · 이름. 화면이 메뉴 · 단추를 고르고, 서버도 따로 막는다 */
  ...(a.staff ? { staff: { role: a.staff.role, name: a.staff.name || null, perm: a.staff.perm || {} } } : {}),
};

const 사무소열 = 'id,role,status,office,name,phone,reg_no,addr,owner_type,created_at,'
  + 'scope_regions,scope_kinds,scope_excluded,scope_set,notify_paused';
export async function approvedAgent(user) {
  const q = new URLSearchParams({ select: 사무소열, user_id: 'eq.' + user.id, limit: '1' });
  const r = await fetch(sbUrl('bk_agent', q.toString()), { headers: sbHeaders() });
  if (!r.ok) return { error: await r.text() };
  const rows = await r.json();
  if (!rows.length) {
    /* 직원 계정 (2026-11-06) - 내 사무소가 없으면 직원으로 든 사무소로 일한다(계약서 · 제안 · 물건을 대표와 같이 본다) */
    const 직 = await 직원사무소(user, 사무소열).catch(() => null);
    if (!직) return { none: true };
    if (직.첫로그인) await 설정고침(직.agent, s => ({ patch: { staff: 직원들어옴(s.staff, 직.agent.staff.i, user.id) } })).catch(() => {});
    const a = 직.agent;
    return a.status === 'approved' ? { agent: a } : { pending: a.status || 'new', agent: a };
  }
  const a = rows[0];
  return a.status === 'approved' ? { agent: a } : { pending: a.status || 'new', agent: a };
}

/* 알림 설정 (2026-10-30 대표님 '카카오 알림설정') - bk_agent.settings.alert.
   settings 칸이 아직 없으면(0032 전) 기본값(모두 켬)을 보여 주고 저장은 막는다. 다른 설정 키는 건드리지 않고 alert 만 바꾼다 */
async function 설정읽기(agent) {
  const r = await fetch(sbUrl('bk_agent', `select=settings&id=eq.${agent.id}`), { headers: sbHeaders() });
  if (!r.ok) { const t = await r.text().catch(() => ''); return /settings/.test(t) ? { need: '0032', settings: {} } : { error: true }; }
  const s = ((await r.json().catch(() => []))[0] || {}).settings;
  return { settings: s && typeof s === 'object' && !Array.isArray(s) ? s : {} };
}
/* settings 고치기 (2026-11-05 리뷰) - settings 를 통째로 읽고 덮으므로, 다른 기기에서 같은 때 고치면 한쪽이 사라졌다.
   읽은 판(settings.rev)이 그대로일 때만 쓰고(rev 를 하나 올린다), 그 사이 바뀌었으면 다시 읽어 다시 고친다 - 3번까지.
   고침(settings) 은 { patch } 또는 { error, code } 를 돌려준다. 돌려주는 값: { x, y } 또는 { need } · { error } · { busy } · { failed } */
export async function 설정고침(agent, 고침) {
  for (let i = 0; i < 3; i++) {
    const x = await 설정읽기(agent);
    if (x.need) return { need: x.need };
    if (x.error) return { error: true };
    const y = 고침(x.settings);
    if (!y || y.error) return { x, y };
    const rev = Number.isInteger(x.settings.rev) && x.settings.rev > 0 ? x.settings.rev : 0;
    const 조건 = rev ? `settings->>rev=eq.${rev}` : 'or=(settings->>rev.is.null,settings->>rev.eq.0)';
    const r = await fetch(sbUrl('bk_agent', `id=eq.${agent.id}&${조건}&select=id`), {
      method: 'PATCH', headers: { ...sbHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify({ settings: { ...x.settings, ...y.patch, rev: rev + 1 } }),
    });
    if (!r.ok) return { failed: true };
    if ((await r.json().catch(() => [])).length) return { x, y };
  }
  return { busy: true };
}
/* 설정고침 의 실패를 답으로 - 이름은 '알림 설정' · '문자 틀' 처럼 */
const 설정실패 = (res, z, 이름) => z.need ? res.status(503).json({ error: `${이름} 저장을 준비 중입니다 (0032 마이그레이션 필요)`, need: '0032' })
  : z.error ? res.status(502).json({ error: `${이름} - 불러오지 못했습니다` })
  : z.busy ? res.status(409).json({ error: '다른 기기에서 같은 때 고쳐 저장하지 못했습니다 - 다시 눌러 주세요' })
  : res.status(502).json({ error: '저장하지 못했습니다' });
/* 직원이 못 하는 일 - 서버가 막는다(화면은 고쳐 쓸 수 있다) */
export const 대표만 = w => /^staff/.test(String(w || '')) || ['office-addr', 'scope-save', 'contract-del', 'ics-reset'].includes(w);   /* contract-del = 영구 삭제(2026-11-10) */
/* 계약서 PDF 를 메일로 (2026-11-08) - 화면이 만든 PDF(base64)를 받아 Resend 로 붙여 보낸다. 서버에 남기지 않는다.
   받는 사람 5명까지 · 사무소마다 한 시간에 20통 · 파일 3MB 까지(본문 4.5MB 한도 안). 회신은 중개사 메일로 */
const 메일모양 = /^[^\s@<>,;:"'()\[\]\\]+@[^\s@<>,;:"'()\[\]\\]+\.[a-z]{2,}$/i;
async function contractMail(req, res, agent, user, b) {
  if (!process.env.RESEND_API_KEY) return res.status(503).json({ error: '메일 보내기는 준비 중입니다' });
  const 받는 = [...new Set((Array.isArray(b.to) ? b.to : []).map(x => String(x || '').trim().toLowerCase()).filter(Boolean))];
  if (!받는.length) return res.status(400).json({ error: '받는 메일 주소를 적어 주세요' });
  if (받는.length > 5) return res.status(400).json({ error: '한 번에 5명까지 보낼 수 있습니다' });
  const 틀린 = 받는.find(x => x.length > 120 || !메일모양.test(x));
  if (틀린) return res.status(400).json({ error: `메일 주소를 확인해 주세요 - ${틀린.slice(0, 60)}` });
  const pdf = String(b.pdf || '');
  if (!pdf || pdf.length > 4.2e6 || !/^[A-Za-z0-9+/]+=*$/.test(pdf)) return res.status(400).json({ error: '파일이 비었거나 너무 큽니다(3MB 까지)' });
  if (Buffer.from(pdf.slice(0, 12), 'base64').toString('latin1').slice(0, 5) !== '%PDF-') return res.status(400).json({ error: 'PDF 파일이 아닙니다' });
  /* 한도는 세기만 하고, 나갔거나 나갔을 수 있을 때만 늘린다 - 메일 서버가 거절한 것까지 세면 한 통도 안 갔는데 한도가 준다 (2026-11-10 리뷰) */
  if (overLimit('ctmail:' + agent.id, 20, 60 * 60e3, false)) return res.status(429).json({ error: '메일은 한 시간에 20통까지 보낼 수 있습니다 - 잠시 뒤 보내 주세요' });
  const 이름 = (String(b.name || '').replace(/[\u0000-\u001f\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120).replace(/\.pdf$/i, '') || '계약서') + '.pdf';
  const 제목 = 이름.replace(/\.pdf$/i, '').split('_')[0];
  const 사무소 = String(agent.office || '').trim() || '중개사무소';
  const 한마디 = String(b.msg || '').replace(/\r/g, '').trim().slice(0, 500);
  const 회신 = user && user.email && 메일모양.test(user.email) ? user.email : undefined;
  const r = await mailWithFile(req, { to: 받는, subject: `${사무소} - ${제목}`, replyTo: 회신,
    rows: [['보낸 곳', 사무소], ['서류', 제목], ...(한마디 ? [['전하는 말', 한마디]] : [])],
    note: `${사무소}에서 비버노크로 보낸 메일입니다. 서류는 첨부한 PDF(${이름})에 있습니다.` + (회신 ? ' 이 메일에 답장하면 사무소로 갑니다.' : ''),
    file: { name: 이름, b64: pdf } });
  if (r.ok || r.unsure) overLimit('ctmail:' + agent.id, 20, 60 * 60e3);
  if (!r.ok) return res.status(r.unsure ? 504 : 502).json({ error: r.error });
  return res.status(200).json({ ok: true, sent: 받는.length });
}
/* 요청 → 권한 (2026-11-10 직원 기능별 권한) */
export const 권한키 = w => { w = String(w || '');
  if (w === 'contract-seal') return 'ct_seal';
  if (w === 'contract-mail') return 'ct_mail';
  if (['contracts', 'contract', 'forms', 'form-url', 'phrases', 'sms', 'complex', 'alert-settings', 'ics-link', 'contract-ext', 'contract-ext-url'].includes(w)) return 'ct_view';
  if (/^(contract|form-)/.test(w) || ['phrases-save', 'sms-save', 'complex-save', 'alert-settings-save', 'end-style-save'].includes(w)) return 'ct_edit';
  if (/^listing-/.test(w)) return 'listing';
  if (/^room/.test(w)) return 'room';
  return ''; };
export const 계약기능 = w => /^(contract|form)/.test(String(w || '')) || ['forms', 'phrases', 'phrases-save', 'sms', 'sms-save',
  'complex', 'complex-save', 'alert-settings', 'alert-settings-save', 'end-style-save', 'ics-link', 'ics-reset'].includes(w);
const 가린번호 = p => { const n = String(p || '').replace(/\D/g, ''); return n.length >= 10 ? `${n.slice(0, 3)}-****-${n.slice(-4)}` : ''; };
async function readAlert(res, agent) {
  const x = await 설정읽기(agent);
  if (x.error) return res.status(502).json({ error: '알림 설정을 불러오지 못했습니다' });
  return res.status(200).json({ ok: true, alert: 알림설정(x.settings.alert), need: x.need || '',
    phone: 가린번호(agent.phone), kakaoReady: !!process.env.SOLAPI_TPL_SCHEDULE, end: x.settings.ctEnd === 'same' ? 'same' : 'prev' });
}
/* 임대차 종료일 표기(파트너 리뷰 '사무소 설정') - 시작 전날(prev) · 시작과 같은 날(same). settings.ctEnd */
async function saveEndStyle(res, agent, b) {
  const ctEnd = b.end === 'same' ? 'same' : 'prev';
  const z = await 설정고침(agent, () => ({ patch: { ctEnd } }));
  if (!z.y) return 설정실패(res, z, '설정');
  return res.status(200).json({ ok: true, end: ctEnd });
}
async function saveAlert(res, agent, b) {
  const alert = 알림설정(b.alert);
  const z = await 설정고침(agent, () => ({ patch: { alert } }));
  if (!z.y) return 설정실패(res, z, '알림 설정');
  return res.status(200).json({ ok: true, alert });
}

/* 내 특약 문구함 (2026-10-30 대표님) - bk_agent.settings.phrases. 계약서 도구라 공인중개사만.
   넣기·고치기·지우기는 하나씩 받아 서버가 지금 목록에 반영한다 - 목록을 통째로 덮으면 다른 기기에서 넣은 것이 사라진다 */
async function readPhrases(res, agent) {
  if (agent.role !== 'agent') return res.status(403).json({ error: '공인중개사만 쓸 수 있습니다' });
  const x = await 설정읽기(agent);
  if (x.error) return res.status(502).json({ error: '내 특약을 불러오지 못했습니다' });
  return res.status(200).json({ ok: true, phrases: 특약문구들(x.settings.phrases), need: x.need || '' });
}
async function savePhrases(res, agent, b) {
  if (agent.role !== 'agent') return res.status(403).json({ error: '공인중개사만 쓸 수 있습니다' });
  const z = await 설정고침(agent, s => { const y = 특약문구고침(s.phrases, b); return y.error ? { ...y, now: 특약문구들(s.phrases) } : { ...y, patch: { phrases: y.list } }; });
  if (!z.y) return 설정실패(res, z, '내 특약');
  if (z.y.error) return res.status(z.y.code || 400).json({ error: z.y.error, phrases: z.y.now });
  return res.status(200).json({ ok: true, phrases: z.y.list, id: z.y.id || '' });
}

/* 계약체결 문자 (2026-11-05 파트너 리뷰) - 문자 틀과 보낸 기록. 계약서 도구라 공인중개사만 */
async function readSms(res, agent) {
  if (agent.role !== 'agent') return res.status(403).json({ error: '공인중개사만 쓸 수 있습니다' });
  const x = await 설정읽기(agent);
  if (x.error) return res.status(502).json({ error: '문자 틀을 불러오지 못했습니다' });
  return res.status(200).json({ ok: true, tpls: 문자틀들(x.settings.smsTpl), log: 문자기록들(x.settings.smsLog), need: x.need || '' });
}
async function saveSms(res, agent, b) {
  if (agent.role !== 'agent') return res.status(403).json({ error: '공인중개사만 쓸 수 있습니다' });
  const z = await 설정고침(agent, s => { const y = 문자고침(s, b);
    return y.error ? { ...y, tpls: 문자틀들(s.smsTpl), log: 문자기록들(s.smsLog) } : { ...y, patch: { smsTpl: y.tpls, smsLog: y.log } }; });
  if (!z.y) return 설정실패(res, z, '문자 틀');
  if (z.y.error) return res.status(z.y.code || 400).json({ error: z.y.error, tpls: z.y.tpls, log: z.y.log });
  return res.status(200).json({ ok: true, tpls: z.y.tpls, log: z.y.log });
}

/* 자주 쓰는 단지 (2026-11-05 파트너 리뷰) - 확인·설명서 단지 값. 공인중개사만 */
async function readComplex(res, agent) {
  if (agent.role !== 'agent') return res.status(403).json({ error: '공인중개사만 쓸 수 있습니다' });
  const x = await 설정읽기(agent);
  if (x.error) return res.status(502).json({ error: '단지를 불러오지 못했습니다' });
  return res.status(200).json({ ok: true, list: 단지들(x.settings.complexes), need: x.need || '' });
}
async function saveComplex(res, agent, b) {
  if (agent.role !== 'agent') return res.status(403).json({ error: '공인중개사만 쓸 수 있습니다' });
  const z = await 설정고침(agent, s => { const y = 단지고침(s.complexes, b); return y.error ? { ...y, now: 단지들(s.complexes) } : { ...y, patch: { complexes: y.list } }; });
  if (!z.y) return 설정실패(res, z, '단지');
  if (z.y.error) return res.status(z.y.code || 400).json({ error: z.y.error, list: z.y.now });
  return res.status(200).json({ ok: true, list: z.y.list });
}

/* 우리 사무소 서식 (2026-11-06) - 파일은 저장소 bk-forms, 목록은 settings.forms. 공인중개사만 */
async function readForms(res, agent) {
  if (agent.role !== 'agent') return res.status(403).json({ error: '공인중개사만 쓸 수 있습니다' });
  const x = await 설정읽기(agent);
  if (x.error) return res.status(502).json({ error: '서식을 불러오지 못했습니다' });
  return res.status(200).json({ ok: true, list: 서식들(x.settings.forms), need: x.need || '' });
}
async function upForm(res, agent, b) {
  if (agent.role !== 'agent') return res.status(403).json({ error: '공인중개사만 쓸 수 있습니다' });
  const c = 서식확인(b);
  if (c.error) return res.status(400).json({ error: c.error });
  const 지금 = await 설정읽기(agent);
  if (지금.error) return res.status(502).json({ error: '서식을 불러오지 못했습니다' });
  if (서식들(지금.settings.forms).length >= 서식최대) return res.status(400).json({ error: `서식은 ${서식최대}개까지 둡니다 - 안 쓰는 서식을 지운 뒤 올려 주세요` });
  const u = await 서식올리기(agent.id, c.ext, c.buf);
  if (u.need) return res.status(503).json({ error: '서식 올리기를 준비 중입니다 - 곧 열립니다', need: 'forms' });
  if (!u.id) return res.status(502).json({ error: u.error || '파일을 올리지 못했습니다' });
  const at = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 19);
  const 새 = { id: u.id, name: c.name, ext: c.ext, size: c.buf.length, at };
  const z = await 설정고침(agent, s => { const L = 서식들(s.forms);
    return L.length >= 서식최대 ? { error: `서식은 ${서식최대}개까지 둡니다`, code: 400 } : { list: [새, ...L], patch: { forms: [새, ...L] } }; });
  if (!z.y || z.y.error) { await 서식지우기(agent.id, 새).catch(() => {}); return z.y && z.y.error ? res.status(400).json({ error: z.y.error }) : 설정실패(res, z, '서식'); }
  return res.status(200).json({ ok: true, list: z.y.list });
}
async function formUrl(res, agent, b) {
  if (agent.role !== 'agent') return res.status(403).json({ error: '공인중개사만 쓸 수 있습니다' });
  const x = await 설정읽기(agent);
  if (x.error) return res.status(502).json({ error: '서식을 불러오지 못했습니다 - 잠시 뒤 다시 눌러 주세요' });
  const f = 서식들(x.settings.forms).find(v => v.id === String(b.id || ''));
  if (!f) return res.status(404).json({ error: '지워졌거나 없는 서식입니다' });
  const u = await 서식주소(agent.id, f);
  if (!u.url) return res.status(u.need ? 503 : 502).json({ error: u.need ? '서식 올리기를 준비 중입니다' : u.error, need: u.need || '' });
  return res.status(200).json({ ok: true, url: u.url });
}
async function delForm(res, agent, b) {
  if (agent.role !== 'agent') return res.status(403).json({ error: '공인중개사만 쓸 수 있습니다' });
  let 지운 = null;
  const z = await 설정고침(agent, s => { const L = 서식들(s.forms); 지운 = L.find(v => v.id === String(b.id || '')) || null;
    return { list: L.filter(v => v !== 지운), patch: { forms: L.filter(v => v !== 지운) } }; });
  if (!z.y) return 설정실패(res, z, '서식');
  const 지운수 = 지운 ? await 서식지우기(agent.id, 지운).catch(() => 0) : 0;
  return res.status(200).json({ ok: true, list: z.y.list, removed: 지운수 });
}

/* 직원 명단 - 대표만 (2026-11-06). 초대하면 그 메일로 안내를 보낸다 */
async function readStaff(res, agent) {
  const x = await 설정읽기(agent);
  if (x.error) return res.status(502).json({ error: '직원 명단을 불러오지 못했습니다' });
  return res.status(200).json({ ok: true, list: 직원들(x.settings.staff), ...(x.need ? { need: x.need } : {}) });
}
async function saveStaff(req, res, agent, user, b) {
  if (agent.role !== 'agent') return res.status(403).json({ error: '공인중개사 사무소만 직원을 둘 수 있습니다' });
  if (b.op === 'add') {
    /* 초대 메일이 아무 주소로나 쏟아지지 않게 - 사무소당 하루 30통 */
    if (overLimit('staff:' + agent.id, 30, 864e5)) return res.status(429).json({ error: '오늘은 더 초대할 수 없습니다 - 내일 다시 해 주세요' });
    if (await 다른사무소직원(b.email, agent.id).catch(() => false)) return res.status(409).json({ error: '다른 사무소 직원으로 이미 초대된 메일입니다 - 그 사무소에서 먼저 빼야 합니다' });
  }
  const z = await 설정고침(agent, s => { const y = 직원고침(s.staff, b, user && user.email);
    return y.error ? { ...y, now: 직원들(s.staff) } : { ...y, patch: { staff: y.list } }; });
  if (!z.y) return 설정실패(res, z, '직원 명단');
  if (z.y.error) return res.status(z.y.code || 400).json({ error: z.y.error, list: z.y.now });
  let mailed = false;
  if (b.op === 'add' && z.y.added) {
    const 새 = z.y.added;
    const m = await notify(req, { to: 새.email, subject: `${agent.office || '중개사무소'}에서 비버노크로 초대했습니다`,
      rows: [['사무소', agent.office || '-'], ['역할', 직원역할[새.role]], ['로그인할 메일', 새.email]],
      link: '/#/partner/home', cta: '비버노크에 로그인',
      note: '이 메일 주소로 로그인(구글 · 카카오 · 메일)하면 사무소 화면이 열립니다. 모르는 사무소라면 이 메일은 지우셔도 됩니다.' });
    mailed = !!(m && m.ok);
  }
  return res.status(200).json({ ok: true, list: z.y.list, mailed });
}

async function saveOfficeAddr(res, agent, b) {
  const addr = String(b.addr || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!/\d/.test(addr)) return res.status(400).json({ error: '도로명 찾기로 주소를 골라 주세요' });
  const r = await fetch(sbUrl('bk_agent', 'id=eq.' + agent.id), {
    method: 'PATCH', headers: { ...sbHeaders(), Prefer: 'return=minimal' }, body: JSON.stringify({ addr }),
  });
  if (!r.ok) return res.status(502).json({ error: '저장하지 못했습니다' });
  return res.status(200).json({ ok: true, addr });
}

/* ── 다른 사무소가 쓴 계약서 (2026-11-10 파트너 기획 · api/_ext.js) - settings.ext, 파일은 bk-files 버킷 ── */
const 외부준비중 = res => res.status(503).json({ error: '다른 사무소 계약서 올리기를 준비 중입니다 - 곧 열립니다', need: 'files' });
async function readExt(res, agent) {
  const x = await 설정읽기(agent);
  if (x.error) return res.status(502).json({ error: '목록을 불러오지 못했습니다' });
  return res.status(200).json({ ok: true, list: 외부들(x.settings.ext), need: x.need || '' });
}
async function saveExt(res, agent, b) {
  const 입력 = b.item && typeof b.item === 'object' ? b.item : {};
  const id = /^[0-9a-f]{12}$/.test(String(입력.id || '')) ? String(입력.id) : crypto.randomBytes(6).toString('hex');
  let 새파일 = null;
  if (b.data) {
    if (overLimit('extup:' + agent.id, 30, 600e3)) return res.status(429).json({ error: '잠시 뒤 다시 올려 주세요' });
    const c = 서식확인(b);
    if (c.error) return res.status(400).json({ error: c.error });
    const f = { id: crypto.randomBytes(6).toString('hex'), ext: c.ext, size: c.buf.length, name: c.name };
    const u = await 버킷올리기(파일버킷, 외부경로(agent.id, f), c.ext, c.buf);
    if (u.need) return 외부준비중(res);
    if (!u.ok) return res.status(502).json({ error: u.error || '파일을 올리지 못했습니다' });
    새파일 = f;
  }
  const at = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 19);
  let 옛파일 = null;
  const z = await 설정고침(agent, s => {
    const L = 외부들(s.ext), 옛 = L.find(e => e.id === id);
    if (!옛 && L.length >= 외부최대) return { error: `다른 사무소 계약서는 ${외부최대}건까지 둡니다 - 끝난 건을 지운 뒤 올려 주세요`, code: 400 };
    const v = 외부하나({ ...입력, id, file: 새파일 || (옛 && 옛.file) || null, at: (옛 && 옛.at) || at });
    if (!v) return { error: '소재지(이름)를 적어 주세요', code: 400 };
    옛파일 = 새파일 && 옛 && 옛.file ? 옛.file : null;
    const 목록 = 옛 ? L.map(e => e.id === id ? v : e) : [v, ...L];
    return { list: 목록, item: v, patch: { ext: 목록 } };
  });
  if (!z.y || z.y.error) {
    if (새파일) await 버킷지우기(파일버킷, [외부경로(agent.id, 새파일)]).catch(() => {});
    return z.y && z.y.error ? res.status(z.y.code || 400).json({ error: z.y.error }) : 설정실패(res, z, '계약서');
  }
  if (옛파일) await 버킷지우기(파일버킷, [외부경로(agent.id, 옛파일)]).catch(() => {});
  return res.status(200).json({ ok: true, list: z.y.list, item: z.y.item });
}
async function delExt(res, agent, b) {
  let 지운 = null;
  const z = await 설정고침(agent, s => { const L = 외부들(s.ext); 지운 = L.find(e => e.id === String(b.id || '')) || null;
    return { list: L.filter(e => e !== 지운), patch: { ext: L.filter(e => e !== 지운) } }; });
  if (!z.y) return 설정실패(res, z, '계약서');
  if (지운 && 지운.file) await 버킷지우기(파일버킷, [외부경로(agent.id, 지운.file)]).catch(() => {});
  return res.status(200).json({ ok: true, list: z.y.list });
}
async function extUrl(res, agent, b) {
  const x = await 설정읽기(agent);
  if (x.error) return res.status(502).json({ error: '목록을 불러오지 못했습니다 - 잠시 뒤 다시 눌러 주세요' });
  const e = 외부들(x.settings.ext).find(v => v.id === String(b.id || ''));
  if (!e || !e.file) return res.status(404).json({ error: '지워졌거나 파일이 없는 계약서입니다' });
  const u = await 버킷주소(파일버킷, 외부경로(agent.id, e.file), `${e.file.name}.${e.file.ext}`, e.file.ext);
  if (!u.url) return u.need ? 외부준비중(res) : res.status(502).json({ error: u.error });
  return res.status(200).json({ ok: true, url: u.url, ext: e.file.ext });
}
/* ── 일정 달력 구독 주소 (2026-11-10 · api/_contract.js icsFeed) - 사무소 하나에 주소 하나. 바꾸기는 대표만 ── */
const 달력주소 = (req, agentId, n) => `${String((req.headers && req.headers['x-forwarded-proto']) || 'https').split(',')[0]}://${(req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || 'beaverknock.co.kr'}/api/feed?ics=${달력표(agentId, n)}`;
async function icsLink(req, res, agent, 바꾸기) {
  if (!바꾸기) {
    const x = await 설정읽기(agent);
    if (x.error) return res.status(502).json({ error: '구독 주소를 만들지 못했습니다' });
    const n = Number.isInteger(x.settings.icsN) ? x.settings.icsN : 0;
    return res.status(200).json({ ok: true, url: 달력주소(req, agent.id, n) });
  }
  const z = await 설정고침(agent, s => { const n = (Number.isInteger(s.icsN) ? s.icsN : 0) + 1; return { n, patch: { icsN: n } }; });
  if (!z.y) return 설정실패(res, z, '구독 주소');
  return res.status(200).json({ ok: true, url: 달력주소(req, agent.id, z.y.n) });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  /* 매일 아침 신고 기한 알림(Vercel 예약 실행). CRON_SECRET 으로만 열린다 - api/_contract.js */
  if (req.method === 'GET' && req.query && req.query.cron === 'report-due') {
    if (!process.env.BK_URL || !process.env.BK_SECRET_KEY) return res.status(503).json({ error: '서버에 환경변수가 설정되지 않았습니다' });
    return reportDueCron(req, res);
  }
  /* 확정 전 초안 보기(로그인 없이 서명된 표로) - api/_contract.js draftRead */
  if (req.method === 'GET' && req.query && req.query.draft) {
    if (!process.env.BK_URL || !process.env.BK_SECRET_KEY) return res.status(503).json({ error: '서버에 환경변수가 설정되지 않았습니다' });
    return draftRead(req, res);
  }
  /* 대화방 초대 미리 보기(로그인 전에도 링크만으로) - api/_room.js invitePeek */
  if (req.method === 'GET' && req.query && req.query.invite) {
    if (!process.env.BK_URL || !process.env.BK_SECRET_KEY) return res.status(503).json({ error: '서버에 환경변수가 설정되지 않았습니다' });
    if (overLimit('invite:' + String((req.headers && (req.headers['x-forwarded-for'] || '')) || '').split(',')[0].trim(), 60, 600e3)) return res.status(429).json({ error: '잠시 뒤 다시 열어 주세요' });
    return invitePeek(res, req.query.invite);
  }
  /* 일정 달력 구독(휴대폰 · 구글 달력이 몇 시간마다 읽는다) - 사무소마다 서명한 주소로만. api/_contract.js icsFeed */
  if (req.method === 'GET' && req.query && req.query.ics) {
    if (!process.env.BK_URL || !process.env.BK_SECRET_KEY) return res.status(503).json({ error: '서버에 환경변수가 설정되지 않았습니다' });
    if (overLimit('ics:' + String((req.headers && (req.headers['x-forwarded-for'] || '')) || '').split(',')[0].trim(), 120, 600e3)) return res.status(429).json({ error: '잠시 뒤 다시 읽어 주세요' });
    return icsFeed(req, res);
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 만 받습니다' });
  /* 초안에 의견 남기기 - 로그인 없이 서명된 표로(api/_contract.js draftNote) */
  if (req.query && req.query.draft) {
    if (!process.env.BK_URL || !process.env.BK_SECRET_KEY) return res.status(503).json({ error: '서버에 환경변수가 설정되지 않았습니다' });
    let nb = req.body; if (typeof nb === 'string') { try { nb = JSON.parse(nb); } catch { nb = {}; } }
    return draftNote(req, res, nb || {});
  }
  if (!process.env.BK_URL || !process.env.BK_SECRET_KEY) {
    return res.status(503).json({ error: '서버에 환경변수가 설정되지 않았습니다' });
  }

  const user = await userFrom(req);
  if (!user) return res.status(401).json({ error: '로그인이 필요합니다' });

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};

  /* 대시보드 머리의 날씨 (2026-10-30) - 로그인한 누구나(운영자 화면도). 사무소 주소의 시·군·구 기준 - api/_weather.js */
  if (b.what === 'weather') return res.status(200).json({ ok: true, ...(await 날씨(b.addr)) });

  const chk = await approvedAgent(user);
  if (chk.error) {
    if (/user_id/.test(chk.error)) return res.status(503).json({ error: '아직 준비 중입니다 (0009 마이그레이션 필요)' });
    return res.status(502).json({ error: '자격을 확인하지 못했습니다' });
  }
  /* 가입은 했지만 자격(공인중개사 등록번호 등)을 아직 확인하지 않은 분도 목록은 본다.
     다만 **요약만** 본다 - 아래 maskDemand 가 가린다. 전에는 403 으로 아예 막아서,
     가입해도 무엇이 있는지 볼 수 없으니 인증할 이유가 생기지 않았다. */
  if (chk.none)    return res.status(403).json({ error: '파트너 가입 후 이용하실 수 있습니다', need: 'join' });

  /* 직원 권한 (2026-11-06) - 직원 관리 · 사무소 주소 · 활동 지역은 대표만. 중개보조원은 계약서 기능을 쓰지 않는다 */
  const 직원 = chk.agent && chk.agent.staff;
  if (직원 && 대표만(b.what)) return res.status(403).json({ error: '대표만 할 수 있습니다' });
  if (직원 && 직원.role === 'assistant' && 계약기능(b.what)) return res.status(403).json({ error: '중개보조원은 계약서 기능을 쓸 수 없습니다' });
  /* 기능별 권한 (2026-11-10) - 대표가 끈 기능. 계약서 보기를 끄면 계약서 일은 모두 막힌다 */
  const 권 = 직원 && 권한키(b.what), 끔 = (직원 && 직원.perm) || {};
  if (권 && (끔[권] === false || (권.startsWith('ct_') && 끔.ct_view === false))) return res.status(403).json({ error: '대표님이 이 기능을 꺼 두셨습니다', need: 'perm' });
  /* 계약진행 대화방 (2026-11-06 · api/_room.js) - 보조원도 대화는 한다(초대 · 내보내기는 _room.js 가 막는다) */
  if (['rooms', 'room', 'room-send', 'room-file', 'room-file-url', 'room-invite', 'room-cut'].includes(b.what)) {
    if (chk.agent.role !== 'agent') return res.status(403).json({ error: '공인중개사 사무소만 쓸 수 있습니다' });
    return roomAgent(req, res, chk.agent, user, b);
  }
  /* 계약서 보관(2026-11-08) - 중개사 본인의 Google 드라이브 · Dropbox 로 올릴 때 쓰는 공개 앱 번호. 비밀값이 아니다(브라우저 로그인 창에 그대로 보인다).
     비어 있으면 화면이 그 단추를 '준비 중' 으로 잠근다 */
  if (b.what === 'cloud-cfg') return res.status(200).json({ ok: true,
    google: String(process.env.GOOGLE_DRIVE_CLIENT_ID || '').trim(), dropbox: String(process.env.DROPBOX_APP_KEY || '').trim(),
    mail: !!process.env.RESEND_API_KEY });
  /* 계약서 메일로 보내기 - 이름이 contract 로 시작해 중개보조원은 위에서 막힌다 */
  if (b.what === 'contract-mail') return contractMail(req, res, chk.agent, user, b);
  if (b.what === 'staff')      return readStaff(res, chk.agent);
  if (b.what === 'staff-save') return saveStaff(req, res, chk.agent, user, b);

  /* 내가 보낸 제안 목록. 지금까지 이 목록은 그 브라우저 메모리에만 있어서
     새로고침하면 자기가 보낸 것이 사라졌다.
     함수 상한(12개) 때문에 수요 목록과 한 지붕 아래 둔다. */
  if (b.what === 'mine') return readMine(req, res, chk.agent);

  /* 사무소 주소 (2026-10-30 대표님 - 계약서의 사무소 소재지로 자동으로). 마이페이지에서 도로명 찾기로 고른다.
     가입 때 명부에서 온 값은 동 이름 하나라 계약서에 쓸 수 없다 */
  if (b.what === 'office-addr') return saveOfficeAddr(res, chk.agent, b);

  /* 계약 일정 알림 설정 - 받는 곳 · 항목 · 법무사 예약 시점 */
  if (b.what === 'alert-settings')      return readAlert(res, chk.agent);
  if (b.what === 'alert-settings-save') return saveAlert(res, chk.agent, b);
  /* 사무소 메모 (2026-11-10 파트너 기획 대시보드 'memo') - settings.memo, 2000자. 대표 · 직원 모두 보고 고친다(같은 사무소) */
  if (b.what === 'memo') { const x = await 설정읽기(chk.agent); if (x.error) return res.status(502).json({ error: '메모를 불러오지 못했습니다' });
    return res.status(200).json({ ok: true, memo: String(x.settings.memo || ''), at: String(x.settings.memoAt || ''), need: x.need || '' }); }
  if (b.what === 'memo-save') { const memo = String(b.memo || '').slice(0, 2000), at = new Date().toISOString();
    const z = await 설정고침(chk.agent, () => ({ patch: { memo, memoAt: at } })); if (!z.y) return 설정실패(res, z, '메모');
    return res.status(200).json({ ok: true, at }); }
  if (b.what === 'end-style-save')      return saveEndStyle(res, chk.agent, b);

  /* 내 특약 문구함 - 자주 쓰는 특약을 매매·임대차·갱신계약·기타로 */
  if (b.what === 'phrases')      return readPhrases(res, chk.agent);
  if (b.what === 'phrases-save') return savePhrases(res, chk.agent, b);
  if (b.what === 'sms')          return readSms(res, chk.agent);
  if (b.what === 'sms-save')     return saveSms(res, chk.agent, b);
  if (b.what === 'complex')      return readComplex(res, chk.agent);
  if (b.what === 'complex-save') return saveComplex(res, chk.agent, b);
  if (b.what === 'forms')        return readForms(res, chk.agent);
  if (b.what === 'form-up')      return upForm(res, chk.agent, b);
  if (b.what === 'form-url')     return formUrl(res, chk.agent, b);
  if (b.what === 'form-del')     return delForm(res, chk.agent, b);

  /* 계약서 (2026-10-29). 승인 전 중개사도 쓴다 - 자격 확인은 수요 전문을 여는 문이지
     양식·인쇄 도구의 문이 아니다. 갈래는 api/_contract.js 가 맡는다. */
  /* 다른 사무소 계약서 · 달력 구독 (2026-11-10) - 공인중개사 사무소만. 직원 권한은 위에서 걸렀다 */
  if (/^contract-ext/.test(b.what || '') || b.what === 'ics-link' || b.what === 'ics-reset') {
    if (chk.agent.role !== 'agent') return res.status(403).json({ error: '공인중개사만 쓸 수 있습니다' });
    if (b.what === 'contract-ext')      return readExt(res, chk.agent);
    if (b.what === 'contract-ext-save') return saveExt(res, chk.agent, b);
    if (b.what === 'contract-ext-del')  return delExt(res, chk.agent, b);
    if (b.what === 'contract-ext-url')  return extUrl(res, chk.agent, b);
    if (b.what === 'ics-link')          return icsLink(req, res, chk.agent, false);
    if (b.what === 'ics-reset')         return icsLink(req, res, chk.agent, true);
    return res.status(400).json({ error: '알 수 없는 요청입니다' });
  }
  if (await contractRoute(req, res, chk.agent, user, b)) return;

  /* 올려둔 물건. 지금까지 이 목록도 그 브라우저에만 있어서 창을 닫으면
     사라졌다. 함수 상한(12개) 때문에 여기 함께 둔다. */
  if (b.what === 'listings')    return readListings(req, res, chk.agent);
  if (b.what === 'listing-add') return addListing(req, res, chk.agent, user, b);
  if (b.what === 'listing-del') return delListing(req, res, chk.agent, b);
  if (b.what === 'listing-memo')      return readListingMemos(res, chk.agent);
  if (b.what === 'listing-memo-save') return saveListingMemo(res, chk.agent, b);

  /* 활동 조건을 저장한다.
     지금까지 이 화면은 "저장됐습니다" 라고 말하고 아무 데도 넣지 않았다.
     브라우저 메모리에만 있어서 새로고침하면 하남시로 돌아갔고, 서울에서
     활동하겠다고 정해둔 분이 다음 날 들어오면 하남 손님만 보였다. */
  if (b.what === 'scope-save') return saveScope(res, chk.agent, b);
  if (b.what === 'scope')      return res.status(200).json({ ok: true, scope: scopeOf(chk.agent) });
  /* 소유자·시행사는 목록을 훑지 못한다. 올려둔 물건에 맞는 것만 본다.
     화면에서 감추는 것으로는 부족해 여기서 막는다 - 화면은 고쳐 쓸 수 있다. */
  if (!canBrowse(chk.agent)) return readFitting(res, chk.agent, !!chk.pending);

  /* 거르는 값은 저장된 것을 쓴다. 브라우저가 보내는 것을 그대로 믿으면,
     새 조건이 들어왔을 때 '이것이 누구에게 맞는가' 를 서버가 알 수 없다 -
     알림을 보낼 방법이 아예 없어진다. */
  const sc = scopeOf(chk.agent);
  /* 빈 배열은 '가리지 않는다' 가 아니라 '아무것도 안 받겠다' 는 뜻이다.
     지역은 그렇게 막아뒀는데 유형만 반대로 열려 있었다. */
  const kinds = sc.kinds.filter(k => KIND_KO[k]);
  if (!kinds.length) {
    return res.status(200).json({ ok: true, agent: meAgent(chk.agent),
      scope: sc, hidden: { region: 0, slot: 0, kind: 1 }, at: new Date().toISOString(), rows: [] });
  }
  const regions = sc.set ? sc.regions.map(norm).filter(Boolean) : [];

  try {
    const q = new URLSearchParams({
      select: 'id,created_at,kind,dongs,deal,dep,rent,biz,area_min,area_max,htype,rooms,musts,must_free,'
            + 'floor_avoid,household,elevator,loan_plan,open_when,shop_floor_free,facilities_free,'
            + 'area_bands,bath_want,floor_bands,dir_want,age_band,'
            + 'key_ok,sign_need,park_need,shop_note,spec,memo,slots,slots_left,edited_at',
      order: 'created_at.desc', limit: '200',
    });
    q.set('kind', `in.(${kinds.join(',')})`);
    /* 손님이 멈추거나 끝낸 조건, 기한(30일)이 지난 조건은 보이지 않는다 - 전에는 거르지 않았다 (2026-11-03) */
    q.set('status', 'eq.active'); q.set('expires_at', 'gt.' + new Date().toISOString());
    const r = await getDemands(q);
    if (!r.ok) return res.status(502).json({ error: '조건을 불러오지 못했습니다' });
    let rows = await r.json();

    /* 지역은 배열이라 DB 에서 거르기 번거롭다 - 여기서 맞춰본다.
       고른 지역이 없으면 아무것도 보여주지 않는다. 활동 지역을 정하는 것이 먼저다. */
    /* 알림과 같은 규칙으로 거른다. 여기만 따로 두면 목록에는 보이는데 알림은
       안 오는 일이 생기고, 그때는 어느 쪽이 맞는지 알 수 없게 된다.
       예전에는 이름이 겹치는지만 봐서, 활동 지역을 '하남시' 로 둔 분에게
       미사1동 손님이 한 건도 보이지 않았다 - 기본값이 하남시였다. */
    const hidden = { region: 0, slot: 0 };
    rows = rows.filter(d => {
      if (!(d.slots_left > 0)) { hidden.slot++; return false; }
      if (!regions.length) { hidden.region++; return false; }
      const hit = regions.some(rg => regionHit(rg, d.dongs));
      if (!hit) hidden.region++;
      return hit;
    });

    /* 내가 이미 보낸 조건은 표시해 준다 */
    const mine = rows.length ? await myProposalTimes(chk.agent.id, 가장오래된(rows)) : new Map();

    return res.status(200).json({
      ok: true,
      agent: meAgent(chk.agent),
      scope: sc,
      hidden,
      at: new Date().toISOString(),
      locked: !!chk.pending,
      need: chk.pending ? 'verify' : '',
      rows: rows.map(d => {
        const base = chk.pending ? maskDemand(d) : d;
        return { ...base, kind_ko: KIND_KO[d.kind] || '주거', mine: mine.has(d.id), mine_at: mine.get(d.id) || null };
      }),
    });
  } catch (e) {
    console.error('[feed]', e && e.message);
    return res.status(502).json({ error: 'DB에 닿지 못했습니다' });
  }
}

/* 새 칸을 select 에 적었는데 0022 가 아직 안 돌았으면 목록이 통째로 502 가 된다 -
   물건 저장과 달리 조회는 조용히 물러설 자리가 없다. 한 번 더, 새 칸만 빼고 묻는다.
   이때는 손님이 건 밴드 조건이 안 실려 오므로 중개사 화면에서 그 줄만 비어 보인다. */
const BAND_COLS = 'area_bands,bath_want,floor_bands,dir_want,age_band,';
export async function getDemands(q) {
  let r = await fetch(sbUrl('bk_demand', q.toString()), { headers: sbHeaders() });
  if (r.ok) return r;
  const t = await r.clone().text().catch(() => '');
  if (!/does not exist|PGRST204|42703/i.test(t)) return r;
  /* 고친 시각(0030)이 아직 없으면 그 칸만 빼고 다시 묻는다 - '조건 고침' 표시만 안 뜬다 */
  const sel = String(q.get('select') || '');
  let 새sel = sel;
  if (/edited_at/.test(t)) 새sel = sel.replace(',edited_at', '');
  else if (/area_bands|bath_want|floor_bands|dir_want|age_band/.test(t)) 새sel = sel.replace(BAND_COLS, '');
  if (새sel === sel) return r;
  const q2 = new URLSearchParams(q);
  q2.set('select', 새sel);
  return getDemands(q2);           /* 둘 다 없으면 한 번 더 - 칸이 줄어드니 끝이 있다 */
}

/* 내가 보낸 제안 - 조건 번호 → 마지막으로 보낸 시각.
   조건 id 를 전부 URL 에 싣지 않는다 - 200개면 7KB 가 넘어 414 로 잘린다.
   내가 보낸 것만 받아와서 여기서 맞춰본다. 시각은 '보낸 뒤에 손님이 고쳤나' 를 가리는 데 쓴다
   (2026-10-15 리뷰 - 고친 조건을 보고 제안한 중개사에게 '다시 확인' 을 띄우지 않게). */
/* 최근 1000건만 읽으면 제안을 많이 보낸 중개사의 예전 제안이 '안 보낸 것' 이 됐다(2026-10-15 리뷰).
   since(목록에 실린 조건 중 가장 오래된 것의 등록 시각)보다 앞선 제안은 그 조건들에 대한 것일 수 없으니
   거기서 자르고, 남은 것은 쪽으로 나눠 끝까지 읽는다(한 쪽 1000건, 최대 10쪽). */
const PROP_PAGE = 1000, PROP_PAGES = 10;
export async function myProposalTimes(agentId, since = null) {
  const mine = new Map();
  for (let 쪽 = 0; 쪽 < PROP_PAGES; 쪽++) {
    const pq = new URLSearchParams({
      select: 'demand_id,created_at', agent_id: 'eq.' + agentId,
      order: 'created_at.desc', limit: String(PROP_PAGE), offset: String(쪽 * PROP_PAGE),
    });
    if (since) pq.set('created_at', 'gte.' + since);
    const pr = await fetch(sbUrl('bk_proposal', pq.toString()), { headers: sbHeaders() });
    if (!pr.ok) break;
    const a = await pr.json();
    /* 최신순이라 처음 본 것이 마지막 제안이다 */
    for (const p of a) if (!mine.has(p.demand_id)) mine.set(p.demand_id, p.created_at || null);
    if (a.length < PROP_PAGE) break;
  }
  return mine;
}
/* 목록에 실린 조건 중 가장 오래된 등록 시각 */
const 가장오래된 = rows => rows.reduce((m, d) => (d.created_at && (!m || d.created_at < m) ? d.created_at : m), null);

/* ── 자격을 확인하기 전에 보이는 것 ──
   조건 전문에는 손님이 적은 사정과 메모가 들어 있어서 자격 없이 볼 것이 아니다.
   그렇다고 빈 화면만 보여주면 '여기 손님이 있다' 는 것조차 알 수 없어 인증할
   이유가 안 생긴다 - 있다는 것까지만 보여준다.
   ※ 가리는 일은 반드시 서버가 한다. 화면에서 감추면 감춘 것이 아니다. */
const SUMMARY_COLS = ['id','created_at','kind','dongs','deal','dep','rent',
                      'htype','rooms','slots_left','open_when','area_bands','edited_at'];
function maskDemand(d) {
  const o = { locked: true };
  for (const k of SUMMARY_COLS) if (d[k] !== undefined) o[k] = d[k];
  return o;
}

/* 이 조건이 이 활동 조건에 드는가.
   목록을 거를 때 쓰는 규칙과 같은 것을 쓴다 - 목록에는 보이는데 알림은 안 오거나
   그 반대이면, 어느 쪽이 맞는지 알 수 없게 된다. */
export function scopeHits(sc, d) {
  if (!sc || !d) return false;
  if (!sc.set || !sc.regions.length) return false;      /* 정하기 전에는 아무것도 안 간다 */
  if (!sc.kinds.includes(d.kind)) return false;
  return sc.regions.some(rg => regionHit(rg, d.dongs));
}

/* ── 활동 조건 ──
   0017 전이면 칸이 없다. 그때는 예전처럼 기본값으로 돈다 - 마이그레이션을
   안 돌렸다고 목록이 안 보이면, 고장 난 것으로 읽힌다. */
const SCOPE_KINDS = ['home', 'shop', 'office', 'storage'];

export function scopeOf(a) {
  const has = a && a.scope_kinds !== undefined;
  return {
    regions: (a && a.scope_regions) || [],
    kinds:   has ? ((a.scope_kinds || []).filter(k => SCOPE_KINDS.includes(k))) : SCOPE_KINDS,
    excluded: (a && a.scope_excluded) || [],
    set:     has ? !!a.scope_set : false,
    paused:  !!(a && a.notify_paused),
    stored:  !!has,
  };
}

const cleanList = (v, max) => (Array.isArray(v) ? v : [])
  .map(x => String(x || '').trim()).filter(Boolean).slice(0, max);

async function saveScope(res, agent, b) {
  const patch = {
    scope_regions:  cleanList(b.regions, 60),
    scope_kinds:    cleanList(b.kinds, 8).filter(k => SCOPE_KINDS.includes(k)),
    scope_excluded: cleanList(b.excluded, 20),
    scope_set:      true,
    notify_paused:  b.paused === true,
    scope_at:       new Date().toISOString(),
  };
  try {
    const r = await fetch(sbUrl('bk_agent', 'id=eq.' + agent.id), {
      method: 'PATCH',
      headers: { ...sbHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify(patch),
    });
    if (!r.ok) {
      const t = await r.text();
      if (/scope_regions|scope_kinds|scope_set|notify_paused|scope_at|PGRST204/i.test(t)) {
        return res.status(503).json({ error: '아직 준비 중입니다 (0017 마이그레이션 필요)', need: 'sql' });
      }
      return res.status(500).json({ error: '활동 조건을 저장하지 못했습니다' });
    }
    /* 몇 건이 실제로 바뀌었는지 본다 - minimal 로 두면 한 건도 안 바뀌어도 200 이 온다 */
    const got = (await r.json().catch(() => []))[0];
    if (!got) return res.status(404).json({ error: '저장할 곳을 찾지 못했습니다' });
    return res.status(200).json({ ok: true, scope: scopeOf(got) });
  } catch (e) {
    return res.status(502).json({ error: 'DB에 닿지 못했습니다' });
  }
}

/* ── 소유자: 내 물건에 맞는 수요만 ──
   활동 지역·유형을 따로 설정하지 않는다. 올려둔 물건이 곧 조건이다. */
async function readFitting(res, agent, pending) {
  try {
    const list = await myListings(agent.id);
    if (list === null) return res.status(502).json({ error: '올려두신 물건을 확인하지 못했습니다' });
    if (!list.length) {
      return res.status(200).json({
        ok: true, agent: meAgent(agent),
        scope: scopeOf(agent),
        byListing: true, listings: 0, hidden: { region: 0, slot: 0, fit: 0 },
        at: new Date().toISOString(), rows: [],
        note: '물건을 올리시면 그 물건에 맞는 손님만 보여드립니다.',
      });
    }

    const kinds = [...new Set(list.map(L => L.kind).filter(k => KIND_KO[k]))];
    /* 빈 배열을 그대로 넣으면 kind=in.() 이 되어 PostgREST 가 문법 오류를 낸다.
       물건은 있는데 유형을 하나도 못 읽는 상황이라, 맞는 것이 없다고 답하는 편이
       '조건을 불러오지 못했습니다' 보다 사실에 가깝다. */
    if (!kinds.length) {
      return res.status(200).json({
        ok: true, agent: meAgent(agent),
        scope: scopeOf(agent),
        byListing: true, listings: list.length, hidden: { region: 0, slot: 0, fit: 0 },
        at: new Date().toISOString(), rows: [],
        note: '올려두신 물건의 유형을 읽지 못했습니다 - 물건을 다시 등록해 주세요.',
      });
    }
    const q = new URLSearchParams({
      select: 'id,created_at,kind,dongs,deal,dep,rent,biz,area_min,area_max,htype,rooms,musts,must_free,'
            + 'floor_avoid,household,elevator,loan_plan,open_when,shop_floor_free,facilities_free,'
            + 'area_bands,bath_want,floor_bands,dir_want,age_band,'
            + 'key_ok,sign_need,park_need,shop_note,spec,memo,slots,slots_left,edited_at',
      order: 'created_at.desc', limit: '200',
    });
    q.set('kind', `in.(${kinds.join(',')})`);
    /* 손님이 멈추거나 끝낸 조건, 기한(30일)이 지난 조건은 보이지 않는다 - 전에는 거르지 않았다 (2026-11-03) */
    q.set('status', 'eq.active'); q.set('expires_at', 'gt.' + new Date().toISOString());
    const r = await getDemands(q);
    if (!r.ok) return res.status(502).json({ error: '조건을 불러오지 못했습니다' });

    const hidden = { region: 0, slot: 0, fit: 0 };
    const rows = [];
    for (const d of await r.json()) {
      if (!(d.slots_left > 0)) { hidden.slot++; continue; }
      const fit = list.filter(L => listingFits(L, d));
      if (!fit.length) { hidden.fit++; continue; }
      /* 어느 물건으로 제안할 수 있는지 함께 보낸다 - 고르는 수고를 덜어준다 */
      rows.push({ ...d, fitIds: fit.map(L => L.id), fitNames: fit.map(L => L.name) });
    }

    const mine = rows.length ? await myProposalTimes(agent.id, 가장오래된(rows)) : new Map();

    return res.status(200).json({
      ok: true, agent: meAgent(agent),
      scope: scopeOf(agent),
      byListing: true, listings: list.length, hidden, at: new Date().toISOString(),
      /* 승인 전이면 요약만 - 전에는 이 함수 안에 없는 chk 를 읽어 ReferenceError → 늘 502 였다 (2026-11-03 리뷰) */
      locked: pending,
      need: pending ? 'verify' : '',
      rows: rows.map(d => {
        const base = pending ? maskDemand(d) : d;
        return { ...base, kind_ko: KIND_KO[d.kind] || '주거', mine: mine.has(d.id), mine_at: mine.get(d.id) || null };
      }),
    });
  } catch (e) {
    console.error('[feed:fit]', e && e.message);
    return res.status(502).json({ error: 'DB에 닿지 못했습니다' });
  }
}

/* ── 내가 보낸 제안 ── */
const P_STATUS_KO = {
  sent: '보냄', read: '열람', accepted: '연결', rejected: '관심 없음',
  reported: '신고', withdrawn: '회수', expired: '미열람 만료',
};

async function readMine(req, res, agent) {
  try {
    const 열 = 'id,created_at,status,addr,bname,dep,rent,fee,demand_id,connected_at,report_type,read_at';
    const 묻기 = s => fetch(sbUrl('bk_proposal', new URLSearchParams({ select: s, agent_id: 'eq.' + agent.id, order: 'created_at.desc', limit: '200' }).toString()), { headers: sbHeaders() });
    let r = await 묻기(열 + ',contact_pref');
    if (!r.ok) { const t = await r.clone().text().catch(() => ''); if (/contact_pref|42703/.test(t)) r = await 묻기(열); }
    if (!r.ok) {
      const t = await r.text();
      if (/does not exist|PGRST205/i.test(t)) {
        return res.status(200).json({ ok: true, rows: [], at: new Date().toISOString() });
      }
      return res.status(502).json({ error: '보낸 제안을 불러오지 못했습니다' });
    }
    const rows = await r.json();
    if (!rows.length) return res.status(200).json({ ok: true, rows: [], at: new Date().toISOString() });

    /* 어느 조건에 보낸 것인지 붙여준다.
       손님 이름과 연락처는 '연결' 된 건에만 싣는다 - 손님이 연결을 누른 그
       순간에만 오간다는 약속이 여기서도 지켜져야 한다. */
    const dIds = [...new Set(rows.map(x => x.demand_id).filter(Boolean))];
    const dm = {};
    if (dIds.length) {
      const dr = await fetch(sbUrl('bk_demand',
        `select=id,dongs,kind,deal,dep,rent,name,phone&id=in.(${dIds.join(',')})`), { headers: sbHeaders() });
      if (dr.ok) for (const d of await dr.json()) dm[d.id] = d;
    }

    return res.status(200).json({
      ok: true, at: new Date().toISOString(),
      rows: rows.map(x => {
        const d = dm[x.demand_id] || {};
        const connected = x.status === 'accepted';
        return {
          id: x.id, status: x.status, status_ko: P_STATUS_KO[x.status] || x.status,
          created_at: x.created_at, connected_at: x.connected_at || null,
          bname: x.bname, addr: x.addr, dep: x.dep, rent: x.rent, fee: x.fee,
          dongs: (d.dongs || []).join(' · '),
          kind: d.kind || null, deal: d.deal || null,
          want: d.dep != null ? { dep: d.dep, rent: d.rent } : null,
          report_type: x.status === 'reported' ? (x.report_type || null) : null,
          cust:   connected ? (d.name || null)  : null,
          cphone: connected ? (d.phone || null) : null,
          cpref:  connected ? (x.contact_pref || null) : null,   /* 손님이 고른 연락 방법 (2026-11-11) */
        };
      }),
    });
  } catch (e) {
    console.error('[feed:mine]', e && e.message);
    return res.status(502).json({ error: 'DB에 닿지 못했습니다' });
  }
}

/* ── 올려둔 물건 ── */
const KINDS = ['home', 'shop', 'office', 'storage'];
const LUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const txt = (v, max = 200) => { const x = String(v ?? '').trim(); return x ? x.slice(0, max) : null; };
const int0 = v => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const num0 = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const arr = (v, max = 20) => Array.isArray(v)
  ? v.map(x => String(x ?? '').trim()).filter(Boolean).slice(0, max) : null;

/* 표가 아직 없을 때는 빈 목록으로 돌려준다 - 화면이 예시로 버틴다 */
const noTable = t => /does not exist|PGRST205|bk_listing/i.test(t);

async function readListings(req, res, agent) {
  try {
    const q = new URLSearchParams({
      select: '*', agent_id: 'eq.' + agent.id, status: 'neq.closed',
      order: 'created_at.desc', limit: '200',
    });
    const r = await fetch(sbUrl('bk_listing', q.toString()), { headers: sbHeaders() });
    if (!r.ok) {
      const t = await r.text();
      if (noTable(t)) return res.status(200).json({ ok: true, rows: [], note: '0015 마이그레이션 필요' });
      return res.status(502).json({ error: '물건을 불러오지 못했습니다' });
    }
    return res.status(200).json({ ok: true, rows: await r.json(), at: new Date().toISOString() });
  } catch (e) {
    return res.status(502).json({ error: 'DB에 닿지 못했습니다' });
  }
}

async function addListing(req, res, agent, user, b) {
  const L = b.listing || {};
  const kind = KINDS.includes(L.kind) ? L.kind : null;
  const name = txt(L.name, 80);
  if (!kind) return res.status(400).json({ error: '어떤 물건인지 알 수 없습니다' });
  if (!name) return res.status(400).json({ error: '물건 이름을 적어주세요' });

  const row = {
    agent_id: agent.id, agent_user: user.id,
    /* biz(업종)·fac(설비)는 싣지 않는다. 물건 등록 화면에서 업종·설비 칩을
       걷어낸 뒤로 화면이 늘 빈 값을 보냈고, 표에는 늘 빈 칸만 쌓였다.
       0027 에서 칸 자체를 지웠다 - 여기서 보내면 등록이 통째로 막힌다. */
    kind, name, dong: txt(L.dong, 60), deal: txt(L.deal, 20),
    dep: int0(L.dep), rent: int0(L.rent), fee: int0(L.fee),
    /* 면적은 ㎡ 로 담는다. py 는 대조와 옛 행이 아직 쓰므로 함께 남긴다 */
    area: num0(L.area), area_sup: num0(L.areaSup), py: num0(L.py),
    /* 화장실은 주거에만 받는다 - 화면이 이미 안 보여주지만, 조건 번호만 알고
       바로 찔러 넣는 길이 있으므로 여기서도 막는다(중개사 회신 2026-09-20). */
    rooms: int0(L.rooms), baths: kind === 'home' ? int0(L.baths) : 0,
    band: txt(L.band, 20), floors: int0(L.floors),
    /* 아파트 동·호 (2026-09-21). 동은 손님에게 보이고 호는 보내지 않는다 -
       특정 세대를 지목하는 값이라 연결 전에 나갈 이유가 없다.
       내보내지 않는 일은 제안을 만드는 api/proposal.js 가 맡는다. */
    bdong: txt(L.bdong, 20), ho: txt(L.ho, 20),
    htype: txt(L.htype, 30),
    floor_no: txt(L.floorNo, 10), duplex: L.duplex === true,
    musts: arr(L.musts),
    /* fac_free(설비 자유기입)도 싣지 않는다 - biz·fac 과 같은 처지로, 물건 쪽은
       칩을 걷은 뒤로 늘 빈 문자열이었다. 0028 에서 칸을 지웠다.
       ⚠ 손님 조건의 facilities_free 는 **다른 값이다** - 그건 그대로 쓴다. */
    musts_free: txt(L.mustsFree, 120),
    /* 중개대상물 표시·광고 명시사항 - 방향은 기준까지, 관리비는 산정 기준과 포함 비목까지 */
    dir: txt(L.dir, 10), dir_base: txt(L.dirBase, 20),
    fee_basis: txt(L.feeBasis, 20), fee_type: txt(L.feeType, 40), fee_items: txt(L.feeItems, 200),
    note: txt(L.note, 1000),
    /* 손님의 연식 조건(age_band)을 판단하려면 이 값이 물건에 있어야 한다.
       여태 칸도 없고 묻지도 않아서 그 조건은 한 번도 판단된 적이 없다(0026). */
    approved: txt(L.approved, 40),
    move_in: txt(L.moveIn, 40), photos: int0(L.photos) || 0,
  };

  try {
    const put = body => fetch(sbUrl('bk_listing'), {
      method: 'POST', headers: { ...sbHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify(body),
    });
    let r = await put(row);
    let dropped = null;          /* 물러섰으면 무엇을 빼고 넣었는지 적어둔다 */
    /* 코드가 먼저 올라가고 마이그레이션이 아직 안 돌았을 수 있다. 그때 새 칸 때문에
       등록 자체가 막히면 안 된다 - 새 칸만 빼고 한 번 더 넣는다. 면적이 평으로만
       남지만, 물건을 못 올리는 것보다는 낫다.
       ⚠ 다만 **조용히 물러서지는 않는다.** 예전에는 그냥 성공이라고 답해서,
       반쪽만 저장됐는데도 등록한 사람은 다 된 줄 알았다 - 그러면 무엇이 안 들어갔는지
       아무도 모른 채로 넘어간다. 무엇을 뺐는지 함께 돌려준다. */
    if (!r.ok) {
      const t0 = await r.text();
      /* '그 칸이 없다' 는 두 가지 말로 온다.
           PGRST204 : Could not find the 'area' column of ... in the schema cache
           42703    : column "area" of relation ... does not exist
         전에는 뒤의 것과 코드 이름만 보고 있었다 - 앞의 형태로 오면 못 알아채고
         등록 자체를 실패로 돌려보냈다. demand.js 는 둘 다 보고 있었는데
         여기만 빠져 있었다. */
      const noColumn = /does not exist|PGRST204/i.test(t0)
                    || /Could not find the '[a-z_]+' column/i.test(t0);
      /* fac_free 는 목록에서 뺐다 - 더 이상 싣지 않으므로 그 이름으로 걸려 올 일이
         없다. 남겨두면 '언젠가 다시 실을 것' 처럼 읽힌다. */
      if (noColumn
          && /area|duplex|floor_no|musts_free|dir|fee_basis|fee_type|fee_items|note|bdong|ho|htype|approved/.test(t0)) {
        const { area, area_sup, floor_no, duplex, musts_free,
                dir, dir_base, fee_basis, fee_type, fee_items, note,
                bdong, ho, htype, approved, ...old } = row;
        dropped = ['면적', '정확한 층', '복층', '갖춰진 조건', '방향', '관리비 기준',
                   '매물 특징', '동·호', '주택 유형', '사용승인일'];
        console.error('[feed:listing-add] 새 칸을 빼고 저장했다 - 마이그레이션 확인 필요',
                      t0.slice(0, 160));
        r = await put(old);
      } else {
        if (noTable(t0)) return res.status(503).json({ error: '아직 준비 중입니다 (0015 마이그레이션 필요)' });
        /* 왜 거절당했는지 코드로 가려 사람 말로 돌려준다 - 중개사님이 화면만 보고
           무엇을 고쳐야 할지 알 수 있어야 한다. 칸 이름이 든 원문은 로그에만 남긴다. */
        const w0 = dbWhy(t0);
        console.error('[feed:listing-add]', r.status, w0.code || '-', t0.slice(0, 200));
        return res.status(502).json({ error: w0.msg || '물건을 저장하지 못했습니다', code: w0.code });
      }
    }
    if (!r.ok) {
      const t = await r.text();
      if (noTable(t)) return res.status(503).json({ error: '아직 준비 중입니다 (0015 마이그레이션 필요)' });
      const w = dbWhy(t);
      console.error('[feed:listing-add]', r.status, w.code || '-', t.slice(0, 200));
      return res.status(502).json({ error: w.msg || '물건을 저장하지 못했습니다', code: w.code });
    }
    return res.status(201).json({
      ok: true, row: (await r.json())[0] || null,
      /* 화면이 이것을 보고 '다 저장되지 않았다' 고 말한다 */
      degraded: dropped ? { dropped } : null,
    });
  } catch (e) {
    return res.status(502).json({ error: 'DB에 닿지 못했습니다' });
  }
}

/* 내 물건 비공개 메모 (2026-11-11 파트너 기획 '매물장부 - 의뢰인 비공개 칸') - 사무소 설정 settings.lmemo { 물건id: {...} }.
   물건 표(bk_listing)에 두지 않는다 - 물건 값은 제안 · 수요 대조로 손님 쪽에 흘러가는 길이 여럿이라, 메모는 아예 다른 곳에 둔다.
   현관 비밀번호 같은 것은 받지 않는다(화면이 그렇게 안내한다). 사무소 직원 중 '내 물건' 권한이 있는 사람만 본다 */
const 메모최대 = 300;
const 메모글 = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').trim().slice(0, n);
export function 물건메모(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  const 값 = { who: 메모글(m.who, 30), phone: 메모글(m.phone, 20).replace(/[^0-9-]/g, ''), nego: Math.max(0, Math.min(1e13, Math.round(+String(m.nego ?? '').replace(/[^0-9]/g, '')) || 0)), note: 메모글(m.note, 500) };
  if (!값.who && !값.phone && !값.nego && !값.note) return null;
  return { ...값, at: String(m.at || '').slice(0, 19) };
}
export function 물건메모들(x) {
  const out = {};
  if (!x || typeof x !== 'object' || Array.isArray(x)) return out;
  for (const [k, v] of Object.entries(x).slice(0, 메모최대)) { const m = LUUID.test(k) && 물건메모(v); if (m) out[k] = m; }
  return out;
}
async function readListingMemos(res, agent) {
  const x = await 설정읽기(agent);
  if (x.error) return res.status(502).json({ error: '메모를 불러오지 못했습니다' });
  return res.status(200).json({ ok: true, memos: 물건메모들(x.settings.lmemo), need: x.need || '' });
}
async function saveListingMemo(res, agent, b) {
  const id = String(b.id || '');
  if (!LUUID.test(id)) return res.status(400).json({ error: '어느 물건인지 알 수 없습니다' });
  const 새 = 물건메모({ ...(b.memo || {}), at: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 19) });
  const z = await 설정고침(agent, s => { const L = 물건메모들(s.lmemo);
    if (새) { if (!L[id] && Object.keys(L).length >= 메모최대) return { error: `메모는 물건 ${메모최대}개까지 둡니다`, code: 400 }; L[id] = 새; } else delete L[id];
    return { memos: L, patch: { lmemo: L } }; });
  if (!z.y || z.y.error) return z.y && z.y.error ? res.status(400).json({ error: z.y.error }) : 설정실패(res, z, '메모');
  return res.status(200).json({ ok: true, memo: 새 });
}
async function delListing(req, res, agent, b) {
  const id = String(b.id || '');
  if (!LUUID.test(id)) return res.status(400).json({ error: '어느 물건인지 알 수 없습니다' });
  try {
    /* 내 물건만 내린다. 지우지 않고 닫는다 - 이미 보낸 제안에서 참조가 남는다. */
    const r = await fetch(sbUrl('bk_listing', `id=eq.${id}&agent_id=eq.${agent.id}`), {
      method: 'PATCH', headers: { ...sbHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'closed' }),
    });
    if (!r.ok) {
      const t = await r.text();
      if (noTable(t)) return res.status(503).json({ error: '아직 준비 중입니다 (0015 마이그레이션 필요)' });
      return res.status(502).json({ error: '물건을 내리지 못했습니다' });
    }
    if (!(await r.json().catch(() => [])).length) {
      return res.status(404).json({ error: '내 물건이 아니거나 이미 내려간 물건입니다' });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ error: 'DB에 닿지 못했습니다' });
  }
}
