/* 직원 계정 (2026-11-06 대표님 · 파트너 기획 '대표가 직원을 초대 · 소속공인중개사는 전부 · 보조원은 계약서 불가')
 * 명단은 대표 사무소의 bk_agent.settings.staff - [{ i, email, role, name, at, uid?, joined? }] 20명까지.
 *   role: staff(소속공인중개사 - 대표와 같게, 직원 관리 · 사무소 주소 · 활동 지역만 빼고) · assistant(중개보조원 - 계약서 기능 전부 불가)
 * 직원이 초대받은 메일로 로그인하면 approvedAgent(feed.js) 가 이 명단에서 대표 사무소를 찾는다 - 직원은 대표 사무소로 일한다
 * (계약서 · 제안 · 물건은 사무소 것이라 대표와 같이 본다). 메일은 확인된 메일만 맞춘다(소셜 로그인 · 메일 확인 마친 계정) */
import crypto from 'node:crypto';
import { sbHeaders, sbUrl } from './_auth.js';

export const 직원역할 = { staff: '소속공인중개사', assistant: '중개보조원' };
/* 기능별 권한 (2026-11-10 파트너 기획 ①-9 '기능마다 켜고 끄기') - 지금 있는 기능만. 기본은 모두 켬, 끈 것만 perm[k] = false 로 둔다.
   중개보조원은 계약서 넷(ct_*)이 늘 꺼져 있다(공인중개사법 - 대표가 켤 수 없다). 영구 삭제 · 직원 관리 · 사무소 주소 · 활동 지역은 대표만(권한 밖) */
export const 권한목록 = [['ct_view', '계약서 보기'], ['ct_edit', '계약서 작성 · 수정'], ['ct_seal', '날인본 확정'], ['ct_mail', '계약서 메일 보내기'],
  ['propose', '제안 보내기'], ['listing', '매물장부 작성 · 수정'], ['room', '손님 대화'], ['stats', '성과 보기'],
  /* 2026-11-12 파트너 기획 A3 - 매물 노출(보조원은 늘 꺼짐: 공인중개사법 제18조의2 표시 · 광고) · 의뢰인 비공개 정보 · 노출 중 금액 */
  ['listing_open', '매물 노출 · 노출 종료'], ['listing_memo', '의뢰인 비공개 정보 보기'], ['listing_price', '노출 중 매물 금액 수정']];
/* 보조원에게 늘 꺼진 권한 - 대표가 켤 수 없다 */
export const 보조원잠금 = k => /^ct_/.test(k) || k === 'listing_open';
const 권한키들 = new Set(권한목록.map(([k]) => k));
const 권한값 = p => { const o = {}; if (p && typeof p === 'object') for (const k of Object.keys(p)) if (권한키들.has(k) && p[k] === false) o[k] = false; return o; };
export const 직원최대 = 20;
/* 직원 자격증 파일 - bk-files 버킷 staffcert/사무소/직원번호.확장자. 2MB · JPG · PNG · PDF */
export const 자격증크기 = 2 * 1024 * 1024;
export const 자격증경로 = (사무소, i, ext) => `staffcert/${사무소}/${i}.${ext}`;
export function 자격증형식(buf) {
  if (!buf || buf.length < 100) return '';
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'png';
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  return '';
}
const 메일꼴 = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const 메일 = v => String(v || '').trim().toLowerCase();
const 지금 = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 19);

export function 직원들(x) {
  const out = [], 본 = new Set();
  for (const s of Array.isArray(x) ? x : []) {
    if (!s || !/^[0-9a-f]{10}$/.test(String(s.i)) || !Object.hasOwn(직원역할, s.role)) continue;
    const email = 메일(s.email);
    if (!메일꼴.test(email) || 본.has(email)) continue;
    본.add(email);
    out.push({
      i: s.i, email, role: s.role, name: String(s.name || '').trim().slice(0, 20), at: String(s.at || '').slice(0, 19),
      ...(/^[0-9a-f-]{36}$/.test(String(s.uid || '')) ? { uid: s.uid } : {}),
      ...(s.joined ? { joined: String(s.joined).slice(0, 19) } : {}),
      ...(Object.keys(권한값(s.perm)).length ? { perm: 권한값(s.perm) } : {}),
      ...(s.cert && ['jpg', 'png', 'pdf'].includes(s.cert.ext) ? { cert: { ext: s.cert.ext, at: String(s.cert.at || '').slice(0, 19) } } : {}),
      ...(s.cert && s.certOk ? { certOk: String(s.certOk).slice(0, 19) } : {}),
    });
    if (out.length >= 직원최대) break;
  }
  return out;
}

/* 명단 고치기 - add(메일 · 역할 · 이름) · del(i) · role(i, 역할). 대표 자신의 메일은 넣지 않는다 */
/* 변경 이력 (2026-11-12 파트너 기획 A3 '바꾼 내용은 이력이 남는다') - settings.staff_log 에 최근 50건 */
export const 이력최대 = 50;
export function 직원이력(x) { return (Array.isArray(x) ? x : []).filter(v => v && typeof v === 'object').slice(-이력최대).map(v => ({ at: String(v.at || '').slice(0, 19), who: String(v.who || '').slice(0, 40), what: String(v.what || '').slice(0, 300) })); }
const 권한이름 = Object.fromEntries(권한목록);
export function 이력한줄(앞, 뒤, b) {
  const 사람 = s => (s && (s.name || s.email)) || '';
  if (b.op === 'add' && 뒤.added) return { who: 사람(뒤.added), what: `초대 (${직원역할[뒤.added.role]})` };
  const 전 = 앞.find(s => s.i === String(b.i || '')); if (!전) return null;
  if (b.op === 'del') return { who: 사람(전), what: '명단에서 뺌' };
  if (b.op === 'role') return { who: 사람(전), what: `역할 ${직원역할[전.role]} → ${직원역할[b.role] || b.role}` };
  if (b.op === 'cert-ok') return { who: 사람(전), what: b.ok ? '자격증 확인함' : '자격증 확인 취소' };
  if (b.op === 'perm') {
    const 후 = (뒤.list || []).find(s => s.i === 전.i) || {}, a = 전.perm || {}, c = 후.perm || {};
    const 끔 = 권한목록.filter(([k]) => a[k] !== false && c[k] === false).map(([k]) => 권한이름[k]);
    const 켬 = 권한목록.filter(([k]) => a[k] === false && c[k] !== false).map(([k]) => 권한이름[k]);
    if (!끔.length && !켬.length) return null;
    return { who: 사람(전), what: [켬.length ? `켬: ${켬.join(' · ')}` : '', 끔.length ? `끔: ${끔.join(' · ')}` : ''].filter(Boolean).join(' / ') };
  }
  return null;
}
export function 직원고침(list, b, 대표메일 = '') {
  const L = 직원들(list);
  if (b.op === 'add') {
    const email = 메일(b.email);
    if (!메일꼴.test(email)) return { error: '메일 주소 모양이 맞지 않습니다', code: 400 };
    if (대표메일 && email === 메일(대표메일)) return { error: '대표님 계정은 직원으로 넣지 않습니다', code: 400 };
    if (!Object.hasOwn(직원역할, b.role)) return { error: '역할을 골라 주세요', code: 400 };
    if (L.some(s => s.email === email)) return { error: '이미 명단에 있는 메일입니다', code: 409 };
    if (L.length >= 직원최대) return { error: `직원은 ${직원최대}명까지 둡니다`, code: 400 };
    const 새 = { i: crypto.randomBytes(5).toString('hex'), email, role: b.role, name: String(b.name || '').trim().slice(0, 20), at: 지금() };
    /* 새로 생긴 권한(노출 · 의뢰인 정보 · 금액)도 기본은 켬 - 보조원은 노출이 늘 꺼진다 */
    return { list: [...L, 새], added: 새 };
  }
  const i = String(b.i || '');
  if (!L.some(s => s.i === i)) return { error: '명단에 없는 직원입니다 - 새로고침해 주세요', code: 404 };
  if (b.op === 'del') return { list: L.filter(s => s.i !== i) };
  if (b.op === 'perm') {
    const p = 권한값(b.perm);
    return { list: L.map(s => s.i === i ? (({ perm, ...x }) => Object.keys(p).length ? { ...x, perm: p } : x)(s) : s) };
  }
  /* 자격증 확인 (2026-11-12 파트너 기획 '직원 가입 승인 - 자격증 첨부') - 직원이 올린 자격증을 대표가 보고 확인 표시 */
  if (b.op === 'cert-ok') {
    const s = L.find(x => x.i === i);
    if (!s.cert) return { error: '아직 올린 자격증이 없습니다', code: 400 };
    return { list: L.map(x => x.i === i ? (({ certOk, ...y }) => b.ok ? { ...y, certOk: 지금() } : y)(x) : x) };
  }
  if (b.op === 'role') {
    if (!Object.hasOwn(직원역할, b.role)) return { error: '역할을 골라 주세요', code: 400 };
    return { list: L.map(s => s.i === i ? { ...s, role: b.role } : s) };
  }
  return { error: '알 수 없는 요청입니다', code: 400 };
}

/* 이 메일이 다른 사무소 명단에 이미 있는가 - 두 사무소에 들면 어느 쪽으로 열릴지 정해지지 않는다 */
export async function 다른사무소직원(email, 내사무소, fetchFn = fetch) {
  const q = new URLSearchParams({ select: 'id', settings: 'cs.' + JSON.stringify({ staff: [{ email: 메일(email) }] }), id: 'neq.' + 내사무소, limit: '1' });
  const r = await fetchFn(sbUrl('bk_agent', q.toString()), { headers: sbHeaders() });
  if (!r.ok) return false;
  return (await r.json().catch(() => [])).length > 0;
}

/* 처음 들어온 직원 - 명단에 계정 id 를 적는다(메일이 바뀌어도 이어지게) */
export function 직원들어옴(list, i, uid) {
  return 직원들(list).map(x => x.i === i ? { ...x, uid, joined: x.joined || 지금() } : x);
}

/* 이 계정이 직원으로 든 사무소 - { agent, 첫로그인 } 또는 null. 계정 id 로 먼저, 없으면 확인된 메일로 */
export async function 직원사무소(user, 열, fetchFn = fetch) {
  if (!user || !user.id) return null;
  /* userFrom(_auth.js) 은 provider 를 맨 위에 담는다 - opsAccount 와 같은 판정 */
  const 믿는메일 = user.email_confirmed_at || user.confirmed_at || (user.provider && user.provider !== 'email');
  const email = 믿는메일 ? 메일(user.email) : '';
  const 찾기 = async 조각 => {
    const q = new URLSearchParams({ select: 열 + ',settings', settings: 'cs.' + JSON.stringify({ staff: [조각] }), limit: '1' });
    const r = await fetchFn(sbUrl('bk_agent', q.toString()), { headers: sbHeaders() });
    if (!r.ok) return null;
    return (await r.json().catch(() => []))[0] || null;
  };
  let row = await 찾기({ uid: user.id });
  if (!row && email) row = await 찾기({ email });
  if (!row) return null;
  const s = 직원들((row.settings || {}).staff).find(x => x.uid === user.id || (email && x.email === email));
  if (!s) return null;
  const { settings, ...a } = row;
  return { agent: { ...a, staff: { i: s.i, role: s.role, name: s.name, email: s.email, perm: s.perm || {} } }, 첫로그인: !s.uid };
}
