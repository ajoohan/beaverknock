/* 부운영자 (2026-11-06) - 운영 화면을 보되 연락처 · 메일은 가린 것만, 승인 · 반려 · 지우기 · 임시 링크는 못 한다 */
import * as 길 from './길.mjs';
let ran = 0, fail = 0;
const ok = (c, m) => { ran++; if (!c) fail++; console.log(`  ${c ? 'OK' : 'X '}  ${m}`); };
process.env.BK_URL = 'https://x.supabase.co'; process.env.BK_SECRET_KEY = 'k'; process.env.BK_OPS_PASS = 'p';
process.env.BK_OPS_USERS = 'aaaaaaaa-0000-0000-0000-000000000001';
process.env.BK_OPS_SUBS = 'bbbbbbbb-0000-0000-0000-000000000002';
const 사람 = { t1: { id: 'aaaaaaaa-0000-0000-0000-000000000001', email: 'boss@x.com', provider: 'google' },
  t2: { id: 'bbbbbbbb-0000-0000-0000-000000000002', email: 'sub@x.com', provider: 'google' },
  t3: { id: 'cccccccc-0000-0000-0000-000000000003', email: 'no@x.com', provider: 'google' } };
let 불린 = [];
globalThis.fetch = async (u, o = {}) => { u = String(u); 불린.push({ u, m: o.method || 'GET', b: o.body });
  if (/auth\/v1\/user$/.test(u)) { const tok = String((o.headers || {}).Authorization || '').replace('Bearer ', ''); const k = tok.slice(-2); const p = 사람[k]; return p ? new Response(JSON.stringify(p)) : new Response('{}', { status: 401 }); }
  if (/auth\/v1\/admin\/users/.test(u)) return new Response(JSON.stringify({ users: [{ id: 'u1', email: 'customer@gmail.com', created_at: 'x' }] }));
  if (/bk_demand\?/.test(u)) return new Response(JSON.stringify([{ id: 'd1', name: '홍길동', phone: '010-1234-5678', birth: '19900101' }]));
  if (/bk_agent\?/.test(u) && (o.method || 'GET') === 'GET') return new Response(JSON.stringify([{ id: 'a1', phone: '010-9999-8888', status: 'new' }]));
  if (/bk_agent\?/.test(u)) return new Response(JSON.stringify([{ id: 'a1' }]));
  if (/bk_ops_log/.test(u)) return new Response('[]', { status: 201 });
  return new Response('[]'); };
const { default: demands } = await import('../api/demands.js');
const { default: agentStatus } = await import('../api/agent-status.js');
const 응답 = () => { const r = { code: 0, body: null, h: {} }; r.status = c => (r.code = c, r); r.json = b => (r.body = b, r); r.setHeader = () => r; return r; };
const 부르기 = async (fn, who, body) => { const res = 응답(); await fn({ method: 'POST', headers: { authorization: 'Bearer ' + 'x'.repeat(30) + who }, body }, res); return res; };

let r = await 부르기(demands, 't2', { what: 'whoami' });
ok(r.code === 200 && r.body.role === 'sub', '부운영자 명단(BK_OPS_SUBS)의 계정은 암호 없이 들어오고 sub 로 알려진다');
ok((await 부르기(demands, 't1', { what: 'whoami' })).body.role === 'admin' && (await 부르기(demands, 't3', { what: 'whoami' })).code === 403, '운영자는 admin · 명단에 없으면 403');
r = await 부르기(demands, 't2', { reveal: true });
ok(r.code === 200 && r.body.revealed === false && r.body.rows[0].phone !== '010-1234-5678' && r.body.role === 'sub', '부운영자는 원문 보기를 보내도 연락처가 가려진다');
r = await 부르기(demands, 't1', { reveal: true });
ok(r.body.revealed === true && r.body.rows[0].phone === '010-1234-5678', '운영자는 원문을 볼 수 있다');
r = await 부르기(demands, 't2', { what: 'users' });
ok(r.body.rows[0].email === 'cu***@gmail.com', '부운영자에게 손님 메일은 가린다');
r = await 부르기(demands, 't2', { what: 'agents', reveal: true });
ok(r.body.rows[0].phone !== '010-9999-8888', '부운영자는 가입 신청 연락처도 가린다');
ok((await 부르기(demands, 't2', { what: 'ops-link', days: 7 })).code === 403, '부운영자는 임시 링크를 만들 수 없다');
const id = '11111111-1111-1111-1111-111111111111';
ok((await 부르기(agentStatus, 't2', { id, status: 'approved' })).code === 403 && (await 부르기(agentStatus, 't2', { ids: [id], op: 'delete' })).code === 403, '부운영자는 승인 · 반려 · 지우기를 못 한다');
불린 = []; r = await 부르기(agentStatus, 't2', { id, status: 'contacted' });
ok(r.code === 200 && 불린.some(x => x.m === 'PATCH' && /contacted/.test(x.b)), '부운영자도 연락함 표시는 한다');
const js = 길.js();
ok(js.includes("OPS.role = j.role === 'sub' ? 'sub' : 'admin';") && js.includes("sub: OPS.role === 'sub' ? '부운영자' : '운영자'") && js.includes("filter(([k]) => OPS.role !== 'sub' || !['approved', 'rejected'].includes(k))"),
   '화면 - 부운영자 표시 · 원문 보기 · 승인 · 반려 · 삭제 단추를 감춘다');
console.log(`${ran - fail} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
