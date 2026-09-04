const __mods = {}; const __req = (id) => { const m = __mods[id]; if (!m) throw new Error("모듈을 찾을 수 없습니다: " + id); return m; };
__mods["core/rng.js"] = (function(){
// @ts-check
/**
 * 시드 고정 난수. 밸런스 실행을 재현 가능하게 만드는 핵심.
 * 같은 시드 → 같은 웨이브 구성, 같은 드래프트, 같은 무효화 대상.
 */
class Rng {
  /** @param {number} seed */
  constructor(seed) {
    this.seed = seed >>> 0;
    this._s = this.seed || 1;
  }
  /** 0 이상 1 미만 */
  next() {
    // mulberry32
    this._s = (this._s + 0x6d2b79f5) >>> 0;
    let t = this._s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** @param {number} n @returns {number} 0 이상 n 미만 정수 */
  int(n) { return Math.floor(this.next() * n) % Math.max(1, n); }
  /** @template T @param {T[]} arr @returns {T} */
  pick(arr) { return arr[this.int(arr.length)]; }
  /** @template T @param {T[]} arr @returns {T[]} 원본을 바꾸지 않는 셔플 */
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

return { Rng };
})();
__mods["core/data.js"] = (function(){
// @ts-check
/**
 * 순수 데이터. 로직도 DOM도 없다.
 * 밸런스 조정은 원칙적으로 이 파일 하나만 건드린다.
 */

/**
 * 심사관(고양이) 정의 — 이전 게임(특허 디펜스)의 8종 타워 규칙을 그대로 옮겼다.
 * 유물 합성은 없다. 심사관 자체가 곧 화력이자 벽이다.
 *
 * row/arow  스프라이트 시트의 대기/공격 행 (0,1=생산냥 바디 · 2,3=전투냥 바디)
 * filter    같은 스프라이트를 재활용하기 위한 CSS 캔버스 필터 (색만 다르게)
 * pierce    방어무시 % (0~100)
 * targets   동시에 조준하는 적의 수
 * critC/critM  치명타 확률 / 배율
 * slow      명중 시 적용하는 둔화 % (0~100)
 * kind      "atk" 공격형 · "buff" 비공격 보좌형 (인접 심사관 강화)
 * auraDmg/auraRate  buff 타입이 실제로 이어진 터(보통 좌우, 모서리에선 꺾이는 방향)에 맞닿은 심사관에게 곱하는 배율
 * @type {Record<string, {name:string,row:number,arow:number,dmg:number,rate:number,range:number,
 *   tag:string,desc:string,cost:number,kind:string,pierce?:number,targets?:number,
 *   critC?:number,critM?:number,slow?:number,auraDmg?:number,auraRate?:number,filter?:string}>}
 */
const CATS = {
  spec: {
    name: "출원냥", row: 2, arow: 3, kind: "atk",
    dmg: 12, rate: 2.0, range: 118, tag: "기본", cost: 55,
    desc: "기본 공격, 무난하게 잘 싸운다.",
    filter: "none",
    icon: "📄",
  },
  claim: {
    name: "특허범위냥", row: 2, arow: 3, kind: "atk",
    dmg: 8, rate: 0.85, range: 304, pierce: 35, tag: "장사거리", cost: 85,
    desc: "사거리가 길고 방어를 일부 무시한다.",
    filter: "hue-rotate(195deg) saturate(1.25)",
    icon: "📐",
  },
  search: {
    // 출원냥(dmg 12 / rate 2.0)을 기준으로 공격력 ×2, 공속 ÷2 — 초당 피해는 같고 한 방이 두 배다.
    // 방어력은 명중할 때마다 한 번씩 깎이므로, 같은 DPS라도 단단한 적에게는 이쪽이 훨씬 세게 들어간다.
    name: "선행조사냥", row: 2, arow: 3, kind: "atk",
    dmg: 24, rate: 1.0, range: 118, tag: "한방", cost: 130,
    desc: "출원냥의 두 배로 세게, 절반의 속도로 때린다. 방어가 두꺼운 적에게 강하다.",
    filter: "hue-rotate(255deg) saturate(1.35)",
    icon: "🔍",
  },
  pct: {
    name: "국제출원냥", row: 2, arow: 3, kind: "atk",
    dmg: 7, rate: 1.6, range: 118, targets: 3, tag: "다중조준", cost: 190,
    desc: "한 번에 여러 마리를 동시에 공격한다.",
    filter: "hue-rotate(40deg) saturate(1.45)",
    icon: "🌐",
  },
  fast: {
    name: "우선심사냥", row: 2, arow: 3, kind: "atk",
    dmg: 4, rate: 5.0, range: 118, tag: "연사", cost: 65,
    desc: "쉬지 않고 빠르게 연타한다.",
    filter: "hue-rotate(315deg) saturate(1.3)",
    icon: "⚡",
  },
  agent: {
    name: "변리사냥", row: 0, arow: 1, kind: "buff",
    dmg: 0, rate: 0, range: 0, auraDmg: 1.25, auraRate: 1.15, tag: "보좌", cost: 145,
    desc: "비공격. 실제로 이어진 심사관 터(보통 좌우, 모서리에서는 꺾이는 방향)의 화력과 공속을 끌어올린다.",
    filter: "hue-rotate(15deg) saturate(1.5)",
    icon: "💼",
  },
};

/**
 * 웨이브 클리어 시 고르는 패시브 효과 7종.
 * side "self" = 내 스탯을 올린다 · side "foe" = 상대에게 적용된다 (네트워크로 상대에게 전달됨).
 * stat이 "hp"인 것은 %가 아니라 즉시 한 번 적용되는 고정 피해다 — 나머지 6개(dmg/rate/range)는
 * 지속적으로 누적되는 % 보정이라 이 하나만 성격이 다르다는 걸 UI에서 구분해서 보여준다.
 * @type {{key:string,name:string,side:"self"|"foe",stat:"dmg"|"rate"|"range"|"hp",amount:number,desc:string}[]}
 */
const PASSIVES = [
  { key: "amend",      name: "보정",             side: "self", stat: "dmg",  amount: 0.10,  desc: "내 공격력 +10%",
    detail: "명세서를 다듬어 권리를 또렷하게 만든다. 모든 냥타워의 공격력이 10% 올라가며, 고를 때마다 누적된다." },
  { key: "efile",      name: "전자출원",         side: "self", stat: "rate", amount: 0.10,  desc: "내 공속 +10%",
    detail: "서류를 전자로 넘겨 심사 회전을 빠르게 한다. 모든 냥타워의 공격 속도가 10% 올라가며, 고를 때마다 누적된다." },
  { key: "appeal",     name: "거절결정불복심판", side: "self", stat: "hp",   amount: 10,    desc: "내 등록원부 내구 +10 (즉시)",
    detail: "거절결정에 불복해 다시 판단을 구한다. 무너진 등록원부 내구를 그 자리에서 10 되살린다 (최대치를 넘지는 않는다). 누적 보정이 아니라 한 번 쓰고 끝나는 회복이다." },
  { key: "info",       name: "정보제공",         side: "foe",  stat: "dmg",  amount: -0.10, desc: "상대 공격력 -10%",
    detail: "상대 출원의 흠을 심사관에게 제보한다. 상대의 모든 냥타워 공격력이 10% 깎인다." },
  { key: "oa",         name: "의견제출통지",     side: "foe",  stat: "rate", amount: -0.10, desc: "상대 공속 -10%",
    detail: "상대에게 의견을 내라고 통지해 발목을 잡는다. 상대의 모든 냥타워 공격 속도가 10% 깎인다." },
  { key: "invalidate", name: "무효심판",         side: "foe",  stat: "hp",   amount: -10,   desc: "상대 등록원부 내구 -10 (즉시)",
    detail: "이미 난 등록을 무효로 돌린다. 상대 등록원부 내구를 즉시 10 깎는다 — 상대를 곧장 끝낼 수도 있는 유일한 효과다." },
];
const PASSIVE_BY_KEY = Object.fromEntries(PASSIVES.map((p) => [p.key, p]));

/**
 * 침입자. voids = 돌파 시 무효화하는 냥타워 수 · fee = 돌파 시 빼앗기는 특허료.
 * @type {Record<string,{nm:string,hp:number,spd:number,def:number,r:number,col:string,rw:number,
 *   leak:number,voids?:number,fee?:number,desc:string,icon:string}>}
 */
const ENEMIES = {
  copy: { nm:"도용업자",       hp:42,  spd:136, def:1, r:18, col:"#8fa6bd", rw:3,  leak:1, icon:"🥷",
    desc:"허락 없이 슬쩍 가져다 쓴다. 수가 많다." },
  fast: { nm:"벤치마킹업체",   hp:32,  spd:232, def:1, r:16, col:"#c9b26a", rw:3,  leak:1, icon:"📊",
    desc:"분석이라 부르지만 사실상 베끼기. 빠르게 스치고 지나간다." },
  tank: { nm:"무효심판 청구인", hp:190, spd:96,  def:8, r:24, col:"#7d5a8f", rw:9,  leak:3, voids:1, icon:"⚖️",
    desc:"내 권리를 통째로 없애려 든다. 돌파 시 냥타워 1개를 무작위로 무효화한다." },
  boss: { nm:"특허괴물",       hp:1150, spd:80, def:13, r:34, col:"#c4322a", rw:70, leak:8, fee:100, icon:"👹",
    desc:"제품은 만들지 않고 특허만 사서 소송으로 돈을 받아낸다. 돌파 시 합의금 명목으로 특허료 100을 가져간다 — 잔고가 모자라면 빚으로 남는다." },
};

/** @type {Record<string,number>[]} */
const WAVES = [
  // 공속을 2.2배로 올린 만큼, 웨이브당 스폰 수도 약 1.9배로 늘려서 균형을 맞췄었는데,
  // 공속을 다시 2배로 더 올리면서 스폰 수도 그만큼 2배로 늘렸다 — 화력도 물량도 같이 시원해지도록.
  {copy:26}, {copy:34,fast:12}, {copy:38,fast:20}, {copy:30,fast:22,tank:8},
  {copy:42,fast:26,tank:12}, {fast:46,tank:16}, {copy:50,fast:34,tank:20},
  {copy:42,fast:38,tank:22}, {fast:54,tank:26}, {copy:50,fast:46,tank:30},
  {copy:46,fast:46,tank:38}, {boss:2,tank:22,fast:38},
];

/**
 * 웨이브 진행 중에 특허료를 내고 즉시 쓰는 액티브 스킬.
 * 패시브(PASSIVES)가 웨이브 사이에 고르는 누적 보정이라면, 이쪽은 전투 중 한 번에 터뜨리는 카드다.
 *
 * cost    특허료 (스킬은 종류별 가격 상승이 없다 — 항상 정액)
 * cd      재사용 대기(초). 웨이브가 끝나면 초기화된다 — 웨이브 안에서의 타이밍 싸움이 되도록.
 * target  "global" 즉시 전체 적용 · "point" 판 위 한 지점을 찍어 그 반경에 적용
 * kind    "freeze" 이동정지 · "purge" 범위 제거
 * dur     freeze 지속(초) · radius purge 반경(px, 1칸 = 84px)
 * bossHp  purge 시 보스에게 주는 피해 (최대 체력 비율) — 보스는 즉사시키지 않는다
 * @type {Record<string,{key:string,name:string,short:string,icon:string,cost:number,cd:number,
 *   target:"global"|"point",kind:"freeze"|"purge",tag:string,desc:string,
 *   dur?:number,radius?:number,bossHp?:number}>}
 */
const SKILLS = {
  injunction: {
    key: "injunction", name: "침해금지가처분", short: "가처분", icon: "🧊",
    cost: 100, cd: 14, target: "global", kind: "freeze", dur: 3.2, tag: "이동정지",
    desc: "본안 판결 전에 침해를 잠정적으로 멈춰 세우는 처분. 판 위 모든 침입자를 3.2초 동안 그 자리에 묶는다. 묶인 동안에도 피해는 그대로 들어간다.",
  },
  scrap: {
    key: "scrap", name: "침해품 폐기명령", short: "폐기명령", icon: "💥",
    cost: 100, cd: 20, target: "point", kind: "purge", radius: 148, bossHp: 0.5, tag: "범위제거",
    desc: "침해를 조성한 물건을 폐기하도록 명하는 처분. 찍은 지점 반경 약 1.7칸 안의 침입자를 즉시 제거한다. 국제소송단(보스)만은 즉사하지 않고 최대 체력 50% 피해를 입는다.",
  },
};

/** 밸런스 상수. 시뮬레이터가 이 객체를 통째로 덮어써서 스윕할 수 있다. */
const BAL = {
  cellSize: 80, cellGap: 4,
  startGold: 130, startHp: 80,         // 난이도 상향 — 시작 자금·체력을 줄여 초반부터 신중하게
  hpPerWave: 0.26,          // 웨이브당 적 체력 배율 증가 (상향 — 후반 웨이브가 확실히 버겁다)
  incomeBase: 10, incomePerWave: 3,    // 수입도 줄여서 후반 화력 스노우볼을 억제
  catCostMul: 1.0,           // 같은 종류를 더 배치해도 가격은 그대로 — 임용 비용은 항상 정가다
  pierceCap: 70, slowCap: 70,
  voidWaves: 3,              // 무효화 지속 웨이브 (상향 — 돌파당 손실이 더 오래 간다)
  spawnGap: 0.52, spawnGapBoss: 2.0,   // 더 촘촘하게 몰아친다
  waveCount: 12,
};

return { BAL, CATS, ENEMIES, PASSIVES, PASSIVE_BY_KEY, SKILLS, WAVES };
})();
__mods["core/maps.js"] = (function(){
// @ts-check
/**
 * 맵 정의.
 *
 * 레이아웃은 ASCII 로 적는다. 눈으로 보고 고칠 수 있는 것이 중요하다.
 *   #  고정 구조물 (벽. 놓을 수도 지울 수도 없다)
 *   .  통로 — 침입자만 지나간다. 심사관은 놓을 수 없다
 *   T  심사관 터 — 심사관만 놓을 수 있다. 침입자는 밟지 못한다
 *   G  진입구 (침입자 출발점)
 *   X  등록원부 (목표점)
 *
 * T 가 하나도 없는 맵은 옛 규칙을 따른다 — 동선이 아닌 빈 칸 어디든 놓을 수 있다.
 *
 * annex 는 특허료를 내고 개방하는 구역. 단계별로 # 를 . 로 바꾼다.
 * 고정 맵은 판이 커지지 않으므로, 증축 대신 이쪽이 공간 확보 수단이다.
 */

/**
 * @typedef {{
 *   id:string, name:string, sub:string, desc:string,
 *   layout:string[], annex:{name:string, cost:number, cells:number[][]}[],
 *   labels?:{x:number,y:number,w:number,h:number,text:string}[],
 *   catStart:{key:string,x:number,y:number}[],
 *   mods?:Partial<{startGold:number,startHp:number,incomeBase:number,
 *                  incomePerWave:number,waveScale:number}>
 * }} MapDef
 */

/** 연습장 — 원래의 열린 직사각형. 왼쪽에서 오른쪽으로. */
const YARD = {
  id: "yard",
  name: "심사관 연습장",
  sub: "PRACTICE YARD",
  desc: "장애물 없는 열린 판. 인접과 미로의 기본기를 익힌다.",
  layout: [
    "..........",
    "..........",
    "..........",
    "G........X",
    "..........",
    "..........",
    "..........",
  ],
  annex: [],
  catStart: [],
  labels: [],
  mods: { startGold: 100000 },
};

/**
 * 특허청 내성 — 나선형 성곽.
 *
 * 북서쪽 정문에서 시계방향으로 빙글빙글 돌아 한가운데 등록원부에 닿는다.
 * 통로(.) 한 줄, 심사관 터(T) 한 줄이 번갈아 겹겹이 감긴다.
 * 통로는 침입자만, 터는 심사관만 쓴다 — 둘은 절대 섞이지 않는다.
 */
const COMPLEX = {
  id: "complex",
  name: "특허청 내성",
  sub: "PATENT OFFICE INNER WARD",
  desc: "북서쪽 정문 하나로만 침입자가 들어온다. 통로가 나선으로 감겨 있어 성벽을 따라 안쪽으로 계속 돌아야 등록원부에 닿는다. 초록 터에만 심사관을 세울 수 있고, 통로는 침입자만 지난다.",
  //        0    5
  //        |....|...
  layout: [
    "G........",   // 0  바깥 통로 (북)
    "TTTTTTTT.",   // 1  바깥 터
    ".......T.",   // 2  둘째 통로
    ".TTTTT.T.",   // 3  둘째 터
    ".T..XT.T.",   // 4  등록원부 — 나선의 끝
    ".T.TTT.T.",   // 5
    ".T.....T.",   // 6  셋째 통로
    ".TTTTTTT.",   // 7
    ".........",   // 8  바깥 통로 (남)
  ],
  annex: [],
  labels: [],
  catStart: [],
};

/** @type {MapDef[]} */
const MAPS = [COMPLEX, YARD];

/** @param {string} id */
const getMap = (id) => MAPS.find((m) => m.id === id) || MAPS[0];

/**
 * ASCII 레이아웃을 해석한다.
 * @param {MapDef} def
 * @returns {{cols:number, rows:number, gates:number[][], goal:number[], fixed:Set<string>, tower:Set<string>|null}}
 */
function parseMap(def) {
  const rows = def.layout.length;
  const cols = def.layout[0].length;
  const gates = [];
  const fixed = new Set();
  const tower = new Set();
  let goal = null;

  def.layout.forEach((line, y) => {
    if (line.length !== cols)
      throw new Error(`${def.id}: ${y}행 길이가 ${line.length} (기대 ${cols})`);
    [...line].forEach((ch, x) => {
      if (ch === "#") fixed.add(`${x},${y}`);
      else if (ch === "T") tower.add(`${x},${y}`);
      else if (ch === "G") gates.push([x, y]);
      else if (ch === "X") goal = [x, y];
      else if (ch !== ".") throw new Error(`${def.id}: 알 수 없는 문자 '${ch}' (${x},${y})`);
    });
  });

  if (!goal) throw new Error(`${def.id}: 등록원부(X)가 없습니다`);
  if (!gates.length) throw new Error(`${def.id}: 진입구(G)가 없습니다`);
  return { cols, rows, gates, goal, fixed, tower: tower.size ? tower : null };
}

return { MAPS, getMap, parseMap };
})();
__mods["core/board.js"] = (function(){
// @ts-check
const {BAL} = __req("core/data.js");
/**
 * @typedef {{kind:"cat"|"relic", key:string, x:number, y:number, w:number, h:number,
 *            uid:number, lv?:number, void?:number, reg?:number,
 *            st?:any, cd?:number, atkEnd?:number}} Piece
 * @typedef {{cols:number, rows:number, gates:number[][], goal:number[],
 *            fixed:Set<string>, tower:Set<string>|null, pieces:Piece[]}} Board
 */

const CS = BAL.cellSize, GAP = BAL.cellGap;

/** 격자 좌표 → 픽셀 좌상단 */
const px = (i) => i * (CS + GAP);
/** 격자 좌표 → 픽셀 중심 */
const cellCenter = (x, y) => [px(x) + CS / 2, px(y) + CS / 2];
/** 2×2 조각의 픽셀 중심 */
const pieceCenter = (p) => [px(p.x) + (p.w * CS + (p.w - 1) * GAP) / 2,
                                   px(p.y) + (p.h * CS + (p.h - 1) * GAP) / 2];

/** @param {Board} b */
const placed = (b) => b.pieces.filter((p) => p.x >= 0);
/** @param {Board} b */
const cats = (b) => placed(b).filter((p) => p.kind === "cat");
/** @param {Board} b */
const prodCat = (b) => cats(b).find((c) => c.key === "prod");
/** @param {Board} b */
const relics = (b) => placed(b).filter((p) => p.kind === "relic");

const isGate = (b, x, y) => b.gates.some(([gx, gy]) => gx === x && gy === y);
const isGoal = (b, x, y) => b.goal[0] === x && b.goal[1] === y;
const isFixed = (b, x, y) => b.fixed.has(`${x},${y}`);
/** 심사관 터인가. 터가 정의되지 않은 맵(T 없음)은 모든 칸이 터다. */
const isTower = (b, x, y) => !b.tower || b.tower.has(`${x},${y}`);

/** @param {Board} b @returns {Piece|null} */
function pieceAt(b, x, y, skip) {
  for (const p of placed(b)) {
    if (p === skip) continue;
    if (x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h) return p;
  }
  return null;
}

/** 겹침·경계·출입구만 검사 (경로는 보지 않는다) */
function canPlace(b, p, nx, ny, skip) {
  if (nx < 0 || ny < 0 || nx + p.w > b.cols || ny + p.h > b.rows) return false;
  for (let dy = 0; dy < p.h; dy++) {
    for (let dx = 0; dx < p.w; dx++) {
      const x = nx + dx, y = ny + dy;
      if (isGate(b, x, y) || isGoal(b, x, y) || isFixed(b, x, y)) return false;
      if (!isTower(b, x, y)) return false;
      if (pieceAt(b, x, y, skip)) return false;
    }
  }
  return true;
}

/* ── BFS 재사용 버퍼 ──────────────────────
 * 후보 칸마다 경로를 다시 찾기 때문에 findPath 는 가장 뜨거운 함수다.
 * 문자열 키 Set 대신 타입 배열을 쓰고, 방문 표시는 세대 번호로 관리해
 * 매 호출마다 배열을 새로 만들지 않는다.
 * 탐색 순서는 이전 구현과 동일하게 유지한다 — 경로가 달라지면 결정성이 깨진다.
 */
let _cap = 0;
let _seen = new Int32Array(0);
let _prev = new Int32Array(0);
let _queue = new Int32Array(0);
let _gen = 0;

function ensureBuffers(n) {
  if (_cap >= n) return;
  _cap = n;
  _seen = new Int32Array(n);
  _prev = new Int32Array(n);
  _queue = new Int32Array(n);
  _gen = 0;
}

/**
 * 벽 격자를 만든다. 1 = 막힘.
 * 같은 보드에서 여러 후보를 평가할 때 한 번 만들어 재사용한다.
 * @param {Board} b
 * @param {Piece} [skip]
 * @returns {Uint8Array}
 */
function blockedGrid(b, skip) {
  const grid = fixedBlockedGrid(b);
  for (const p of placed(b)) {
    if (p === skip) continue;
    for (let dy = 0; dy < p.h; dy++) {
      const y = p.y + dy;
      if (y < 0 || y >= b.rows) continue;
      for (let dx = 0; dx < p.w; dx++) {
        const x = p.x + dx;
        if (x < 0 || x >= b.cols) continue;
        grid[y * b.cols + x] = 1;
      }
    }
  }
  return grid;
}

/**
 * 고정 구조물만 벽으로 취급한 격자 — 심사관은 절대 포함하지 않는다.
 * 침입자 동선은 이 격자로만 계산한다. 심사관을 놓거나 옮겨도 동선이 흔들리지 않아야 하기 때문이다.
 * @param {Board} b
 * @returns {Uint8Array}
 */
function fixedBlockedGrid(b) {
  const grid = new Uint8Array(b.cols * b.rows);
  const mark = (key) => {
    const c = key.indexOf(",");
    const x = +key.slice(0, c), y = +key.slice(c + 1);
    if (x >= 0 && y >= 0 && x < b.cols && y < b.rows) grid[y * b.cols + x] = 1;
  };
  for (const key of b.fixed) mark(key);
  if (b.tower) for (const key of b.tower) mark(key);   // 심사관 터도 침입자에겐 벽
  return grid;
}

/**
 * 모든 진입구 → 등록원부 경로. 하나라도 막혀 있으면 null.
 *
 * 탐색은 등록원부에서 바깥으로 딱 한 번만 돈다.
 * 그러면 진입구가 몇 개든 BFS 한 번으로 모든 경로가 나온다.
 *
 * @param {Board} b
 * @param {number[][]} [tentative] 가상으로 벽 취급할 칸들
 * @param {Piece} [skip] 벽에서 제외할 조각 (자기 자신을 옮길 때)
 * @param {Uint8Array} [grid] 미리 만든 벽 격자 (호출 후 원상복구됨)
 * @returns {number[][][]|null} 진입구별 경로
 */
function findPaths(b, tentative, skip, grid) {
  const cols = b.cols, rows = b.rows, n = cols * rows;
  const blocked = grid || blockedGrid(b, skip);

  let marked = null;
  if (tentative) {
    for (const [x, y] of tentative) {
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
      const i = y * cols + x;
      if (!blocked[i]) { blocked[i] = 1; (marked ||= []).push(i); }
    }
  }

  try {
    const goal = b.goal[1] * cols + b.goal[0];
    if (blocked[goal]) return null;

    ensureBuffers(n);
    _gen++;
    _seen[goal] = _gen;
    _prev[goal] = -1;
    _queue[0] = goal;
    let head = 0, tail = 1;

    // 순서 고정: 오른쪽 → 아래 → 위 → 왼쪽
    while (head < tail) {
      const cur = _queue[head++];
      const cx = cur % cols, cy = (cur / cols) | 0;
      if (cx + 1 < cols) { const k = cur + 1;    if (_seen[k] !== _gen && !blocked[k]) { _seen[k] = _gen; _prev[k] = cur; _queue[tail++] = k; } }
      if (cy + 1 < rows) { const k = cur + cols; if (_seen[k] !== _gen && !blocked[k]) { _seen[k] = _gen; _prev[k] = cur; _queue[tail++] = k; } }
      if (cy - 1 >= 0)   { const k = cur - cols; if (_seen[k] !== _gen && !blocked[k]) { _seen[k] = _gen; _prev[k] = cur; _queue[tail++] = k; } }
      if (cx - 1 >= 0)   { const k = cur - 1;    if (_seen[k] !== _gen && !blocked[k]) { _seen[k] = _gen; _prev[k] = cur; _queue[tail++] = k; } }
    }

    const out = [];
    for (const [gx, gy] of b.gates) {
      const gi = gy * cols + gx;
      if (_seen[gi] !== _gen) return null;   // 한 곳이라도 고립되면 배치 불가
      const path = [];
      for (let i = gi; i !== -1; i = _prev[i]) path.push([i % cols, (i / cols) | 0]);
      out.push(path);                         // 진입구 → 등록원부 순서
    }
    return out;
  } finally {
    if (marked) for (const i of marked) blocked[i] = 0;
  }
}

/** 진입구가 하나뿐인 맵을 위한 편의 함수 */
function findPath(b, tentative, skip, grid) {
  const ps = findPaths(b, tentative, skip, grid);
  return ps ? ps[0] : null;
}

/**
 * 심사관과 무관한, 고정 구조물만 반영한 진짜 침입자 동선.
 * 게임 내내 딱 두 순간(맵을 새로 불러올 때, 부속 구역을 열 때)에만 다시 계산한다.
 * @param {Board} b
 * @returns {number[][][]|null}
 */
function findFixedPaths(b) {
  return findPaths(b, undefined, undefined, fixedBlockedGrid(b));
}

/**
 * 배치 가능한가. 경계·겹침·출입구는 물론, 고정된 동선 칸 위에도 놓을 수 없다.
 * 동선은 심사관 배치로 절대 바뀌지 않으므로, 여기서 다시 길찾기를 할 필요가 없다 —
 * 이미 계산된 b.pathCells 와 겹치는지만 보면 된다.
 * @param {Board} b
 */
function legal(b, p, nx, ny, skip) {
  if (!canPlace(b, p, nx, ny, skip)) return false;
  if (!b.pathCells) return true;
  for (let dy = 0; dy < p.h; dy++)
    for (let dx = 0; dx < p.w; dx++)
      if (b.pathCells.has(`${nx + dx},${ny + dy}`)) return false;
  return true;
}

/** 좌상단부터 훑어 첫 합법 칸 */
function firstLegalSpot(b, p) {
  for (let y = 0; y <= b.rows - p.h; y++)
    for (let x = 0; x <= b.cols - p.w; x++)
      if (legal(b, p, x, y, p)) return [x, y];
  return null;
}

/** 조각과 변을 맞댄 칸들 ("x,y" 문자열 집합) */
function adjCells(b, piece) {
  const s = new Set();
  for (let dy = 0; dy < piece.h; dy++) {
    for (let dx = 0; dx < piece.w; dx++) {
      const cx = piece.x + dx, cy = piece.y + dy;
      for (const [ax, ay] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = cx + ax, ny = cy + ay;
        if (nx < 0 || ny < 0 || nx >= b.cols || ny >= b.rows) continue;
        if (nx >= piece.x && nx < piece.x + piece.w &&
            ny >= piece.y && ny < piece.y + piece.h) continue;
        s.add(`${nx},${ny}`);
      }
    }
  }
  return s;
}

/** 변리사냥류의 보좌 범위 — 실제로 이어진 심사관 터(폭 1칸 나선 통로)만 골라낸다.
 *  직선 구간에서는 자연히 좌우 칸이 되고, 나선이 꺾이는 모서리에서는 좌우 대신
 *  이어지는 방향(위·아래)의 터가 대신 잡힌다 — 통로/벽은 애초에 터가 아니라서 제외된다. */
function adjCellsLR(b, piece) {
  const s = new Set();
  for (let dy = 0; dy < piece.h; dy++) {
    for (let dx = 0; dx < piece.w; dx++) {
      const cx = piece.x + dx, cy = piece.y + dy;
      for (const [ax, ay] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = cx + ax, ny = cy + ay;
        if (nx < 0 || ny < 0 || nx >= b.cols || ny >= b.rows) continue;
        if (nx >= piece.x && nx < piece.x + piece.w &&
            ny >= piece.y && ny < piece.y + piece.h) continue;
        if (!isTower(b, nx, ny)) continue;    // 터가 아니면(통로·벽) 보좌 대상에서 제외
        s.add(`${nx},${ny}`);
      }
    }
  }
  return s;
}

/** 심사관과 맞닿은 유효 유물들 (무효화된 것 제외) */
function adjRelics(b, cat) {
  const s = adjCells(b, cat);
  return relics(b).filter((p) => !p.void && s.has(`${p.x},${p.y}`));
}

/** 경로를 픽셀 폴리라인으로. 진입 방향 바깥 한 칸에서 시작한다. */
function pathToPixels(b, path) {
  const [gx, gy] = path[0];
  const [nx, ny] = path[1] || path[0];
  const dx = gx - nx, dy = gy - ny;
  const [cx, cy] = cellCenter(gx, gy);
  return [[cx + dx * (CS + GAP) * 0.9, cy + dy * (CS + GAP) * 0.9],
          ...path.map(([x, y]) => cellCenter(x, y))];
}

/**
 * 폴리라인 구간 길이 배열. total 프로퍼티에 전체 길이가 붙는다.
 * @typedef {number[] & {total:number}} Segments
 * @param {number[][]} pathPx
 * @returns {Segments}
 */
function segments(pathPx) {
  const L = /** @type {Segments} */ ([]);
  let total = 0;
  for (let i = 1; i < pathPx.length; i++) {
    const d = Math.hypot(pathPx[i][0] - pathPx[i-1][0], pathPx[i][1] - pathPx[i-1][1]);
    L.push(d); total += d;
  }
  L.total = total;
  return L;
}

/** 경로 시작점에서 dist 만큼 진행한 위치 */
function posOnPath(pathPx, L, dist) {
  let d = dist;
  for (let i = 0; i < L.length; i++) {
    if (d <= L[i]) {
      const t = L[i] ? d / L[i] : 0;
      const a = pathPx[i], b2 = pathPx[i + 1];
      return [a[0] + (b2[0] - a[0]) * t, a[1] + (b2[1] - a[1]) * t];
    }
    d -= L[i];
  }
  return pathPx[pathPx.length - 1];
}

/** 모든 진입 동선 중 심사관 사거리에 들어가는 비율 (0~1) */
function coverage(b, lanes) {
  const cs = cats(b).filter((c) => c.st);
  if (!cs.length || !lanes || !lanes.length) return 0;
  const centers = cs.map((c) => [...pieceCenter(c), c.st.range]);
  let inside = 0, total = 0;
  for (const lane of lanes) {
    const pathPx = lane.pathPx;
    for (let i = 1; i < pathPx.length; i++) {
      const a = pathPx[i-1], b2 = pathPx[i];
      const steps = Math.max(1, Math.round(Math.hypot(b2[0]-a[0], b2[1]-a[1]) / 7));
      for (let k = 0; k < steps; k++) {
        const t = k / steps;
        const sx = a[0] + (b2[0]-a[0]) * t, sy = a[1] + (b2[1]-a[1]) * t;
        total++;
        if (centers.some(([cx, cy, r]) => Math.hypot(sx-cx, sy-cy) <= r)) inside++;
      }
    }
  }
  return total ? inside / total : 0;
}

/** 빈 칸 수 */
function freeCellCount(b) {
  let n = 0;
  for (let y = 0; y < b.rows; y++)
    for (let x = 0; x < b.cols; x++)
      if (!isFixed(b, x, y) && isTower(b, x, y) && !isGate(b, x, y) && !isGoal(b, x, y) && !pieceAt(b, x, y)) n++;
  return n;
}

/**
 * 심사관 사거리 안에 든 동선 칸 수.
 *
 * 이 게임의 진짜 지표다. 동선을 아무리 늘려도 사거리 밖이면 의미가 없다.
 * coverage() 가 비율이라면 이쪽은 절대량 — 실제 사격 시간에 비례한다.
 * @param {Board} b
 * @param {number[][][]} paths
 */
function coveredCells(b, paths) {
  const cs = cats(b).filter((c) => c.st);
  if (!cs.length || !paths) return 0;
  const centers = cs.map((c) => [...pieceCenter(c), c.st.range * c.st.range]);
  let n = 0;
  for (const path of paths) {
    for (const [x, y] of path) {
      const [sx, sy] = cellCenter(x, y);
      for (const [cx, cy, r2] of centers) {
        const dx = sx - cx, dy = sy - cy;
        if (dx * dx + dy * dy <= r2) { n++; break; }
      }
    }
  }
  return n;
}

return { adjCells, adjCellsLR, adjRelics, blockedGrid, canPlace, cats, cellCenter, coverage, coveredCells, findFixedPaths, findPath, findPaths, firstLegalSpot, freeCellCount, isFixed, isGate, isGoal, isTower, legal, pathToPixels, pieceAt, pieceCenter, placed, posOnPath, prodCat, px, relics, segments };
})();
__mods["core/stats.js"] = (function(){
// @ts-check
const {CATS, BAL} = __req("core/data.js");
const {cats, adjCellsLR} = __req("core/board.js");

/** 조각이 차지한 칸들 ("x,y" 문자열) */
function pieceCells(p) {
  const out = [];
  for (let dy = 0; dy < p.h; dy++)
    for (let dx = 0; dx < p.w; dx++) out.push(`${p.x + dx},${p.y + dy}`);
  return out;
}

/**
 * 보드 전체 스탯을 계산해 각 심사관의 `st` 를 채우고 경제 수치를 반환.
 *
 * 유물 합성은 없다 — 심사관은 자기 타입 그대로의 고정 스탯을 갖는다.
 * 유일한 상호작용은 변리사냥(buff 타입)의 인접 보좌: 실제로 이어진 터(보통 좌우, 모서리에선 꺾이는 방향)에 맞닿은 심사관에게
 * 화력·공속 배율을 곱해 준다.
 *
 * 중요: 심사관의 `st` 는 매 계산마다 통째로 새로 만든다.
 * 정적 정의(CATS)와 파생 결과(st)를 절대 같은 필드에 쓰지 않는다 —
 * 이걸 섞으면 프레임마다 값이 누적되거나 0이 되는 버그가 난다.
 *
 * @param {import("./board.js").Board} b
 * @returns {{econ:{killGold:number,income:number,hp:number}, active:Set<number>,
 *            report:{cat:any, buffed:boolean}[]}}
 */
function computeStats(b) {
  const live = cats(b).filter((c) => !c.void);
  const bonus = b.bonus || { dmg: 0, rate: 0, range: 0 };
  const bMul = (k) => Math.max(0.2, 1 + bonus[k]);
  const ATTACK_RATE_MULT = 2.2;   // 공속 상향 — 균형을 위해 WAVES 스폰 수도 함께 늘렸다

  // 기본 스탯 (+ 패시브로 누적된 자기강화/상대약화 배율)
  for (const c of live) {
    const base = CATS[c.key];
    c.st = {
      dmg: base.dmg * bMul("dmg"), rate: base.rate * ATTACK_RATE_MULT * bMul("rate"), range: base.range * bMul("range"),
      pierce: Math.min(BAL.pierceCap, base.pierce || 0),
      targets: base.targets || 1,
      critC: base.critC || 0, critM: base.critM || 1,
      slow: Math.min(BAL.slowCap, base.slow || 0),
      buffDmg: 1, buffRate: 1,
    };
  }
  for (const c of cats(b).filter((c) => c.void)) c.st = null;

  // 인접 보좌 — 변리사냥류(순수 보좌형이든, 조합으로 만들어진 하이브리드든) 실제로 이어진 터 칸에만 배율을 곱한다
  for (const a of live) {
    const base = CATS[a.key];
    if (!base.auraDmg && !base.auraRate) continue;
    const adjSet = adjCellsLR(b, a);
    for (const c of live) {
      if (c === a) continue;
      if (pieceCells(c).some((k) => adjSet.has(k))) {
        c.st.buffDmg *= base.auraDmg;
        c.st.buffRate *= base.auraRate;
      }
    }
  }
  const report = [];
  for (const c of live) {
    c.st.dmg *= c.st.buffDmg;
    c.st.rate *= c.st.buffRate;
    report.push({ cat: c, buffed: c.st.buffDmg > 1 || c.st.buffRate > 1 });
  }

  // 경제는 유물이 없으니 항상 고정값
  const econ = { killGold: 0, income: 0, hp: 0 };
  return { econ, active: new Set(), report };
}

return { computeStats };
})();
__mods["core/combat.js"] = (function(){
// @ts-check
const {ENEMIES, CATS, BAL} = __req("core/data.js");
const {cats, pieceCenter, posOnPath} = __req("core/board.js");
/**
 * 적 하나에 피해를 준다. 처치 시 보상 지급 + 이벤트.
 * @param {any} g 게임 상태
 * @param {any} e 적
 * @param {number} amt
 * @param {any} src 공격자의 st (또는 {})
 */
function damage(g, e, amt, src) {
  const def = ENEMIES[e.t].def * (1 - (src.pierce || 0) / 100);
  e.hp -= Math.max(1, amt - def);

  if (src.slow) { e.slowT = 1.6; e.slowPct = Math.min(BAL.slowCap, src.slow) / 100; }

  if (e.hp <= 0 && !e.dead) {
    e.dead = true;
    const reward = ENEMIES[e.t].rw * (1 + g.econ.killGold / 100);
    g.gold += reward;
    g.killed++;
    g.events.push({ t: "kill", x: e.x, y: e.y, reward: Math.round(reward) });
  }
}

/**
 * 액티브 스킬의 실제 효과. 특허료 차감·쿨다운·이벤트는 Game 쪽이 맡고,
 * 여기서는 "적에게 무슨 일이 일어나는가"만 계산한다.
 * @param {any} g 게임 상태
 * @param {any} def SKILLS 의 정의
 * @param {number[]|null} pt purge 일 때 찍은 지점 [x,y] (픽셀)
 * @returns {{hit:number, killed:number}} 영향을 받은 수 / 그 중 처치한 수
 */
function castSkill(g, def, pt) {
  let hit = 0, killed = 0;

  if (def.kind === "freeze") {
    // 가처분 — 판 위 전체. 이미 걸려 있으면 남은 시간이 긴 쪽을 유지한다(중첩으로 늘어나지 않게).
    for (const e of g.enemies) {
      if (e.dead) continue;
      e.freezeT = Math.max(e.freezeT || 0, def.dur);
      hit++;
    }
    return { hit, killed };
  }

  // 폐기명령 — 찍은 지점 반경 안. 방어무시 100%로 처리해 방어력 높은 적도 확실히 정리된다.
  if (!pt) return { hit, killed };
  for (const e of g.enemies) {
    if (e.dead) continue;
    if (Math.hypot(e.x - pt[0], e.y - pt[1]) > def.radius) continue;
    hit++;
    const before = e.hp;
    // 보스는 즉사시키지 않는다 — 100 특허료로 국제소송단을 지우는 건 너무 싸다
    damage(g, e, e.t === "boss" ? e.max * (def.bossHp ?? 0.5) : before + 1, { pierce: 100 });
    if (e.dead) killed++;
    e.hitT = 0.22; e.hitCrit = true;
    e.hitAng = Math.atan2(e.y - pt[1], e.x - pt[0]);
  }
  return { hit, killed };
}

/** 돌파 시 심사관 무효화 */
function voidCats(g, n) {
  const pool = cats(g).filter((p) => !p.void);
  for (let i = 0; i < n && pool.length; i++) {
    const p = pool.splice(g.rng.int(pool.length), 1)[0];
    p.void = BAL.voidWaves;
    g.voidedThisWave.add(p);   // 이번 웨이브 안에서 막 무효화된 심사관 — 이번 웨이브 종료 시 감산을 한 번 건너뛴다
    g.events.push({ t: "void", key: p.key, name: CATS[p.key].name });
  }
}

/**
 * 전투 한 틱. 시간이 흐르는 유일한 곳.
 * @param {any} g
 * @param {number} dt 초
 * @param {number} now ms (애니메이션 프레임 계산용)
 */
function step(g, dt, now) {
  if (!g.lanes.length) return;

  // ── 사격 ──
  for (const c of cats(g)) {
    if (!c.st || CATS[c.key].kind === "buff") continue;
    c.cd = (c.cd || 0) - dt;
    if (c.cd > 0) continue;

    const [cx, cy] = pieceCenter(c);
    const inRange = [];
    for (const e of g.enemies) {
      if (e.dead) continue;
      if (Math.hypot(e.x - cx, e.y - cy) > c.st.range) continue;
      inRange.push(e);
    }
    if (!inRange.length) continue;
    inRange.sort((a, b) => b.dist - a.dist); // 가장 앞선 적부터

    c.cd = 1 / c.st.rate;
    c.atkEnd = now + g.atkTotal;
    const col = c.st.slow ? "#79b7d8" : c.st.critC ? "#c79bff" : "#69b6d6";
    const n = Math.min(c.st.targets, inRange.length);
    const isLong = c.key === "claim";          // 특허범위냥 — 장거리 미사일 전용 연출
    for (let i = 0; i < n; i++) {
      const target = inRange[i];
      const crit = Math.random() < c.st.critC;
      const dist = Math.hypot(target.x - cx, target.y - cy);
      const life = isLong ? Math.min(0.7, Math.max(0.26, dist / 620)) : 0.13;
      g.shots.push({ x1: cx, y1: cy, x2: target.x, y2: target.y,
                     col: crit ? "#cda43a" : col, w: crit ? 3 : 2, life, max: life, crit, long: isLong });
      damage(g, target, c.st.dmg * (crit ? c.st.critM : 1), c.st);
      // 명중 연출 — 몸통이 잠깐 번쩍이고 살짝 튕긴다. 타이밍은 발사와 동시(즉발 데미지),
      // 미사일이 날아가는 건 순수 연출이라 실제 피격 반응은 여기서 바로 건다.
      target.hitT = crit ? 0.22 : 0.14;
      target.hitCrit = crit;
      target.hitAng = Math.atan2(target.y - cy, target.x - cx);
    }
  }

  // ── 적 이동 ──
  for (const e of g.enemies) {
    if (e.dead) continue;
    if (e.slowT > 0) e.slowT -= dt;
    if (e.hitT > 0) e.hitT -= dt;
    if (e.hp <= 0) { damage(g, e, 0, {}); continue; }

    // 가처분에 묶인 동안에는 이동만 멈춘다 — 사격 대상은 그대로이므로 그 자리에서 계속 맞는다
    if (e.freezeT > 0) { e.freezeT -= dt; continue; }

    const lane = g.lanes[e.lane] || g.lanes[0];
    e.dist += ENEMIES[e.t].spd * (e.slowT > 0 ? 1 - e.slowPct : 1) * dt;

    if (e.dist >= lane.segs.total) {
      e.dead = true;
      const d = ENEMIES[e.t];
      g.hp -= d.leak;
      g.leaked++;
      g.events.push({ t: "leak", x: e.x, y: e.y, enemy: e.t, hp: g.hp });
      if (d.voids) voidCats(g, d.voids);
      if (d.fee) {
        // 합의금 — 잔고가 모자라도 그대로 가져간다. 마이너스는 빚으로 남아 수입으로 갚아야 한다.
        g.gold -= d.fee;
        g.events.push({ t: "fee", x: e.x, y: e.y, name: d.nm, amount: d.fee, gold: g.gold });
      }
      continue;
    }
    [e.x, e.y] = posOnPath(lane.pathPx, lane.segs, e.dist);
  }

  // ── 정리 ──
  g.enemies = g.enemies.filter((e) => !e.dead);
  for (const s of g.shots) s.life -= dt;
  g.shots = g.shots.filter((s) => s.life > 0);

  // ── 소환 ──
  while (g.spawnQueue.length && g.spawnQueue[0].at <= g.waveTime) {
    const q = g.spawnQueue.shift();
    const d = ENEMIES[q.t];
    const scale = 1 + BAL.hpPerWave * (g.wave - 1);
    const lane = g.lanes[q.lane] || g.lanes[0];
    g.enemies.push({
      t: q.t, lane: q.lane ?? 0, hp: d.hp * scale, max: d.hp * scale, dist: 0,
      x: lane.pathPx[0][0], y: lane.pathPx[0][1],
      slowT: 0, slowPct: 0, freezeT: 0, hitT: 0, hitCrit: false, hitAng: 0,
    });
  }
  g.waveTime += dt;
}

return { castSkill, damage, step };
})();
__mods["core/game.js"] = (function(){
// @ts-check
const {Rng} = __req("core/rng.js");
const {WAVES, BAL, CATS, SKILLS} = __req("core/data.js");
const {getMap, parseMap} = __req("core/maps.js");
const B = __req("core/board.js");
const {computeStats} = __req("core/stats.js");
const {step, castSkill} = __req("core/combat.js");
/** 대기 모션: 핑퐁 루프 */
const IDLE_ORDER = [0,1,2,3,4,5,4,3,2,1];
const IDLE_MS    = [170,110,100,100,110,190,110,100,100,110];
/** 공격 모션: 예비 → 돌진 → 타격 → 복귀 */
const ATK_ORDER  = [0,1,2,3,4,5];
const ATK_MS     = [100,150,50,70,90,140];
const ATK_TOTAL  = ATK_MS.reduce((a,b)=>a+b, 0);
const IDLE_TOTAL = IDLE_MS.reduce((a,b)=>a+b, 0);

/** 심사관의 현재 스프라이트 프레임 [행, 열] */
function frameOf(cat, now) {
  if (cat.atkEnd && now < cat.atkEnd) {
    let t = ATK_TOTAL - (cat.atkEnd - now);
    for (let i = 0; i < ATK_ORDER.length; i++) {
      if (t < ATK_MS[i]) return [CATS[cat.key].arow, ATK_ORDER[i]];
      t -= ATK_MS[i];
    }
  }
  let t = (now + cat.uid * 137) % IDLE_TOTAL;
  for (let i = 0; i < IDLE_ORDER.length; i++) {
    if (t < IDLE_MS[i]) return [CATS[cat.key].row, IDLE_ORDER[i]];
    t -= IDLE_MS[i];
  }
  return [CATS[cat.key].row, 0];
}

class Game {
  /** @param {{seed?:number, map?:string}} [opts] */
  constructor(opts = {}) {
    this.seed = opts.seed ?? ((Math.random() * 1e9) | 0);
    this.mapId = opts.map ?? "complex";
    this.reset();
  }

  reset() {
    this.rng = new Rng(this.seed);
    this._uid = 0;
    this.atkTotal = ATK_TOTAL;

    this.map = getMap(this.mapId);
    /** 맵별 밸런스 보정을 얹은 상수 */
    this.bal = { ...BAL, ...(this.map.mods || {}) };
    const parsed = parseMap(this.map);
    this.cols = parsed.cols; this.rows = parsed.rows;
    this.gates = parsed.gates; this.goal = parsed.goal;
    this.fixed = new Set(parsed.fixed);        // annex 개방 시 여기서 지운다
    this.tower = parsed.tower;                 // 심사관 터 (null 이면 제한 없음)

    this.pieces = [];      // 시작부터 배치된 심사관은 없다 — 특허료로 직접 골라 세운다
    this.tray = [];

    this.wave = 0;
    this.gold = this.bal.startGold;
    this.hp = this.bal.startHp;
    this.maxHp = this.bal.startHp;
    this.phase = "prep";      // prep | wave | won | lost
    this.ext = 0;
    this.reg = 1000;
    this.killed = 0;
    this.leaked = 0;
    this.bonus = { dmg: 0, rate: 0, range: 0 };  // 패시브로 누적된 % 보정 (자기강화 + 상대에게서 받은 약화)
    this.myPassives = [];  // 내가 (직접 선택 또는 상대에게서) 받은 효과 로그
    this.foePassives = []; // 내가 상대에게 건 효과 로그
    this.awaitingPassive = false;

    /** 액티브 스킬 재사용 대기(초). 웨이브가 끝나면 전부 0으로 돌아간다. */
    this.skillCd = {};
    /** 스킬을 몇 번 썼는지 (전적 요약용) */
    this.skillUses = {};
    for (const k in SKILLS) { this.skillCd[k] = 0; this.skillUses[k] = 0; }

    this.enemies = []; this.shots = []; this.spawnQueue = [];
    this.voidedThisWave = new Set();   // 이번 웨이브 중에 새로 무효화된 심사관 — 웨이브 종료 시 감산에서 한 번 제외한다
    this.waveTime = 0;
    this.events = [];
    this.econ = { killGold: 0, income: 0, hp: 0 };
    this.active = new Set();
    this.report = [];
    /** @type {{gate:number[], path:number[][], pathPx:number[][], segs:any}[]} */
    this.lanes = [];
    this.pathCells = new Set();
    this.cover = 0;

    this.recomputePath();
    this.recompute();
    return this;
  }

  uid() { return ++this._uid; }

  /**
   * 침입자 동선을 다시 계산한다. 심사관은 절대 이 계산에 관여하지 않는다.
   * 맵을 새로 불러오거나(reset) 부속 구역을 열 때(expand)만 부른다 —
   * 심사관을 놓거나 옮길 때 이걸 부르면 동선이 흔들려 보이므로 절대 여기서 호출하지 않는다.
   */
  recomputePath() {
    const paths = B.findFixedPaths(this);
    if (paths) {
      this.lanes = paths.map((path, i) => {
        const pathPx = B.pathToPixels(this, path);
        return { gate: this.gates[i], path, pathPx, segs: B.segments(pathPx) };
      });
      this.pathCells = new Set();
      for (const lane of this.lanes) for (const [x, y] of lane.path) this.pathCells.add(`${x},${y}`);
    } else {
      this.lanes = []; this.pathCells = new Set();
    }
  }

  /** 스탯 · 제압률을 다시 계산. 심사관을 놓거나 옮길 때마다 부른다. 동선(this.lanes)은 건드리지 않는다. */
  recompute() {
    const { econ, active, report } = computeStats(this);
    this.econ = econ; this.active = active; this.report = report;
    this.cover = B.coverage(this, this.lanes);
  }

  /** 가장 짧은 동선 길이. 방어의 실질 지표. */
  get shortestPath() {
    return this.lanes.length ? Math.min(...this.lanes.map((l) => l.path.length)) : 0;
  }
  /** 전체 동선 길이 합 */
  get totalPath() {
    return this.lanes.reduce((a, l) => a + l.path.length, 0);
  }
  /** 사거리 안에 든 동선 칸 수. 방어력의 실질 지표. */
  get coveredPath() {
    return B.coveredCells(this, this.lanes.map((l) => l.path));
  }

  // ── 비용 ──
  /** 임용 비용. 몇 명을 놓든 정가로 고정된다. @param {string} key */
  catCost(key) {
    // 몇 명을 임용하든 정가. (예전에는 같은 종류를 더 놓을수록 비싸졌지만, 지금은 붙이지 않는다.)
    return Math.round(CATS[key].cost * (this.bal.catCostMul ?? 1));
  }
  /** 다음 개방 구역. 없으면 null */
  nextAnnex() { return this.map.annex[this.ext] || null; }
  expandCost() { const a = this.nextAnnex(); return a ? a.cost : Infinity; }

  // ── 배치 ──
  /** 조각을 (x,y)에 놓는다. 트레이에서든 보드에서든. */
  place(p, x, y) {
    if (!B.legal(this, p, x, y, p)) return false;
    if (p.x < 0) {
      this.tray = this.tray.filter((q) => q !== p);
      this.pieces.push(p);
    }
    p.x = x; p.y = y;
    this.recompute();
    this.events.push({ t: "place", key: p.key, x, y });
    return true;
  }

  /** 보드에서 트레이로 뺀다 (무료 재배치) */
  unplace(p) {
    if (p.x < 0) return false;
    this.pieces = this.pieces.filter((q) => q !== p);
    p.x = -1; p.y = -1;
    this.tray.push(p);
    this.recompute();
    return true;
  }

  // ── 구매 ──
  /** @param {string} key 심사관 타입 (CATS 의 키). 빈 자리가 있으면 즉시 배치되고, 없으면 대기열에 놓인다. */
  buyCat(key) {
    const c = this.catCost(key);
    if (this.phase !== "prep" || this.gold < c) return null;
    const p = { kind: "cat", key, x: -1, y: -1, w: 1, h: 1, uid: this.uid(), void: 0 };
    const spot = B.firstLegalSpot(this, p);
    if (spot) { p.x = spot[0]; p.y = spot[1]; this.pieces.push(p); }
    else this.tray.push(p);
    this.gold -= c;
    this.recompute();
    this.events.push({ t: "buy", what: "cat", key, name: CATS[key].name, cost: c });
    return p;
  }

  // ── 액티브 스킬 ──
  /** @param {string} key */
  skillCost(key) { return SKILLS[key] ? SKILLS[key].cost : Infinity; }

  /**
   * 지금 이 스킬을 쓸 수 있는가. 못 쓰는 이유가 있으면 문자열로, 쓸 수 있으면 null.
   * UI가 버튼에 그대로 띄울 수 있게 이유를 말로 돌려준다.
   * @param {string} key
   * @returns {string|null}
   */
  skillBlocked(key) {
    const d = SKILLS[key];
    if (!d) return "없는 스킬";
    if (this.phase !== "wave") return "웨이브 중 사용";
    if ((this.skillCd[key] || 0) > 0) return `대기 ${this.skillCd[key].toFixed(1)}s`;
    if (this.gold < d.cost) return "특허료 부족";
    return null;
  }
  /** @param {string} key */
  canUseSkill(key) { return this.skillBlocked(key) === null; }

  /**
   * 스킬을 집행한다. 특허료를 내고 즉시 효과가 들어간다.
   * @param {string} key
   * @param {number[]|null} [pt] target 이 "point" 인 스킬에서 찍은 지점 [x,y] (보드 픽셀 좌표)
   * @returns {boolean} 실제로 나갔는가
   */
  useSkill(key, pt) {
    if (!this.canUseSkill(key)) return false;
    const d = SKILLS[key];
    if (d.target === "point" && !pt) return false;

    this.gold -= d.cost;
    this.skillCd[key] = d.cd;
    this.skillUses[key] = (this.skillUses[key] || 0) + 1;
    const { hit, killed } = castSkill(this, d, pt || null);

    this.events.push({
      t: "skill", key, name: d.name, kind: d.kind, cost: d.cost, hit, killed,
      x: pt ? pt[0] : 0, y: pt ? pt[1] : 0, radius: d.radius || 0, dur: d.dur || 0,
    });
    return true;
  }

  /** 부속 구역을 개방한다. 고정 구조물이 빈 칸이 된다. */
  expand() {
    const a = this.nextAnnex();
    if (this.phase !== "prep" || !a || this.gold < a.cost) return false;
    this.gold -= a.cost;
    this.ext++;
    for (const [x, y] of a.cells) this.fixed.delete(`${x},${y}`);
    this.recomputePath();
    this.recompute();
    this.events.push({ t: "expand", name: a.name, cells: a.cells.length, cost: a.cost });
    return true;
  }

  // ── 웨이브 ──
  startWave() {
    if (this.phase !== "prep" || this.awaitingPassive) return false;
    this.recompute();
    if (!this.lanes.length) return false;
    this.wave++;
    this.phase = "wave";
    this.waveTime = 0;
    this.spawnQueue = [];
    this.voidedThisWave = new Set();   // 새 웨이브 시작 — 이번 웨이브 동안 새로 무효화될 심사관 추적 초기화

    const def = WAVES[this.wave - 1];
    const scale = this.bal.waveScale ?? 1;
    let list = [];
    for (const k in def) {
      const n = k === "boss" ? def[k] : Math.max(1, Math.round(def[k] * scale));
      for (let i = 0; i < n; i++) list.push(k);
    }
    list = this.rng.shuffle(list);
    list.sort((a, b) => (a === "boss" ? 1 : 0) - (b === "boss" ? 1 : 0));

    // 진입구가 여럿이면 돌아가며 분배한다
    const nLanes = this.lanes.length;
    let at = 0, laneCursor = this.rng.int(nLanes);
    for (const t of list) {
      const lane = t === "boss" ? this.rng.int(nLanes) : (laneCursor++ % nLanes);
      this.spawnQueue.push({ t, at, lane });
      at += t === "boss" ? BAL.spawnGapBoss : BAL.spawnGap;
    }
    this.events.push({
      t: "wave_start", wave: this.wave, count: list.length,
      cover: this.cover, path: this.totalPath, covered: this.coveredPath, gates: nLanes,
    });
    return true;
  }

  endWave() {
    this.phase = "prep";
    // 무효화 카운트다운 감산 — 단, "이번 웨이브 중에 막 무효화된" 심사관은 이번 한 번은 건너뛴다.
    // (그렇지 않으면 웨이브 막판에 돌파당해 막 무효화된 심사관이, 곧바로 이어지는 이번 웨이브
    //  종료 처리에서 카운트가 1 깎여버려 정해진 지속 웨이브보다 한 웨이브 일찍 부활하는 버그가 있었다.)
    for (const p of B.placed(this)) {
      if (p.void && !this.voidedThisWave.has(p)) p.void--;
    }
    this.voidedThisWave = new Set();
    // 이번 웨이브에서 날아가던 미사일이 남아있으면 웨이브가 끝나도 화면에 얼어붙은 채 남는 잔상 버그가
    // 있었다 — step()이 phase==="wave"일 때만 돌아서 s.life가 더는 줄지 않기 때문. 웨이브가 끝나면
    // 무조건 정리한다.
    this.shots = [];
    // 스킬 대기시간은 웨이브를 넘기면 초기화된다 — 웨이브 안에서 언제 쓸지가 판단 지점이 되도록
    for (const k in this.skillCd) this.skillCd[k] = 0;
    const income = Math.round(this.bal.incomeBase + this.wave * this.bal.incomePerWave);
    this.gold += income;
    this.recompute();
    this.events.push({ t: "wave_end", wave: this.wave, income, bonus: 0 });
    if (this.wave >= BAL.waveCount) {
      this.phase = "won";
      this.events.push({ t: "over", win: true });
    } else {
      this.awaitingPassive = true;
    }
  }

  /**
   * 웨이브 클리어 후 고른 패시브를 적용한다.
   * self  → 내 스탯을 즉시 올린다.
   * foe   → 나에겐 아무 효과가 없다. 이 선택을 상대에게 전달해서 상대가 receiveFoePassive를 부르게 하는 건
   *         네트워크 레이어(웹 클라이언트)의 몫이다.
   * @param {{key:string,side:"self"|"foe",stat:string,amount:number}} def
   */
  applyPassive(def) {
    if (def.side === "self") {
      if (def.stat === "hp") {
        // 거절결정불복심판류 — %가 아니라 즉시 한 번 들어오는 회복. 최대치는 넘기지 않는다.
        this.hp = Math.min(this.maxHp, this.hp + def.amount);
      } else {
        this.bonus[def.stat] = Math.max(-0.7, this.bonus[def.stat] + def.amount);
      }
      this.myPassives.push(def);
      this.recompute();
    } else {
      this.foePassives.push(def);
    }
    this.awaitingPassive = false;
  }
  /** 상대가 나에게 건 "상대 약화" 패시브를 내 쪽에 실제로 적용한다. */
  receiveFoePassive(def) {
    if (def.stat === "hp") {
      // 무효심판류 — %가 아니라 즉시 한 번 적용되는 고정 피해
      this.hp = Math.max(0, this.hp + def.amount);
      this.myPassives.push(def);
      if (this.hp <= 0 && this.phase !== "lost" && this.phase !== "won") {
        this.phase = "lost";
        this.shots = [];
        this.events.push({ t: "over", win: false });
      }
      return;
    }
    this.bonus[def.stat] = Math.max(-0.7, this.bonus[def.stat] + def.amount);
    this.myPassives.push(def);
    this.recompute();
  }

  /**
   * 시간을 dt초 진행. 웨이브 중에만 의미가 있다.
   * @returns {boolean} 아직 진행 중인가
   */
  tick(dt, now) {
    if (this.phase !== "wave") return false;
    // 스킬 재사용 대기는 전투 시간과 같이 흐른다 (배속을 걸면 그만큼 빨리 준다)
    for (const k in this.skillCd) {
      if (this.skillCd[k] > 0) this.skillCd[k] = Math.max(0, this.skillCd[k] - dt);
    }
    step(this, dt, now);
    if (this.hp <= 0) {
      this.phase = "lost";
      this.shots = [];
      this.events.push({ t: "over", win: false });
      return false;
    }
    if (!this.spawnQueue.length && !this.enemies.length) { this.endWave(); return false; }
    return true;
  }

  /** 렌더러가 소비할 이벤트를 꺼내간다 */
  drainEvents() { const e = this.events; this.events = []; return e; }

  /** 한 판 요약 */
  summary() {
    return {
      seed: this.seed, map: this.mapId, win: this.phase === "won", wave: this.wave,
      hp: Math.max(0, this.hp), maxHp: this.maxHp,
      killed: this.killed, leaked: this.leaked,
      path: this.shortestPath, totalPath: this.totalPath,
      covered: this.coveredPath, gates: this.gates.length,
      cover: this.cover, gold: Math.round(this.gold),
      cats: B.cats(this).length,
      skillUses: { ...this.skillUses },
      skillTotal: Object.values(this.skillUses).reduce((a, b) => a + b, 0),
      reg: this.reg,
    };
  }
}

return { ATK_MS, ATK_ORDER, ATK_TOTAL, Game, IDLE_MS, IDLE_ORDER, frameOf };
})();
__mods["web/sprite.js"] = (function(){
// @ts-check
/**
 * 스프라이트 시트. 4행 × 6열, 각 64px.
 * 행 순서: 생산냥 대기 / 생산냥 공격 / 전투냥 대기 / 전투냥 공격
 *
 * 빌드 스크립트가 __SPRITE_DATA__ 를 base64 로 치환한다.
 * 치환되지 않았으면(모듈 직접 실행 시) 같은 폴더의 sprite.png 를 찾는다.
 */
const INLINE = "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";

const sprite = new Image();
sprite.src = INLINE.startsWith("__") ? "./sprite.png" : "data:image/png;base64," + INLINE;

/** 로드 완료 시 콜백 (이미 로드됐으면 즉시) */
function onSpriteReady(fn) {
  if (sprite.complete && sprite.naturalWidth) fn();
  else sprite.addEventListener("load", fn, { once: true });
}

return { onSpriteReady, sprite };
})();
__mods["web/main.js"] = (function(){
// @ts-check
const {Game, frameOf} = __req("core/game.js");
const {CATS, ENEMIES, BAL, PASSIVES, PASSIVE_BY_KEY, SKILLS} = __req("core/data.js");
const {MAPS} = __req("core/maps.js");
const B = __req("core/board.js");
const {sprite, onSpriteReady} = __req("web/sprite.js");
const $ = (s) => /** @type {HTMLElement} */ (document.querySelector(s));
const CS = BAL.cellSize, GAP = BAL.cellGap;

/** @type {any} 방에 입장해서 대전이 시작되어야 만들어진다 */
let game = null;
let speed = 1;
let dragging = null;
/** 범위 지정이 필요한 스킬을 고른 상태 (판을 찍기 전까지 유지) */
let armedSkill = null;
/** 조준 중인 마우스 위치 (보드 픽셀 좌표) */
let aimPt = null;
/** 스킬 연출 조각들 */
let skillFx = [];
/** 심사관 uid → 스프라이트 캔버스. 렌더러 소유 상태. @type {Map<number,HTMLCanvasElement>} */
const catCanvas = new Map();

/* ═══════ 네트워킹 ═══════ */
let ws = null, youAre = null;
let oppSnapshot = null;   // 상대에게서 마지막으로 받은 보드 스냅샷
let lastStateSentAt = 0;

function connectWS() {
  // HTTPS 로 서비스되면 반드시 wss:// 로 붙어야 한다.
  // https 페이지에서 ws:// 를 열면 브라우저가 혼합 콘텐츠로 막아버려 대전이 아예 성립하지 않는다.
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${proto}//${location.host}`);
  ws.onmessage = (ev) => {
    let msg; try { msg = JSON.parse(ev.data); } catch (_) { return; }
    onServerMessage(msg);
  };
}
function sendWS(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }

function onServerMessage(msg) {
  switch (msg.t) {
    case "created":
      $("#codeDisplay").textContent = msg.code;
      $("#createdBox").classList.remove("hidden");
      break;
    case "joinError":
      $("#joinError").textContent = msg.reason;
      $("#joinError").classList.remove("hidden");
      break;
    case "start":
      youAre = msg.youAre;
      beginBattle();
      break;
    case "oppState":
      oppSnapshot = msg.snap;
      $("#oppHp").textContent = `${Math.max(0, Math.ceil(msg.snap.hp))}/${msg.snap.maxHp}`;
      $("#oppWave").textContent = `${msg.snap.wave}/${BAL.waveCount}`;
      break;
    case "oppPassive": {
      const def = PASSIVE_BY_KEY[msg.key];
      if (!def || !game) break;
      if (def.side === "foe") {
        game.receiveFoePassive(def);
        log(`<b class="warn">상대가 「${def.name}」을 선택했습니다</b> — ${def.desc.replace("상대", "내")}`);
      } else {
        log(`상대가 「${def.name}」을 선택했습니다 (자기강화).`);
      }
      renderPassiveTags();
      render();
      break;
    }
    case "oppWon":
      if (game) endMatch(false, "상대가 먼저 특허 등록을 마쳤습니다.");
      break;
    case "oppLost":
      if (game) endMatch(true, "상대의 등록원부가 무너졌습니다.");
      break;
    case "oppLeft":
      if (game && game.phase !== "won" && game.phase !== "lost") endMatch(true, "상대가 대전을 떠났습니다.");
      break;
  }
}

/* ═══════ 렌더 ═══════ */
/** 보드 칸·건물 라벨·fx 캔버스 크기를 만든다. 맵을 새로 불러올 때만 부른다 —
 *  칸 자체는 게임 내내 절대 다시 만들지 않는다. 심사관을 옮길 때마다 이걸 다시 하면
 *  보드 전체가 순간적으로 깜빡이며 "변형"되는 것처럼 보이기 때문이다. */
function buildBoardCells() {
  const baseFixed = new Set(baseFixedCells());
  const b = $("#board");
  b.style.gridTemplateColumns = `repeat(${game.cols},${CS}px)`;
  b.innerHTML = "";

  for (let y = 0; y < game.rows; y++) {
    for (let x = 0; x < game.cols; x++) {
      const gate = B.isGate(game, x, y), goal = B.isGoal(game, x, y);
      const fixed = B.isFixed(game, x, y);
      const opened = !fixed && baseFixed.has(`${x},${y}`);
      const tower = !!game.tower && !gate && !goal && !fixed && B.isTower(game, x, y);
      const road = !!game.tower && !gate && !goal && !fixed && !tower;
      const d = document.createElement("div");
      d.className = "cell" +
        (gate ? " gate" : "") + (goal ? " goal" : "") +
        (fixed ? " fixed" : "") + (opened ? " annex" : "") +
        (tower ? " tower" : "") + (road ? " road" : "");
      d.dataset.x = String(x); d.dataset.y = String(y);
      if (gate) d.innerHTML = `<span>${gateName(x, y)}</span>`;
      if (goal) d.innerHTML = "<span>등록<br>원부</span>";
      b.appendChild(d);
    }
  }
  for (const lab of game.map.labels || []) {
    const t = document.createElement("div");
    t.className = "wingtag";
    t.style.left = B.px(lab.x) + "px";
    t.style.top = B.px(lab.y) + "px";
    t.style.width = (lab.w * CS + (lab.w - 1) * GAP) + "px";
    t.style.height = (lab.h * CS + (lab.h - 1) * GAP) + "px";
    t.textContent = lab.text;
    b.appendChild(t);
  }

  const fx = /** @type {HTMLCanvasElement} */ ($("#fx"));
  fx.width = game.cols * (CS + GAP) - GAP;
  fx.height = game.rows * (CS + GAP) - GAP;
  fx.style.width = fx.width + "px";
  fx.style.height = fx.height + "px";
}

/** 칸을 새로 만들지 않고, 칸 위에 붙는 클래스(인접 강조 / 부속 구역 개방)만 갱신한다 */
function syncBoardCells() {
  const baseFixed = new Set(baseFixedCells());
  const adj = new Set();
  for (const c of B.cats(game)) {
    if (!CATS[c.key].auraDmg && !CATS[c.key].auraRate) continue;
    for (const k of B.adjCellsLR(game, c)) adj.add(k);
  }
  document.querySelectorAll("#board .cell").forEach((el) => {
    const x = +(/** @type {HTMLElement} */ (el).dataset.x), y = +(/** @type {HTMLElement} */ (el).dataset.y);
    const fixed = B.isFixed(game, x, y);
    const opened = !fixed && baseFixed.has(`${x},${y}`);
    el.classList.toggle("adj", adj.has(`${x},${y}`));
    el.classList.toggle("fixed", fixed);
    el.classList.toggle("annex", opened);
  });
}

function render() {
  catCanvas.clear();
  syncBoardCells();

  const b = $("#board");
  b.querySelectorAll(".piece").forEach((el) => el.remove());
  for (const p of B.placed(game)) b.appendChild(pieceEl(p, true));

  const tray = $("#tray");
  tray.innerHTML = "";
  tray.classList.toggle("empty", !game.tray.length);
  for (const p of game.tray) tray.appendChild(pieceEl(p, false));

  renderCatRoster();
  renderHud();
}

function pieceEl(p, onBoard) {
  const el = document.createElement("div");
  // 변리사냥의 보좌를 받고 있으면 배경이 은은하게 반짝인다 (실제로 이어진 터에만 적용됨)
  const buffed = !p.void && p.st && (p.st.buffDmg > 1 || p.st.buffRate > 1);
  el.className = "piece cat" + (p.void ? " void" : "") + (buffed ? " buffed" : "");
  el.dataset.uid = String(p.uid);

  if (onBoard) {
    el.style.left = B.px(p.x) + "px";
    el.style.top = B.px(p.y) + "px";
    el.style.width = (p.w * CS + (p.w - 1) * GAP) + "px";
    el.style.height = (p.h * CS + (p.h - 1) * GAP) + "px";
  }

  const cv = document.createElement("canvas");
  cv.width = 64; cv.height = 64;
  cv.style.width = "64px"; cv.style.height = "64px";
  catCanvas.set(p.uid, cv);        // 코어 객체를 오염시키지 않는다
  el.appendChild(cv);

  const badge = document.createElement("span");
  badge.textContent = CATS[p.key].icon;
  badge.style.cssText = "position:absolute;right:-3px;bottom:-3px;font-size:20px;line-height:1;" +
    "background:#f2ecdb;border:2px solid #2b2418;border-radius:50%;width:26px;height:26px;" +
    "display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:5";
  el.appendChild(badge);

  el.addEventListener("pointerdown", (e) => startDrag(e, p));
  el.addEventListener("pointerenter", (e) => showTip(e, p));
  el.addEventListener("pointerleave", hideTip);
  return el;
}

/** 진입구 위치로 방위 이름을 붙인다 */
function gateName(x, y) {
  if (y === 0) return "북문";
  if (y === game.rows - 1) return "남문";
  if (x === 0) return "서문";
  if (x === game.cols - 1) return "동문";
  return "진입";
}
/** 맵 원본의 고정 칸 (개방 여부 표시용) */
function baseFixedCells() {
  const out = [];
  game.map.layout.forEach((line, y) =>
    [...line].forEach((ch, x) => { if (ch === "#") out.push(`${x},${y}`); }));
  return out;
}

function renderHud() {
  $("#sHp").textContent = `${Math.max(0, game.hp)}/${game.maxHp}`;
  const goldEl = $("#sGold");
  goldEl.textContent = String(Math.floor(game.gold));
  // 빚(마이너스)은 색으로 바로 알아보게 — 갚기 전까지는 아무것도 살 수 없다
  goldEl.style.color = game.gold < 0 ? "#e0574d" : "";
  goldEl.parentElement.querySelector("span").textContent = game.gold < 0 ? "특허료 (빚)" : "특허료";
  $("#sWave").textContent = `${game.wave}/${BAL.waveCount}`;
  $("#regHead").textContent = String(game.reg);

  const prep = game.phase === "prep";
  btn("#btnGo").disabled = !prep || game.awaitingPassive;
  if (prep) disarmSkill();   // 웨이브가 끝나면 조준 상태는 자동으로 풀린다
  updateSkillBar();
}
const btn = (s) => /** @type {HTMLButtonElement} */ ($(s));

function renderReport() {
  const cov = Math.round(game.cover * 100);
  const cards = game.report.map(({ cat, buffed }) => {
    if (CATS[cat.key].kind === "buff") {
      return `<div class="card"><div class="t">${CATS[cat.key].name} <span class="tag">${CATS[cat.key].tag}</span>
        <span style="margin-left:auto;font-family:var(--mono);font-size:10px;color:var(--muted)">비공격</span></div>
        <div style="font-size:10.5px;color:var(--muted);margin-top:4px">
        화력 +${Math.round((CATS[cat.key].auraDmg - 1) * 100)}% · 공속 +${Math.round((CATS[cat.key].auraRate - 1) * 100)}%
        — 맞닿은 심사관에게 적용</div></div>`;
    }
    const s = cat.st, d = CATS[cat.key], tags = [];
    if (s.slow) tags.push(`<span class="tag">둔화 ${Math.round(s.slow)}%</span>`);
    if (s.pierce) tags.push(`<span class="tag">방어무시 ${Math.round(s.pierce)}%</span>`);
    if (s.critC) tags.push(`<span class="tag">치명타 ${Math.round(s.critC * 100)}% ×${s.critM}</span>`);
    if (s.targets > 1) tags.push(`<span class="tag">동시조준 ${s.targets}</span>`);
    if (buffed) tags.push(`<span class="tag seal">보좌 적용중</span>`);
    return `<div class="card"><div class="t">${d.name} <span class="tag">${d.tag}</span></div>
      <div class="kv"><span>공격력</span><b>${s.dmg.toFixed(1)}</b>
      <span>공속</span><b>${s.rate.toFixed(2)}/s</b>
      <span>사거리</span><b>${(s.range / (CS + GAP)).toFixed(1)}칸</b>
      <span>초당 피해</span><b>${(s.dmg * s.rate * s.targets).toFixed(1)}</b></div>
      ${tags.length ? `<div style="margin-top:5px;display:flex;gap:4px;flex-wrap:wrap">${tags.join("")}</div>` : ""}
      </div>`;
  }).join("");

  $("#report").innerHTML = cards + `<div class="card">
    <div class="t">동선 장악 <span class="tag">${game.lanes.length ? game.lanes.map(l=>l.path.length).join(" / ") + "칸" : "막힘"}</span></div>
    <div class="bar"><i style="width:${cov}%"></i></div>
    <div style="font-size:10.5px;color:var(--muted);margin-top:4px">
    전체 ${game.totalPath}칸 중 <b style="color:#7fbf6a">${game.coveredPath}칸</b>이 사거리 안입니다 (${cov}%).
    길만 늘리고 사거리를 벗어나면 오히려 손해입니다.</div></div>`;
}

/* ═══════ 캔버스 오버레이 ═══════ */
const fxCanvas = () => /** @type {HTMLCanvasElement} */ ($("#fx"));
function draw(now) {
  const cv = fxCanvas();
  const g = cv.getContext("2d");
  g.clearRect(0, 0, cv.width, cv.height);

  g.save();
  if (shakeT > 0) {
    const k = shakeMag * (shakeT / 0.16 > 1 ? 1 : shakeT / 0.16); // 끝에 갈수록 잦아든다
    g.translate((Math.random() - 0.5) * 2 * k, (Math.random() - 0.5) * 2 * k);
  }

  for (const lane of game.lanes) {
    g.strokeStyle = "rgba(196,50,42,.26)"; g.lineWidth = 12;
    g.lineJoin = "round"; g.lineCap = "round";
    g.beginPath();
    lane.pathPx.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]));
    g.stroke();
    g.strokeStyle = "rgba(120,30,25,.45)"; g.lineWidth = 1.4; g.setLineDash([6, 5]);
    g.beginPath();
    lane.pathPx.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]));
    g.stroke(); g.setLineDash([]);
  }
  for (const c of B.cats(game)) {
    if (!c.st) continue;
    if (CATS[c.key].kind !== "buff") {
      const [cx, cy] = B.pieceCenter(c);
      g.beginPath(); g.arc(cx, cy, c.st.range, 0, 7);
      g.fillStyle = "rgba(105,182,214,.07)"; g.fill();
      g.strokeStyle = "rgba(60,106,138,.32)"; g.lineWidth = 1; g.stroke();
    }
    const cc = catCanvas.get(c.uid);
    if (cc && sprite.complete) {
      const [row, fr] = frameOf(c, now);
      const cg = cc.getContext("2d");
      cg.clearRect(0, 0, 64, 64);
      cg.filter = CATS[c.key].filter || "none";
      cg.drawImage(sprite, fr * 64, row * 64, 64, 64, 0, 0, 64, 64);
      cg.filter = "none";
    }
  }
  for (const e of game.enemies) {
    const d = ENEMIES[e.t];
    drawMonster(g, e, d, now);
    const w = d.r * 1.5, hp = Math.max(0, e.hp / e.max), by = -d.r * 1.05;
    g.fillStyle = "rgba(0,0,0,.5)"; g.fillRect(e.x - w / 2, e.y + by, w, 2.4);
    g.fillStyle = hp > .5 ? "#7fbf6a" : hp > .25 ? "#cda43a" : "#c4322a";
    g.fillRect(e.x - w / 2, e.y + by, w * hp, 2.4);
  }
  for (const s of game.shots) drawMissile(g, s);
  drawSparks(g);
  drawSkillFx(g, now);
  g.textAlign = "center"; g.font = "bold 11px ui-monospace,monospace";
  for (const f of floaters) {
    g.globalAlpha = Math.max(0, f.life / .8); g.fillStyle = f.col;
    g.fillText(f.txt, f.x, f.y - (.8 - f.life) * 22); g.globalAlpha = 1;
  }
  g.restore(); // 화면 흔들림 여기까지 — 이 아래는 화면에 고정된 UI라 흔들리지 않는다
}
function fxCanvasSize() {
  const fx = /** @type {HTMLCanvasElement} */ ($("#fx"));
  return { w: fx.width, h: fx.height };
}
function dot(g, x, y) { g.beginPath(); g.arc(x, y, 2.4, 0, 7); g.fill(); }

/** 침입자를 종류별로 다른 캐릭터로 그린다 */
/** 다리 두 개를 걸음걸이에 맞춰 그린다 (보스는 호출하지 않음 — 붕 떠서 이동) */
function drawLegs(g, r, phase) {
  g.strokeStyle = "rgba(12,21,36,.75)"; g.lineWidth = Math.max(1.2, r * 0.16);
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(-r * 0.32, r * 0.62); g.lineTo(-r * 0.32 + phase * r * 0.28, r * 0.98);
  g.moveTo(r * 0.32, r * 0.62); g.lineTo(r * 0.32 - phase * r * 0.28, r * 0.98);
  g.stroke();
}

/** 치비 비율의 쥐 몸통(둥근 귀·긴 꼬리·글로시 눈) — 침입자 4종이 전부 공유하는 기본 실루엣.
 *  냥타워 스프라이트와 톤을 맞춘 파스텔 회갈색 + 분홍 포인트.
 *  slowed면 몸통을 살짝 푸르게 물들여 둔화 상태를 표시한다. */
function drawRatSilhouette(g, r, slowed) {
  const body = slowed ? "#7d94a3" : "#b09e8c";
  const belly = slowed ? "#c9d8de" : "#e6ddce";
  const earIn = "#e8b0b6";
  const out = "#6b5d4e";
  g.strokeStyle = out; g.lineWidth = 1.1;
  // 꼬리 — 길고 가늘게, 끝이 살짝 말림
  g.beginPath();
  g.moveTo(r * 0.42, r * 0.5);
  g.quadraticCurveTo(r * 1.05, r * 0.3, r * 1.15, -r * 0.15);
  g.lineWidth = 2; g.strokeStyle = earIn; g.lineCap = "round"; g.stroke();
  g.lineWidth = 1.1; g.strokeStyle = out;
  // 동글동글한 몸통
  g.fillStyle = body;
  g.beginPath(); g.ellipse(0, r * 0.14, r * 0.62, r * 0.68, 0, 0, 7); g.fill(); g.stroke();
  // 배(밝은 크림색)
  g.fillStyle = belly;
  g.beginPath(); g.ellipse(0, r * 0.34, r * 0.34, r * 0.32, 0, 0, 7); g.fill();
  // 발 — 아래쪽에 작고 둥근 두 뭉치
  g.fillStyle = belly;
  g.beginPath(); g.ellipse(-r * 0.26, r * 0.72, r * 0.2, r * 0.15, 0, 0, 7); g.fill(); g.stroke();
  g.beginPath(); g.ellipse(r * 0.26, r * 0.72, r * 0.2, r * 0.15, 0, 0, 7); g.fill(); g.stroke();
  // 귀 — 크고 둥근 쥐 귀, 안쪽 분홍
  g.fillStyle = body;
  g.beginPath(); g.ellipse(-r * 0.42, -r * 0.62, r * 0.3, r * 0.34, -0.15, 0, 7); g.fill(); g.stroke();
  g.beginPath(); g.ellipse(r * 0.42, -r * 0.62, r * 0.3, r * 0.34, 0.15, 0, 7); g.fill(); g.stroke();
  g.fillStyle = earIn;
  g.beginPath(); g.ellipse(-r * 0.42, -r * 0.58, r * 0.16, r * 0.2, -0.15, 0, 7); g.fill();
  g.beginPath(); g.ellipse(r * 0.42, -r * 0.58, r * 0.16, r * 0.2, 0.15, 0, 7); g.fill();
  // 눈 — 크고 반짝이는 검은 눈 + 하이라이트
  for (const sx of [-1, 1]) {
    g.fillStyle = "#28221c";
    g.beginPath(); g.ellipse(sx * r * 0.24, -r * 0.02, r * 0.14, r * 0.17, 0, 0, 7); g.fill();
    g.fillStyle = "#fff";
    g.beginPath(); g.ellipse(sx * r * 0.24 - 1.4, -r * 0.1, r * 0.045, r * 0.06, 0, 0, 7); g.fill();
  }
  // 코 + 수염
  g.fillStyle = earIn;
  g.beginPath(); g.moveTo(-r * 0.05, r * 0.22); g.lineTo(r * 0.05, r * 0.22); g.lineTo(0, r * 0.3); g.closePath(); g.fill();
  g.strokeStyle = out; g.lineWidth = 0.8;
  g.beginPath(); g.moveTo(-r * 0.16, r * 0.24); g.lineTo(-r * 0.5, r * 0.14); g.stroke();
  g.beginPath(); g.moveTo(-r * 0.16, r * 0.3); g.lineTo(-r * 0.5, r * 0.3); g.stroke();
  g.beginPath(); g.moveTo(r * 0.16, r * 0.24); g.lineTo(r * 0.5, r * 0.14); g.stroke();
  g.beginPath(); g.moveTo(r * 0.16, r * 0.3); g.lineTo(r * 0.5, r * 0.3); g.stroke();
  // 앞니
  g.fillStyle = "#faf7ec"; g.strokeStyle = out; g.lineWidth = 0.6;
  g.fillRect(-r * 0.05, r * 0.3, r * 0.1, r * 0.12); g.strokeRect(-r * 0.05, r * 0.3, r * 0.1, r * 0.12);
  g.strokeStyle = out; g.lineWidth = 1.1;
}

/** 미사일 발사 이펙트 — 타워→적을 잇는 직선 대신, 살짝 포물선을 그리며 날아가는 발광 구슬 + 궤적 + 명중 폭발.
 *  s.life가 s.max에서 0으로 줄어드는 걸 진행도로 삼는다 (0=발사 직후, 1=명중). */
function drawMissile(g, s) {
  if (s.long) return drawLongMissile(g, s);
  const p = 1 - Math.max(0, s.life / s.max);          // 0..1 진행도
  const crit = s.col === "#cda43a";
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
  const dist = Math.hypot(dx, dy) || 1;
  const arcH = Math.min(16, dist * 0.12);
  const ang = Math.atan2(dy, dx);

  const posAt = (t) => ({
    x: s.x1 + dx * t,
    y: s.y1 + dy * t - Math.sin(t * Math.PI) * arcH,
  });

  const MSCALE = 2; // 미사일 몸체 전체 크기 배율 — 도파민용으로 2배 키움
  if (p < 0.9) {
    // 배기 궤적 — 지나온 자리에 옅어지는 잔상
    for (let i = 1; i <= 5; i++) {
      const tp = Math.max(0, p - i * 0.045);
      const tpos = posAt(tp);
      g.fillStyle = crit ? `rgba(205,164,58,${0.4 * (1 - i / 5)})` : `rgba(105,182,214,${0.4 * (1 - i / 5)})`;
      g.beginPath(); g.arc(tpos.x, tpos.y, (3.4 - i * 0.45) * MSCALE, 0, 7); g.fill();
    }
    // 진행 방향 접선 각도 (포물선을 따라 기수가 향하도록)
    const t0 = Math.max(0, p - 0.02), t1 = Math.min(1, p + 0.02);
    const a0 = posAt(t0), a1 = posAt(t1);
    const heading = Math.atan2(a1.y - a0.y, a1.x - a0.x);
    const mp = posAt(p);

    g.save();
    g.translate(mp.x, mp.y);
    g.rotate(heading);
    const len = s.w * 5 * MSCALE, wid = s.w * 1.9 * MSCALE;
    // 발광
    g.fillStyle = crit ? "rgba(233,203,140,.5)" : "rgba(150,210,235,.45)";
    g.beginPath(); g.arc(0, 0, len * 0.9, 0, 7); g.fill();
    // 화염 꼬리
    g.fillStyle = crit ? "#e9a23a" : "#5bc8e8";
    g.beginPath();
    g.moveTo(-len * 0.55, -wid * 0.32); g.lineTo(-len * 1.15, 0); g.lineTo(-len * 0.55, wid * 0.32);
    g.closePath(); g.fill();
    // 몸체 (뾰족한 탄두)
    g.fillStyle = "#fff8e6"; g.strokeStyle = crit ? "#a9791e" : "#2f7a9e"; g.lineWidth = 1;
    g.beginPath();
    g.moveTo(len * 0.62, 0);
    g.lineTo(len * 0.05, -wid * 0.5);
    g.lineTo(-len * 0.5, -wid * 0.34);
    g.lineTo(-len * 0.5, wid * 0.34);
    g.lineTo(len * 0.05, wid * 0.5);
    g.closePath(); g.fill(); g.stroke();
    g.fillStyle = crit ? "#e9a23a" : "#5bc8e8";
    g.beginPath(); g.arc(len * 0.1, 0, wid * 0.22, 0, 7); g.fill();
    g.restore();
  } else {
    // 명중 폭발 — 순간 백색 코어 플래시 + 확산하는 충격파 + 튀는 파편, 치명타는 한 단계 더 크고 진하게
    if (!s.burst) { s.burst = true; spawnSparks(s.x2, s.y2, crit); addShake(crit ? 4.5 : 1.6, crit ? 0.16 : 0.07); }
    const bp = (p - 0.9) / 0.1;
    const rad = s.w * 2.4 + bp * (crit ? 30 : 18);
    const alpha = 1 - bp;

    // 코어 플래시 — 터지는 첫 순간 확 밝아졌다가 빠르게 잦아든다
    const flash = Math.max(0, 1 - bp * 3.2);
    if (flash > 0) {
      g.fillStyle = crit ? `rgba(255,235,190,${flash})` : `rgba(255,255,255,${flash * 0.9})`;
      g.beginPath(); g.arc(s.x2, s.y2, rad * (0.55 + flash * 0.5), 0, 7); g.fill();
    }

    g.fillStyle = crit ? `rgba(233,203,140,${alpha * 0.55})` : `rgba(150,210,235,${alpha * 0.5})`;
    g.beginPath(); g.arc(s.x2, s.y2, rad * 0.65, 0, 7); g.fill();
    g.strokeStyle = crit ? `rgba(255,215,120,${alpha})` : `rgba(150,210,235,${alpha})`;
    g.lineWidth = crit ? 3 : 2;
    g.beginPath(); g.arc(s.x2, s.y2, rad, 0, 7); g.stroke();
    const spokes = crit ? 10 : 6;
    for (let i = 0; i < spokes; i++) {
      const a = i * (Math.PI * 2 / spokes);
      g.beginPath();
      g.moveTo(s.x2 + Math.cos(a) * rad * 0.35, s.y2 + Math.sin(a) * rad * 0.35);
      g.lineTo(s.x2 + Math.cos(a) * rad, s.y2 + Math.sin(a) * rad);
      g.stroke();
    }
  }
}

/** 특허범위냥 전용 — 사거리가 2배로 길어진 만큼, "멀리서 크게 날아온다"는 게 한눈에 보이도록
 *  전용 궤적(창 모양 탄두 + 전체 경로를 잇는 연막)과 더 육중한 착탄을 그린다. */
function drawLongMissile(g, s) {
  const p = 1 - Math.max(0, s.life / s.max);
  const crit = s.col === "#cda43a";
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
  const dist = Math.hypot(dx, dy) || 1;
  const arcH = Math.min(46, dist * 0.16);              // 일반 미사일보다 훨씬 높은 포물선 — 장거리임을 눈으로 알린다
  const posAt = (t) => ({
    x: s.x1 + dx * t,
    y: s.y1 + dy * t - Math.sin(t * Math.PI) * arcH,
  });

  if (p < 0.92) {
    // 전체 경로를 잇는 연막 — 뒤로 갈수록(발사 지점 쪽) 옅어져 "먼 거리를 날아왔다"가 보인다
    g.save();
    g.lineCap = "round"; g.lineJoin = "round";
    const steps = 26, upto = Math.max(1, Math.round(steps * p));
    for (let i = 0; i < upto; i++) {
      const t0 = p * (i / steps), t1 = p * ((i + 1) / steps);
      const a0 = posAt(t0), a1 = posAt(t1);
      const k = i / steps;
      g.strokeStyle = crit ? `rgba(233,203,140,${0.05 + k * 0.4})` : `rgba(150,210,235,${0.05 + k * 0.4})`;
      g.lineWidth = 2.5 + k * 4.5;
      g.beginPath(); g.moveTo(a0.x, a0.y); g.lineTo(a1.x, a1.y); g.stroke();
    }
    g.restore();

    const t0 = Math.max(0, p - 0.015), t1 = Math.min(1, p + 0.015);
    const a0 = posAt(t0), a1 = posAt(t1);
    const heading = Math.atan2(a1.y - a0.y, a1.x - a0.x);
    const mp = posAt(p);

    g.save();
    g.translate(mp.x, mp.y);
    g.rotate(heading);
    const len = 42, wid = 9;                            // 일반 미사일보다 훨씬 길고 뾰족한 창 모양
    g.fillStyle = crit ? "rgba(233,203,140,.55)" : "rgba(150,210,235,.5)";
    g.beginPath(); g.arc(0, 0, len * 0.6, 0, 7); g.fill();
    // 화염 꼬리 — 더 길게 늘어진다
    g.fillStyle = crit ? "#e9a23a" : "#5bc8e8";
    g.beginPath();
    g.moveTo(-len * 0.5, -wid * 0.3); g.lineTo(-len * 1.5, 0); g.lineTo(-len * 0.5, wid * 0.3);
    g.closePath(); g.fill();
    // 몸체 — 가늘고 긴 창끝
    g.fillStyle = "#fff8e6"; g.strokeStyle = crit ? "#a9791e" : "#2f7a9e"; g.lineWidth = 1.3;
    g.beginPath();
    g.moveTo(len * 0.62, 0);
    g.lineTo(0, -wid * 0.5);
    g.lineTo(-len * 0.62, -wid * 0.32);
    g.lineTo(-len * 0.62, wid * 0.32);
    g.lineTo(0, wid * 0.5);
    g.closePath(); g.fill(); g.stroke();
    g.fillStyle = crit ? "#e9a23a" : "#5bc8e8";
    g.beginPath(); g.arc(len * 0.15, 0, wid * 0.22, 0, 7); g.fill();
    g.restore();
  } else {
    // 착탄 — 장거리 탄약답게 일반 미사일보다 한 단계 더 크고 묵직하게 터진다
    if (!s.burst) { s.burst = true; spawnSparks(s.x2, s.y2, crit); addShake(crit ? 7 : 3.4, crit ? 0.22 : 0.13); }
    const bp = (p - 0.92) / 0.08;
    const rad = 12 + bp * (crit ? 46 : 30);
    const alpha = 1 - bp;

    const flash = Math.max(0, 1 - bp * 3);
    if (flash > 0) {
      g.fillStyle = crit ? `rgba(255,235,190,${flash})` : `rgba(255,255,255,${flash * 0.9})`;
      g.beginPath(); g.arc(s.x2, s.y2, rad * (0.55 + flash * 0.55), 0, 7); g.fill();
    }

    g.fillStyle = crit ? `rgba(233,203,140,${alpha * 0.55})` : `rgba(150,210,235,${alpha * 0.5})`;
    g.beginPath(); g.arc(s.x2, s.y2, rad * 0.65, 0, 7); g.fill();
    g.strokeStyle = crit ? `rgba(255,215,120,${alpha})` : `rgba(150,210,235,${alpha})`;
    g.lineWidth = crit ? 3.5 : 2.5;
    g.beginPath(); g.arc(s.x2, s.y2, rad, 0, 7); g.stroke();
    const spokes = crit ? 12 : 8;
    for (let i = 0; i < spokes; i++) {
      const a = i * (Math.PI * 2 / spokes);
      g.beginPath();
      g.moveTo(s.x2 + Math.cos(a) * rad * 0.3, s.y2 + Math.sin(a) * rad * 0.3);
      g.lineTo(s.x2 + Math.cos(a) * rad, s.y2 + Math.sin(a) * rad);
      g.stroke();
    }
  }
}

/* ═══════ 타격 파편 & 화면 흔들림 — 명중 순간의 "묵직함"을 담당 ═══════ */
let sparks = [];
function spawnSparks(x, y, crit) {
  const n = crit ? 14 : 8;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const spd = (crit ? 90 : 55) + Math.random() * (crit ? 90 : 55);
    sparks.push({
      x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
      life: 0.22 + Math.random() * 0.16, max: 0.38,
      col: crit ? "#ffd782" : "#bfe6f5",
    });
  }
}
function stepSparks(dt) {
  for (const sp of sparks) {
    sp.x += sp.vx * dt; sp.y += sp.vy * dt;
    sp.vx *= 0.9; sp.vy *= 0.9;
    sp.life -= dt;
  }
  sparks = sparks.filter((sp) => sp.life > 0);
}
function drawSparks(g) {
  for (const sp of sparks) {
    const a = Math.max(0, sp.life / sp.max);
    g.fillStyle = sp.col.startsWith("#") ? hexA(sp.col, a) : sp.col;
    const rr = 1.6 * a + 0.4;
    g.beginPath(); g.arc(sp.x, sp.y, rr, 0, 7); g.fill();
  }
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

let shakeT = 0, shakeMag = 0;
function addShake(mag, dur) {
  shakeMag = Math.max(shakeMag, mag);   // 더 강한 흔들림이 있으면 그쪽을 따른다
  shakeT = Math.max(shakeT, dur);
}
function stepShake(dt) {
  if (shakeT <= 0) { shakeMag = 0; return; }
  shakeT -= dt;
  if (shakeT < 0) shakeT = 0;
}

function drawMonster(g, e, d, now) {
  const r = d.r;
  const bob = Math.sin(e.dist * 0.16) * r * 0.09;       // 이동 거리 기준 걸음 흔들림
  const legPhase = Math.sin(e.dist * 0.32);
  const slowed = e.slowT > 0;
  // 피격 펀치 — 맞은 직후 짧게 찌그러졌다 튕겨나오고(스쿼시), 맞은 반대쪽으로 살짝 밀린다
  const hitDur = e.hitCrit ? 0.22 : 0.14;
  const hitP = e.hitT > 0 ? e.hitT / hitDur : 0;         // 1(막 맞음) → 0(끝)
  const punch = Math.sin(hitP * Math.PI);                 // 0 → 1 → 0, 부드러운 펀치 곡선
  const kb = punch * (e.hitCrit ? 5 : 2.4);                // 넉백 거리
  g.save();
  g.translate(e.x - Math.cos(e.hitAng || 0) * kb, e.y - Math.sin(e.hitAng || 0) * kb);
  if (punch > 0) {
    g.translate(0, 0);
    const sx = 1 + punch * 0.22, sy = 1 - punch * 0.22;    // 가로로 눌리는 스쿼시
    g.scale(sx, sy);
  }

  // 바닥 그림자 — 캐릭터가 판 위에 실제로 서 있는 느낌
  g.save();
  g.globalAlpha = 0.24; g.fillStyle = "#0c1524";
  g.beginPath(); g.ellipse(0, r * 0.92, r * 0.5, r * 0.16, 0, 0, 7); g.fill();
  g.restore();

  g.translate(0, bob);

  if (punch > 0) {
    // 몸통 번쩍임 — 흰색(일반) / 금색(치명타) 실루엣 플래시로 "맞았다"를 즉시 알린다
    g.save();
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = punch * 0.85;
    g.fillStyle = e.hitCrit ? "#ffd782" : "#ffffff";
    g.beginPath(); g.arc(0, 0, r * 1.05, 0, 7); g.fill();
    g.restore();
  }

  switch (e.t) {
    case "copy": { // 도용업자 쥐 — 눈만 드러나는 마스크 + 훔친 설계도 두루마리
      drawLegs(g, r, legPhase);
      drawRatSilhouette(g, r, slowed);
      const w = r * 1.1, h = r * 1.5;
      g.fillStyle = "#0c0c0c";
      g.fillRect(-w * 0.34, -h * 0.14, w * 0.68, h * 0.13);
      // 훔친 설계도 두루마리 (옆구리)
      g.save(); g.translate(w * 0.5, h * 0.1); g.rotate(0.35);
      g.fillStyle = "#e8ddc4"; g.strokeStyle = "#0c1524"; g.lineWidth = 0.8;
      g.fillRect(-1.6, -r * 0.42, 3.2, r * 0.84); g.strokeRect(-1.6, -r * 0.42, 3.2, r * 0.84);
      g.restore();
      break;
    }
    case "fast": { // 벤치마킹업체 쥐 — 클립보드를 낀 채 전력질주, 잔상+속도선
      g.save();
      g.globalAlpha = 0.28; g.translate(-r * 0.7, 0); g.fillStyle = "#b09e8c";
      g.beginPath(); g.arc(0, 0, r * 0.55, 0, 7); g.fill();
      g.restore();

      drawLegs(g, r * 0.75, legPhase);
      g.save(); g.rotate(-0.14);
      drawRatSilhouette(g, r * 0.95, slowed);
      // 클립보드(경쟁사 분석 자료라며 들고 다니는 판)
      g.save(); g.translate(-r * 0.3, -r * 0.55); g.rotate(-0.25);
      g.fillStyle = "#e8ddc4"; g.strokeStyle = "#0c1524"; g.lineWidth = 0.8;
      g.fillRect(-r * 0.22, -r * 0.28, r * 0.44, r * 0.5); g.strokeRect(-r * 0.22, -r * 0.28, r * 0.44, r * 0.5);
      g.strokeStyle = "rgba(12,21,36,.5)"; g.lineWidth = 0.6;
      g.beginPath(); g.moveTo(-r * 0.14, -r * 0.14); g.lineTo(r * 0.14, -r * 0.14);
      g.moveTo(-r * 0.14, -r * 0.02); g.lineTo(r * 0.14, -r * 0.02); g.stroke();
      g.restore();
      g.restore();
      g.strokeStyle = "rgba(12,21,36,.45)"; g.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        g.beginPath(); g.moveTo(-r * 0.95 - i * 4, -r * 0.2 + i * 7); g.lineTo(-r * 1.4 - i * 4, -r * 0.2 + i * 7); g.stroke();
      }
      break;
    }
    case "tank": { // 특허괴물 쥐 — 귀 사이에 작은 뿔, 크고 묵직하다
      drawLegs(g, r * 1.1, legPhase * 0.5);
      drawRatSilhouette(g, r * 1.05, slowed);
      const rr = r * 0.95;
      g.fillStyle = "#e8ddc4"; g.strokeStyle = "rgba(0,0,0,.9)"; g.lineWidth = 1;
      g.beginPath(); g.moveTo(-rr * 0.32, -rr * 0.92); g.lineTo(-rr * 0.44, -rr * 1.35); g.lineTo(-rr * 0.14, -rr * 0.98); g.closePath();
      g.moveTo(rr * 0.32, -rr * 0.92); g.lineTo(rr * 0.44, -rr * 1.35); g.lineTo(rr * 0.14, -rr * 0.98); g.closePath();
      g.fill(); g.stroke();
      // 송곳니
      g.fillStyle = "#e8ddc4";
      g.beginPath(); g.moveTo(-rr * 0.14, rr * 0.32); g.lineTo(-rr * 0.06, rr * 0.5); g.lineTo(rr * 0.02, rr * 0.32); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(rr * 0.14, rr * 0.32); g.lineTo(rr * 0.06, rr * 0.5); g.lineTo(-rr * 0.02, rr * 0.32); g.closePath(); g.fill();
      break;
    }
    case "boss": { // 국제소송단 쥐 — 넥타이 + 국기색 위성(각국 소송팀)이 주위를 맴돈다
      const flagCols = ["#c4322a", "#5bc8e8", "#e8ddc4"];
      for (let i = 0; i < 3; i++) {
        const a = now * 0.0016 + i * (Math.PI * 2 / 3), ox = Math.cos(a) * r * 1.15, oy = Math.sin(a) * r * 0.7;
        g.save();
        g.globalAlpha = 0.9; g.fillStyle = flagCols[i]; g.strokeStyle = "rgba(12,21,36,.8)"; g.lineWidth = 0.8;
        g.beginPath(); g.arc(ox, oy, r * 0.14, 0, 7); g.fill(); g.stroke();
        g.restore();
      }
      drawLegs(g, r * 1.15, legPhase * 0.4);
      drawRatSilhouette(g, r * 1.2, slowed);
      // 넥타이
      g.fillStyle = "#c4322a";
      g.beginPath(); g.moveTo(-r * 0.08, r * 0.02); g.lineTo(r * 0.08, r * 0.02); g.lineTo(0, r * 0.55); g.closePath(); g.fill();
      // 지구본 표식
      g.strokeStyle = "#e8ddc4"; g.lineWidth = 0.9;
      g.beginPath(); g.arc(0, r * 0.72, r * 0.16, 0, 7); g.stroke();
      g.beginPath(); g.moveTo(-r * 0.16, r * 0.72); g.lineTo(r * 0.16, r * 0.72); g.stroke();
      break;
    }
    default: {
      drawRatSilhouette(g, r, slowed);
    }
  }

  // 가처분으로 묶인 상태 — 각진 얼음에 갇힌 실루엣
  if (e.freezeT > 0) {
    g.save();
    g.globalAlpha = 0.62;
    g.fillStyle = "#a8ddf2";
    g.beginPath();
    g.moveTo(0, -r * 1.25); g.lineTo(r * 1.05, -r * 0.35);
    g.lineTo(r * 0.72, r * 1.1); g.lineTo(-r * 0.72, r * 1.1);
    g.lineTo(-r * 1.05, -r * 0.35); g.closePath(); g.fill();
    g.globalAlpha = 0.95;
    g.strokeStyle = "#eafaff"; g.lineWidth = 1.4; g.stroke();
    g.globalAlpha = 0.7; g.lineWidth = 1;
    g.beginPath();
    g.moveTo(-r * 0.5, -r * 0.9); g.lineTo(r * 0.35, r * 0.75);
    g.moveTo(r * 0.55, -r * 0.75); g.lineTo(-r * 0.3, r * 0.85);
    g.stroke();
    g.restore();
  }
  g.restore();
}

/** 캔버스 위를 떠다니는 짧은 텍스트 */
const floaters = [];

/* ═══════ 이벤트 → 연출 ═══════ */
function consumeEvents() {
  for (const ev of game.drainEvents()) {
    switch (ev.t) {
      case "kill":
        floaters.push({ x: ev.x, y: ev.y, txt: "+" + ev.reward, col: "#cda43a", life: .8 });
        break;
      case "leak":
        floaters.push({ x: ev.x, y: ev.y, txt: "돌파!", col: "#e0574d", life: .8 });
        break;
      case "void":
        log(`<b style="color:#e0574d">무효심결</b> ${ev.name} ${BAL.voidWaves}웨이브 정지`);
        break;
      case "fee":
        floaters.push({ x: ev.x, y: ev.y, txt: `−${ev.amount}`, col: "#e0574d", life: 1.0 });
        addShake(4, .2);
        log(ev.gold < 0
          ? `<b style="color:#e0574d">${ev.name}</b> 합의금 ${ev.amount} 징수 — 특허료가 <b style="color:#e0574d">${Math.floor(ev.gold)}</b>, 빚으로 남았습니다`
          : `<b style="color:#e0574d">${ev.name}</b> 합의금 ${ev.amount} 징수 (잔고 ${Math.floor(ev.gold)})`);
        renderHud();
        break;
      case "buy":
        log(`<b>심사관 임용</b> ${ev.name} 배치 (−${ev.cost})`);
        break;
      case "expand":
        log(`<b>${ev.name}</b> ${ev.cells}칸 개방 (−${ev.cost})`);
        break;
      case "skill": {
        const bb = $("#board").getBoundingClientRect();
        if (ev.kind === "freeze") {
          skillFx.push({ kind: "freeze", life: .6, max: .6, x: 0, y: 0, r: 0 });
          stamp(bb.left + bb.width / 2, bb.top + bb.height / 2, "假處分", ev.name);
          log(`<b style="color:#8fd8f0">${ev.name}</b> 집행 — 침입자 ${ev.hit}건 ${ev.dur}초 이동정지 (−${ev.cost})`);
        } else {
          skillFx.push({ kind: "purge", life: .5, max: .5, x: ev.x, y: ev.y, r: ev.radius });
          spawnSparks(ev.x, ev.y, true);
          addShake(6, .26);
          floaters.push({ x: ev.x, y: ev.y, txt: `폐기 ${ev.killed}`, col: "#ffd782", life: .9 });
          stamp(bb.left + ev.x, bb.top + ev.y, "廢 棄", ev.name);
          log(`<b style="color:#e0574d">${ev.name}</b> 집행 — 범위 내 ${ev.hit}건 중 ${ev.killed}건 제거 (−${ev.cost})`);
        }
        break;
      }
      case "wave_start":
        log(`<b>웨이브 ${ev.wave}</b> 개시 · 침입 ${ev.count}건 · 동선 ${ev.path}칸 (제압 ${ev.covered}칸)`);
        break;
      case "wave_end":
        log(`웨이브 ${ev.wave} 방어 완료 · 수입 <b>+${ev.income}</b>`);
        if (game.awaitingPassive) openPassiveModal();
        break;
      case "over":
        sendWS({ t: ev.win ? "won" : "lost" });
        endMatch(ev.win, ev.win ? "특허 등록을 완료했습니다!" : "등록원부가 무너졌습니다.");
        break;
    }
  }
}

/* ═══════ 루프 ═══════ */
let last = 0;
function loop() {
  if (!game) return;
  const now = performance.now();
  const dt = Math.min(.05, (now - (last || now)) / 1000);
  last = now;

  if (game.phase === "wave") {
    for (let i = 0; i < speed; i++) {
      if (!game.tick(dt, now)) break;
    }
    renderHud();
  }
  for (let i = floaters.length - 1; i >= 0; i--) {
    floaters[i].life -= dt;
    if (floaters[i].life <= 0) floaters.splice(i, 1);
  }
  stepSparks(dt);
  stepShake(dt);
  stepSkillFx(dt);

  consumeEvents();
  draw(now);
  drawOpponent(now);
  maybeSendState(now);
}

/** 상대에게 내 보드 스냅샷을 초당 몇 번만 보낸다 (전투 자체는 각자 클라이언트가 계산) */
function maybeSendState(now) {
  if (now - lastStateSentAt < 350) return;
  lastStateSentAt = now;
  const snap = {
    hp: game.hp, maxHp: game.maxHp, wave: game.wave, phase: game.phase,
    pieces: B.placed(game).filter((p) => !p.void).map((p) => ({ k: p.key, x: p.x, y: p.y })),
    enemies: game.enemies.map((e) => ({ t: e.t, x: Math.round(e.x), y: Math.round(e.y), hp: e.hp / e.max })),
    cols: game.cols, rows: game.rows, layout: game.map.layout,
  };
  sendWS({ t: "state", snap });
}

/* ═══════ 드래그 ═══════ */
/**
 * 드래그를 시작한다. srcEl을 주면 그 요소를(예: 방금 만들어진 트레이 타일) 유령으로 쓴다 —
 * 냥타워 패널 카드에서 곧바로 드래그를 시작할 때 쓴다.
 */
function startDrag(e, p, srcEl) {
  if (game.phase !== "prep") return;
  e.preventDefault(); hideTip();
  const el = srcEl || /** @type {HTMLElement} */ (e.currentTarget);
  const r = el.getBoundingClientRect();
  const ghost = /** @type {HTMLElement} */ (el.cloneNode(true));
  ghost.classList.add("drag");
  ghost.style.position = "fixed";
  ghost.style.width = r.width + "px";
  ghost.style.height = r.height + "px";
  document.body.appendChild(ghost);
  dragging = { p, ghost, ox: r.width / 2, oy: r.height / 2 };
  el.style.visibility = "hidden";
  moveDrag(e);
  window.addEventListener("pointermove", moveDrag);
  window.addEventListener("pointerup", endDrag);
}
const cellEl = (x, y) => $(`#board .cell[data-x="${x}"][data-y="${y}"]`);
function dropTarget(e) {
  const bb = $("#board").getBoundingClientRect();
  const x = Math.floor((e.clientX - bb.left) / (CS + GAP));
  const y = Math.floor((e.clientY - bb.top) / (CS + GAP));
  // 판 밖으로 끌어내면 대기열로 회수한다. (대기열이 비어 있을 때는 상자를 숨기므로,
  //  예전처럼 대기열 사각형 안에 정확히 떨어뜨리게 하면 회수할 방법이 없어진다.)
  if (x < 0 || y < 0 || x >= game.cols || y >= game.rows) return { type: "tray" };
  return { type: "cell", x, y };
}
function moveDrag(e) {
  if (!dragging) return;
  dragging.ghost.style.left = (e.clientX - dragging.ox) + "px";
  dragging.ghost.style.top = (e.clientY - dragging.oy) + "px";
  const t = dropTarget(e);
  document.querySelectorAll(".cell").forEach((c) => c.classList.remove("hint", "bad"));
  if (t && t.type === "cell") {
    const ok = B.legal(game, dragging.p, t.x, t.y, dragging.p);
    for (let dy = 0; dy < dragging.p.h; dy++)
      for (let dx = 0; dx < dragging.p.w; dx++) {
        const c = cellEl(t.x + dx, t.y + dy);
        if (c) c.classList.add(ok ? "hint" : "bad");
      }
  }
}
function endDrag(e) {
  window.removeEventListener("pointermove", moveDrag);
  window.removeEventListener("pointerup", endDrag);
  if (!dragging) return;
  const t = dropTarget(e), p = dragging.p;
  dragging.ghost.remove();
  document.querySelectorAll(".cell").forEach((c) => c.classList.remove("hint", "bad"));

  if (t && t.type === "cell") {
    const wasNew = p.x < 0;
    if (game.place(p, t.x, t.y) && wasNew) {
      log(`<b>${CATS[p.key].name} 배치</b> — ${CATS[p.key].desc}`);
      stamp(/** @type {PointerEvent} */ (e).clientX, /** @type {PointerEvent} */ (e).clientY, "任 用", CATS[p.key].name);
    }
  } else if (t && t.type === "tray") {
    game.unplace(p);
  }
  dragging = null;
  render();
}

/* ═══════ 보조 UI ═══════ */
function stamp(x, y, txt, sub) {
  const d = document.createElement("div");
  d.className = "seal";
  d.style.left = x + "px"; d.style.top = y + "px";
  d.innerHTML = `<b>${txt}</b><i>${sub}</i>`;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 800);
}
function log(html) {
  const l = $("#log");
  if (!l) return; // 심사현황 패널이 빠지면서 로그 표시 영역도 함께 없어졌다
  const d = document.createElement("div");
  d.innerHTML = html;
  l.appendChild(d);
  l.scrollTop = l.scrollHeight;
  while (l.children.length > 60) l.firstChild.remove();
}
function showTip(e, p) {
  if (dragging) return;
  const t = $("#tip");
  const d = CATS[p.key];
  t.innerHTML = `<b>${d.name}</b> — ${d.tag}<i>${d.desc}</i><i>1칸짜리 벽이기도 하다.</i>
    ${p.void ? `<i style="color:#e0574d">무효 상태 · ${p.void}웨이브 남음</i>` : ""}`;
  t.style.display = "block";
  t.style.left = Math.min(e.clientX + 14, innerWidth - 244) + "px";
  t.style.top = Math.min(e.clientY + 14, innerHeight - 120) + "px";
}
const hideTip = () => { $("#tip").style.display = "none"; };

function endMatch(iWon, reasonText) {
  const s = game.summary();
  $("#sheet").innerHTML = `<div class="end">
    <h3 style="color:${iWon ? "#cda43a" : "#e0574d"}">${iWon ? "登錄 決定 — 승리" : "拒 絶 決 定 — 패배"}</h3>
    <p style="color:var(--muted);font-size:12.5px;margin:0 0 14px">${reasonText}</p>
    <div class="kv" style="max-width:250px;margin:0 auto 16px;text-align:left">
      <span>처치</span><b>${s.killed}</b><span>돌파 허용</span><b>${s.leaked}</b>
      <span>최종 동선</span><b>${s.totalPath}칸 (제압 ${s.covered})</b>
      <span>최종 제압률</span><b>${Math.round(s.cover * 100)}%</b>
      <span>배치 심사관</span><b>${s.cats}명</b>
      <span>특허권 행사</span><b>${s.skillTotal}회 (가처분 ${s.skillUses.injunction} · 폐기 ${s.skillUses.scrap})</b></div>
    <button class="go" id="again" style="padding:10px 26px">로비로</button></div>`;
  $("#modal").classList.add("on");
  $("#again").addEventListener("click", () => location.reload());
}

/* ═══════ 특허권 행사 (액티브 스킬) ═══════ */
/**
 * 스킬 버튼은 판이 시작될 때 한 번만 만든다.
 * 남은 대기시간처럼 매 프레임 바뀌는 것만 updateSkillBar()가 손본다 —
 * 60fps로 innerHTML을 다시 그리면 마우스 오버가 계속 끊기기 때문이다.
 */
function buildSkillBar() {
  const el = $("#skillBar");
  if (!el) return;
  el.innerHTML = Object.keys(SKILLS).map((k, i) => {
    const d = SKILLS[k];
    return `<button class="skill" data-k="${k}" type="button">
      <span class="cdfill"></span>
      <span class="ic">${d.icon}</span>
      <span class="meta">
        <b>${d.name}<span class="tag">${d.tag}</span></b>
        <i>${d.target === "point" ? "범위 지정" : "즉시 · 전체"} · 대기 ${d.cd}s · 단축키 ${i + 1}</i>
      </span>
      <span class="right">
        <span class="cost">₩${d.cost}</span>
        <span class="state">웨이브 중 사용</span>
      </span>
    </button>`;
  }).join("");

  el.querySelectorAll(".skill").forEach((b) => {
    const key = /** @type {HTMLElement} */ (b).dataset.k;
    b.addEventListener("click", () => onSkillClick(key));
    b.addEventListener("pointerenter", (e) => showSkillTip(e, SKILLS[key]));
    b.addEventListener("pointerleave", hideTip);
  });
  updateSkillBar();
}

function updateSkillBar() {
  if (!game) return;
  for (const k in SKILLS) {
    const b = /** @type {HTMLButtonElement} */ ($(`#skillBar .skill[data-k="${k}"]`));
    if (!b) continue;
    const d = SKILLS[k];
    const cd = game.skillCd[k] || 0;
    const blocked = game.skillBlocked(k);
    b.disabled = !!blocked;
    b.classList.toggle("armed", armedSkill === k);
    b.querySelector(".state").textContent = blocked || (d.target === "point" ? "판을 찍으세요" : "사용 가능");
    /** @type {HTMLElement} */ (b.querySelector(".cdfill")).style.width =
      cd > 0 ? `${Math.min(100, (cd / d.cd) * 100)}%` : "0%";
  }
}

function showSkillTip(e, d) {
  if (dragging) return;
  const t = $("#tip");
  t.innerHTML = `<b>${d.name}</b> — ${d.tag}<i>${d.desc}</i>
    <i>특허료 ${d.cost} · 재사용 대기 ${d.cd}초 (웨이브가 끝나면 초기화)</i>`;
  t.style.display = "block";
  t.style.left = Math.min(e.clientX + 14, innerWidth - 264) + "px";
  t.style.top = Math.min(e.clientY + 14, innerHeight - 150) + "px";
}

/** 버튼을 눌렀을 때 — 전체 스킬은 즉시, 범위 스킬은 조준 상태로 들어간다 */
function onSkillClick(key) {
  const d = SKILLS[key];
  if (!d) return;
  const blocked = game.skillBlocked(key);
  if (blocked) { log(`<b>${d.name}</b> 사용 불가 — ${blocked}`); return; }

  if (d.target === "point") {
    armedSkill = armedSkill === key ? null : key;
    aimPt = null;
    $("#board").classList.toggle("aiming", !!armedSkill);
    if (armedSkill) log(`<b>${d.name}</b> 범위를 지정하세요 — 판 위를 클릭 (Esc / 우클릭 취소)`);
    updateSkillBar();
    return;
  }
  fireSkill(key, null);
}

function disarmSkill() {
  if (!armedSkill) return;
  armedSkill = null; aimPt = null;
  $("#board").classList.remove("aiming");
  updateSkillBar();
}

function fireSkill(key, pt) {
  if (!game.useSkill(key, pt)) return false;
  disarmSkill();
  renderHud();
  return true;
}

/** 보드 기준 픽셀 좌표 — fx 캔버스와 좌표계가 정확히 같다 */
function boardPoint(e) {
  const bb = $("#board").getBoundingClientRect();
  return [e.clientX - bb.left, e.clientY - bb.top];
}

/** 판 위 조준·발사 입력을 건다. 판을 만든 뒤 한 번만 부른다. */
function bindSkillAiming() {
  const b = $("#board");
  b.addEventListener("pointermove", (e) => { if (armedSkill) aimPt = boardPoint(e); });
  b.addEventListener("pointerleave", () => { aimPt = null; });
  // 캡처 단계에서 잡는다 — 조준 중에는 아래에 있는 심사관 타일이 드래그로 반응하지 않도록
  b.addEventListener("pointerdown", (e) => {
    if (!armedSkill) return;
    if (e.button === 2) { e.preventDefault(); disarmSkill(); return; }
    e.preventDefault(); e.stopPropagation();
    fireSkill(armedSkill, boardPoint(e));
  }, true);
  b.addEventListener("contextmenu", (e) => { if (armedSkill) { e.preventDefault(); disarmSkill(); } });

  window.addEventListener("keydown", (e) => {
    if (!game) return;
    if (e.key === "Escape") { disarmSkill(); return; }
    const keys = Object.keys(SKILLS);
    const i = Number(e.key) - 1;
    if (Number.isInteger(i) && i >= 0 && i < keys.length) onSkillClick(keys[i]);
  });
}

/** 스킬 연출 진행 */
function stepSkillFx(dt) {
  for (const f of skillFx) f.life -= dt;
  skillFx = skillFx.filter((f) => f.life > 0);
}

/** 조준 원 + 스킬 연출을 판 위에 그린다 */
function drawSkillFx(g, now) {
  for (const f of skillFx) {
    const p = 1 - f.life / f.max;              // 0 → 1
    if (f.kind === "freeze") {
      const { w, h } = fxCanvasSize();
      g.save();
      g.globalAlpha = (1 - p) * 0.34;
      g.fillStyle = "#9fdcf2"; g.fillRect(0, 0, w, h);
      g.globalAlpha = (1 - p) * 0.8;
      g.strokeStyle = "#e8fbff"; g.lineWidth = 3;
      g.strokeRect(2, 2, w - 4, h - 4);
      g.restore();
    } else {
      // 폐기명령 — 안쪽이 차오르고 테두리가 퍼지는 충격파
      g.save();
      g.globalAlpha = (1 - p) * 0.5;
      g.fillStyle = "#c4322a";
      g.beginPath(); g.arc(f.x, f.y, f.r * (1 - p * 0.25), 0, 7); g.fill();
      g.globalAlpha = 1 - p;
      g.strokeStyle = "#ffd782"; g.lineWidth = 3 * (1 - p) + 1;
      g.beginPath(); g.arc(f.x, f.y, f.r * (0.55 + p * 0.6), 0, 7); g.stroke();
      g.restore();
    }
  }

  if (armedSkill && aimPt) {
    const d = SKILLS[armedSkill];
    const pulse = 1 + Math.sin(now * 0.006) * 0.02;
    g.save();
    g.globalAlpha = 0.9;
    g.strokeStyle = "#c4322a"; g.lineWidth = 2; g.setLineDash([7, 5]);
    g.beginPath(); g.arc(aimPt[0], aimPt[1], (d.radius || 60) * pulse, 0, 7); g.stroke();
    g.setLineDash([]);
    g.fillStyle = "rgba(196,50,42,.12)";
    g.beginPath(); g.arc(aimPt[0], aimPt[1], (d.radius || 60) * pulse, 0, 7); g.fill();
    // 십자선
    g.strokeStyle = "rgba(196,50,42,.85)"; g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(aimPt[0] - 10, aimPt[1]); g.lineTo(aimPt[0] + 10, aimPt[1]);
    g.moveTo(aimPt[0], aimPt[1] - 10); g.lineTo(aimPt[0], aimPt[1] + 10);
    g.stroke();
    g.restore();
  }
}

/** 냥타워 패널: 카드를 탭하면 그 자리에서 바로 구매·배치한다 */
function renderCatRoster() {
  const prep = game.phase === "prep" && !game.awaitingPassive;
  $("#catRoster").innerHTML = Object.keys(CATS).map((k) => {
    const d = CATS[k];
    const cost = game.catCost(k);
    const afford = prep && game.gold >= cost;
    return `<div class="pick" data-k="${k}" style="position:relative;text-align:left;cursor:grab;touch-action:none;
      ${afford ? "" : "opacity:.45;cursor:not-allowed;pointer-events:none"}">
      ${prep && !afford ? '<span style="position:absolute;top:6px;right:8px;font-size:9px;color:#c4322a">자금 부족</span>' : ""}
      <div style="display:flex;align-items:center;gap:8px">
        <span class="ic" style="margin:0;font-size:22px">${d.icon}</span>
        <div style="min-width:0">
          <span class="nm" style="display:block">${d.name}</span>
          <span class="ef" style="color:#8a7c5e;font-family:var(--mono);font-size:9.5px;display:block">${d.tag}${d.kind === "buff" ? " · 비공격" : ""}</span>
        </div>
        <span class="ef" style="margin-left:auto;color:#3f5a2f;font-weight:700;white-space:nowrap">₩${cost.toLocaleString()}</span>
      </div>
      <span class="fl" style="font-style:normal;color:#5b4f36;display:block;margin-top:5px">${d.desc}</span>
    </div>`;
  }).join("");
  $("#catRoster").querySelectorAll(".pick").forEach((el) => {
    el.addEventListener("click", (ev) => {
      const key = /** @type {HTMLElement} */ (el).dataset.k;
      if (game.phase !== "prep" || game.awaitingPassive || game.gold < game.catCost(key)) return;
      const p = game.buyCat(key);
      if (!p) return;
      render();
      if (p.x >= 0) {
        const [cx, cy] = B.pieceCenter(p);
        const bb = $("#board").getBoundingClientRect();
        log(`<b>${CATS[key].name} 배치</b> — ${CATS[key].desc}`);
        stamp(bb.left + cx, bb.top + cy, "任 用", CATS[key].name);
      } else {
        log(`<b>심사관 임용</b> ${CATS[key].name} — 판이 가득 차서 대기열에 놓였습니다. 드래그해서 배치하세요.`);
      }
    });
    el.addEventListener("pointerenter", (e) => showTip(e, { key: /** @type {HTMLElement} */ (el).dataset.k }));
    el.addEventListener("pointerleave", hideTip);
  });
}

/** 웨이브 클리어 시 뜨는 패시브 선택 모달 */
function openPassiveModal() {
  $("#sheet").innerHTML = `<h3>웨이브 ${game.wave} 클리어 — 효과를 하나 고르세요</h3>
    <div class="picks" style="grid-template-columns:repeat(3,1fr)">${PASSIVES.map((def) => `
      <div class="pick" data-k="${def.key}">
        <span class="nm">${def.name}</span>
        <span class="ef" style="color:${def.side === "self" ? "#3f5a2f" : "#8a2a24"}">${def.desc}</span>
        <span class="fl">${def.detail}</span>
      </div>`).join("")}</div>`;
  $("#modal").classList.add("on");
  $("#sheet").querySelectorAll(".pick").forEach((el) => {
    el.addEventListener("click", () => {
      const def = PASSIVE_BY_KEY[/** @type {HTMLElement} */ (el).dataset.k];
      game.applyPassive(def);
      sendWS({ t: "passive", key: def.key });
      $("#modal").classList.remove("on");
      log(def.side === "self" ? `<b>${def.name}</b> 선택 — ${def.desc}` : `<b>${def.name}</b> 선택 — 상대에게 전달됩니다.`);
      renderPassiveTags();
      $("#phaseLbl").textContent = "준비 단계";
      btn("#btnGo").textContent = `웨이브 ${game.wave + 1} 개시`;
      render();
    });
  });
}
function renderPassiveTags() {
  // 내 목록에는 "상대가 나에게 건 약화"도 섞여 들어온다 — 그건 내 입장에서 읽히도록 문구를 뒤집는다
  const lasting = (d) => d.stat !== "hp";   // 내구 증감은 즉시 한 번으로 끝난다 — 목록에 남기지 않는다
  const mine = game.myPassives.filter(lasting).map((d) => {
    const txt = d.side === "foe" ? d.desc.replace("상대", "내") : d.desc;
    return tagHtml(d.name, txt, d.side === "foe");
  }).join("");
  const theirs = game.foePassives.filter(lasting).map((d) => tagHtml(d.name, d.desc, true)).join("");
  const none = `<span class="none">없음</span>`;
  $("#myPassiveTags").innerHTML = mine || none;
  $("#foePassiveTags").innerHTML = theirs || none;
}
/** 효과 태그 한 칸 — 이름과 실제로 무엇이 바뀌는지를 같이 보여준다 */
function tagHtml(name, desc, bad) {
  return `<span class="${bad ? "bad" : ""}"><b>${name}</b><i>${desc}</i></span>`;
}

/**
 * 냥타워 스프라이트를 종류별 색보정(filter)까지 입혀 캐시해 둔다.
 * 판 위 심사관은 조각마다 캔버스를 하나씩 들고 거기에 filter를 걸어 그리는데,
 * 미니맵은 캔버스 하나에 전부 그리므로 미리 구워둔 이미지를 붙이는 편이 낫다.
 * 이게 없으면 스프라이트 시트에서 색보정 없는 같은 칸만 나와 여섯 종류가 전부 똑같이 보인다.
 * @returns {HTMLCanvasElement|null} 스프라이트가 아직 안 올라왔으면 null
 */
const catFrameCache = new Map();
function catFrameCanvas(key, row, frame) {
  if (!CATS[key]) return null;
  const id = `${key}:${row}:${frame}`;
  const hit = catFrameCache.get(id);
  if (hit) return hit;
  if (!sprite.complete || !sprite.naturalWidth) return null;   // 아직 로딩 중 — 캐시하지 않는다
  const cv = document.createElement("canvas");
  cv.width = 64; cv.height = 64;
  const cg = cv.getContext("2d");
  cg.filter = CATS[key].filter || "none";
  cg.drawImage(sprite, frame * 64, row * 64, 64, 64, 0, 0, 64, 64);
  cg.filter = "none";
  catFrameCache.set(id, cv);
  return cv;
}

/** 상대 보드 미니맵 — 상대에게서 받은 스냅샷을 그린다 (상대 클라이언트가 계산한 결과를 그대로 그림) */
function drawOpponent(now) {
  const cv = /** @type {HTMLCanvasElement} */ ($("#oppCv"));
  const g = cv.getContext("2d");
  g.clearRect(0, 0, cv.width, cv.height);
  if (!oppSnapshot) {
    g.fillStyle = "rgba(90,80,60,.5)"; g.font = "12px sans-serif"; g.textAlign = "center";
    g.fillText("상대 정보를 기다리는 중…", cv.width / 2, cv.height / 2);
    return;
  }
  const s = oppSnapshot;
  const cell = Math.min(cv.width / s.cols, cv.height / s.rows);
  const ox = (cv.width - cell * s.cols) / 2, oy = (cv.height - cell * s.rows) / 2;
  g.save(); g.translate(ox, oy);

  // 바닥 — 실제 판과 같은 톤: 통로 / 심사관 터 / 성문 / 등록원부를 색으로 구분
  s.layout.forEach((line, y) => [...line].forEach((ch, x) => {
    const checker = (x + y) % 2 === 0;
    let col;
    if (ch === "G") col = "#b7d0af";
    else if (ch === "X") col = "#e9cb8c";
    else if (ch === "T") col = checker ? "#b5d3a8" : "#a9c99c";   // 심사관 터 — 초록
    else if (ch === "#") col = "#e5dbc2"; // 아래서 해치무늬로 다시 덮인다
    else col = checker ? "#e8dcc4" : "#ddcfa9";                    // 통로 — 침입자용
    g.fillStyle = col;
    g.fillRect(x * cell, y * cell, cell, cell);
  }));
  // 벽 — 실제 판과 같은 해치 패턴
  s.layout.forEach((line, y) => [...line].forEach((ch, x) => {
    if (ch !== "#") return;
    g.fillStyle = "#92a8a0";
    g.fillRect(x * cell, y * cell, cell, cell);
    g.strokeStyle = "#a8bcb4"; g.lineWidth = Math.max(1, cell * 0.05);
    g.save();
    g.beginPath(); g.rect(x * cell, y * cell, cell, cell); g.clip();
    for (let i = -cell; i < cell * 2; i += cell * 0.22) {
      g.beginPath();
      g.moveTo(x * cell + i, y * cell + cell);
      g.lineTo(x * cell + i + cell, y * cell);
      g.stroke();
    }
    g.restore();
  }));

  // 심사관 — 내 판에 놓인 것과 같은 타일·같은 스프라이트·같은 색보정으로 그린다
  for (const p of s.pieces) {
    const def = CATS[p.k]; if (!def) continue;
    const cx = (p.x + 0.5) * cell, cy = (p.y + 0.5) * cell;
    const pad = cell * 0.06, tile = cell - pad * 2;

    // 종이 타일 + 붉은 테두리 — 내 판의 .piece.cat 과 같은 모양
    g.fillStyle = "#f2ecdb";
    g.fillRect(cx - tile / 2, cy - tile / 2, tile, tile);
    g.strokeStyle = "#c4322a"; g.lineWidth = Math.max(1, cell * 0.045);
    g.strokeRect(cx - tile / 2, cy - tile / 2, tile, tile);

    // 대기 애니메이션 프레임까지 같이 맞춘다 (uid 대신 좌표로 위상을 흩뿌린다)
    const [row, fr] = frameOf({ key: p.k, uid: p.x * 31 + p.y * 7, atkEnd: 0 }, now || 0);
    const img = catFrameCanvas(p.k, row, fr);
    if (img) {
      const sz = tile * 1.02;
      g.drawImage(img, cx - sz / 2, cy - sz / 2, sz, sz);
    } else {
      g.fillStyle = def.kind === "buff" ? "#f4b740" : "#5bc8e8";
      g.beginPath(); g.arc(cx, cy, cell * 0.26, 0, 7); g.fill();
    }
  }
  // 침입자 — 실제 쥐 실루엣 그대로 (작게)
  for (const e of s.enemies) {
    const d = ENEMIES[e.t]; if (!d) continue;
    const cx = (e.x / (BAL.cellSize + BAL.cellGap)) * cell, cy = (e.y / (BAL.cellSize + BAL.cellGap)) * cell;
    g.save();
    g.translate(cx, cy);
    g.scale(cell / 64, cell / 64);
    drawRatSilhouette(g, 15 * (d.r / 18), false);
    g.restore();
  }
  g.restore();
}

/* ═══════ 대전 시작 ═══════ */
function beginBattle() {
  $("#lobby").classList.add("hidden");
  $("#gameRoot").classList.remove("hidden");

  game = new Game({ map: "complex" });
  floaters.length = 0;
  sparks = [];
  skillFx = [];
  armedSkill = null; aimPt = null;
  shakeT = 0; shakeMag = 0;
  $("#phaseLbl").textContent = "준비 단계";
  btn("#btnGo").textContent = "웨이브 1 개시";
  $("#mapName").textContent = game.map.name;
  $("#oppLabel").textContent = youAre === "p1" ? "OPPONENT (후)" : "OPPONENT (선)";
  log(`<b>${game.map.name}</b> 방위 개시 · ${game.map.desc}`);
  buildBoardCells();
  bindSkillAiming();
  buildSkillBar();
  render();
  renderPassiveTags();
  setInterval(loop, 1000 / 60);
}

$("#btnGo").addEventListener("click", () => {
  if (game.awaitingPassive) return;
  if (!game.startWave()) { log("동선이 막혀 있습니다."); return; }
  $("#phaseLbl").textContent = `웨이브 ${game.wave} 진행 중`;
  btn("#btnGo").textContent = "심사 중…";
  render();
});
$("#btnSpeed").addEventListener("click", (e) => {
  speed = speed === 1 ? 2 : speed === 2 ? 3 : 1;
  /** @type {HTMLElement} */ (e.target).textContent = "속도 ×" + speed;
});

// 침입자 도감 — 이모지 대신 실제 인게임 몬스터 디자인을 미니 초상화로 그린다
function renderBestiary() {
  const PORT = 72;
  const el = $("#bestiary");
  el.innerHTML = Object.keys(ENEMIES).map((k) => {
    const e = ENEMIES[k];
    return `<div class="beast-row">
      <canvas class="beast-cv" data-t="${k}" width="${PORT}" height="${PORT}"></canvas>
      <div><div class="beast-name">${e.nm}
        <span class="beast-stat">HP ${e.hp}·방어 ${e.def}</span></div>
      <div class="beast-desc">${e.desc}</div></div>
    </div>`;
  }).join("");
  el.querySelectorAll(".beast-cv").forEach((cv) => {
    const t = /** @type {HTMLElement} */ (cv).dataset.t, d = ENEMIES[t];
    const ctx = /** @type {HTMLCanvasElement} */ (cv).getContext("2d");
    const cx = PORT / 2, cy = PORT / 2 + 6;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy - 4, PORT * 0.42, 0, 7);
    ctx.fillStyle = d.col + "26"; ctx.fill();
    ctx.restore();
    drawMonster(ctx, { t, x: cx, y: cy, dist: 0, hitT: 0, hitCrit: false, slowT: 0, hitAng: 0 }, d, performance.now());
  });
}
renderBestiary();

/* ═══════ 로비 ═══════ */
connectWS();
$("#btnCreate").addEventListener("click", () => sendWS({ t: "create" }));
$("#btnJoin").addEventListener("click", () => {
  const code = /** @type {HTMLInputElement} */ ($("#joinCode")).value.trim();
  if (code.length !== 4) {
    $("#joinError").textContent = "4자리 코드를 입력하세요.";
    $("#joinError").classList.remove("hidden");
    return;
  }
  $("#joinError").classList.add("hidden");
  sendWS({ t: "join", code });
});

onSpriteReady(() => { if (game) render(); });

return {};
})();
