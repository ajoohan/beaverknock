/* ── 실거래가 (2026-11-23) ── 국토교통부 실거래가 공개(공공데이터포털) - 아파트 · 연립다세대 · 오피스텔 매매.
 * 키는 DATA_GO_KEY(건축물대장과 같은 포털 키). 포털에서 서비스마다 '활용신청'을 해야 열린다 - 안 했으면 알린다.
 *   아파트 매매 실거래가 상세 자료(15126469) · 연립다세대 매매(15126467) · 오피스텔 매매(15126464)
 * 같은 시군구 · 같은 동 · 같은 지번의 최근 거래만 고른다(해제된 거래는 뺀다). 금액은 원으로.
 * 전세 안전 점검의 '시세'와 매물장부 가격 참고에 쓴다. 계약서에 저절로 넣지는 않는다 - 중개사가 보고 고른다. */
const 바탕 = {
  apt:  ['https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade', 'aptNm'],
  rh:   ['https://apis.data.go.kr/1613000/RTMSDataSvcRHTrade/getRTMSDataSvcRHTrade', 'mhouseNm'],
  offi: ['https://apis.data.go.kr/1613000/RTMSDataSvcOffiTrade/getRTMSDataSvcOffiTrade', 'offiNm'],
};
export const 종류이름 = { apt: '아파트', rh: '연립 · 다세대', offi: '오피스텔' };
const 글 = v => String(v ?? '').trim();
const 수 = v => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return isFinite(n) ? n : 0; };
export class 실거래오류 extends Error {}

/* 건물 용도로 어느 자료를 볼지 - 모르면 아파트부터 */
export function 고를종류(용도 = '') {
  const u = 글(용도);
  if (/오피스텔/.test(u)) return ['offi'];
  if (/연립|다세대|빌라/.test(u)) return ['rh'];
  if (/아파트/.test(u)) return ['apt'];
  return ['apt', 'rh'];
}
/* 지번 - '220' · '220-1' · '산 12' */
export const 지번글 = (bun, ji) => { const b = parseInt(글(bun), 10) || 0, j = parseInt(글(ji), 10) || 0; return b ? (j ? `${b}-${j}` : String(b)) : ''; };
/* 지난 n달(이번 달 포함) - YYYYMM */
export function 달들(n, 지금 = Date.now()) {
  const t = new Date(지금 + 9 * 3600e3), out = [];
  for (let i = 0; i < n; i++) { const d = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - i, 1)); out.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`); }
  return out;
}

async function 한달(종류, 시군구, 달, 키, fetchFn) {
  const [주소] = 바탕[종류];
  const p = new URLSearchParams({ serviceKey: /%[0-9A-F]{2}/i.test(키) ? decodeURIComponent(키) : 키, LAWD_CD: 시군구, DEAL_YMD: 달, numOfRows: '1000', pageNo: '1', _type: 'json' });
  let r, t;
  try { r = await fetchFn(`${주소}?${p}`, { signal: AbortSignal.timeout(7000) }); t = await r.text(); }
  catch { throw new 실거래오류('실거래가 조회가 지연되고 있습니다 - 잠시 뒤 다시 해 주세요'); }
  let j = null; try { j = JSON.parse(t); } catch { j = null; }
  const h = j && j.response && j.response.header;
  if (h && /^0+$/.test(String(h.resultCode))) { const it = (((j.response.body || {}).items) || {}).item; return Array.isArray(it) ? it : it ? [it] : []; }
  if (/SERVICE_KEY_IS_NOT_REGISTERED|SERVICE ACCESS DENIED|UNREGISTERED|NOT_REGISTERED|Unauthorized|Forbidden/i.test(t) || (r && (r.status === 401 || r.status === 403)))
    throw new 실거래오류(`실거래가 자동 조회가 아직 열리지 않았습니다 - 공공데이터포털에서 ‘${종류이름[종류]} 매매 실거래가’ 활용신청이 필요합니다`, { cause: 'need' });
  throw new 실거래오류((h && h.resultMsg) || '실거래가를 불러오지 못했습니다');
}

/* b = { admCd(법정동코드 10자리), bun, ji, use(건물 용도), area(전용면적 ㎡, 선택), months(기본 12) } */
export async function 실거래가(b, 키 = process.env.DATA_GO_KEY, fetchFn = fetch, 지금 = Date.now()) {
  const admCd = 글(b.admCd);
  if (!/^\d{10}$/.test(admCd)) return { error: '법정동코드가 없습니다 - 소재지를 ‘도로명 찾기’로 다시 골라 주세요' };
  const 지번 = 지번글(b.bun, b.ji);
  if (!지번) return { error: '지번(본번)이 없어 실거래가를 찾지 못합니다 - 소재지를 다시 골라 주세요' };
  if (!키) return { error: '실거래가 자동 조회가 아직 연결되지 않았습니다 - 국토교통부 실거래가 화면에서 확인해 넣어 주세요', need: 'key' };
  const 시군구 = admCd.slice(0, 5), 동 = admCd.slice(5, 10), 개월 = Math.min(Math.max(parseInt(b.months, 10) || 12, 1), 24), 넓이 = 수(b.area);
  for (const 종류 of 고를종류(b.use)) {
    const 이름칸 = 바탕[종류][1], 거래 = [];
    const 달목록 = 달들(개월, 지금);
    /* 세 달씩 함께 묻는다 - 포털이 한꺼번에 많이 받으면 느려진다 */
    for (let i = 0; i < 달목록.length; i += 3) {
      const 묶음 = await Promise.all(달목록.slice(i, i + 3).map(m => 한달(종류, 시군구, m, 키, fetchFn)));
      for (const rows of 묶음) for (const x of rows) {
        if (글(x.umdCd) && 글(x.umdCd) !== 동) continue;
        if (글(x.jibun).replace(/\s/g, '') !== 지번) continue;
        if (/O|해제/.test(글(x.cdealType))) continue;
        const 금액 = Math.round(수(x.dealAmount) * 1e4);
        if (!금액) continue;
        거래.push({ 날: `${글(x.dealYear)}-${String(글(x.dealMonth)).padStart(2, '0')}-${String(글(x.dealDay)).padStart(2, '0')}`, 금액, 넓이: 수(x.excluUseAr), 층: 글(x.floor), 이름: 글(x[이름칸]) });
      }
    }
    if (!거래.length) continue;
    거래.sort((a, c) => (c.날 > a.날) - (c.날 < a.날));
    /* 같은 넓이(±3㎡)가 있으면 그것으로 대표값 - 최근 거래 셋의 가운데 값 */
    const 비슷 = 넓이 ? 거래.filter(x => Math.abs(x.넓이 - 넓이) <= 3) : [];
    const 기준 = (비슷.length ? 비슷 : 거래).slice(0, 3).map(x => x.금액).sort((a, c) => a - c);
    return { kind: 종류, kindName: 종류이름[종류], name: 거래[0].이름, rows: 거래.slice(0, 20), 대표: 기준[Math.floor(기준.length / 2)], 같은넓이: 비슷.length > 0, 개월 };
  }
  return { rows: [], 개월, note: `최근 ${개월}개월 이 지번의 매매 실거래가 없습니다(아파트 · 연립 · 다세대 · 오피스텔만 찾습니다)` };
}
