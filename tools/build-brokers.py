# -*- coding: utf-8 -*-
"""전국 공인중개사무소 명부를 api/_brokers.js 로 굽는다.

받는 곳
  https://www.vworld.kr/dtmk/dtmk_ntads_s002.do?svcCde=NA&dsId=11
  '부동산중개업사무소정보' CSV (브이월드 로그인 필요 · 무료 · 일간 갱신)
  받으면 AL_D171_00_YYYYMMDD.zip 이 떨어진다.

쓰는 법
  python tools/build-brokers.py ~/Downloads/AL_D171_00_20260901.zip

등록번호가 지역 간에 겹치는 옛 번호(제307호 처럼 숫자만 남는 것)는 뺀다.
405곳쯤 빠지지만, 엉뚱한 사무소를 '확인됨' 으로 보여주는 것보다 낫다.
"""
import sys, io, os, csv, re, json, gzip, base64, zipfile, collections

MODERN = re.compile(r'^([1-5][0-9]{4})-((?:19|20)[0-9]{2})-([0-9]{1,6})$')
STATE  = {'영업중': 1, '휴업': 2, '휴업연장': 2, '업무정지': 3}


def key_of(v):
    v = (v or '').strip().replace(' ', '')
    m = MODERN.match(v)
    if m:
        return f'{m.group(1)}-{m.group(2)}-{int(m.group(3))}'
    return re.sub(r'[제호()\-]', '', v).upper()


def read_rows(path):
    if path.lower().endswith('.zip'):
        zf = zipfile.ZipFile(path)
        name = next(n for n in zf.namelist() if n.lower().endswith('.csv'))
        raw = zf.read(name)
    else:
        raw = open(path, 'rb').read()
    text = raw.decode('cp949', errors='replace')
    r = csv.reader(io.StringIO(text, newline=''))
    cols = next(r)
    return cols, r


def main(src, out='api/_brokers.js'):
    cols, r = read_rows(src)
    rows, std = [], ''
    for row in r:
        d = dict(zip(cols, row))
        k = key_of(d['등록번호'])
        if not k:
            continue
        std = d['데이터기준일자'] or std
        rows.append((k, [
            d['사업자상호'].strip(),
            d['중개업자명'].strip(),
            STATE.get(d['상태구분명'], 0),
            (d['도로명주소'] or d['지번주소']).strip(),
            (d['등록일자'] or '')[:7],
            d['등록번호'].strip(),
        ], d['법정동명']))

    cnt = collections.Counter(k for k, _, _ in rows)
    data = {k: v for k, v, _ in rows if cnt[k] == 1}
    dropped = len(rows) - len(data)
    by = collections.Counter(nm.split()[0] for k, _, nm in rows if cnt[k] == 1)

    packed = base64.b64encode(gzip.compress(
        json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode('utf-8'), 9)).decode()

    head = f'''/* 전국 공인중개사무소 명부 - 조회용 색인. tools/build-brokers.py 가 만든다.
 *
 * 출처: 국토교통부 부동산중개업정보 (브이월드 국가중점데이터)
 *   https://www.vworld.kr/dtmk/dtmk_ntads_s002.do?svcCde=NA&dsId=11
 * 데이터 기준일: {std} · 수록 {len(data):,}곳'''
    for nm in ('서울특별시', '경기도'):
        head += f' · {nm} {by.get(nm, 0):,}'
    head += f'''
 *
 * 서울은 오픈API 가 종료됐고 지자체별 API 는 제각각이라, 전국 파일을
 * 통째로 들고 있는 편이 낫다. gzip 후 base64 로 {len(packed)/1e6:.1f}MB - 함수 번들에
 * 확실히 실리고, 첫 조회 때 한 번만 펴서 메모리에 둔다.
 *
 * 등록번호가 지역 간에 겹치는 옛 번호(제307호 처럼 숫자만 남는 것)는 뺐다.
 * {dropped:,}곳이 빠지지만, 엉뚱한 사무소를 '확인됨' 으로 보여주는 것보다 낫다.
 *
 * 값의 순서: [상호, 중개업자명, 상태, 주소, 등록연월, 등록번호 원문]
 *   상태 1=영업중 2=휴업 3=업무정지
 */

import {{ gunzipSync }} from 'node:zlib';

export const STD_DATE = '{std}';
export const COUNT = {len(data)};
export const STATE_NM = {{ 1: '영업중', 2: '휴업', 3: '업무정지' }};

const PACKED =
'''
    tail = r'''
let MAP = null;
function map() {
  if (!MAP) MAP = JSON.parse(gunzipSync(Buffer.from(PACKED, 'base64')).toString('utf8'));
  return MAP;
}

const pack = (k, v) => ({ key: k, office: v[0], rep: v[1], state: v[2],
                          addr: v[3], since: v[4], reg_no: v[5] });

/** 등록번호 정규화 키로 한 곳을 찾는다. 없으면 null. */
export function findByKey(key) {
  const v = map()[key];
  return v ? pack(key, v) : null;
}

/* 전국이라 같은 상호가 흔하다. '성신부동산' 만 해도 여럿이다.
   하나로 좁혀지지 않으면 아무 것도 알려주지 않는다 -
   엉뚱한 사무소의 등록번호를 알려주면 그대로 잘못 적게 된다. */
export function findByName(nameKey) {
  if (!nameKey || nameKey.length < 2) return null;
  const m = map();
  let hit = null;
  for (const k in m) {
    if (norm(m[k][0]) !== nameKey) continue;
    if (hit) return null;
    hit = pack(k, m[k]);
  }
  return hit;
}

const norm = v => String(v ?? '').trim().replace(/\s+/g, '')
  .replace(/[()\-·.]/g, '').replace(/(공인)?중개사?(사무소|사무실|중개인)?$/, '').toUpperCase();
'''
    io.open(out, 'w', encoding='utf-8', newline='\n').write(head + "'" + packed + "';\n" + tail)
    print(f'{out}: {len(data):,}곳 수록 · {dropped:,}곳 제외 · 기준일 {std}')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(*sys.argv[1:])
