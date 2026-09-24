/* 제안 화면의 동·주택유형. 세 자리가 같은 이름을 봐야 값이 흐른다 -
   ① 화면이 담는 칸 ② 보낼 때 읽는 칸 ③ 물건에서 불러올 때 채우는 칸.
   여태 ①이 아예 없어서, 손으로 쓴 제안에는 늘 비어 있었다. */
import fs from 'node:fs';
import * as 길 from './길.mjs';
const html = 길.html();
const js = html.match(/<script>([\s\S]*)<\/script>/)[1];

let fail = 0, ran = 0;
const ok = (c,m) => { ran++; console.log((c?'  OK  ':'  X   ')+m); if(!c) fail++; };
const has = re => re.test(js);

/* ① 화면에 칸이 있는가 */
ok(has(/data-in="pbdong"/),                       '동 입력칸이 제안 화면에 있다');
ok(has(/chipsHTML\(LHTYPE, g\('phtype'\),'phtype',false\)/), '주택유형 칩이 제안 화면에 있다');

/* ② 보낼 때 그 칸을 읽는가 */
ok(has(/bdong: f\.pbdong \|\| '', htype: f\.phtype \|\| ''/), '보낼 때 pbdong·phtype 를 읽는다');

/* ③ 물건에서 불러올 때 그 칸에 담는가 */
ok(has(/pbdong:L\.bdong\|\|'', phtype:L\.htype\|\|''/),      '물건에서 불러오면 같은 칸에 담긴다');

/* ④ 입력이 실제로 S.form 에 담기는가 - 제안 화면 허용 목록에 있어야 한다 */
const wl = js.match(/if\(\['addr','bname'[^\]]*\]\.includes\(k\) && S\.route\.startsWith\('#\/partner\/propose'\)\)/);
ok(!!wl && /'pbdong'/.test(wl[0]), '동 입력이 제안 화면 허용 목록에 있다');

/* ⑤ 칩이 눌리는가 - 토글 case 에 phtype 이 있어야 한다 */
ok(/case 'feeBasis': case 'phtype':/.test(js),    '주택유형 칩이 토글 case 에 있다');

/* ⑥ 이름이 부딪히지 않는가 - htype 은 손님 조건 등록이 이미 쓴다 */
ok(/case 'htype': toggleIn\(d\.htype,v\)/.test(js), "손님 조건의 'htype' 은 그대로 살아 있다");
ok(!/data-in="htype"/.test(js) && !/,'htype',false\)/.test(js),
   "제안 화면이 'htype' 이름을 가로채지 않는다");

/* ⑦ 호는 여전히 안 나간다 - 이게 무너지면 세대가 특정된다 */
ok(!/ho:\s*f\.(lho|pho)/.test(js.slice(js.indexOf("apiFetch('/api/proposal'"),
                                       js.indexOf("apiFetch('/api/proposal'")+1400)),
   '제안 payload 에 호가 없다');
ok(!/lho:L\.ho/.test(js),                         '제안 화면으로 호를 들고 가지 않는다');

/* ⑧ 상가 조건에는 주택유형을 묻지 않는다 */
const card = js.slice(js.indexOf('<span class="sect"><span style="color:var(--ind)">2.</span> 필수 정보'));
ok(/\$\{home \? `<div style="margin-bottom:14px"><span class="lab"[^`]*주택 유형/.test(card.slice(0,900)),
   '주택유형은 주거 조건일 때만 나온다');

/* ⑨ 주소 안내문이 사실과 맞는가 - 동은 이제 손님에게 보인다 */
ok(has(/호수는 적지 않으셔도 됩니다/), "안내문이 '호수는' 으로 바뀌었다");
ok(!has(/동·호수는 적지 않으셔도 됩니다/), "'동·호수' 라고 말하던 옛 문구가 없다");

/* ⑩ 불러왔다는 표시가 한 번만 나오는가 - 같은 카드에 두 번 박혀 있었다 */
const addrCard = js.slice(js.indexOf('<span class="sect"><span style="color:var(--ind)">1.</span> 주소'),
                          js.indexOf('<span class="sect"><span style="color:var(--ind)">2.</span> 필수 정보'));
ok((addrCard.match(/내 물건에서 불러왔습니다/g)||[]).length === 1,
   '불러왔다는 표시가 주소 카드에 한 번만 있다');

console.log(ran+' 통과 / '+fail+' 실패');
process.exit(fail?1:0);
