
import * as 길 from './길.mjs';/* 매물 등록을 화면 입력부터 서버 INSERT 까지 돌려 본다.
   조건 접수에서 '입주 시기' 가 화면↔서버 틈으로 새고 있었다.
   같은 틈이 매물 쪽에도 있는지, **실제로 나가는 행**을 붙잡아 본다.
   (정적으로 키만 맞대보는 방식은 잡음만 나와서 버렸다) */
process.env.BK_URL = 'https://fake.supabase.co';
process.env.BK_SECRET_KEY = 'x'.repeat(40);
process.env.RESEND_API_KEY = '';

/* 중개사가 다 채운 매물 하나. 화면이 서버로 보내는 모양 그대로다. */
const L = {
  kind:'home', name:'미사강변 ○○아파트', addr:'경기도 하남시 미사강변대로 220',
  dong:'미사1동', deal:'월세', dep:100000000, rent:650000, fee:120000,
  area:59.94, areaSup:84.97, py:25.7, rooms:3, baths:2,
  band:'중층', floors:15, floorNo:'12', duplex:false,
  bdong:'101', ho:'1203', htype:'아파트',
  dir:'남동', dirBase:'거실',
  feeBasis:'3개월 평균', feeType:'정액', feeItems:'수도료·청소비 포함 / 전기·가스 별도',
  note:'남향 거실이라 오후까지 볕이 듭니다', moveIn:'즉시 · 협의',
  musts:['주차 가능','엘리베이터'], fac:[],
  mustsFree:'단지 앞 초등학교 도보 3분', facFree:'',
  approved:'2016-06-24', photos:0, status:'active',
};

let sentRow = null;
globalThis.fetch = async (url, opt = {}) => {
  const u = String(url), m = (opt.method || 'GET').toUpperCase();
  if (u.includes('/auth/v1/user')) return new Response(JSON.stringify({ id:'u-1', email:'a@b.c' }), { status:200 });
  if (u.includes('bk_agent')) return new Response(JSON.stringify([{ id:'a1', user_id:'u-1', role:'agent',
    status:'approved', office:'미사중앙', scope_regions:['하남시'], scope_kinds:['home'], scope_set:true }]), { status:200 });
  if (u.includes('bk_listing') && m === 'POST') { sentRow = JSON.parse(opt.body); return new Response(JSON.stringify([{ id:'L9' }]), { status:201 }); }
  return new Response('[]', { status:200 });
};

const res = { code:0, body:null, setHeader(){}, status(c){ this.code=c; return this; }, json(b){ this.body=b; return this; } };
const { default: feed } = await import(길.api('feed.js'));
await feed({ method:'POST', headers:{ authorization:'Bearer ' + 'y'.repeat(40) },
  socket:{ remoteAddress:'10.1.2.3' }, body:{ what:'listing-add', listing:L } }, res);

console.log('응답 ' + res.code + '  ' + JSON.stringify(res.body).slice(0, 120));
if (!sentRow) { console.log('⚠ INSERT 가 안 나갔다'); process.exit(1); }

/* 화면이 값을 줬는데 서버 행에서 비어버린 칸을 찾는다 - 그게 새는 자리다 */
const snake = s => s.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
const empty = v => v === null || v === undefined || v === '' ||
                   (Array.isArray(v) && !v.length);
/* 안 나가는 것이 **맞는** 칸들. 이유를 적어 둔다 - 적어두지 않으면 다음 사람이
   '새는 것' 으로 읽고 고치려 든다. 이 목록에 없는 것이 사라지면 그때가 진짜다.
   (전에는 이 둘 때문에 이 검사가 늘 1 로 끝나고 있었는데, 출력만 보고
    종료 코드를 보지 않아서 아무도 몰랐다 - 2026-09-24) */
const 괜찮음 = {
  addr:   '매물 표에 addr 칸이 없다. 주소는 dong(행정동) + name(건물명)으로 남는다',
  status: '서버가 싣지 않는다 - 표의 기본값이 active 다',
};
const lost = [], 넘김 = [];
for (const [k, v] of Object.entries(L)) {
  if (empty(v) || v === false || v === 0) continue;      /* 원래 빈 것은 제외 */
  const col = snake(k);
  const 빠짐 = !(col in sentRow) || empty(sentRow[col]);
  if (!빠짐) continue;
  if (괜찮음[k]) { 넘김.push(`${k} - ${괜찮음[k]}`); continue; }
  lost.push(!(col in sentRow) ? `${k} → 표에 '${col}' 칸이 아예 없다`
                              : `${k}=${JSON.stringify(v)} → ${col} 이 비어서 나간다`);
}
console.log('\n── 나간 행 ' + Object.keys(sentRow).length + '칸 ──');
console.log(JSON.stringify(sentRow, null, 1));
if (넘김.length) console.log('\n── 안 나가는 것이 맞는 칸 ──\n' + 넘김.join('\n'));
console.log('\n── 화면은 줬는데 서버 행에서 사라진 것 ──');
console.log(lost.length ? lost.join('\n') : '없음');
console.log(lost.length ? `0 통과 / ${lost.length} 실패` : '1 통과 / 0 실패');
process.exit(lost.length ? 1 : 0);
