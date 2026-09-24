
import * as 길 from './길.mjs';/* 0026 을 아직 안 돌렸을 때도 매물 등록이 살아 있는가.
   칸이 없으면 그 칸만 빼고 저장하고, 무엇을 뺐는지 말해야 한다. */
process.env.BK_URL='https://fake.supabase.co';
process.env.BK_SECRET_KEY='x'.repeat(40);
process.env.RESEND_API_KEY='';

const L = { kind:'home', name:'미사강변 ○○아파트', dong:'미사1동', deal:'월세',
  dep:100000000, rent:650000, area:59.94, rooms:3, dir:'남동', dirBase:'거실',
  feeBasis:'3개월 평균', moveIn:'즉시', approved:'2016.06.24', status:'active' };

let tries = 0, lastRow = null;
globalThis.fetch = async (url, opt={}) => {
  const u=String(url), m=(opt.method||'GET').toUpperCase();
  if(u.includes('/auth/v1/user')) return new Response(JSON.stringify({id:'u-1',email:'a@b.c'}),{status:200});
  if(u.includes('bk_agent')) return new Response(JSON.stringify([{id:'a1',user_id:'u-1',role:'agent',
    status:'approved',office:'미사중앙',scope_regions:['하남시'],scope_kinds:['home'],scope_set:true}]),{status:200});
  if(u.includes('bk_listing') && m==='POST'){
    tries++; lastRow = JSON.parse(opt.body);
    /* 첫 시도: 0026 전이라 approved 칸이 없다고 답한다 */
    if(tries===1) return new Response(JSON.stringify({code:'PGRST204',
      message:"Could not find the 'approved' column of 'bk_listing' in the schema cache"}),{status:400});
    return new Response(JSON.stringify([{id:'L9'}]),{status:201});
  }
  return new Response('[]',{status:200});
};
const res={code:0,body:null,setHeader(){},status(c){this.code=c;return this;},json(b){this.body=b;return this;}};
const { default: feed } = await import(길.api('feed.js'));
await feed({method:'POST',headers:{authorization:'Bearer '+'y'.repeat(40)},
  socket:{remoteAddress:'10.9.9.9'},body:{what:'listing-add',listing:L}},res);

const ok201 = res.code===201;
const dropped = res.body && res.body.degraded && res.body.degraded.dropped || [];
const gone = lastRow && !('approved' in lastRow);
console.log('시도 횟수            ' + tries + ' (2면 한 번 실패하고 다시 넣었다)');
console.log('등록이 살아남았는가   ' + (ok201 ? 'OK' : 'X  ' + JSON.stringify(res.body)));
console.log('approved 를 뺐는가    ' + (gone ? 'OK' : 'X'));
console.log('무엇을 뺐는지 말하나  ' + (dropped.includes('사용승인일') ? 'OK' : 'X  ' + JSON.stringify(dropped)));
process.exit(ok201 && gone && dropped.includes('사용승인일') ? 0 : 1);
