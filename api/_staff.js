/* 직원 계정 (2026-11-06 대표님 · 파트너 기획 '대표가 직원을 초대 · 소속공인중개사는 전부 · 보조원은 계약서 불가')
 * 명단은 대표 사무소의 bk_agent.settings.staff - [{ i, email, role, name, at, uid?, joined? }] 20명까지.
 *   role: staff(소속공인중개사 - 대표와 같게, 직원 관리 · 사무소 주소 · 활동 지역만 빼고) · assistant(중개보조원 - 계약서 기능 전부 불가)
 * 직원이 초대받은 메일로 로그인하면 approvedAgent(feed.js) 가 이 명단에서 대표 사무소를 찾는다 - 직원은 대표 사무소로 일한다
 * (계약서 · 제안 · 물건은 사무소 것이라 대표와 같이 본다). 메일은 확인된 메일만 맞춘다(소셜 로그인 · 메일 확인 마친 계정) */
import crypto from 'node:crypto';
import { sbHeaders, sbUrl } from './_auth.js';

export const 직원역할 = { staff: '소속공인중개사', assistant: '중개보조원' };
export const 직원최대 = 20;
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
    });
    if (out.length >= 직원최대) break;
  }
  return out;
}

/* 명단 고치기 - add(메일 · 역할 · 이름) · del(i) · role(i, 역할). 대표 자신의 메일은 넣지 않는다 */
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
    return { list: [...L, 새], added: 새 };
  }
  const i = String(b.i || '');
  if (!L.some(s => s.i === i)) return { error: '명단에 없는 직원입니다 - 새로고침해 주세요', code: 404 };
  if (b.op === 'del') return { list: L.filter(s => s.i !== i) };
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
  return { agent: { ...a, staff: { i: s.i, role: s.role, name: s.name, email: s.email } }, 첫로그인: !s.uid };
}
