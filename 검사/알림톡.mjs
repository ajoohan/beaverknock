/* 받은 제안 알림 - 카카오 알림톡과 사이트 뱃지 (2026-10-17).
   ── 왜 있나 ──
   ① 알림톡은 키·채널·심사 통과 템플릿이 다 있어야 나간다. 하나라도 빠지면 **조용히** 건너뛰어야
      하고(제안이 실패하면 안 된다), 다 있으면 솔라피가 받는 모양 그대로 나가야 한다.
      어긋나도 화면에는 아무 티가 안 난다 - 손님이 카톡을 못 받을 뿐이다.
   ② 뱃지는 '안 읽은 제안' 만 센다. 예시나 이미 연 제안을 세면 늘 빨간 숫자가 떠 있어 아무도 안 본다. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import * as 길 from './길.mjs';

let ran = 0, fail = 0;
const ok = (c, m) => { ran++; console.log((c ? '  OK  ' : '  X   ') + m); if(!c) fail++; };

const { alimtalk, 휴대폰, 솔라피머리 } = await import(길.api('_kakao.js'));
const 키들 = { SOLAPI_API_KEY: 'NCSTESTKEY', SOLAPI_API_SECRET: 'test-secret', SOLAPI_PFID: 'KA01PFtest', SOLAPI_FROM: '070-4105-0678' };
const 놓기 = o => { for (const k of Object.keys(키들)) delete process.env[k]; Object.assign(process.env, o); };

/* ── ① 빠진 것이 있으면 건너뛴다 ── */
{
  let 불림 = 0;
  globalThis.fetch = async () => { 불림++; return new Response('{}', { status: 200 }); };
  놓기({});
  ok((await alimtalk({ to: '01012345678', template: 'KA01TPx', vars: {} })).skipped === 'no key' && 불림 === 0, '키가 없으면 보내지 않고 조용히 건너뛴다');
  놓기(키들);
  ok((await alimtalk({ to: '01012345678', template: undefined, vars: {} })).skipped === 'no key' && 불림 === 0, '템플릿(심사 통과 ID)이 없으면 건너뛴다 - 심사 전에 키만 넣어도 아무것도 안 나간다');
  ok((await alimtalk({ to: '0212345678', template: 'KA01TPx', vars: {} })).skipped === 'no phone' && 불림 === 0, '휴대폰 번호가 아니면 보내지 않는다');
  놓기({ ...키들, SOLAPI_FROM: '' });
  ok((await alimtalk({ to: '01012345678', template: 'KA01TPx', vars: {} })).skipped === 'no from' && 불림 === 0,
     '발신번호가 없으면 보내지 않고 이유(no from)를 남긴다 - 솔라피는 알림톡에도 발신번호를 요구한다(2026-10-17 리뷰)');
  ok(휴대폰('010-1234-5678') === '01012345678' && 휴대폰('011 234 5678') === '0112345678' && 휴대폰('070-4105-0678') === null && 휴대폰('') === null,
     '번호는 하이픈·공백을 걷고 휴대폰만 남긴다');
}

/* ── ② 다 있으면 솔라피가 받는 모양 그대로 ── */
{
  놓기(키들);
  let 보냄 = null;
  globalThis.fetch = async (url, opt) => { 보냄 = { url: String(url), opt }; return new Response('{"groupId":"G"}', { status: 200 }); };
  const r = await alimtalk({ to: '010-1234-5678', template: 'KA01TPproposal', vars: { 이름: '한상혁', 지역: '망월동 · 풍산동', 가격: '보증금 1,000 / 월 70' } });
  ok(r.ok === true && 보냄 && 보냄.url === 'https://api.solapi.com/messages/v4/send' && 보냄.opt.method === 'POST', '솔라피 발송 주소로 보낸다');
  const m = 보냄 && JSON.parse(보냄.opt.body).message;
  ok(m && m.to === '01012345678' && m.from === '07041050678', '받는 번호·발신번호는 숫자만');
  ok(m && m.kakaoOptions.pfId === 'KA01PFtest' && m.kakaoOptions.templateId === 'KA01TPproposal' && m.kakaoOptions.disableSms === true,
     '채널(pfId)·템플릿으로 알림톡을 보내고, 안 가면 문자로 대신 보내지 않는다(요금)');
  ok(m && m.kakaoOptions.variables['#{이름}'] === '한상혁' && m.kakaoOptions.variables['#{지역}'] === '망월동 · 풍산동' && Object.keys(m.kakaoOptions.variables).every(k => /^#\{.+\}$/.test(k)),
     '변수는 템플릿의 #{…} 이름으로 채운다');
  const 머리 = 보냄 && 보냄.opt.headers.Authorization;
  const p = Object.fromEntries(String(머리).replace(/^HMAC-SHA256 /, '').split(', ').map(s => s.split('=')));
  const 기대 = crypto.createHmac('sha256', 'test-secret').update(p.date + p.salt).digest('hex');
  ok(/^HMAC-SHA256 apiKey=NCSTESTKEY, date=/.test(머리) && p.signature === 기대 && !String(머리).includes('test-secret'),
     '인증 머리는 Secret 으로 (시각+소금)을 서명한 값 - Secret 자체는 보내지 않는다');
  ok(솔라피머리('k', 's', new Date('2026-10-17T00:00:00Z'), 'abc') === `HMAC-SHA256 apiKey=k, date=2026-10-17T00:00:00.000Z, salt=abc, signature=${crypto.createHmac('sha256', 's').update('2026-10-17T00:00:00.000Zabc').digest('hex')}`,
     '서명 규칙이 솔라피 문서와 같다(HMAC-SHA256(date+salt))');
}

/* ── ③ 실패해도 던지지 않는다 ── */
{
  놓기(키들);
  globalThis.fetch = async () => new Response('{"errorCode":"ValidationError","errorMessage":"수신번호 010-1234-5678 / 01012345678 이(가) 올바르지 않습니다"}', { status: 400 });
  const 원 = console.error; const 로그 = []; console.error = (...a) => 로그.push(a.join(' '));
  const r1 = await alimtalk({ to: '01012345678', template: 'T', vars: {} });
  ok(로그.length === 1 && !/01012345678|010-1234-5678/.test(로그[0]) && /ValidationError/.test(로그[0]),
     '거절 이유는 남기되 오류 본문에 되비친 휴대폰 번호는 가린다(2026-10-17 리뷰)');
  globalThis.fetch = async () => { throw new Error('network'); };
  const r2 = await alimtalk({ to: '01012345678', template: 'T', vars: {} });
  globalThis.fetch = () => new Promise(() => {});
  const 시작 = Date.now();
  const r3 = await alimtalk({ to: '01012345678', template: 'T', vars: {} });
  console.error = 원;
  ok(/send failed 400/.test(r1.skipped) && r2.skipped === 'error' && r3.skipped === 'timeout' && Date.now() - 시작 < 4000,
     '거절·네트워크 오류·무응답 모두 던지지 않고 2.5초 안에 물러선다 - 제안 저장은 그대로 성공한다');
}

/* ── ④ 제안 서버가 손님에게 보낸다 ── */
{
  const src = fs.readFileSync(new URL(길.api('proposal.js')), 'utf8');
  ok(/select: 'id,slots_left,user_id,kind,dongs,deal,dep,rent,name,phone'/.test(src), '제안을 받을 때 손님 이름·휴대폰을 함께 읽는다');
  ok(/\n[ \t]*alimtalk\(\{\s*to: d\.phone,\s*template: process\.env\.SOLAPI_TPL_PROPOSAL,/.test(src), '제안이 저장되면 손님 휴대폰으로 \'새 제안\' 템플릿을 보낸다(조건 없이 부른다)');
  const 변수 = (src.match(/vars: \{([\s\S]*?)\}/) || [])[1] || '';
  ok(['이름', '지역', '보낸곳', '가격', '남은자리'].every(k => 변수.includes(k + ':')) && !/office|addr|bname|phone/.test(변수),
     '알림톡에는 메일과 같은 것만 - 사무소 이름·소재지·연락처는 담지 않는다');
  ok(/await Promise\.all\(\[[\s\S]*alimtalk\(/.test(src), '메일과 나란히 보낸다 - 중개사를 더 세워 두지 않는다');
  const 처리방침 = fs.readFileSync(new URL('../privacy.html', import.meta.url), 'utf8');
  ok(/<dt>솔라피 주식회사<\/dt><dd>카카오 알림톡 발송/.test(처리방침) && !/누리고/.test(처리방침),
     '처리방침 수탁사에 알림톡 발송(솔라피 주식회사 - 지금 이름)이 있다 - 휴대폰 번호가 넘어간다');
}

/* ── ④-2 제안 저장을 실제로 돌려, 솔라피로 무엇이 나가는지 본다 (2026-10-17 리뷰 - 전에는 호출 글자만 봤다) ── */
{
  process.env.BK_URL = 'https://fake.supabase.co';
  process.env.BK_SECRET_KEY = 'x'.repeat(40);
  process.env.RESEND_API_KEY = '';
  놓기({ ...키들, SOLAPI_TPL_PROPOSAL: 'KA01TPproposal' });
  let 톡 = null, 저장 = false;
  globalThis.fetch = async (url, opt = {}) => {
    const u = String(url), m = (opt.method || 'GET').toUpperCase();
    if (u.includes('api.solapi.com')) { 톡 = JSON.parse(opt.body).message; return new Response('{}', { status: 200 }); }
    if (u.includes('/auth/v1/user')) return new Response(JSON.stringify({ id: 'u-1', email: 'a@b.c' }), { status: 200 });
    if (u.includes('/auth/v1/admin/users')) return new Response(JSON.stringify({ email: 'son@b.c' }), { status: 200 });
    if (u.includes('bk_agent')) return new Response(JSON.stringify([{ id: 'a1', user_id: 'u-1', role: 'agent', status: 'approved',
      office: '미사중앙공인중개사사무소', reg_no: '41450-2019-00217', scope_regions: ['하남시'], scope_kinds: ['home'], scope_set: true }]), { status: 200 });
    if (u.includes('bk_demand') && m === 'PATCH') return new Response('[{"id":"d1"}]', { status: 200 });
    if (u.includes('bk_demand')) return new Response(JSON.stringify([{ id: '11111111-2222-3333-4444-555555555555', kind: 'home', user_id: 'son-1',
      slots: 5, slots_left: 5, dongs: ['미사1동'], deal: '월세', dep: 100000000, rent: 650000, name: '한상혁', phone: '010-2222-3333' }]), { status: 200 });
    if (u.includes('bk_proposal') && m === 'POST') { 저장 = true; return new Response('[{"id":"p9"}]', { status: 201 }); }
    return new Response('[]', { status: 200 });
  };
  const res = { code: 0, body: null, setHeader(){}, status(c){ this.code = c; return this; }, json(b){ this.body = b; return this; } };
  const { default: prop } = await import(길.api('proposal.js'));
  await prop({ method: 'POST', headers: { authorization: 'Bearer ' + 'y'.repeat(40) }, socket: { remoteAddress: '10.9.9.9' },
    body: { demand_id: '11111111-2222-3333-4444-555555555555', addr: '경기도 하남시 미사강변대로 220', bname: '미사강변 ○○아파트',
      dep: 100000000, rent: 650000, area: 59.94, rooms: '3', dir: '남동', dirBase: '거실', feeBasis: '3개월 평균', msg: '안녕하세요' } }, res);
  ok(res.code === 201 && 저장, `제안이 저장된다 (${res.code})`);
  const v = 톡 && 톡.kakaoOptions.variables;
  ok(톡 && 톡.to === '01022223333' && 톡.kakaoOptions.templateId === 'KA01TPproposal',
     '제안이 저장되면 그 조건을 건 손님의 휴대폰으로 \'새 제안\' 템플릿이 나간다');
  ok(v && v['#{이름}'] === '한상혁' && v['#{지역}'] === '미사1동' && v['#{보낸곳}'] === '공인중개사' && v['#{남은자리}'] === '4' && /보증금/.test(v['#{가격}']),
     `변수에 이름·지역·보낸 곳 자격·가격·남은 자리가 들어간다 (${v && JSON.stringify(v)})`);
  ok(톡 && !JSON.stringify(톡).includes('미사중앙') && !JSON.stringify(톡).includes('미사강변대로'), '사무소 이름·소재지는 나가지 않는다');
}

/* ── ⑤ 사이트 뱃지 - 안 읽은 제안만 ── */
{
  const js = 길.js(), css = 길.css();
  const 몸 = js.slice(js.indexOf('const 새제안수 = '), js.indexOf('function userMenu(){'));
  const 만들기 = S => new Function('S', `${몸}; return { 새제안수, 새제안표 };`)(S);
  const 셈 = S => 만들기(S).새제안수();
  ok(셈({ user: { id: 1 }, props: [{ isNew: true }, { isNew: true }, { isNew: false }, { isNew: true, seed: true }] }) === 2, '안 읽은 것만 센다 - 이미 연 것·예시는 세지 않는다');
  ok(셈({ user: null, props: [{ isNew: true }] }) === 0, '로그인 전에는 세지 않는다');
  const { 새제안표 } = 만들기({});
  ok(새제안표(0) === '' && /nbadge/.test(새제안표(3)) && />3</.test(새제안표(3)) && />99\+</.test(새제안표(120)), '0이면 아무것도, 많으면 99+');
  ok(/aria-label="\$\{esc\(who\)\} 님 메뉴\$\{새 \? ` · 새 제안 \$\{새\}건` : ''\}"/.test(js), '낭독기에도 새 제안 수를 읽어 준다');
  ok(/\$\{새제안표\(새\)\}/.test(js) && /제안함\$\{새제안표\(새제안수\(\)\)\}/.test(js) && /k==='inbox' \? 새제안표\(새제안수\(\)\)/.test(js),
     '내 이름 단추 · 제안함 탭 · 휴대폰 탭바 세 곳에 뜬다');
  ok(/else if\(S\.user && !consentNeeded\(\) && BADGE_ROUTES\.includes\(h\)\) loadMine\(false\);/.test(js),
     '첫 화면·안내에서도 받아 둔다 - 들어와 보지 않아도 뱃지가 보인다(동의 전 계정은 빼고)');
  const 화면들 = new Function(`${js.match(/const BADGE_ROUTES = \[[^\]]*\];/)[0]}; return BADGE_ROUTES;`)();
  ok(화면들.includes('#/') && !['#/kind', '#/who', '#/register', '#/detail', '#/contact', '#/agree', '#/login'].some(h => 화면들.includes(h)),
     `글을 적는 화면에서는 미리 받지 않는다 - 답이 와 다시 그리면 커서·한글 조합이 깨진다(2026-10-17 리뷰) (${화면들.join(' ')})`);
  ok(/새제안표\(새, '새 제안'\)/.test(js) && !/class="nbadge num" style=/.test(js), '메뉴의 뱃지도 같은 함수로 그린다 - 99+ 규칙이 한 곳');
  const { 새제안표: 표2 } = 만들기({});
  ok(/aria-label="새 제안 3건"/.test(표2(3, '새 제안')) && /aria-hidden="true"/.test(표2(3)), '이름표를 주면 낭독기가 \'새 제안 3건\' 으로 읽고, 아니면 숨긴다');
  ok(/\.nbadge\{[^}]*background:var\(--danger\)/.test(css) && /\.nbadge\{[^}]*font-size:12px/.test(css), '뱃지는 빨강 · 12px');
}

console.log(`${ran - fail} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
