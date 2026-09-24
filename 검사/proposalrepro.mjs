
import * as 길 from './길.mjs';/* 제안 보내기를 화면 입력부터 서버 INSERT 까지 돌려 본다.
   조건 접수에서 '입주 시기' 가, 매물 등록에서 '사용승인일' 이 같은 틈으로
   새고 있었다 - 화면은 값을 쥐고 있는데 표에는 안 들어가는 틈이다.
   세 다리 중 마지막이다. */
process.env.BK_URL = 'https://fake.supabase.co';
process.env.BK_SECRET_KEY = 'x'.repeat(40);
process.env.RESEND_API_KEY = '';

/* 중개사가 제안 작성 화면에서 다 채운 모양 */
const P = {
  demand_id: '11111111-2222-3333-4444-555555555555',
  addr: '경기도 하남시 미사강변대로 220', bname: '미사강변 ○○아파트',
  dep: 100000000, rent: 650000, fee: 120000,
  feeType: '정액', feeItems: '수도료·청소비 포함 / 전기·가스 별도',
  feeBasis: '3개월 평균',
  areaSup: 84.97, area: 59.94,
  rooms: '3', baths: '2',
  dir: '남동', dirBase: '거실',
  floorMode: '정확히', floorNo: '12', band: '중층',
  moveIn: '즉시 · 협의', park: '가능', approved: '2016.06.24',
  bdong: '101', htype: '아파트', note: '남향 거실이라 오후까지 볕이 듭니다',
  duplex: false, photos: 3,
  msg: '요청하신 조건 중 지역·예산·방수는 맞고, 엘리베이터는 없습니다.',
};

let sentRow = null;
globalThis.fetch = async (url, opt = {}) => {
  const u = String(url), m = (opt.method || 'GET').toUpperCase();
  if (u.includes('/auth/v1/user')) return new Response(JSON.stringify({ id:'u-1', email:'a@b.c' }), { status:200 });
  if (u.includes('bk_agent')) return new Response(JSON.stringify([{ id:'a1', user_id:'u-1', role:'agent',
    status:'approved', office:'미사중앙공인중개사사무소', reg_no:'41450-2019-00217',
    scope_regions:['하남시'], scope_kinds:['home'], scope_set:true }]), { status:200 });
  if (u.includes('bk_demand')) return new Response(JSON.stringify([{ id:'11111111-2222-3333-4444-555555555555', kind:'home',
    slots:5, slots_left:5, dongs:['미사1동'], deal:'월세', dep:100000000, rent:650000,
    name:'한상혁', phone:'01012345678' }]), { status:200 });
  if (u.includes('bk_proposal') && m === 'POST') { sentRow = JSON.parse(opt.body); return new Response(JSON.stringify([{ id:'p9' }]), { status:201 }); }
  return new Response('[]', { status:200 });
};

const res = { code:0, body:null, setHeader(){}, status(c){ this.code=c; return this; }, json(b){ this.body=b; return this; } };
const { default: prop } = await import(길.api('proposal.js'));
await prop({ method:'POST', headers:{ authorization:'Bearer ' + 'y'.repeat(40) },
  socket:{ remoteAddress:'10.1.2.3' }, body:{ ...P } }, res);

console.log('응답 ' + res.code + '  ' + JSON.stringify(res.body).slice(0, 160));
if (!sentRow) { console.log('⚠ INSERT 가 안 나갔다'); process.exit(1); }

const snake = s => s.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
const empty = v => v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length);
const lost = [];
for (const [k, v] of Object.entries(P)) {
  if (empty(v) || v === false) continue;
  if (k === 'demand_id') continue;                        /* 주소가 아니라 가리키는 값 */
  const col = snake(k);
  if (!(col in sentRow)) { lost.push(`${k} → 행에 '${col}' 이 없다`); continue; }
  if (empty(sentRow[col])) lost.push(`${k}=${JSON.stringify(v)} → ${col} 이 비어서 나간다`);
}
console.log('\n── 나간 행 ' + Object.keys(sentRow).length + '칸 ──');
console.log(JSON.stringify(sentRow, null, 1));
console.log('\n── 화면은 줬는데 행에서 사라진 것 ──');
console.log(lost.length ? lost.join('\n') : '없음');
