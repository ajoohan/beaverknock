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
  if (!표제.length) {
    /* 건물이 없는 땅(토지 매매 등) - 토지 값만이라도 */
    const 땅 = await 토지(b, 키, fetchFn).catch(() => null);
    if (!땅) return { error: '이 지번으로 등록된 건축물대장이 없습니다 - 건축물대장을 올려 주세요' };
    return { scan: { ...땅, warnings: ['건축물대장은 없고 토지특성 · 토지이용계획 값만 넣었습니다. 소유자 · 권리관계는 등기부를 올려 채우세요', ...(땅.permitZone ? ['토지거래허가구역입니다 - 일정 · 체크에서 토지거래허가 단계를 기록하세요'] : [])] }, kinds: ['land'] };
  }
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
  /* 토지 - 집합건물이면 필지 전체 면적은 넣지 않는다(대지권 비율 면적은 등기부에서) */
  const 땅 = await 토지(b, 키, fetchFn).catch(() => null);
  const kinds = 집합 ? ['bld', 'bldx'] : ['bld'];
  if (땅) { Object.assign(scan, { landCat: 땅.landCat, zone: 땅.zone, district: 땅.district, landPrice: 땅.landPrice, landPriceYear: 땅.landPriceYear, permitZone: 땅.permitZone },
      집합 ? {} : { landArea: 땅.landArea || scan.landArea }); kinds.push('land');
    if (땅.permitZone) 알림.unshift('토지거래허가구역입니다 - 일정 · 체크에서 토지거래허가 단계를 기록하세요'); }
  알림[알림.length - 1] = 땅 ? '건축물대장 · 토지특성 · 토지이용계획 값입니다. 소유자 · 권리관계는 등기부를 올려 채우세요'
    : '건축물대장 표제부(전유부) 값입니다. 토지 지목 · 공시지가 · 소유자 · 권리관계는 토지이용계획확인서 · 등기부를 올려 채우세요';
  return { scan: { ...scan, warnings: 알림 }, kinds };
}

/* ── 주소로 토지 (2026-11-06) ── 국가공간정보(NSDI) 서비스 - 공공데이터포털의 같은 키(DATA_GO_KEY).
 * 토지특성(LandCharacteristicsService): 지목 · 면적 · 용도지역 · 개별공시지가. 토지이용계획(LandUseService): 지역 · 지구(토지거래허가구역 여부).
 * PNU = 법정동코드 10 + 산(1 일반 · 2 산) + 본번 4 + 부번 4. 활용신청을 안 했거나 실패하면 null - 건축물대장 결과는 그대로 쓴다 */
const 토지바탕 = 'https://apis.data.go.kr/1611000/nsdi/';
export const 필지번호 = b => `${글(b.admCd)}${b.mount ? '2' : '1'}${네자리(b.bun)}${네자리(b.ji)}`;
async function 토지묻기(path, 키, pnu, fetchFn) {
  const p = new URLSearchParams({ serviceKey: /%[0-9A-F]{2}/i.test(키) ? decodeURIComponent(키) : 키, pnu, format: 'json', numOfRows: '100', pageNo: '1' });
  try {
    const r = await fetchFn(`${토지바탕}${path}?${p}`, { signal: AbortSignal.timeout(6000) });
    const j = JSON.parse(await r.text());
    /* { landCharacteristicss: { field: [...] } } 처럼 묶음 이름 아래 field 목록 */
    const 묶음 = Object.values(j || {}).find(v => v && typeof v === 'object' && 'field' in v);
    const f = 묶음 && 묶음.field;
    return Array.isArray(f) ? f : f ? [f] : [];
  } catch { return null; }
}
export async function 토지(b, 키 = process.env.DATA_GO_KEY, fetchFn = fetch) {
  if (!키 || !/^\d{10}$/.test(글(b.admCd)) || !/^\d{1,4}$/.test(글(b.bun))) return null;
  const pnu = 필지번호(b);
  const [특성, 이용] = await Promise.all([
    토지묻기('LandCharacteristicsService/attr/getLandCharacteristics', 키, pnu, fetchFn),
    토지묻기('LandUseService/attr/getLandUseAttr', 키, pnu, fetchFn)]);
  if (!특성 && !이용) return null;
  /* 해마다 한 줄 - 가장 최근 해 */
  const 최근 = (특성 || []).slice().sort((a, c) => String(c.stdrYear || '').localeCompare(String(a.stdrYear || '')))[0] || {};
  const 지역지구 = [...new Set((이용 || []).map(x => 글(x.prposAreaDstrcCodeNm)).filter(Boolean))];
  const 용도 = 지역지구.filter(n => /지역$/.test(n) && /주거|상업|공업|녹지|관리|농림|자연환경/.test(n));
  const out = {
    landCat: 글(최근.lndcgrCodeNm), landArea: 수(최근.lndpclAr),
    zone: 용도[0] || [글(최근.prposArea1Nm), 글(최근.prposArea2Nm)].filter(x => x && x !== '지정되지않음').join(' · '),
    district: 지역지구.filter(n => !용도.includes(n)).slice(0, 8).join(' · ').slice(0, 80),
    landPrice: 수(최근.pblntfPclnd), landPriceYear: 글(최근.stdrYear),
    permitZone: 지역지구.some(n => /토지거래(계약에관한)?허가구역/.test(n.replace(/\s/g, ''))),
  };
  return Object.values(out).some(v => v) ? out : null;
}
