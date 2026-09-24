/* 검사들이 보는 자리를 한곳에서 정한다.
   ── 왜 만들었나 ──
   검사는 세션 임시 폴더(scratchpad)에 살고 있었다. 2026-09-24 에 그 폴더가
   청소되면서 **일곱 개 145건이 한 번에 사라졌다.** 남은 것을 저장소로 옮기면서,
   절대 경로를 박아두면 자리를 옮기는 순간 또 전부 죽으므로 여기서 되짚는다. */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const 여기 = path.dirname(fileURLToPath(import.meta.url));
export const 저장소 = path.resolve(여기, '..');                 /* beaverknock-prototype */

/* 화면의 원본은 저장소 **바깥**에 있다(D:/BeaverKnock/비버노크_프로토타입.html).
   그것을 고치고 배포할 때 index.html 로 복사한다 - 그래서 원본이 있으면 원본을 본다.
   없으면(다른 자리에 내려받았다면) 저장소의 index.html 을 본다.
   둘 중 무엇을 보고 있는지는 검사가 말해 준다 - 말없이 옛것을 재면 안 된다. */
const 원본 = path.resolve(저장소, '..', '비버노크_프로토타입.html');
export const HTML경로 = fs.existsSync(원본) ? 원본 : path.resolve(저장소, 'index.html');
export const 보는곳 = fs.existsSync(원본) ? '원본' : 'index.html';

export const html = () => fs.readFileSync(HTML경로, 'utf8');
export const js = () => html().match(/<script>([\s\S]*)<\/script>/)[1];
/* style 블록이 둘이다 - 첫 번째는 글꼴 몇 줄뿐이라 .steps 가 든 쪽을 고른다 */
export const css = () => [...html().matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
  .map(m => m[1]).find(s => s.includes('.steps'));

/* 서버 코드는 저장소 안에 있다. import 에 넘길 수 있는 file:// 주소로 돌려준다. */
export const api = name => pathToFileURL(path.resolve(저장소, 'api', name)).href;
