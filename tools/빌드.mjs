/* 화면 빌드 (2026-11-12 속도) - 원본 한 장(D:/BeaverKnock/비버노크_프로토타입.html)에서 배포본을 만든다.
   ⚠ 원본은 그대로 한 장이다. 고치는 곳도 검사가 보는 곳도 원본이다. 배포 직전에 이것을 돌린다:
       node tools/빌드.mjs
   하는 일
   1) 주석 · 공백을 걷어 낸다(이름은 그대로 - onclick="..." 이 전역 이름을 부른다).
   2) 큰 스크립트를 /app/bk.<지문>.js 로 떼어 낸다. 파일 이름에 내용 지문이 들어가 1년 캐시(immutable)를 걸 수 있고,
      바깥 스크립트라 크롬이 해석 결과(코드 캐시)를 저장해 두 번째 방문부터는 해석을 건너뛴다.
      자리는 원래 인라인 스크립트가 있던 곳(body 끝) 그대로 - 실행 순서가 바뀌지 않는다.
   3) CSS 는 첫 화면을 막지 않게 그대로 인라인으로 두되 줄인다. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const 여기 = path.dirname(fileURLToPath(import.meta.url));
export const 저장소 = path.resolve(여기, '..');
export const 원본경로 = path.resolve(저장소, '..', '비버노크_프로토타입.html');

export async function 빌드(html) {
  const 파일 = {};
  let 끝 = html;
  /* CSS */
  const 스타일 = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)];
  for (const m of 스타일) {
    const r = await esbuild.transform(m[1], { loader: 'css', minify: true, charset: 'utf8', legalComments: 'none' });
    끝 = 끝.replace(m[0], () => `<style>${r.code.trim()}</style>`);
  }
  /* 스크립트 - 속성 없는 인라인 스크립트 가운데 가장 큰 것(본 앱) */
  const 스크립트 = [...끝.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (!스크립트.length) throw new Error('본 스크립트를 찾지 못했습니다');
  const 본 = 스크립트.reduce((a, b) => (b[1].length > a[1].length ? b : a));
  const r = await esbuild.transform(본[1], { loader: 'js', minifyWhitespace: true, minifySyntax: true, charset: 'utf8', legalComments: 'none', target: 'esnext' });
  const 지문 = crypto.createHash('sha256').update(r.code).digest('hex').slice(0, 10);
  const 이름 = `app/bk.${지문}.js`;
  파일[이름] = r.code;
  끝 = 끝.replace(본[0], () => `<script src="/${이름}"></script>`);
  return { html: 끝, 파일, 이름 };
}

/* 직접 돌리면 index.html 과 app/ 를 쓴다. 예전 지문 파일은 바로 앞 것 하나만 남긴다(열려 있던 옛 화면이 새로 고침 전까지 받을 수 있게). */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const 원본 = fs.readFileSync(원본경로, 'utf8');
  const { html, 파일, 이름 } = await 빌드(원본);
  const 앱 = path.join(저장소, 'app');
  fs.mkdirSync(앱, { recursive: true });
  const 옛 = path.join(저장소, 'index.html');
  const 앞이름 = fs.existsSync(옛) ? (/<script src="\/(app\/bk\.[0-9a-f]+\.js)"><\/script>/.exec(fs.readFileSync(옛, 'utf8')) || [])[1] : null;
  for (const [p, c] of Object.entries(파일)) fs.writeFileSync(path.join(저장소, p), c);
  fs.writeFileSync(옛, html);
  for (const f of fs.readdirSync(앱)) { const p = `app/${f}`; if (p !== 이름 && p !== 앞이름) fs.unlinkSync(path.join(앱, f)); }
  const kb = n => (Buffer.byteLength(n) / 1024).toFixed(0) + 'KB';
  console.log(`빌드 - index.html ${kb(html)} · ${이름} ${kb(파일[이름])} (원본 ${kb(원본)})`);
}
