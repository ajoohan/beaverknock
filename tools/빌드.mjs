/* 화면 빌드 (2026-11-12 속도) - 원본 한 장(D:/BeaverKnock/비버노크_프로토타입.html)에서 배포본을 만든다.
   ⚠ 원본은 그대로 한 장이다. 고치는 곳도 검사가 보는 곳도 원본이다. 배포 직전에 이것을 돌린다:
       node tools/빌드.mjs
   하는 일
   1) 주석 · 공백을 걷어 낸다(이름은 그대로 - onclick="..." 이 전역 이름을 부른다).
   2) 큰 스크립트를 /app/bk.<지문>.js 로 떼어 낸다. 파일 이름에 내용 지문이 들어가 1년 캐시(immutable)를 걸 수 있고,
      바깥 스크립트라 크롬이 해석 결과(코드 캐시)를 저장해 두 번째 방문부터는 해석을 건너뛴다.
      자리는 원래 인라인 스크립트가 있던 곳(body 끝) 그대로 - 실행 순서가 바뀌지 않는다.
   3) CSS 는 첫 화면을 막지 않게 그대로 인라인으로 두되 줄인다.
   4) 원본 사본을 저장소 원본/ 에 남긴다 - 원본은 저장소 밖이라, 이것이 주석까지 든 화면 코드의 이력(백업)이다. 웹에는 안 올라간다(.vercelignore).
   5) 오류 위치를 원본 줄로 되짚을 지도(소스맵)는 저장소 밖 ../빌드지도/ 에 둔다 - 웹에 두면 내부 주석이 그대로 드러난다.
   리뷰 11-12: 예전 지문 파일은 '지금 운영 중인 것'(커밋된 HEAD 의 index.html 이 부르는 것)을 지킨다 - 배포 전에 빌드를 여러 번 돌려도 안 지운다. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
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
  const r = await esbuild.transform(본[1], { loader: 'js', minifyWhitespace: true, minifySyntax: true, charset: 'utf8', legalComments: 'none', target: 'esnext', sourcemap: 'external', sourcefile: '비버노크_프로토타입.js' });
  const 지문 = crypto.createHash('sha256').update(r.code).digest('hex').slice(0, 10);
  const 이름 = `app/bk.${지문}.js`;
  파일[이름] = r.code;
  끝 = 끝.replace(본[0], () => `<script src="/${이름}"></script>`);
  return { html: 끝, 파일, 이름, 지도: r.map };
}

/* 직접 돌리면 index.html · app/ · 원본/ 을 쓴다. 예전 지문 파일은 지금 운영 중인 것 하나만 남긴다(배포 순간에 옛 화면을 연 사람이 받을 수 있게). */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const 원본 = fs.readFileSync(원본경로, 'utf8');
  const { html, 파일, 이름, 지도 } = await 빌드(원본);
  const 앱 = path.join(저장소, 'app');
  fs.mkdirSync(앱, { recursive: true });
  const 부르는것 = t => (/<script src="\/(app\/bk\.[0-9a-f]+\.js)"><\/script>/.exec(t || '') || [])[1];
  let 운영중 = null;
  try { 운영중 = 부르는것(execFileSync('git', ['show', 'HEAD:index.html'], { cwd: 저장소, encoding: 'utf8', maxBuffer: 64 << 20 })); } catch { /* 첫 커밋 전 */ }
  for (const [p, c] of Object.entries(파일)) fs.writeFileSync(path.join(저장소, p), c);
  fs.writeFileSync(path.join(저장소, 'index.html'), html);
  fs.mkdirSync(path.join(저장소, '원본'), { recursive: true });
  fs.writeFileSync(path.join(저장소, '원본', '비버노크_프로토타입.html'), 원본);
  const 지도곳 = path.resolve(저장소, '..', '빌드지도');
  fs.mkdirSync(지도곳, { recursive: true });
  fs.writeFileSync(path.join(지도곳, path.basename(이름) + '.map'), 지도);
  for (const f of fs.readdirSync(앱)) { const p = `app/${f}`; if (p !== 이름 && p !== 운영중) fs.unlinkSync(path.join(앱, f)); }
  const kb = n => (Buffer.byteLength(n) / 1024).toFixed(0) + 'KB';
  console.log(`빌드 - index.html ${kb(html)} · ${이름} ${kb(파일[이름])} (원본 ${kb(원본)})`);
}
