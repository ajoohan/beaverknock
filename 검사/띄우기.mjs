/* 프로토타입 한 장을 그대로 띄우는 작은 서버. 캐시는 끈다 -
   고친 것을 보려고 매번 강력 새로고침을 하게 되면 재는 일이 느려진다. */
import http from 'node:http';
import fs from 'node:fs';
import * as 길 from './길.mjs';

const FILE = 길.HTML경로;   /* 원본이 있으면 원본, 없으면 저장소의 index.html */

http.createServer((req, res) => {
  try {
    const html = fs.readFileSync(FILE);
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(html);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('못 읽었다: ' + e.message);
  }
}).listen(3111, () => console.log('http://localhost:3111'));
