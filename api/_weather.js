/* 대시보드 머리의 날씨 (2026-10-30 대표님 '인사는 필요없고, 접속한 날짜 요일 시간 날씨가 나오게 해').
 *
 * 기상청 초단기예보 - 공공데이터포털 '기상청_단기예보 ((구)_동네예보) 조회서비스' 의 getUltraSrtFcst.
 * 사무소 주소의 시·군·구로 위경도를 잡아 기상청 격자(nx·ny)로 바꾸고, 지금 시각에 가장 가까운 예보 한 칸
 * (기온 · 하늘 · 비/눈)을 돌려준다. 위치 권한은 묻지 않는다 - 사무소 주소면 동네 날씨로 충분하다.
 *
 * 키는 KMA_KEY(없으면 DATA_GO_KEY). 키가 없거나, 그 키로 기상청 예보 활용신청을 안 했거나, 기상청이 늦으면
 * 날씨 없이(null) 돌려준다 - 화면은 날짜·시간만 보인다. 같은 격자·같은 발표 시각은 10분 동안 기억해 둔다.
 * api/ 안에서 _ 로 시작하므로 라우트가 되지 않는다(feed.js 가 부른다).
 */

/* 시·도 - 주소 첫 마디로 가른다. 위경도는 시·도청 근처(격자가 5km 라 이 정도면 된다) */
const 도표 = [
  ['서울', /^서울/, [37.5665, 126.9780]], ['경기', /^경기/, [37.2752, 127.0095]], ['인천', /^인천/, [37.4563, 126.7052]],
  ['부산', /^부산/, [35.1796, 129.0756]], ['대구', /^대구/, [35.8714, 128.6014]], ['광주', /^광주(광역시)?$/, [35.1595, 126.8526]],
  ['대전', /^대전/, [36.3504, 127.3845]], ['울산', /^울산/, [35.5384, 129.3114]], ['세종', /^세종/, [36.4800, 127.2890]],
  ['강원', /^강원/, [37.8813, 127.7298]], ['충북', /^(충북|충청북)/, [36.6424, 127.4890]], ['충남', /^(충남|충청남)/, [36.6588, 126.6728]],
  ['전북', /^(전북|전라북)/, [35.8242, 127.1480]], ['전남', /^(전남|전라남)/, [34.8161, 126.4630]],
  ['경북', /^(경북|경상북)/, [36.5760, 128.5056]], ['경남', /^(경남|경상남)/, [35.2383, 128.6925]], ['제주', /^제주/, [33.4996, 126.5312]],
];
/* 서비스 지역(서울·경기)은 구·시·군까지 - 구청·시청 근처 */
const 서울구 = {
  종로구: [37.5735, 126.9790], 중구: [37.5638, 126.9976], 용산구: [37.5326, 126.9905], 성동구: [37.5634, 127.0368], 광진구: [37.5385, 127.0823],
  동대문구: [37.5744, 127.0396], 중랑구: [37.6066, 127.0927], 성북구: [37.5894, 127.0167], 강북구: [37.6396, 127.0257], 도봉구: [37.6688, 127.0471],
  노원구: [37.6542, 127.0568], 은평구: [37.6027, 126.9291], 서대문구: [37.5791, 126.9368], 마포구: [37.5663, 126.9016], 양천구: [37.5170, 126.8665],
  강서구: [37.5509, 126.8495], 구로구: [37.4954, 126.8874], 금천구: [37.4569, 126.8955], 영등포구: [37.5264, 126.8962], 동작구: [37.5124, 126.9393],
  관악구: [37.4784, 126.9516], 서초구: [37.4837, 127.0324], 강남구: [37.5172, 127.0473], 송파구: [37.5145, 127.1059], 강동구: [37.5301, 127.1238],
};
const 경기시 = {
  수원시: [37.2636, 127.0286], 성남시: [37.4200, 127.1267], 의정부시: [37.7381, 127.0337], 안양시: [37.3943, 126.9568], 부천시: [37.5034, 126.7660],
  광명시: [37.4786, 126.8646], 평택시: [36.9921, 127.1129], 동두천시: [37.9036, 127.0606], 안산시: [37.3219, 126.8309], 고양시: [37.6584, 126.8320],
  과천시: [37.4292, 126.9876], 구리시: [37.5943, 127.1296], 남양주시: [37.6360, 127.2165], 오산시: [37.1498, 127.0772], 시흥시: [37.3800, 126.8029],
  군포시: [37.3616, 126.9352], 의왕시: [37.3448, 126.9683], 하남시: [37.5393, 127.2149], 용인시: [37.2411, 127.1776], 파주시: [37.7600, 126.7800],
  이천시: [37.2720, 127.4350], 안성시: [37.0080, 127.2798], 김포시: [37.6153, 126.7156], 화성시: [37.1995, 126.8313], 광주시: [37.4295, 127.2550],
  양주시: [37.7853, 127.0458], 포천시: [37.8949, 127.2003], 여주시: [37.2984, 127.6373], 연천군: [38.0966, 127.0749], 가평군: [37.8315, 127.5105],
  양평군: [37.4917, 127.4875],
};

/* 주소 → 날씨 볼 곳. 시·도를 먼저 보고(부산 강서구·광주광역시를 서울 강서구·경기 광주시로 잘못 잡지 않게),
   시·도가 없으면('하남시 미사대로 550') 서울 구 · 경기 시군 이름으로 찾는다. 모르면 서울 */
export function 날씨곳(addr) {
  const 마디 = String(addr || '').replace(/\s+/g, ' ').trim().slice(0, 200).split(' ').filter(Boolean);
  const 도 = 도표.find(([, re]) => re.test(마디[0] || ''));
  const 구 = 마디.find(m => Object.hasOwn(서울구, m)), 시 = 마디.find(m => Object.hasOwn(경기시, m));
  if (도 && 도[0] === '서울') return 구 ? { 이름: `서울 ${구}`, 위: 서울구[구] } : { 이름: '서울', 위: 도[2] };
  if (도 && 도[0] === '경기') return 시 ? { 이름: 시, 위: 경기시[시] } : { 이름: '경기', 위: 도[2] };
  if (도) return { 이름: 도[0], 위: 도[2] };
  if (시) return { 이름: 시, 위: 경기시[시] };
  if (구) return { 이름: `서울 ${구}`, 위: 서울구[구] };
  return { 이름: '서울', 위: 도표[0][2] };
}

/* 위경도 → 기상청 격자 (기상청 동네예보 격자 변환 - 람베르트 정각원추도법, 5km 격자) */
export function 격자(lat, lon) {
  const RE = 6371.00877 / 5.0, D = Math.PI / 180;
  const s1 = 30 * D, s2 = 60 * D, olon = 126 * D, olat = 38 * D;
  let sn = Math.tan(Math.PI * 0.25 + s2 * 0.5) / Math.tan(Math.PI * 0.25 + s1 * 0.5);
  sn = Math.log(Math.cos(s1) / Math.cos(s2)) / Math.log(sn);
  const sf = Math.pow(Math.tan(Math.PI * 0.25 + s1 * 0.5), sn) * Math.cos(s1) / sn;
  const ro = RE * sf / Math.pow(Math.tan(Math.PI * 0.25 + olat * 0.5), sn);
  const ra = RE * sf / Math.pow(Math.tan(Math.PI * 0.25 + lat * D * 0.5), sn);
  let th = lon * D - olon;
  if (th > Math.PI) th -= 2 * Math.PI;
  if (th < -Math.PI) th += 2 * Math.PI;
  th *= sn;
  return { nx: Math.floor(ra * Math.sin(th) + 43 + 0.5), ny: Math.floor(ro - ra * Math.cos(th) + 136 + 0.5) };
}

const 하늘 = { 1: '맑음', 3: '구름많음', 4: '흐림' };
const 비눈 = { 1: '비', 2: '비/눈', 3: '눈', 5: '빗방울', 6: '빗방울눈날림', 7: '눈날림' };
/* 예보 칸들 → 지금에 가장 가까운 시각 한 칸. 기온이 없으면 null */
export function 예보한칸(items, now = new Date()) {
  const 칸 = new Map();
  for (const x of Array.isArray(items) ? items : []) {
    if (!x || !x.fcstDate || !x.fcstTime) continue;
    const k = x.fcstDate + x.fcstTime;
    if (!칸.has(k)) 칸.set(k, {});
    칸.get(k)[x.category] = x.fcstValue;
  }
  const 지금 = now.getTime();
  const 때 = k => Date.UTC(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8), +k.slice(8, 10) - 9, +k.slice(10, 12));
  const 고른 = [...칸.keys()].sort((a, b) => Math.abs(때(a) - 지금) - Math.abs(때(b) - 지금))[0];
  const v = 고른 && 칸.get(고른);
  if (!v || v.T1H == null || !isFinite(+v.T1H)) return null;
  const pty = +v.PTY || 0, sky = +v.SKY || 0, 시 = +고른.slice(8, 10), 밤 = 시 < 6 || 시 >= 19;
  return {
    t: Math.round(+v.T1H), sky: 비눈[pty] || 하늘[sky] || '',
    icon: [3, 7].includes(pty) ? 'snow' : pty ? 'rain' : sky === 1 ? (밤 ? 'moon' : 'sun') : sky === 3 ? 'cloud' : 'overcast',
    at: `${고른.slice(8, 10)}:${고른.slice(10, 12)}`,
  };
}

const API = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtFcst';
const 기억 = new Map();
/* 돌려주는 값: { place, weather: { t, sky, icon, at } | null } */
export async function 날씨(addr, now = new Date()) {
  const p = 날씨곳(addr), 키 = process.env.KMA_KEY || process.env.DATA_GO_KEY;
  if (!키) return { place: p.이름, weather: null };
  const { nx, ny } = 격자(p.위[0], p.위[1]);
  /* 초단기예보는 매시 30분에 나와 45분부터 받는다 - 한국 시각에서 45분 뺀 때의 HH30 이 가장 새 발표 */
  const 발표 = new Date(now.getTime() + 9 * 3600e3 - 45 * 60e3);
  const base_date = 발표.toISOString().slice(0, 10).replace(/-/g, ''), base_time = String(발표.getUTCHours()).padStart(2, '0') + '30';
  const 열쇠 = `${nx},${ny},${base_date}${base_time}`, 있던 = 기억.get(열쇠);
  if (있던 && now.getTime() - 있던.at < 10 * 60e3) return { place: p.이름, weather: 있던.w };
  /* 포털이 주는 키는 인코딩된 것(%2B…)과 안 된 것 둘이다 - 인코딩된 것은 풀어서 한 번만 인코딩한다 */
  const q = new URLSearchParams({ serviceKey: /%[0-9A-F]{2}/i.test(키) ? decodeURIComponent(키) : 키, pageNo: '1', numOfRows: '60',
    dataType: 'JSON', base_date, base_time, nx: String(nx), ny: String(ny) });
  let w = null;
  try {
    const r = await fetch(`${API}?${q}`, { signal: AbortSignal.timeout(4000) });
    /* 키가 틀리거나 활용신청 전이면 dataType 과 상관없이 XML 오류가 온다 - JSON 이 아니면 날씨 없음 */
    const j = r.ok ? await r.json().catch(() => null) : null;
    const h = j && j.response && j.response.header;
    w = h && h.resultCode === '00' ? 예보한칸((((j.response.body || {}).items) || {}).item, now) : null;
  } catch { w = null; }
  기억.set(열쇠, { at: now.getTime(), w });
  if (기억.size > 300) 기억.clear();
  return { place: p.이름, weather: w };
}
