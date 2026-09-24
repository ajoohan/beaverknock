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
const WANT_HOME = ['주택유형','면적','화장실','층','방향','주차','반려동물'];
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

/* 화장실 하나 어긋난 물건이 면적 어긋난 물건보다 앞에 서는가 */
ok(w(HOME.면적) > w(HOME.화장실), `면적(${w(HOME.면적)}) 이 화장실(${w(HOME.화장실)}) 보다 무겁다`);
ok(w(HOME.화장실) > w(HOME.층),   `화장실(${w(HOME.화장실)}) 이 층(${w(HOME.층)}) 보다 무겁다`);
/* 화장실 하나 < 주택유형 하나 - 낮은 것 여럿이 높은 것 하나를 밀어내지 않는지도 본다 */
ok(w(HOME.주차)+w(HOME.반려동물) < w(HOME.주택유형)+w(HOME.면적),
   '주차+반려동물 이 주택유형+면적 을 밀어내지 않는다');

console.log(ran+' 통과 / '+fail+' 실패');
process.exit(fail?1:0);
