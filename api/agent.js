/* 중개사·소유자·시행사 가입 신청 접수 — 브라우저 대신 여기서 저장한다.
 *
 * bk_demand 와 같은 원칙이다: 키는 서버에만 있고, 표에는 RLS 정책이 없어
 * 브라우저가 직접 넣지 못한다. 방어 순서도 같다 - 검증을 먼저, 속도 제한은 그 뒤.
 * 오타 세 번에 60초 잠기면 그건 방어가 아니라 방해다.
 *
 * 필요한 환경변수
 *   BK_URL         https://xxxx.supabase.co
 *   BK_SECRET_KEY  secret / service_role 키
 */

import crypto from 'node:crypto';
import { notify, mask } from './_notify.js';
import { checkShape, lookupReg, regOpens } from './agent-verify.js';
import { userFrom } from './_auth.js';
import { readIdv } from './_idv.js';

const TABLE = 'bk_agent';

/* 같은 인스턴스가 살아 있는 동안의 연타 방지 */
const burst = new Map();
const BURST_WINDOW = 60_000, BURST_MAX = 3;

const ipHash = (ip, salt) =>
  crypto.createHash('sha256').update(String(ip) + '|' + salt).digest('hex').slice(0, 32);

function clientIp(req) {
  const f = req.headers['x-forwarded-for'];
  if (typeof f === 'string' && f) return f.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

const str = (v, max = 200) => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
};

/* developer 는 화면에서 뺐지만 여기서는 계속 받는다.
   기존 신청이 남아 있고, 옛 화면을 열어둔 창에서 넘어올 수 있다. */
const ROLES = ['agent', 'owner', 'developer'];
const ROLE_KO = { agent: '공인중개사', owner: '소유자', developer: '시행사' };

/* 소유자는 개인만이 아니다.
   법인이 가진 건물, 신탁등기가 되어 등기부상 소유자가 신탁사인 건물 -
   신탁 건은 형식상 소유자(신탁사)가 아니라 위탁자(시행사)가 물건을 움직인다.
   형식상 소유자만 받으면 정작 올려야 할 사람이 못 올린다. */
const OWNER_TYPES = ['individual', 'corp', 'trustor'];
const OWNER_KO = { individual: '개인', corp: '법인', trustor: '신탁 위탁자' };

/* 숫자만 남긴다. 사람은 하이픈을 넣기도 빼기도 한다. */
const digits = x => String(x ?? '').replace(/[^0-9]/g, '');

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 만 받습니다' });

  const { BK_URL, BK_SECRET_KEY } = process.env;
  if (!BK_URL || !BK_SECRET_KEY) {
    return res.status(503).json({
      error: '서버에 환경변수가 설정되지 않았습니다',
      need: ['BK_URL', 'BK_SECRET_KEY'].filter(k => !process.env[k]),
    });
  }

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};

  /* 사람은 비워두는 칸. 채워져 있으면 사람이 아니다. */
  if (str(b.website)) return res.status(200).json({ ok: true });
  /* 사람은 이 화면들을 3초 안에 통과하지 못한다 */
  if (Number(b.elapsed) < 3000) return res.status(429).json({ error: '너무 빠릅니다. 잠시 후 다시 시도해 주세요' });

  /* 이미 가입한 분이 나중에 자격을 채우러 온다. 새 주소를 낼 자리가 없어
     같은 함수에 갈래로 둔다(함수 상한 12개). */
  if (b.what === 'verify') return verify(req, res, b);

  const role  = ROLES.includes(b.role) ? b.role : null;
  const ownerType = role === 'owner'
    ? (OWNER_TYPES.includes(b.owner_type) ? b.owner_type : 'individual') : null;
  /* 실계약 채널이 붙어 있으면 손으로 적은 이름·연락처를 쓰지 않는다.
     화면에서 무엇을 적었든 서명된 표에 적힌 값만 저장한다 - demand.js 와 같다.
     테스트 MID 일 때는 예전처럼 받는다. 테스트 값으로 공급자를 만들면 안 된다. */
  const idvLive = process.env.PORTONE_LIVE === '1';
  const idv = idvLive ? readIdv(b.idv_token) : null;
  if (idvLive && !idv) {
    return res.status(401).json({ error: '본인확인을 먼저 받아주세요', need_idv: true });
  }
  const name  = idv ? str(idv.name, 40) : str(b.name, 40);
  const phone = idv ? idv.phone : String(b.phone ?? '').replace(/-/g, '');

  const bad =
    !role                                        ? '역할이 없습니다' :
    !name || name.length < 2                     ? '성함을 확인해 주세요' :
    !/^01[016789][0-9]{7,8}$/.test(phone)        ? '연락처 형식이 맞지 않습니다' :
    /* 개설등록번호는 가입 자리에서 묻지 않는다(2026-09-21).
       가입은 역할과 연락처까지다 - 자격은 '손님 조건을 열어보려 할 때' 나
       '매물을 올리려 할 때' 따로 받는다(what:'verify').
       적어 보내셨다면 형식만은 여기서 본다. */
    role === 'agent' && str(b.reg_no) && !checkShape(b.reg_no).ok ? checkShape(b.reg_no).reason :
    /* 법인·위탁자라면 어느 법인인지는 있어야 한다. 사람이 확인할 실마리가
       하나도 없으면 승인할 수가 없다 - 그러면 받아둔 의미가 없다. */
    role === 'owner' && ownerType === 'corp' && !str(b.corp_name)
      ? '법인명을 적어주세요' :
    role === 'owner' && ownerType === 'corp' && digits(b.corp_no).length !== 13 && digits(b.biz_no).length !== 10
      ? '법인등록번호(13자리) 또는 사업자등록번호(10자리) 중 하나를 적어주세요' :
    role === 'owner' && ownerType === 'trustor' && !str(b.corp_name)
      ? '위탁자(시행사) 이름을 적어주세요' :
    role === 'owner' && ownerType === 'trustor' && !str(b.trust_co)
      ? '어느 신탁사에 맡기셨는지 적어주세요' :
    null;
  if (bad) return res.status(400).json({ error: bad });

  /* 검증을 통과한 요청만 센다 */
  const ip = clientIp(req);
  const now = Date.now();
  const hits = (burst.get(ip) || []).filter(t => now - t < BURST_WINDOW);
  if (hits.length >= BURST_MAX) {
    return res.status(429).json({ error: '잠시 후 다시 시도해 주세요' });
  }
  hits.push(now); burst.set(ip, hits);

  /* 계정과 이어둬야 나중에 '내가 승인된 파트너인가' 를 물을 수 있다.
     계정 없이 받아주면 user_id 가 null 로 남는다 - 그분은 나중에 로그인해도
     자기 신청과 이어지지 않고, bk_agent_user_idx 가 계정당 하나라 다시 신청할
     수도 없다. 승인은 됐는데 아무것도 못 쓰는 자리가 만들어진다.
     화면도 로그인을 먼저 받지만, 화면만 막으면 막은 것이 아니다. */
  const owner = await userFrom(req);
  if (!owner) {
    return res.status(401).json({ error: '먼저 로그인해 주세요', need_login: true });
  }

  /* 사람이 하나씩 열어주던 것은 2026-09-14 에 없앴다 - 기다리는 동안 파트너는
     아무것도 못 하고, 그 사이 들어온 손님 조건은 아무에게도 안 간다.
     다만 '확인 없이 연다' 는 뜻은 아니다(2026-09-21 에 고쳤다).
     되돌리려면 환경변수 BK_AUTO_APPROVE 를 '0' 으로 둔다. */
  /* 자격이 확인된 신청만 바로 연다.
     공인중개사는 등록번호가 공공데이터와 맞아떨어져야 하고, 소유자·시행사는
     확인할 실마리(법인명·신탁사 등)가 이미 위에서 걸러졌다.
     확인 전이면 'new' 로 두고 요약만 보여준다 - 손님 조건 전문은 자격이
     확인된 뒤에 열린다. */
  /* ⚠ 전에는 `b.reg_verified === true` 를 그대로 믿었다 - 화면이 보내온 값이다.
     화면을 거치지 않고 그 한 줄만 넣으면 **승인된 파트너**가 됐다.
     이제 서버가 공공데이터를 직접 본다. 화면이 뭐라고 보내든 상관없다.
     번호를 안 적었으면 열지 않는다 - 자격은 나중에 what:'verify' 로 받는다. */
  const look = role === 'agent' && str(b.reg_no)
    ? await lookupReg(b.reg_no, b.sigun) : null;
  const verified = role === 'agent' ? regOpens(look) : true;
  const autoApprove = process.env.BK_AUTO_APPROVE !== '0' && verified;

  const row = {
    role, name, phone,
    status: autoApprove ? 'approved' : 'new',
    user_id: owner.id,
    email:    str(b.email, 120),
    /* 상호·주소는 명부에 적힌 것을 먼저 쓴다 - 번호만 맞고 이름은 다른
       사무소로 남으면, 운영 화면에서 그 줄을 믿을 수 없게 된다. */
    office:   str((look && look.hit && look.hit.office) || b.office, 80),
    reg_no:   str((look && look.regNo) || b.reg_no, 40),
    /* ⚠ **서버가 본 결과**를 적는다. 화면이 보내온 값을 그대로 담으면,
       운영 화면에 '(공공데이터 확인됨)' 이라고 찍히는 줄을 신청자가 스스로
       만들 수 있다 - 확인했다는 표시는 확인한 쪽만 붙일 수 있어야 한다. */
    reg_verified: verified && role === 'agent',
    addr:     str((look && look.hit && look.hit.addr) || b.addr, 200),
    relation: str(b.relation, 40),
    biz_no:   str(b.biz_no, 20),
    dev_type: str(b.dev_type, 40),
    owner_type: ownerType,
    corp_name:  str(b.corp_name, 80),
    corp_no:    digits(b.corp_no).slice(0, 13) || null,
    trust_co:   str(b.trust_co, 80),
    done:     str(b.done, 20),
    memo:     str(b.memo, 500),
    ip_hash:  ipHash(ip, BK_SECRET_KEY),
    ua:       str(req.headers['user-agent'], 200),
  };

  const post = body => fetch(`${BK_URL}/rest/v1/${TABLE}`, {
    method: 'POST',
    headers: {
      apikey: BK_SECRET_KEY,
      Authorization: 'Bearer ' + BK_SECRET_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  });

  try {
    let r = await post(row);

    /* 표를 아직 안 만들었거나 컬럼이 없으면 알아볼 수 있게 답한다 */
    if (!r.ok) {
      const t = await r.text();
      if (/relation .* does not exist|PGRST205/i.test(t)) {
        return res.status(503).json({ error: '신청 표가 아직 준비되지 않았습니다 (bk_agent)' });
      }
      /* 이미 신청한 경우는 실패가 아니다.
         다만 어느 쪽에 걸렸는지는 알려야 한다 - 계정당 한 번(bk_agent_user_idx)인데
         "같은 번호로 접수됐다"고만 하면 번호를 바꿔가며 다시 시도하게 된다. */
      if (/duplicate key|23505/i.test(t)) {
        const why = /bk_agent_user_idx/.test(t) ? 'account' : 'phone';
        return res.status(200).json({ ok: true, already: true, why });
      }
      /* 컬럼이 없더라도 신청 자체는 살린다.
         0016 은 칸을 넷 늘렸다 - 하나만 빼고 다시 넣으면 다음 칸에서 또 걸린다.
         걸릴 때마다 그 칸을 빼고, 뺀 값은 메모에 적어 사람이 보게 남긴다. */
      let body = row, note = [], miss = t, dropped = 0;
      while (dropped < 8) {
        const m = miss.match(/'([a-z_]+)' column/i);
        if (!m || body[m[1]] === undefined) break;
        const k = m[1];
        if (body[k]) note.push(`${k}=${body[k]}`);
        const { [k]: _drop, ...rest } = body;
        body = rest; dropped++;
        if (note.length) {
          body = { ...body, memo: [row.memo, '[표에 없는 칸] ' + note.join(' · ')]
            .filter(Boolean).join(' / ').slice(0, 500) };
        }
        r = await post(body);
        if (r.ok) return res.status(200).json({ ok: true });
        miss = await r.text();
      }
      return res.status(500).json({ error: '저장에 실패했습니다' });
    }
    const sent = await notify(req, {
      subject: `새 파트너 ${autoApprove ? '가입' : '신청'} · ${ROLE_KO[row.role] || row.role}`,
      rows: [
        ['처리', autoApprove
          ? '자동 승인됨 · 등록번호 공공데이터 확인됨'
          : (row.role === 'agent'
              ? '자격 확인 전 · 목록 요약만 보입니다 (등록번호를 확인하면 열립니다)'
              : '승인 대기')],
        ['역할', ROLE_KO[row.role] || row.role],
        ['성함', row.name || '-'],
        ['연락처', mask(row.phone)],
        ['사무소 · 물건', row.office || row.addr || '-'],
        ['등록번호 · 사업자', (row.reg_no || row.biz_no || '-') + (row.reg_no ? (row.reg_verified ? ' (공공데이터 확인됨)' : ' (형식만 확인)') : '')],
        ...(row.owner_type ? [['소유 형태', OWNER_KO[row.owner_type] || row.owner_type]] : []),
        ...(row.corp_name ? [['법인 · 위탁자', row.corp_name + (row.corp_no ? ` (${row.corp_no})` : '')]] : []),
        ...(row.trust_co ? [['신탁사', row.trust_co + ' - 등기부 또는 신탁원부로 위탁자 확인 필요']] : []),
        ['이메일', row.email || '-'],
      ],
      link: '/#/ops/live',
    });
    return res.status(200).json({ ok: true, approved: autoApprove,
      notified: sent && sent.ok ? 'ok' : (sent && sent.skipped) || 'unknown' });
  } catch (e) {
    return res.status(500).json({ error: '저장 중 문제가 생겼습니다' });
  }
}

/* ── 자격 확인 ──
   가입은 역할·연락처까지만 받는다. 손님 조건을 열어보려 하거나 매물을 올리려 할 때
   이 자리로 온다. 통과하면 status 를 approved 로 올린다.

   ⚠ 계정으로만 찾는다. 화면이 보내오는 id 는 믿지 않는다 -
   남의 신청을 승격시키는 길이 열린다. */
export async function verify(req, res, b) {
  const { BK_URL, BK_SECRET_KEY } = process.env;
  const user = await userFrom(req);
  if (!user) return res.status(401).json({ error: '먼저 로그인해 주세요', need_login: true });

  const q = new URLSearchParams({ select: '*', user_id: 'eq.' + user.id, limit: '1' });
  const r0 = await fetch(`${BK_URL}/rest/v1/${TABLE}?${q}`, {
    headers: { apikey: BK_SECRET_KEY, Authorization: 'Bearer ' + BK_SECRET_KEY } });
  if (!r0.ok) return res.status(502).json({ error: '신청을 확인하지 못했습니다' });
  const me = (await r0.json())[0];
  if (!me) return res.status(404).json({ error: '먼저 파트너 가입을 해주세요', need_join: true });
  if (me.status === 'approved') return res.status(200).json({ ok: true, already: true });

  const patch = {};
  if (me.role === 'agent') {
    /* 공공데이터와 맞아떨어져야 연다. 형식만 맞는 번호로는 열지 않는다 -
       손님 조건 전문이 걸린 문이다.
       ⚠ 그 대조를 **서버가 직접 한다.** 전에는 화면이 보내온 reg_verified 를
       믿었는데, 그러면 이 한 줄을 그냥 넣는 쪽에 문을 열어 주는 것이다. */
    const look = await lookupReg(b.reg_no, b.sigun);
    if (!look.ok) return res.status(400).json({ error: look.reason });
    if (!regOpens(look)) {
      return res.status(400).json({
        error: look.hit
          ? `등록은 확인했지만 현재 상태가 '${look.state}' 입니다 - 담당자가 확인한 뒤 연락드립니다`
          : '등록번호를 확인하지 못했습니다 - 사무소 상호와 번호를 다시 봐주세요',
      });
    }
    patch.reg_no = str(look.regNo || b.reg_no, 40);
    patch.reg_verified = true;
    /* 상호·주소는 **명부에 적힌 것**을 먼저 쓴다. 적어 보낸 것을 그대로 담으면
       번호만 맞고 이름은 다른 사무소로 남을 수 있다. */
    if (look.hit && look.hit.office) patch.office = str(look.hit.office, 80);
    else if (str(b.office))          patch.office = str(b.office, 80);
    if (look.hit && look.hit.addr)   patch.addr   = str(look.hit.addr, 200);
    else if (str(b.addr))            patch.addr   = str(b.addr, 200);
  }
  patch.status = process.env.BK_AUTO_APPROVE === '0' ? 'new' : 'approved';

  const r = await fetch(`${BK_URL}/rest/v1/${TABLE}?id=eq.${me.id}`, {
    method: 'PATCH',
    headers: { apikey: BK_SECRET_KEY, Authorization: 'Bearer ' + BK_SECRET_KEY,
               'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    console.error('[agent:verify]', r.status, t.slice(0, 160));
    return res.status(502).json({ error: '자격을 저장하지 못했습니다' });
  }
  return res.status(200).json({ ok: true, status: patch.status });
}
