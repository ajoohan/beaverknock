/* 우리 사무소 서식 올리기 (2026-11-06) - 확인 · 저장소 요청 모양을 흉내 낸 답으로 돌린다 */
import { 서식확인, 서식들, 서식올리기, 서식주소, 서식지우기, 머리맞음 } from '../api/_forms.js';
import * as 길 from './길.mjs';
import fs from 'node:fs';
import path from 'node:path';
let ran = 0, fail = 0;
const ok = (c, m) => { ran++; if (!c) fail++; console.log(`  ${c ? 'OK' : 'X '}  ${m}`); };
process.env.BK_URL = 'https://x.supabase.co'; process.env.BK_SECRET_KEY = 'k';
const b64 = s => Buffer.from(s).toString('base64');
const PDF = b64('%PDF-1.7 hello'), HWP = Buffer.from('d0cf11e0a1b11ae1000000', 'hex').toString('base64');

ok(서식확인({ name: '시설물 확인서.pdf', data: PDF }).ext === 'pdf' && 서식확인({ name: '시설물 확인서.pdf', data: PDF }).name === '시설물 확인서'
   && 서식확인({ name: '위임장.HWP', data: HWP }).ext === 'hwp', '받는 파일 - 확장자 · 머리가 맞으면 이름에서 확장자를 뺀다');
ok(/한글/.test(서식확인({ name: 'a.exe', data: PDF }).error) && /맞지 않/.test(서식확인({ name: 'a.pdf', data: HWP }).error)
   && /3MB/.test(서식확인({ name: 'a.pdf', data: Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(3 * 1024 * 1024)]).toString('base64') }).error),
   '거르는 파일 - 다른 확장자 · 확장자와 내용이 다른 것 · 3MB 넘는 것');
ok(머리맞음('docx', Buffer.from('504b0304', 'hex')) && 머리맞음('png', Buffer.from('89504e470d0a1a0a', 'hex')) && !머리맞음('jpg', Buffer.from('%PDF-')), '파일 머리 - zip(docx) · PNG · JPEG');
ok(서식들([{ id: 'abcdefabcdef', name: 'x', ext: 'pdf', size: 3 }, { id: 'bad', ext: 'pdf' }, { id: 'abcdefabcdef', ext: 'pdf' }, { id: '0123456789ab', ext: 'exe' }]).length === 1, '목록 - 모양이 틀린 것 · 겹친 것 · 다른 확장자는 버린다');
{ let 불린 = [];
  const f = async (u, o) => { 불린.push({ u: String(u), o }); return /sign/.test(u) ? new Response(JSON.stringify({ signedURL: '/object/sign/bk-forms/a/abc.pdf?token=t' })) : new Response('{}'); };
  const u = await 서식올리기('aaaa-1', 'pdf', Buffer.from('%PDF-'), f);
  ok(/^[0-9a-f]{12}$/.test(u.id) && 불린[0].u === `https://x.supabase.co/storage/v1/object/bk-forms/aaaa-1/${u.id}.pdf` && 불린[0].o.headers['Content-Type'] === 'application/pdf' && 불린[0].o.headers['x-upsert'] === 'false',
     '올리기 - 비공개 버킷 bk-forms 의 사무소id/서식id.확장자 (덮어쓰지 않음)');
  const s = await 서식주소('aaaa-1', { id: 'abc', ext: 'pdf', name: '시설물 확인서' }, f);
  ok(s.url === 'https://x.supabase.co/storage/v1/object/sign/bk-forms/a/abc.pdf?token=t&download=%EC%8B%9C%EC%84%A4%EB%AC%BC%20%ED%99%95%EC%9D%B8%EC%84%9C.pdf' && JSON.parse(불린[1].o.body).expiresIn === 300,
     '내려받기 - 5분짜리 서명 주소 · 원래 이름으로 내려받는다');
  await 서식지우기('aaaa-1', { id: 'abc', ext: 'pdf' }, f);
  ok(불린[2].o.method === 'DELETE' && JSON.parse(불린[2].o.body).prefixes[0] === 'aaaa-1/abc.pdf', '지우기 - 저장소에서도 지운다');
  const 없음 = await 서식올리기('aaaa-1', 'pdf', Buffer.from('%PDF-'), async () => new Response('{"statusCode":"404","error":"Bucket not found"}', { status: 400 }));
  ok(없음.need === 'forms', '버킷이 없으면(SQL 실행 전) 준비 중으로 알린다');
}
const feed = fs.readFileSync(path.resolve(길.저장소, 'api/feed.js'), 'utf8'), js = 길.js();
ok(/if \(b\.what === 'form-up'\)      return upForm\(res, chk\.agent, b\);/.test(feed) && /if \(!z\.y \|\| z\.y\.error\) \{ await 서식지우기\(agent\.id, 새\)/.test(feed),
   '서버 - 목록에 못 넣으면 올린 파일을 지운다(남는 파일 없음)');
ok(/function ct내서식HTML\(\)/.test(js) && /data-fu-file/.test(js) && /data-act="fu-get"/.test(js), '화면 - 서식 자료실에 ‘우리 사무소 서식’ 올리기 · 내려받기 · 지우기');
console.log(`${ran - fail} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
