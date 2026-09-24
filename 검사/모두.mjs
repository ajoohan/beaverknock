/* 검사를 전부 돌린다.  node 검사/모두.mjs
   ── 왜 있나 ──
   검사를 하나씩 손으로 돌리면 **빠뜨린 것이 통과한 것처럼 보인다.**
   2026-09-24 에 임시 폴더가 청소되어 일곱 개가 사라졌는데, 하나씩 돌리고 있어서
   '파일이 없다' 는 오류가 통과 줄 사이에 묻혔다. 여기서는 없어진 것도 실패로 센다. */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import * as 길 from './길.mjs';

const 여기 = path.dirname(fileURLToPath(import.meta.url));

/* 이름 옆의 수는 **그때 통과하던 건수**다. 줄어들면 검사가 지워진 것이고,
   늘면 새로 넣은 것이다 - 둘 다 눈에 띄어야 한다. */
const 목록 = [
  ['밴드',          59, '면적·연식·층 밴드의 경계와 빈 값'],
  ['게이트',        43, '등록·제안·접수의 문턱 - 무엇이 열고 무엇이 막는가'],
  ['호',            16, '호수는 손님에게 가지 않는다 (동은 간다)'],
  ['동의',          27, '필수·선택을 가르고 **언제** 동의했는지를 남긴다'],
  ['광고',          33, '표시·광고 명시사항이 손님 화면까지 닿는가'],
  ['가입',          44, '파트너 자격 - 손님 조건 전문이 걸린 문. 서버가 직접 대조한다'],
  ['spectest',      35, '명시사항·강점·제안이 표에 그대로 담기는가'],
  ['ranktest',      11, '매칭 우선순위 표와 무게'],
  ['proptest',      14, '제안 화면의 동·주택유형이 세 자리에서 같은 이름을 보는가'],
  ['steptest',      26, '홈 네 걸음의 시간표와 되감기'],
  ['mapgaptest',    21, '매칭이 읽는 값이 실제로 실려 오는가 · 유형이 양쪽에 다 있는가'],
  ['demandrepro',   null, '조건 접수 네 유형을 서버까지 돌려본다'],
  ['listingrepro',  null, '매물 등록을 서버까지 돌려본다'],
  ['proposalrepro', null, '제안 보내기를 서버까지 돌려본다'],
];

console.log(`보는 곳: ${길.보는곳} (${길.HTML경로})\n`);

let 합 = 0, 실패 = 0;
for(const [이름, 기대, 설명] of 목록){
  const p = path.join(여기, 이름 + '.mjs');
  if(!fs.existsSync(p)){ console.log(`  없음  ${이름.padEnd(14)} ← 파일이 사라졌다`); 실패++; continue; }
  const r = spawnSync(process.execPath, [p], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const m = out.match(/(\d+) 통과 \/ (\d+) 실패/);
  if(r.status !== 0 || (m && +m[2] > 0)){
    실패++;
    console.log(`  실패  ${이름.padEnd(14)} ${m ? m[0] : '(오류)'}`);
    console.log(out.split('\n').filter(l => /^\s{2}X|Error|없음/.test(l)).slice(0, 6).map(l => '        ' + l).join('\n'));
    continue;
  }
  const n = m ? +m[1] : null;
  합 += n || 0;
  const 표 = n === null ? '통과' : `${n}건`;
  const 경고 = (기대 != null && n !== null && n !== 기대) ? `  ⚠ 전에는 ${기대}건이었다` : '';
  console.log(`  OK    ${이름.padEnd(14)} ${String(표).padStart(5)}  ${설명}${경고}`);
}
console.log(`\n${합}건 통과 · ${실패 ? 실패 + '개 검사 실패' : '실패 없음'}`);
process.exit(실패 ? 1 : 0);
