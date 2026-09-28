/* 우선순위 표와 무게 식을 화면 코드에서 그대로 꺼내 확인한다.
   무게는 '어느 물건을 먼저 보여줄까' 를 정한다 - 순위가 뒤집히면
   중개사가 덜 중요한 것이 어긋난 물건을 뒤로 보게 된다. */
import fs from 'node:fs';
import * as 길 from './길.mjs';
const js = 길.html();

const HOME = JSON.parse(js.match(/\?\s*(\{ 주택유형:[^}]*\})/)[1]
  .replace(/([가-힣]+):/g,'"$1":'));
const SHOP = JSON.parse(js.match(/:\s*(\{ 입주시기:[^}]*\})/)[1]
  .replace(/([가-힣]+):/g,'"$1":'));
const BASE = +js.match(/Math\.max\(0\.5,\s*(\d+)\s*-\s*x\.r\)/)[1];
const w = r => Math.max(0.5, BASE - r);

let fail = 0, ran = 0;
const ok = (c,m) => { ran++; console.log((c?'  OK  ':'  X   ')+m); if(!c) fail++; };

/* 대표가 준 차례 그대로인가 */
/* 2026-09-28 중개사 의견 - 화장실을 층 뒤로 내렸다.
   층은 못 바꾸는 조건이고, 화장실 개수는 같은 층의 다른 집에서 맞출 여지가 있다. */
const WANT_HOME = ['주택유형','면적','층','화장실','방향','주차','반려동물'];
const WANT_SHOP = ['입주시기','면적','주차'];
const order = T => Object.entries(T).sort((a,b)=>a[1]-b[1]).map(x=>x[0]);
ok(order(HOME).join('>') === WANT_HOME.join('>'), '주거 차례 ' + order(HOME).join(' > '));
ok(order(SHOP).join('>') === WANT_SHOP.join('>'), '상가 차례 ' + order(SHOP).join(' > '));

/* 5위부터 빈칸 없이 이어지는가 */
const seq = T => Object.values(T).sort((a,b)=>a-b).every((v,i)=>v===5+i);
ok(seq(HOME), '주거 순위 5부터 연속');
ok(seq(SHOP), '상가 순위 5부터 연속');

/* 무게가 순위대로 줄고, 꼴찌도 목록 밖(0.5)보다 무거운가 */
for(const [T,n] of [[HOME,'주거'],[SHOP,'상가']]){
  const ws = order(T).map(k=>w(T[k]));
  ok(ws.every((v,i)=>i===0||v<ws[i-1]), `${n} 무게 단조감소 ` + ws.join(' > '));
  ok(ws[ws.length-1] > w(50), `${n} 꼴찌(${order(T).at(-1)} ${ws.at(-1)}) > 목록 밖(${w(50)})`);
}

/* 층 하나 어긋난 물건이 화장실 어긋난 물건보다 뒤에 서는가 */
ok(w(HOME.면적) > w(HOME.층),     `면적(${w(HOME.면적)}) 이 층(${w(HOME.층)}) 보다 무겁다`);
ok(w(HOME.층) > w(HOME.화장실),   `층(${w(HOME.층)}) 이 화장실(${w(HOME.화장실)}) 보다 무겁다 - 중개사 의견(9/28)`);
ok(w(HOME.화장실) > w(HOME.방향), `화장실(${w(HOME.화장실)}) 이 방향(${w(HOME.방향)}) 보다 무겁다`);
/* 화장실 하나 < 주택유형 하나 - 낮은 것 여럿이 높은 것 하나를 밀어내지 않는지도 본다 */
ok(w(HOME.주차)+w(HOME.반려동물) < w(HOME.주택유형)+w(HOME.면적),
   '주차+반려동물 이 주택유형+면적 을 밀어내지 않는다');

/* ── 읽는 차례도 같은 말을 해야 한다 ──
   표만 고치고 목록을 안 고치면, **중개사가 보는 순서와 우리가 줄 세우는 순서가
   서로 다른 말을 한다.** 9/28 에 화장실을 층 뒤로 내리면서 실제로 세 곳이
   어긋날 뻔했다 - 조건 상세 · 복사해서 붙여넣는 글 · 운영 화면 한 줄 요약.
   셋 다 중개사가 읽는 자리다. 표를 기준으로 셋을 같이 잰다. */
{
  const 표차례 = order(HOME);
  const 곳 = [
    ['조건 상세',      /put\('면적',[\s\S]{0,400}?put\('방향'/],
    ['복사용 글',      /put\('면적   ',[\s\S]{0,400}?put\('방향   '/],
    ['운영 한 줄 요약', /\(r\.area_bands\|\|\[\]\)\.join\('·'\),[\s\S]{0,300}?\(r\.dir_want\|\|\[\]\)\.join\('·'\)/],
  ];
  for(const [이름, re] of 곳){
    const m = js.match(re);
    if(!m){ ok(false, `${이름} 을 찾지 못했다 - 검사가 옛 모양을 보고 있다`); continue; }
    const 글 = m[0];
    /* 라벨('층')이 아니라 **칸 이름**으로 찾는다 - 운영 화면 한 줄 요약에는
       라벨 없이 값만 이어 붙이므로 '층' 이라는 글자가 아예 없다.
       처음에 라벨로 찾았다가 그 한 곳만 못 찾았다. */
    const i층 = 글.indexOf('floor_'), i화 = 글.indexOf('bath_want');
    ok(i층 > -1 && i화 > -1 && (i층 < i화) === (표차례.indexOf('층') < 표차례.indexOf('화장실')),
       `${이름}: 층·화장실 차례가 우선순위 표와 같다`);
  }
}

console.log(ran+' 통과 / '+fail+' 실패');
process.exit(fail?1:0);
