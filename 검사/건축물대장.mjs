/* 주소로 건축물대장 불러오기 (2026-11-06) - 포털 답을 흉내 내 실제로 돌린다 */
import { 건축물대장, 동호, 포털오류, 토지 } from '../api/_bld.js';
import * as 길 from './길.mjs';
import fs from 'node:fs';
import path from 'node:path';
let ran = 0, fail = 0;
const ok = (c, m) => { ran++; if (!c) fail++; console.log(`  ${c ? 'OK' : 'X '}  ${m}`); };
const js = 길.js();
const 답 = items => new Response(JSON.stringify({ response: { header: { resultCode: '00' }, body: { items: { item: items } } } }), { status: 200 });

ok(동호('미사강변대로 220, 101동 1203호').dong === '101' && 동호('미사강변대로 220, 101동 1203호').ho === '1203' && 동호('하남시 신장동 123').dong === '' && 동호('가동 101호').dong === '가' && 동호('미사강변대로 165, 101동1203호').ho === '1203',
   '동·호 읽기 - 건물 동만(법정동 이름은 아니다)');

{ let 불린 = [];
  const f = async u => { 불린.push(String(u)); return /getBrTitleInfo/.test(u)
    ? 답([{ bldNm:'미사강변', dongNm:'101동', mainAtchGbCdNm:'주건축물', strctCdNm:'철근콘크리트구조', mainPurpsCdNm:'공동주택', totArea:'30000', platArea:'9000', useAprDay:'20150630', grndFlrCnt:'25', ugrndFlrCnt:'2', rideUseElvtCnt:'2', emgenUseElvtCnt:'1', indrAutoUtcnt:'300' },
          { dongNm:'102동', mainAtchGbCdNm:'주건축물', strctCdNm:'벽돌', totArea:'99999' }])
    : 답([{ exposPubuseGbCd:'1', area:'84.97', mainPurpsCdNm:'아파트' }, { exposPubuseGbCd:'2', area:'30.1' }]); };
  const o = await 건축물대장({ admCd:'4145010300', bun:'123', ji:'4', road:'경기도 하남시 미사강변대로 220, 101동 1203호' }, 'k%2Bk', f);
  ok(o.scan.bldStruct === '철근콘크리트구조' && o.scan.bldUse === '아파트' && o.scan.bldArea === 84.97 && o.scan.landArea === 0 && o.scan.approval === '2015-06-30'
     && o.scan.floors === '지하 2층 / 지상 25층' && o.scan.elevators === '3대' && o.kinds.includes('bldx'),
     '집합건물 - 적은 동의 표제부 + 그 호의 전유 면적(공용 빼고) · 대지 면적은 넣지 않는다');
  ok(/sigunguCd=41450&bjdongCd=10300&platGbCd=0&bun=0123&ji=0004/.test(불린[0]) && /serviceKey=k%2Bk/.test(불린[0]) && /hoNm=1203/.test(불린[1]),
     '법정동코드 앞 5·뒤 5 · 본번·부번 네 자리 · 인코딩된 키는 한 번만 인코딩');
}
{ const f = async u => /getBrTitleInfo/.test(u) ? 답({ strctCdNm:'철골구조', mainPurpsCdNm:'제2종근린생활시설', totArea:'420.5', platArea:'200', useAprDay:'20001010' }) : 답([]);
  const o = await 건축물대장({ admCd:'4145010300', bun:'5', ji:'' }, 'k', f);
  ok(o.scan.bldArea === 420.5 && o.scan.landArea === 200 && o.kinds.length === 1, '일반건물 - 연면적 · 대지 면적');
}
{ const f = async () => new Response('<OpenAPI_ServiceResponse><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg></OpenAPI_ServiceResponse>', { status: 200 });
  let e = null; try { await 건축물대장({ admCd:'4145010300', bun:'5' }, 'k', f); } catch (x) { e = x; }
  ok(e instanceof 포털오류 && /활용신청/.test(e.message), '활용신청 전이면 그렇다고 알려 준다');
  ok(/법정동코드/.test((await 건축물대장({ admCd:'', bun:'1' }, 'k', f)).error) && /연결되지/.test((await 건축물대장({ admCd:'4145010300', bun:'1' }, '', f)).error),
     '법정동코드가 없거나 키가 없으면 포털에 묻지 않는다');
}
{ const f = async u => /getLandCharacteristics/.test(u)
    ? new Response(JSON.stringify({ landCharacteristicss: { field: [{ stdrYear: '2025', lndcgrCodeNm: '대', lndpclAr: '1200.5', prposArea1Nm: '제2종일반주거지역', pblntfPclnd: '5230000' }, { stdrYear: '2024', lndcgrCodeNm: '전', pblntfPclnd: '1' }] } }))
    : /getLandUseAttr/.test(u) ? new Response(JSON.stringify({ landUses: { field: [{ prposAreaDstrcCodeNm: '제2종일반주거지역' }, { prposAreaDstrcCodeNm: '토지거래계약에관한허가구역' }, { prposAreaDstrcCodeNm: '가축사육제한구역' }] } }))
    : 답([]);
  const o = await 건축물대장({ admCd:'4145010300', bun:'5', ji:'', mount:false }, 'k', f, 'vk');
  ok(o.kinds[0] === 'land' && o.scan.landCat === '대' && o.scan.landArea === 1200.5 && o.scan.zone === '제2종일반주거지역' && o.scan.landPrice === 5230000 && o.scan.landPriceYear === '2025' && o.scan.permitZone === true && /가축사육제한구역/.test(o.scan.district),
     '토지 - 건물이 없으면 토지특성(최근 해) · 토지이용계획(허가구역)만으로 채운다');
  let 본 = ''; await 건축물대장({ admCd:'4145010300', bun:'5', ji:'12', mount:true }, 'k', async u => { if (/vworld/.test(u)) 본 = String(u); return /vworld/.test(u) ? new Response('{}') : 답([]); }, 'vk').catch(() => {});
  ok(/pnu=4145010300200050012/.test(본) && /api\.vworld\.kr\/ned\/data\/getLand/.test(본) && /key=vk&domain=beaverknock\.co\.kr/.test(본), 'PNU = 법정동코드 + 산(2) + 본번 4 + 부번 4 · 브이월드 키와 도메인');
}
{ process.env.BK_SECRET_KEY = 's'; let 본 = null;
  const o = await 토지({ admCd:'4145010300', bun:'5', ji:'' }, 'vk', async (u, op) => { 본 = { u: String(u), op }; return new Response(JSON.stringify({ 특성: [{ stdrYear:'2025', lndcgrCodeNm:'대', lndpclAr:'10' }], 이용: [] })); }, true);
  ok(o && o.landCat === '대' && /\/api\/agent-verify$/.test(본.u) && JSON.parse(본.op.body).what === 'land' && 본.op.headers['x-bk-land'].length === 64 && JSON.parse(본.op.body).pnu === '4145010300100050000' && !/vk/.test(본.op.body),
     '서버(미국)에서는 서울 함수(agent-verify what:land)를 거친다 - 열쇠는 서버 비밀값에서, 브이월드 키는 보내지 않는다');
}
ok(/case 'contract-bld':\s+await 대장\(req, res, agent, b\);/.test(fs.readFileSync(path.resolve(길.저장소, 'api/_contract.js'), 'utf8')) && /ctApplyScan\(CT\.doc, j\.scan, j\.kinds \|\| \['bld'\], true\)/.test(js) && /data-act="ct-bld-go"/.test(js),
   '화면 - 소재지를 고르면 ‘주소로 건축물대장 불러오기’ · 빈칸만 채운다');
console.log(`${ran - fail} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
