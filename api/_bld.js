/* 주소로 건축물대장 불러오기 (2026-11-06 · 파트너 기획 [221] '건축물대장 업로드와 무관하게 정보를 불러와 자동 입력')
 * 국토교통부 건축HUB 건축물대장정보 서비스(공공데이터포털 15134735) - 표제부(getBrTitleInfo) · 전유공용면적(getBrExposPubuseAreaInfo).
 * 키는 DATA_GO_KEY(날씨와 같은 포털 키). 포털에서 이 서비스에 '활용신청'을 해야 열린다 - 안 했으면 포털이 XML 오류를 준다.
 * 주소 검색(juso)이 준 법정동코드 · 본번 · 부번으로 찾는다. 서류 판독(_scan.js)과 같은 모양(scan)으로 돌려준다.
 * 등기부는 공개 조회가 없어 여기서 못 가져온다 - 소유자 · 권리관계는 등기부를 올려야 한다. */
const 바탕 = ['https://apis.data.go.kr/1613000/BldRgstHubService/', 'https://apis.data.go.kr/1613000/BldRgstService_v2/'];
const 네자리 = v => String(parseInt(String(v || '0'), 10) || 0).padStart(4, '0');
const 수 = v => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0; };
const 글 = v => String(v ?? '').trim();

export class 포털오류 extends Error {}

async function 묻기(op, q, 키, fetchFn = fetch) {
  const p = new URLSearchParams({ serviceKey: /%[0-9A-F]{2}/i.test(키) ? decodeURIComponent(키) : 키, _type: 'json', numOfRows: '100', pageNo: '1', ...q });
  let 마지막 = '';
  for (const b of 바탕) {
    let r, t;
    try { r = await fetchFn(`${b}${op}?${p}`, { signal: AbortSignal.timeout(6000) }); t = await r.text(); }
    catch { 마지막 = '건축물대장 조회가 지연되고 있습니다 - 잠시 뒤 다시 해 주세요'; continue; }
    let j = null; try { j = JSON.parse(t); } catch { j = null; }
    const h = j && j.response && j.response.header;
    if (h && h.resultCode === '00') { const it = (((j.response.body || {}).items) || {}).item; return Array.isArray(it) ? it : it ? [it] : []; }
    /* 활용신청 전 · 키 오류는 XML 로 온다 */
    마지막 = /SERVICE_KEY_IS_NOT_REGISTERED|SERVICE ACCESS DENIED|UNREGISTERED|NOT_REGISTERED|Unauthorized|401|403/i.test(t) || (r && (r.status === 401 || r.status === 403))
      ? '건축물대장 자동 조회가 아직 열리지 않았습니다 - 공공데이터포털에서 건축물대장정보 서비스 활용신청이 필요합니다'
      : (h && h.resultMsg) || '건축물대장을 불러오지 못했습니다';
  }
  throw new 포털오류(마지막);
}

/* 동·호 - '101동 1203호' · '제101동 제12층 제1203호' · 'A동 302호' */
export function 동호(s) {
  const t = 글(s);
  /* 동은 숫자 · 영문 · 한 글자(가동 · 나동)만 - '신장동' 같은 법정동 이름은 건물 동이 아니다 */
  const 호 = [...t.matchAll(/(?:^|[\s,동층])(?:제\s*)?([0-9A-Za-z][0-9A-Za-z-]{0,7})\s*호(?![가-힣])/g)].pop();
  const 동 = [...t.matchAll(/(?:^|[\s,])(?:제\s*)?([0-9A-Za-z]{1,6}|[가-힣])\s*동(?=[\s,]|$|제?\s*[0-9A-Za-z])/g)].pop();
  return { dong: 동 ? 동[1] : '', ho: 호 ? 호[1] : '' };
}

export async function 건축물대장(b, 키 = process.env.DATA_GO_KEY, fetchFn = fetch) {
  const admCd = 글(b.admCd);
  if (!/^\d{10}$/.test(admCd)) return { error: '법정동코드가 없습니다 - 소재지를 ‘도로명 찾기’로 다시 골라 주세요' };
  if (!글(b.bun) || !/^\d{1,4}$/.test(글(b.bun))) return { error: '지번(본번)이 없어 건축물대장을 찾지 못합니다 - 소재지를 다시 골라 주세요' };
  if (!키) return { error: '건축물대장 자동 조회가 아직 연결되지 않았습니다 - 건축물대장을 올려 주세요' };
  const 곳 = { sigunguCd: admCd.slice(0, 5), bjdongCd: admCd.slice(5), platGbCd: b.mount ? '1' : '0', bun: 네자리(b.bun), ji: 네자리(b.ji) };
  const { dong, ho } = 동호(b.unit || b.road);
  const 표제 = await 묻기('getBrTitleInfo', 곳, 키, fetchFn);
  if (!표제.length) return { error: '이 지번으로 등록된 건축물대장이 없습니다 - 건축물대장을 올려 주세요' };
  /* 여러 동이면 적은 동 → 주건축물 → 연면적이 가장 큰 것 */
  const 같은동 = dong ? 표제.filter(x => 글(x.dongNm).replace(/동$/, '') === dong) : [];
  const 주 = 표제.filter(x => /주건축물/.test(글(x.mainAtchGbCdNm)));
  const 고른 = (같은동[0]) || [...(주.length ? 주 : 표제)].sort((a, c) => 수(c.totArea) - 수(a.totArea))[0];
  let 전유 = [];
  if (ho) {
    try { 전유 = (await 묻기('getBrExposPubuseAreaInfo', { ...곳, ...(dong ? { dongNm: dong } : {}), hoNm: ho }, 키, fetchFn))
      .filter(x => 글(x.exposPubuseGbCd) === '1' || /전유/.test(글(x.exposPubuseGbCdNm))); }
    catch { 전유 = []; }
    /* 동 이름이 '101동' 처럼 '동' 까지 붙어 등록된 곳이 있다 */
    if (!전유.length && dong) {
      try { 전유 = (await 묻기('getBrExposPubuseAreaInfo', { ...곳, dongNm: dong + '동', hoNm: ho }, 키, fetchFn))
        .filter(x => 글(x.exposPubuseGbCd) === '1' || /전유/.test(글(x.exposPubuseGbCdNm))); } catch { 전유 = []; }
    }
  }
  const 전유면적 = Math.round(전유.reduce((s, x) => s + 수(x.area), 0) * 100) / 100;
  const 승인 = 글(고른.useAprDay), 날 = /^\d{8}$/.test(승인) ? `${승인.slice(0, 4)}-${승인.slice(4, 6)}-${승인.slice(6)}` : '';
  const 승강기 = (parseInt(고른.rideUseElvtCnt, 10) || 0) + (parseInt(고른.emgenUseElvtCnt, 10) || 0);
  const 주차 = ['indrAutoUtcnt', 'oudrAutoUtcnt', 'indrMechUtcnt', 'oudrMechUtcnt'].reduce((s, k) => s + (parseInt(고른[k], 10) || 0), 0);
  const 집합 = !!전유면적;
  const scan = {
    bdNm: 글(고른.bldNm), unit: 집합 ? [dong && dong + '동', ho + '호'].filter(Boolean).join(' ') : '',
    bldStruct: 글(고른.strctCdNm), bldUse: 집합 ? 글(전유[0].mainPurpsCdNm) || 글(고른.mainPurpsCdNm) : 글(고른.mainPurpsCdNm),
    bldArea: 집합 ? 전유면적 : 수(고른.totArea), landArea: 집합 ? 0 : 수(고른.platArea),
    totalArea: 수(고른.totArea), approval: 날,
    floors: [+고른.ugrndFlrCnt ? `지하 ${+고른.ugrndFlrCnt}층` : '', +고른.grndFlrCnt ? `지상 ${+고른.grndFlrCnt}층` : ''].filter(Boolean).join(' / '),
    elevators: 승강기 ? `${승강기}대` : '없음', parking: 주차 ? `${주차}대` : '',
  };
  const 알림 = [];
  if (ho && !집합) 알림.push(`${[dong && dong + '동', ho + '호'].filter(Boolean).join(' ')} 전유부를 찾지 못해 건물 전체 연면적을 넣었습니다 - 전유 면적을 확인하세요`);
  if (!ho && 표제.length > 1 && !같은동.length) 알림.push('건물이 여러 동입니다 - 소재지에 동·호를 적으면 그 호의 전유 면적을 찾습니다');
  알림.push('건축물대장 표제부(전유부) 값입니다. 토지 지목 · 공시지가 · 소유자 · 권리관계는 토지이용계획확인서 · 등기부를 올려 채우세요');
  return { scan: { ...scan, warnings: 알림 }, kinds: 집합 ? ['bld', 'bldx'] : ['bld'] };
}
