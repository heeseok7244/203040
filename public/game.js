const __mods = {}; const __req = (id) => { const m = __mods[id]; if (!m) throw new Error("모듈을 찾을 수 없습니다: " + id); return m; };
__mods["core/rng.js"] = (function(){
// @ts-check
/**
 * 시드 고정 난수. 밸런스 실행을 재현 가능하게 만드는 핵심.
 * 같은 시드 → 같은 웨이브 구성, 같은 드래프트.
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
 * weight    0 이면 임용 카드에 나오지 않는다 (= 합성으로만 얻는 특수 냥타워).
 *           0 이 아닌 값은 「흔한 냥을 위에」 놓는 정렬 힌트로만 쓴다.
 * @type {Record<string, {name:string,row:number,arow:number,dmg:number,rate:number,range:number,
 *   tag:string,desc:string,cost:number,kind:string,weight:number,pierce?:number,targets?:number,
 *   critC?:number,critM?:number,slow?:number,auraDmg?:number,auraRate?:number,filter?:string}>}
 */
const CATS = {
  /*
   * 출원냥 — **한 방이 무겁고 느린** 물리형. 💥 침해 계열의 주인공이다.
   * 예전에는 dmg 12 / rate 2.0 의 「무난한 중간」이라 아무 빌드도 대표하지 못했다.
   * 지금은 같은 DPS를 한 발에 몰아 담아, 방어력을 뚫는 힘(26 − 방어 8 = 18)과
   * **방사 피해 배율의 기준**을 동시에 쥔다 — 방사는 직격 피해에 비례하므로
   * 한 방이 무거울수록 광역이 세진다. 「균등침해」·「손해액 산정」을 모으면
   * 한 발이 무리를 통째로 쓸어 버리는 쪽으로 자란다.
   */
  spec: {
    name: "출원냥", row: 2, arow: 3, kind: "atk",
    dmg: 26, rate: 0.85, range: 118, tag: "중타", cost: 55, weight: 30,
    critC: 0.12, critM: 2.0,
    desc: "한 방이 무겁고 느리다. 방사 피해를 얹으면 무리를 통째로 쓸어 담는다.",
    filter: "none",
    icon: "📄",
  },
  /*
   * 특허범위냥 — 가장 느린 저격수. 📐 권리범위 계열의 주인공이다.
   * 한 발에 몰아 담아(dmg 15 / rate 0.45) 방어무시(pierce)가 실제로 값을 하도록 했다 —
   * 방어는 **명중마다** 깎이므로, 잘게 여러 번 때리는 냥에게는 방어무시가 큰 의미가 없다.
   */
  claim: {
    name: "특허범위냥", row: 2, arow: 3, kind: "atk",
    dmg: 15, rate: 0.45, range: 304, pierce: 35, tag: "저격", cost: 85, weight: 15,
    critC: 0.22, critM: 2.2,
    desc: "아주 느리지만 사거리가 길고 방어를 무시한다. 사거리·방어무시를 쌓을수록 세진다.",
    filter: "hue-rotate(195deg) saturate(1.25)",
    icon: "📐",
  },
  pct: {
    name: "국제출원냥", row: 2, arow: 3, kind: "atk",
    dmg: 7, rate: 1.6, range: 118, targets: 3, tag: "다중조준", cost: 190, weight: 5,
    critC: 0.12, critM: 1.6,
    desc: "한 번에 여러 마리를 동시에 공격한다.",
    filter: "hue-rotate(40deg) saturate(1.45)",
    icon: "🌐",
  },
  /*
   * 우선심사냥 — 가장 빠르고 가장 가벼운 연사형. 🎯 입증(치명타) 계열의 주인공이다.
   * 한 방이 3밖에 안 되므로 방어가 두꺼운 적에게는 거의 통하지 않는다(최소 피해 1).
   * 대신 **초당 열네 번 굴리는 치명타 주사위**를 갖는다 — 치명타 확률·배율을 쌓을수록
   * 다른 어떤 냥보다 이득이 크고, 「고의침해 인정」(치명타 시 재장전 −40%)에 닿으면
   * 치명타가 치명타를 부르며 눈덩이처럼 불어난다.
   */
  fast: {
    name: "우선심사냥", row: 2, arow: 3, kind: "atk",
    dmg: 3, rate: 6.4, range: 118, tag: "연사", cost: 65, weight: 24,
    critC: 0.30, critM: 1.45,
    desc: "쉬지 않고 연타한다. 한 방은 가볍지만 치명타를 쌓을수록 폭발적으로 세진다.",
    filter: "hue-rotate(315deg) saturate(1.3)",
    icon: "⚡",
  },
  /*
   * 보정명령냥 — 유일한 둔화형.
   * 보정명령은 출원인의 발을 묶어 심사를 늦추는 실제 절차라, 「상대를 느리게 만든다」는
   * 역할에 그대로 맞는다. 한 방은 가볍지만(피해 5) 맞은 침입자가 1.6초 동안 42% 느려져
   * 다른 냥타워의 사거리 안에 머무는 시간이 길어진다 — 혼자 쓰면 약하고 옆에 세우면 세다.
   * 둔화는 중첩되지 않고 마지막에 맞은 값으로 덮어쓰므로(combat.damage), 여러 명을 세워도
   * 느려지는 정도는 그대로고 「끊기지 않게 계속 걸어 두는」 쪽으로만 이득이 난다.
   */
  delay: {
    name: "보정명령냥", row: 2, arow: 3, kind: "atk",
    dmg: 5, rate: 1.5, range: 138, slow: 42, tag: "둔화", cost: 75, weight: 18,
    critC: 0.14, critM: 1.6,
    desc: "맞은 침입자를 1.6초 동안 42% 느리게 만든다.",
    filter: "hue-rotate(255deg) saturate(1.4)",
    icon: "⏳",
  },
  agent: {
    name: "변리사냥", row: 0, arow: 1, kind: "buff",
    dmg: 0, rate: 0, range: 0, auraDmg: 1.25, auraRate: 1.15, tag: "보좌", cost: 145, weight: 8,
    desc: "비공격. 실제로 이어진 심사관 터(보통 좌우, 모서리에서는 꺾이는 방향)의 화력과 공속을 끌어올린다.",
    filter: "hue-rotate(15deg) saturate(1.5)",
    icon: "💼",
  },

  /* ══ 특수 냥타워 ══
   * 뽑기로는 절대 나오지 않는다(weight 0). **다른 종류끼리 합성**해야만 얻을 수 있고,
   * 같은 종류를 셋 모아 레벨을 올리는 것과 달리 **없던 규칙**을 하나씩 들고 온다 —
   * 연쇄·정지·즉사·징수처럼 숫자만 커지는 게 아니라 판이 달리 돌아가게 만드는 것들이다.
   * 처방은 아래 RECIPES 에 모여 있다. */
  panel: {
    name: "심판합의체냥", row: 2, arow: 3, kind: "atk", special: true, weight: 0,
    dmg: 14, rate: 1.3, range: 250, targets: 6, pierce: 20, tag: "합의심결", cost: 330,
    critC: 0.16, critM: 1.8,
    desc: "심판관 셋이 한자리에 앉는다. 사거리 안 최대 6마리를 한 번에 조준한다.",
    filter: "hue-rotate(85deg) saturate(1.6) brightness(1.05)",
    icon: "⚖️",
  },
  citation: {
    name: "인용문헌냥", row: 2, arow: 3, kind: "atk", special: true, weight: 0,
    dmg: 16, rate: 1.2, range: 180, pierce: 25, tag: "연쇄", cost: 190,
    critC: 0.18, critM: 1.8,
    chain: { n: 3, r: 110, f: 0.6 },
    desc: "인용문헌 하나가 옆 출원까지 무너뜨린다. 명중이 근처 3마리로 튄다 (피해 60%).",
    filter: "hue-rotate(160deg) saturate(1.7)",
    icon: "🔗",
  },
  rush: {
    name: "조기공개냥", row: 2, arow: 3, kind: "atk", special: true, weight: 0,
    dmg: 6, rate: 4.0, range: 130, tag: "정지", cost: 165,
    critC: 0.22, critM: 1.5,
    stunC: 0.25, stunD: 0.6,
    desc: "출원을 앞당겨 공개해 발을 묶는다. 명중마다 25% 확률로 0.6초 완전 정지.",
    filter: "hue-rotate(285deg) saturate(1.8) brightness(1.1)",
    icon: "⏱️",
  },
  fee: {
    name: "수수료징수냥", row: 2, arow: 3, kind: "atk", special: true, weight: 0,
    dmg: 11, rate: 2.0, range: 140, tag: "징수", cost: 210,
    critC: 0.18, critM: 1.8,
    bounty: 1.2,
    desc: "처치할 때마다 수수료를 받아 낸다. 이 냥이 잡으면 특허료가 120% 더 들어온다.",
    filter: "hue-rotate(55deg) saturate(2)",
    icon: "💰",
  },
  invalid: {
    name: "무효사유냥", row: 2, arow: 3, kind: "atk", special: true, weight: 0,
    dmg: 9, rate: 1.5, range: 160, pierce: 30, tag: "즉사", cost: 350,
    critC: 0.15, critM: 1.9,
    exec: 0.18,
    desc: "흠을 찾아내면 그대로 끝이다. 체력 18% 이하 침입자를 즉시 제거한다 (특허괴물 제외).",
    filter: "grayscale(.45) sepia(.6) hue-rotate(318deg) saturate(2.2) brightness(.92)",
    icon: "☠️",
  },
};

/** 뽑기로 나올 수 있는 종류 (특수 냥타워는 합성으로만 얻는다) */
const DRAW_KEYS = Object.keys(CATS).filter((k) => !CATS[k].special);
/** 랜덤 임용 후보 — 가중치 합. 뽑기 확률 표시(UI)와 실제 추첨이 같은 값을 본다. */
const CAT_WEIGHT_TOTAL = DRAW_KEYS.reduce((a, k) => a + (CATS[k].weight || 0), 0);
/** @param {string} key 이 종류가 뽑힐 확률 (0~1) */
const catDrawChance = (key) => (CATS[key].weight || 0) / CAT_WEIGHT_TOTAL;

/**
 * 합성 처방(RECIPES) — **다른 종류끼리** 합쳐 특수 냥타워를 만든다.
 *
 * 같은 종류 셋을 모으는 레벨업이 「같은 것을 더 세게」라면, 이쪽은 「없던 것을 만든다」이다.
 * 재료는 전부 **Lv1** 이어야 한다 — 애써 올려 둔 Lv2·Lv3 이 처방에 빨려 들어가면
 * 합성 단추를 누르는 일이 도박이 되어 버린다. 재료가 서로 다른 종류라는 것도 규칙이다.
 *
 * 처방은 재료 수가 많을수록(그리고 비싼 종류를 쓸수록) 센 것이 나오도록 잡았고,
 * 어느 재료도 두 처방에서 같은 자리를 차지하지 않게 흩어 놓아, 무엇을 남기고 무엇을 태울지가
 * 매번 판단거리가 되도록 했다.
 * @type {{key:string, need:string[]}[]}
 */
const RECIPES = [
  { key: "panel",    need: ["spec", "claim", "pct"] },     // 출원 + 특허범위 + 국제출원
  { key: "invalid",  need: ["pct", "agent"] },             // 국제출원 + 변리사
  { key: "citation", need: ["claim", "delay"] },           // 특허범위 + 보정명령
  { key: "rush",     need: ["fast", "delay"] },            // 우선심사 + 보정명령
  { key: "fee",      need: ["spec", "agent"] },            // 출원 + 변리사
];

/*
 * 치명타 밸런스 메모 — 기대 피해 배율 = 1 + critC × (critM − 1)
 *   출원냥   0.12 × 1.0 = +12.0%   (한 방이 무거워 치명타 한 번의 값이 크다)
 *   특허범위냥 0.22 × 1.2 = +26.4%  (가장 느린 저격 — 한 발의 값이 가장 크다)
 *   국제출원냥 0.12 × 0.6 =  +7.2%  (이미 3인 동시조준으로 세다)
 *   우선심사냥 0.30 × 0.45 = +13.5% (연사라 치명타가 자주, 대신 작게 — 쌓을수록 값이 커진다)
 */

/**
 * 합성 냥타워(특수 5종)의 **고유 스킬** — 쿨타임마다 저절로 터진다.
 *
 * 임용으로 사는 여섯은 「가만히 잘 쏘는」 것이 일이고, 합성으로만 나오는 다섯은
 * 그 위에 **한 번씩 판을 흔드는 한 수**를 갖는다. 애써 재료를 모아 만든 보람이
 * 숫자가 아니라 눈에 보이는 사건으로 돌아오도록 한 장치다.
 *
 * 누를 것은 없다 — 쿨이 차면 사거리 안에 표적이 있을 때 저절로 터진다.
 * 그래야 「누를 것이 하나도 없는」 1:1 대전장에서도 똑같이 살아 있고,
 * 손이 빠른 쪽이 아니라 **잘 키운 쪽**이 이긴다는 성격이 깨지지 않는다.
 *
 * 터지는 순간 화면 아래에 **캐릭터 컷인**이 파칭 하고 뜬다 (web/main.js 의 cutIn).
 *
 * cd      재사용 대기(초). 합성 레벨마다 cdLv 배로 짧아진다
 * mul     공격력의 몇 배를 때리는가 (레벨마다 mulLv 배)
 * rMul    사거리 배율 (없으면 1)
 * n       최대 대상 수 (없으면 사거리 안 전부)
 * slow/slowD  둔화 %·지속(초) · stun 완전 정지(초)
 * exec    체력이 최대치의 이 비율 이하면 즉시 제거 (보스는 bossHp 만큼만 깎는다)
 * gold/goldD  터진 뒤 이 시간 동안 특허료 획득 배율 +gold (청사 판 전용)
 * @type {Record<string,{name:string,icon:string,cd:number,quote:string,desc:string,
 *   mul?:number,rMul?:number,n?:number,slow?:number,slowD?:number,stun?:number,
 *   exec?:number,bossHp?:number,gold?:number,goldD?:number,col:string}>}
 */
const CAT_SKILLS = {
  panel: {
    name: "전원합의 심결", icon: "⚖️", cd: 20, mul: 3.2, col: "#8fd66a",
    quote: "주문 — 청구는 이유 없다.",
    desc: "심판관 셋이 한목소리를 낸다. 사거리 안 <b>모든</b> 침입자에게 공격력 <b>3.2배</b> 피해.",
  },
  citation: {
    name: "인용의 사슬", icon: "🔗", cd: 18, mul: 2.4, n: 8, slow: 60, slowD: 2, col: "#6fe0d0",
    quote: "이 문헌 하나면 충분합니다.",
    desc: "선행문헌이 줄줄이 엮인다. 사거리 안 <b>최대 8마리</b>를 사슬로 묶어 공격력 <b>2.4배</b> 피해 · <b>2초 동안 60% 둔화</b>.",
  },
  rush: {
    name: "강제 공개", icon: "⏱️", cd: 22, rMul: 1.6, stun: 2.2, col: "#c3a8f5",
    quote: "오늘부로 전부 공개합니다.",
    desc: "출원을 통째로 공개해 발을 묶는다. 사거리 <b>1.6배</b> 안 <b>모든</b> 침입자를 <b>2.2초 완전 정지</b>.",
  },
  invalid: {
    name: "무효 심결", icon: "☠️", cd: 25, exec: 0.45, bossHp: 0.25, col: "#e0574d",
    quote: "그 권리, 처음부터 없었습니다.",
    desc: "흠이 있는 것은 전부 지운다. 사거리 안 <b>체력 45% 이하</b> 침입자를 즉시 제거 (특허괴물은 최대 체력 <b>25%</b> 피해).",
  },
  fee: {
    name: "과징금 부과", icon: "💰", cd: 20, mul: 1.8, gold: 0.6, goldD: 8, col: "#ffd782",
    quote: "수수료를 납부하십시오.",
    desc: "밀린 수수료를 한꺼번에 걷는다. 사거리 안 침입자에게 공격력 <b>1.8배</b> 피해 · <b>8초 동안 특허료 획득 +60%</b>.",
  },
};
/** 레벨이 오르면 쿨은 짧아지고 배율은 커진다 — 합성한 보람이 스킬에도 실린다 */
const SKILL_CD_LV = 0.88, SKILL_MUL_LV = 1.15;

/**
 * 빌드 계열(LINES) — 「내가 지금 무슨 덱을 만들고 있는가」를 다섯 갈래로 못 박은 것.
 *
 * 예전에는 스테이지 강화가 넷뿐이었고 **매번 그 넷이 전부 나왔다.** 고를 것이 없으니
 * 고민도 없었고, 열두 판을 굴려도 남는 것은 「공격력 +84%」 같은 밋밋한 총량뿐이었다.
 *
 * 이제 강화는 열여섯 장이고 **매 스테이지 넷만 뽑혀 나온다.** 강화마다 계열 딱지가 붙어
 * 있어서 고를 때마다 그 계열의 점수가 오르고, **3점·5점에 닿으면 그 계열에만 있는
 * 특수효과가 열린다.** 숫자가 조금씩 오르는 것이 아니라 **규칙이 하나 바뀐다** —
 * 「빌드를 완성했다」가 눈에 보이는 사건이 되도록 한 장치다.
 *
 * 계열마다 그 규칙으로 가장 크게 웃는 냥타워를 하나씩 붙여 두었다 (hero).
 * 출원냥은 한 방이 무거워 방사가 세지고, 우선심사냥은 초당 열네 번 주사위를 굴려
 * 치명타가 세진다 — **냥타워의 기본 수치 자체가 계열의 출발점**이다.
 *
 * @type {Record<string,{key:string,name:string,icon:string,col:string,hero:string,axis:string,
 *   t1:{name:string,desc:string}, t2:{name:string,desc:string}}>}
 */
const LINES = {
  splash: {
    key: "splash", name: "침해", icon: "💥", col: "#ff9a5c",
    hero: "📄 출원냥", axis: "방사 피해 · 무거운 한 방",
    t1: { name: "간접침해", desc: "방사 피해가 침입자의 방어력을 완전히 무시한다" },
    t2: { name: "징벌적 배상", desc: "방사 반경 +50% · 방사 피해 비율 +50%p" },
  },
  crit: {
    key: "crit", name: "입증", icon: "🎯", col: "#e0574d",
    hero: "⚡ 우선심사냥", axis: "치명타 확률 · 치명타 배율",
    t1: { name: "입증책임 전환", desc: "치명타 확률 상한이 75% → 100% 로 풀리고, 치명타는 방어를 무시한다" },
    t2: { name: "고의침해 인정", desc: "치명타가 터지면 그 냥타워의 재장전이 40% 짧아진다 — 치명타가 치명타를 부른다" },
  },
  pierce: {
    key: "pierce", name: "권리범위", icon: "📐", col: "#6fa8d6",
    hero: "📐 특허범위냥", axis: "사거리 · 방어무시",
    t1: { name: "균등론", desc: "방어무시 상한이 70%p → 100%p 로 풀리고 사거리 +20%" },
    t2: { name: "원천특허", desc: "사거리가 기본(118px)보다 긴 만큼 공격력이 오른다 — 100px 당 +14%" },
  },
  control: {
    key: "control", name: "절차", icon: "⏳", col: "#a08cff",
    hero: "⏳ 보정명령냥", axis: "둔화 · 정지",
    t1: { name: "절차 중지", desc: "둔화에 걸린 침입자가 받는 피해 +30%" },
    t2: { name: "심사 보류", desc: "둔화 상한이 90% 로 오르고, 모든 냥타워의 명중이 10% 확률로 0.5초 정지시킨다" },
  },
  aide: {
    key: "aide", name: "대리", icon: "💼", col: "#7fbf6a",
    hero: "💼 변리사냥 · 🌐 국제출원냥", axis: "보좌 · 동시조준",
    t1: { name: "공동대리", desc: "모든 냥타워의 동시조준 +1" },
    t2: { name: "특허법인 설립", desc: "변리사냥 보좌가 반경 2칸으로 퍼지고 보좌 배율이 1.4배가 된다" },
  },
};
/** 계열 특수효과가 열리는 점수 — [3점에 1단계, 5점에 2단계] */
const LINE_TIER_AT = [3, 5];

/**
 * 스테이지 강화 효과 — 웨이브를 클리어할 때마다 **넷이 뽑혀 나오고 그중 하나**를 고른다.
 *
 * ── 어디까지 따라가는가 ──
 * gold2x 를 뺀 전부가 냥타워의 능력치·규칙을 바꾸므로 **청사 판과 1:1 대전장 양쪽에
 * 그대로 실린다.** 대전 명세(makeRoster)를 계산이 끝난 c.st 에서 뽑기 때문이다.
 * 그래서 「스테이지 강화 + 합성」으로 쌓아 올린 것이 곧 내 덱이고, 그 덱이 얼마나 되는지를
 * 확인하는 자리가 대전 라운드다.
 *
 * **gold2x 만 판 전용이다** — 처치 보상을 두 배로 만드는 효과인데, 대전장에는 처치 보상이
 * 없으므로 실릴 곳이 없다.
 *
 * line   빌드 계열 딱지 (null 이면 계열 없는 공통 강화 — 어떤 덱에서도 값을 한다)
 * stat   무엇을 올리는가
 *   dmg/rate/range   % 배율로 계속 쌓인다
 *   critC/critM      확률·배율에 그대로 더하는 절대값
 *   pierce/slow      방어무시·둔화에 더하는 %p
 *   targets          동시조준 +n
 *   stunC            명중 시 정지 확률 +n (지속은 0.45초)
 *   splash           방사 피해를 **부여**한다 {r: 반경 px, f: 직격 대비 비율}
 *   splashUp         이미 가진 방사를 키운다 (반경 ×(1+n) · 비율 +0.08n)
 *   heavy/rapid/longR  조건부 — 무거운 냥 / 연사형 냥 / 장사거리 냥에게만 걸린다 (누적)
 *   aura             변리사냥 보좌 배율 강화 (누적)
 *   gold2x           그 스테이지 한 번만 — 처치 보상이 2배 (누적 없음, 판 전용)
 *
 * @type {{key:string,name:string,icon:string,line:string|null,stat:string,
 *   amount:any,desc:string,detail:string}[]}
 */
const PASSIVES = [
  /* ── 공통 — 계열이 없다. 어떤 덱을 만들고 있든 값을 한다 ── */
  { key: "amend", name: "보정", icon: "📈", line: null, stat: "dmg", amount: 0.12,
    desc: "모든 냥타워 공격력 +12%",
    detail: "명세서를 다듬어 권리를 또렷하게 만든다. 계열을 가리지 않고 값을 하는 무난한 한 장이다." },
  { key: "efile", name: "전자출원", icon: "⚡", line: null, stat: "rate", amount: 0.12,
    desc: "모든 냥타워 공격속도 +12%",
    detail: "서류를 전자로 넘겨 심사 회전을 빠르게 한다. 계열을 가리지 않지만, 치명타 주사위를 더 자주 굴리게 되므로 🎯 입증 덱에서 특히 값이 크다." },
  { key: "refund", name: "수수료 환급", icon: "💰", line: null, stat: "gold2x", amount: 2,
    desc: "이번 스테이지 획득 특허료 2배",
    detail: "과오납한 수수료를 돌려받는다. <b>다음 한 스테이지 동안만</b> 처치 보상이 두 배가 되고 쌓이지 않는다. 물량이 많이 나오는 웨이브 직전에 고를수록 값이 크다 (대전 라운드에는 실리지 않는다)." },

  /* ── 💥 침해 계열 — 한 방을 무겁게, 그 무게를 옆으로 퍼뜨린다 ── */
  { key: "equiv", name: "균등침해", icon: "💥", line: "splash", stat: "splash", amount: { r: 46, f: 0.18 },
    desc: "모든 냥타워가 방사 피해를 얻는다 (반경 +0.55칸 · 피해 18%p)",
    detail: "문언에 없어도 실질이 같으면 침해다. 방사가 없던 냥타워도 명중 지점 둘레를 함께 때리게 되고, 이미 가진 냥은 반경과 비율이 더 커진다. <b>방사는 직격 피해에 비례</b>하므로 한 방이 무거운 📄 출원냥에게 가장 크게 실린다." },
  { key: "damages", name: "손해액 산정", icon: "🔨", line: "splash", stat: "heavy", amount: 1,
    desc: "한 방이 무거운 냥타워 공격력 +40%",
    detail: "배상액은 한 건의 무게로 정해진다. <b>기본 공속이 초당 1.35회 이하</b>인 냥타워(📄 출원냥 · 📐 특허범위냥 · 🔗 인용문헌냥 · ⚖️ 심판합의체냥)의 공격력이 40% 오른다. 고를 때마다 누적된다." },
  { key: "destroy", name: "폐기명령", icon: "🧨", line: "splash", stat: "splashUp", amount: 0.35,
    desc: "방사 반경 +35% · 방사 피해 비율 +8%p",
    detail: "침해품을 그 자리에서 폐기한다. <b>이미 방사 피해를 가진 냥타워</b>만 커진다 — 「균등침해」나 승진(Lv3)으로 방사를 먼저 얻어 두어야 값을 한다." },

  /* ── 🎯 입증 계열 — 급소를 짚는다. 주사위를 자주 굴리는 냥일수록 웃는다 ── */
  { key: "keyclaim", name: "핵심청구항 지정", icon: "🎯", line: "crit", stat: "critC", amount: 0.08,
    desc: "치명타 확률 +8%p",
    detail: "권리의 급소가 되는 청구항을 짚어 둔다. 고를 때마다 누적된다 (상한 75% — 🎯 입증 3단계에 닿으면 100% 까지 풀린다)." },
  { key: "treble", name: "3배 배상", icon: "⚖️", line: "crit", stat: "critM", amount: 0.45,
    desc: "치명타 배율 +0.45",
    detail: "고의가 인정되면 배상이 몇 배로 뛴다. 치명타가 터졌을 때의 피해 배율이 0.45 올라간다. 확률을 이미 쌓아 둔 덱일수록 값이 크다." },
  { key: "willful", name: "고의 입증", icon: "🩸", line: "crit", stat: "rapid", amount: 1,
    desc: "연사형 냥타워 치명타 확률 +16%p",
    detail: "여러 건을 들이대야 고의가 드러난다. <b>기본 공속이 초당 3회 이상</b>인 냥타워(⚡ 우선심사냥 · ⏱️ 조기공개냥)의 치명타 확률이 16%p 오른다. 고를 때마다 누적된다." },

  /* ── 📐 권리범위 계열 — 멀리서, 방어를 뚫고 ── */
  { key: "longspec", name: "명세서 보정", icon: "📏", line: "pierce", stat: "range", amount: 0.18,
    desc: "모든 냥타워 사거리 +18%",
    detail: "청구범위를 넓게 다시 쓴다. 같은 배치로도 실제 사격 시간이 늘어난다. 「선행조사」·「원천특허」가 사거리를 보고 값을 매기므로 그 둘과 겹쳐 쌓인다." },
  { key: "isr", name: "국제조사보고서", icon: "🌍", line: "pierce", stat: "pierce", amount: 18,
    desc: "모든 냥타워 방어무시 +18%p",
    detail: "국제조사기관의 보고서로 상대 권리의 약점을 짚는다. 방어는 <b>명중마다</b> 깎이므로, 한 방이 무거운 냥일수록 원래 방어무시가 덜 아쉽고 연사형일수록 이게 절실하다 (상한 70%p — 📐 권리범위 3단계에 닿으면 100%p 까지 풀린다)." },
  { key: "prior", name: "선행조사", icon: "🔍", line: "pierce", stat: "longR", amount: 1,
    desc: "사거리가 긴 냥타워 공격력 +35%",
    detail: "멀리까지 뒤져 본 만큼 날카로워진다. <b>실제 사거리가 200px(약 2.4칸) 이상</b>인 냥타워의 공격력이 35% 오른다. 「명세서 보정」으로 사거리를 늘려 두면 원래 짧던 냥도 이 조건에 들어온다." },

  /* ── ⏳ 절차 계열 — 발을 묶어 두고 천천히 처리한다 ── */
  { key: "stall", name: "절차 지연", icon: "⏳", line: "control", stat: "slow", amount: 14,
    desc: "모든 냥타워가 둔화를 건다 (+14%p)",
    detail: "보정·의견제출 통지를 거듭해 절차를 늦춘다. <b>둔화가 없던 냥타워도 둔화를 얻는다.</b> 둔화는 중첩되지 않고 마지막 값으로 덮이므로, 여러 명이 끊기지 않게 계속 걸어 두는 쪽으로 이득이 난다 (상한 70% — ⏳ 절차 5단계에 닿으면 90%)." },
  { key: "extend", name: "보정기간 연장", icon: "⏱️", line: "control", stat: "stunC", amount: 0.09,
    desc: "명중 시 9% 확률로 0.45초 완전 정지",
    detail: "기간을 늘려 주고는 그동안 아무것도 못 하게 붙잡아 둔다. 모든 냥타워가 정지 확률을 얻는다 — <b>연사형일수록 주사위를 자주 굴려</b> 실제로는 거의 끊기지 않게 묶어 둔다. 고를 때마다 누적된다." },

  /* ── 💼 대리 계열 — 한 사람이 여러 건을 맡는다 ── */
  { key: "staff", name: "대리인 증원", icon: "💼", line: "aide", stat: "aura", amount: 1,
    desc: "변리사냥 보좌 강화 (화력 +22%p · 공속 +14%p)",
    detail: "사무소에 사람을 더 들인다. 💼 변리사냥의 보좌 배율이 커진다 — <b>변리사냥이 판에 없으면 아무 일도 일어나지 않는다.</b> 보좌 받는 냥이 많을수록 한 장의 값이 커진다." },
  { key: "joint", name: "공동출원", icon: "🌐", line: "aide", stat: "targets", amount: 1,
    desc: "모든 냥타워 동시조준 +1",
    detail: "여러 출원인을 한 건에 묶는다. 모든 냥타워가 한 번에 한 마리를 더 조준한다. 한 발이 그대로 곱해지는 셈이라 <b>공격력이 높거나 조준 수가 이미 많은</b> 🌐 국제출원냥 · ⚖️ 심판합의체냥에게 특히 크게 실린다." },
];
const PASSIVE_BY_KEY = Object.fromEntries(PASSIVES.map((p) => [p.key, p]));

/**
 * 침입자. fee = 돌파 시 빼앗기는 특허료.
 * (예전에는 무효심판 청구인이 돌파할 때마다 냥타워를 무작위로 무효화했지만, 웨이브 하나에서
 *  여러 마리를 놓치면 판이 통째로 마비되고 그게 하필 증강 선택 직전에 몰려 보였다 — 지금은
 *  무효화 자체를 없애고, 대신 돌파당했을 때의 내구 손실을 크게 잡았다.)
 * spd 는 넷 다 예전의 0.78배다 — 너무 빨라 달리는 모습이 눈에 안 담겼다. 서로의 상대적인
 * 빠르기(벤치마킹업체가 가장 빠르고 특허괴물이 가장 느리다)는 그대로 두려고 같은 비율로 줄였다.
 *
 * duel 은 **1:1 대전장에 침입단으로 나설 때**의 성격이다 (솔로 플레이에서 붙는 상대).
 * 청사 판에서는 침입자가 공격을 하지 않으므로, 대전장용 수치는 여기 따로 적는다.
 *   w         무작위 조합에서 뽑힐 가중치 (특허괴물은 어쩌다 한 번 나오도록 낮게 잡았다)
 *   hpS/dpsS  같은 침입단 안에서 이 종류가 가져갈 체력·화력의 몫.
 *             **절대값이 아니라 몫이다** — 침입단 전체의 세기는 내 냥타워를 재서 정하고,
 *             그 총량을 이 몫대로 나눠 준다. 그래야 내가 잘 키웠든 못 키웠든 붙어 볼 만해진다.
 *   rate/range  공속(초당 공격 수) · 사거리(대전장 px). 쥐라서 대체로 짧다
 *   sl        명중 시 둔화 % · sp/spf 방사 피해 반경·비율
 * @type {Record<string,{nm:string,hp:number,spd:number,def:number,r:number,col:string,rw:number,
 *   leak:number,fee?:number,desc:string,icon:string,
 *   duel:{w:number,hpS:number,dpsS:number,rate:number,range:number,sl?:number,sp?:number,spf?:number}}>}
 */
const ENEMIES = {
  copy: { nm:"도용업자",       hp:42,  spd:106, def:1, r:18, col:"#8fa6bd", rw:3,  leak:1, icon:"🥷",
    desc:"허락 없이 슬쩍 가져다 쓴다. 수가 많다.",
    duel:{ w:34, hpS:1.0, dpsS:1.0, rate:1.6, range:100 } },
  fast: { nm:"벤치마킹업체",   hp:32,  spd:181, def:1, r:16, col:"#c9b26a", rw:3,  leak:1, icon:"📊",
    desc:"분석이라 부르지만 사실상 베끼기. <br>빠르게 스치고 지나간다.",
    duel:{ w:26, hpS:0.6, dpsS:1.3, rate:3.0, range:86 } },
  tank: { nm:"무효심판 청구인", hp:190, spd:75,  def:8, r:24, col:"#7d5a8f", rw:9,  leak:5, icon:"⚖️",
    desc:"내 권리를 통째로 없애려 든다. <br>돌파 시 등록원부 내구를 5 깎는다.",
    duel:{ w:16, hpS:2.4, dpsS:1.1, rate:0.85, range:140, sl:30 } },
  boss: { nm:"특허괴물",       hp:1150, spd:62, def:13, r:34, col:"#c4322a", rw:70, leak:8, fee:100, icon:"👹",
    desc:"특허만 사서 소송으로 돈을 받아낸다. <br>돌파 시 합의금 명목으로 특허료 100을 가져간다. <br>— 잔고가 모자라면 빚으로 남는다.",
    duel:{ w:4, hpS:4.0, dpsS:2.4, rate:1.0, range:130, sp:92, spf:0.5 } }
};

/**
 * 라운드별 침입자 구성 (index 0 = 라운드 1).
 *
 * 한 판은 **10라운드**이고 그중 **4 · 7 · 10 은 1:1 대전**이라 침입자가 오지 않는다
 * (DUEL_WAVES). 그 세 자리는 빈 칸으로 두어 **라운드 번호와 배열 자리가 어긋나지 않게** 한다 —
 * 자리를 당겨 채우면 「라운드 5의 구성」을 찾을 때마다 대전 라운드 수를 빼야 한다.
 *
 * 실제로 싸우는 것은 일곱 라운드(1·2·3·5·6·8·9)뿐이라, 예전 12라운드짜리 곡선을 그대로 쓰면
 * 물량이 늘 시간이 없어 후반이 싱거워진다. 그래서 **뒤로 갈수록 더 가파르게** 잡았고,
 * **특허괴물은 마지막 전투 라운드(9)** 에 들어온다 — 라운드 10이 대전이라 여기가 아니면
 * 보스가 설 자리가 없다.
 * @type {Record<string,number>[]}
 */
const WAVES = [
  {copy:26},                              // 1
  {copy:34,fast:12},                      // 2
  {copy:38,fast:20},                      // 3
  {},                                     // 4 — ⚔️ 1:1 대전
  {copy:36,fast:24,tank:10},              // 5
  {copy:44,fast:30,tank:16},              // 6
  {},                                     // 7 — ⚔️ 1:1 대전
  {copy:50,fast:38,tank:24},              // 8
  {copy:48,fast:46,tank:32,boss:1},       // 9 — 마지막 전투 라운드 · 특허괴물 등장
  {},                                     // 10 — ⚔️ 1:1 대전 (여기서 판이 끝나고 점수를 낸다)
];

/**
 * 방해 공작(SABOTAGE) — 특허료를 내고 **상대 판에** 거는 훼방. 무엇이 나갈지는 뽑아 봐야 안다.
 *
 * 예전에는 다섯 종류를 늘어놓고 골라 질렀다. 이제는 **정액을 내고 무작위로 하나를 뽑는다** —
 * 냥타워는 내가 고르고 상대를 흔드는 쪽이 운에 맡겨지므로, 「내 판은 내가 짓고 상대 판은
 * 던져 본다」로 성격이 갈린다. 뽑기는 한 웨이브 주기(준비 + 그 웨이브)에 BAL.sabotageDraws 번.
 *
 * when   "live" 상대 판에서 곧바로 흐르기 시작한다 (상대가 준비 단계면 다음 웨이브 개시와 함께)
 *        "next" 상대의 다음 웨이브 구성 자체를 바꾼다 (이미 웨이브 중이면 그 다음 웨이브)
 * kind   haste 이동속도 · fog 사거리 · tough 체력 · swarm 물량 · elite 정예 추가 투입
 * weight 뽑기 가중치. 판을 크게 흔드는 것일수록 낮게 잡았다
 * @type {Record<string,{key:string,name:string,short:string,icon:string,cost:number,weight:number,
 *   when:"live"|"next",kind:string,tag:string,amount:number,dur?:number,desc:string}>}
 */
const SABOTAGE = {
  grease: {
    key: "grease", name: "심사 지연 기름", short: "기름", icon: "🛢️", cost: 110, weight: 26,
    when: "live", kind: "haste", amount: 0.45, dur: 10, tag: "실시간 · 이동속도",
    desc: "상대 청사 복도에 기름을 붓는다. 상대 판의 모든 침입자가 10초 동안 45% 빨라진다. " +
      "상대가 준비 단계면 다음 웨이브가 시작되는 순간부터 흐른다.",
  },
  fog: {
    key: "fog", name: "심사 방해 연막", short: "연막", icon: "🌫️", cost: 100, weight: 26,
    when: "live", kind: "fog", amount: 0.25, dur: 12, tag: "실시간 · 사거리",
    desc: "서류를 잔뜩 밀어 넣어 시야를 흐린다. 상대 냥타워의 사거리가 12초 동안 25% 줄어든다. " +
      "사거리로 버티는 배치일수록 크게 흔들린다.",
  },
  tough: {
    key: "tough", name: "무효자료 보강", short: "보강", icon: "💊", cost: 130, weight: 20,
    when: "next", kind: "tough", amount: 0.40, tag: "다음 웨이브 · 체력",
    desc: "상대를 치러 가는 침입자들에게 자료를 쥐여 준다. 상대의 다음 웨이브 침입자 체력이 40% 늘어난다.",
  },
  swarm: {
    key: "swarm", name: "이의신청 대량제출", short: "물량", icon: "📨", cost: 120, weight: 20,
    when: "next", kind: "swarm", amount: 0.30, tag: "다음 웨이브 · 물량",
    desc: "이의신청서를 무더기로 넣는다. 상대의 다음 웨이브 침입자 수가 30% 늘어난다 (보스는 늘지 않는다).",
  },
  elite: {
    key: "elite", name: "전문가 증인 투입", short: "정예", icon: "⚖️", cost: 150, weight: 8,
    when: "next", kind: "elite", amount: 6, tag: "다음 웨이브 · 정예",
    desc: "무효심판 청구인 6명을 상대 쪽 웨이브에 끼워 넣는다. 단단한 정예가 줄 사이에 섞여 들어간다.",
  },
};

/**
 * 증강(AUGMENT) — 몇 웨이브에 한 번씩 고르는 "판을 뒤집는" 규칙 변경.
 *
 * 패시브가 +10% 를 쌓는 미세 조정이라면, 이쪽은 규칙 자체를 바꾼다.
 * 비공격이던 변리사냥이 최전선에 서고, 공격냥들이 돌덩이가 되고,
 * 서로 다른 냥이 하나로 합쳐진다 — 매번 다른 판이 되도록 하는 장치다.
 *
 * kind  "rule" 지속적으로 규칙을 바꾼다 · "instant" 고를 때 한 번만 적용된다
 * tag   한눈에 성격을 알리는 딱지
 * @type {Record<string,{key:string,name:string,icon:string,tag:string,kind:"rule"|"instant",
 *   desc:string,detail:string}>}
 */
const AUGMENTS = {
  agentWar: {
    key: "agentWar", name: "변리사 개업", icon: "⚔️", tag: "판갈이", kind: "rule",
    desc: "변리사냥이 직접 싸운다 · 나머지 냥타워 공격력 −35%",
    detail: "보좌만 하던 변리사냥이 사무소를 차리고 직접 대리에 나선다. 공격력 32 · 공속 1.1 · 사거리 2.4칸의 " +
      "장거리 화력이 되면서 기존 보좌 효과도 그대로 유지한다. 대신 다른 냥타워는 대리인에게 일을 맡기고 " +
      "손을 놓아 공격력이 35% 깎인다 — 판의 축이 통째로 변리사냥으로 옮겨간다.",
  },
  precision: {
    key: "precision", name: "정밀심사", icon: "🎯", tag: "특화", kind: "rule",
    desc: "전체 치명타 확률 +15%p · 배율 +0.6",
    detail: "선행문헌을 한 줄씩 대조하며 급소만 짚는다. 모든 냥타워의 치명타 확률이 15%p, " +
      "치명타 배율이 0.6 올라간다. 원래 치명타가 잦은 우선심사냥·출원냥과 특히 잘 맞고, " +
      "승진시켜 둔 냥타워에는 그 위에 다시 얹힌다 (확률 상한은 75%).",
  },
  mono: {
    key: "mono", name: "선행기술 총동원", icon: "📚", tag: "특화", kind: "rule",
    desc: "같은 종류가 3명 이상이면 그 종류 공격력 +50%",
    detail: "같은 기술 분야를 파고들수록 심사가 날카로워진다. 판 위에 같은 종류의 냥타워가 3명 이상 있으면 " +
      "그 종류 전체의 공격력이 50% 올라간다. 여러 종류를 조금씩 섞는 것보다 한 종류를 몰아 세우는 게 이득이 된다.",
  },
  overwork: {
    key: "overwork", name: "심사관 과로", icon: "☕", tag: "특화", kind: "rule",
    desc: "전체 공속 +65% · 공격력 −20%",
    detail: "밀린 심사를 밤새 처리한다. 모든 냥타워의 공격 속도가 65% 올라가는 대신 한 방의 무게는 20% 줄어든다. " +
      "잡몹 물량에는 확실히 강해지지만, 방어가 두꺼운 적에게는 오히려 손해다 (방어력은 명중마다 깎이기 때문).",
  },
  longspec: {
    key: "longspec", name: "명세서 보정", icon: "📏", tag: "보정", kind: "rule",
    desc: "모든 냥타워 사거리 +40%",
    detail: "청구범위를 넓게 다시 쓴다. 모든 냥타워의 사거리가 40% 늘어나 나선 통로의 안쪽 줄까지 사격이 닿는다. " +
      "같은 배치로도 실제 사격 시간이 크게 늘어난다.",
  },
  isr: {
    key: "isr", name: "국제조사보고서", icon: "🌍", tag: "보정", kind: "rule",
    desc: "모든 냥타워 방어무시 +40%p",
    detail: "국제조사기관의 보고서로 상대 권리의 약점을 짚는다. 모든 냥타워가 적의 방어력을 40%p 더 무시한다. " +
      "무효심판 청구인(방어 8)·특허괴물(방어 13)처럼 단단한 적에게 특히 크게 들어간다.",
  },
  auraWide: {
    key: "auraWide", name: "심사 병합", icon: "🔮", tag: "판갈이", kind: "rule",
    desc: "변리사냥 보좌가 반경 2칸으로 · 화력 +55% 공속 +35%",
    detail: "관련 출원을 묶어 한 심사관이 몰아 본다. 변리사냥의 보좌가 맞닿은 터를 넘어 반경 2칸(대각선 포함)까지 " +
      "퍼져 통로 건너 안쪽·바깥쪽 줄의 냥타워에도 닿고, 배율도 화력 +55% · 공속 +35% 로 커진다. " +
      "변리사냥 한 명이 판 절반을 먹여 살리게 된다.",
  },
  golden: {
    key: "golden", name: "직권보정", icon: "✨", tag: "변수", kind: "rule",
    desc: "웨이브마다 무작위 냥타워 1명이 공격력 3배",
    detail: "심사관이 직권으로 손을 대 한 건을 단숨에 통과시킨다. 웨이브가 개시될 때마다 공격형 냥타워 중 " +
      "하나가 무작위로 뽑혀 그 웨이브 동안 공격력이 3배가 된다 (판에서 금빛으로 빛난다). 누가 뽑힐지는 매번 다르다.",
  },
  cheap: {
    key: "cheap", name: "선사용권", icon: "💰", tag: "경제", kind: "rule",
    desc: "임용 비용 40% 인하 · 즉시 특허료 +120",
    detail: "출원 전부터 쓰고 있었으니 값을 깎아 준다. 이후 모든 냥타워의 임용 비용이 40% 싸지고, " +
      "고르는 즉시 특허료 120을 받는다. 물량으로 판을 채우는 쪽으로 방향을 잡을 때 고른다.",
  },
  fortify: {
    key: "fortify", name: "등록료 납부", icon: "🏛️", tag: "방어", kind: "instant",
    desc: "등록원부 최대 내구 +30 · 즉시 30 회복",
    detail: "등록료를 미리 납부해 권리를 두껍게 만든다. 등록원부의 최대 내구가 30 늘고 그만큼 즉시 채워진다. " +
      "돌파를 몇 번 허용해도 버틸 수 있게 되고, 상대의 무효심판(−10)도 한 번 더 견딘다.",
  },
  burst: {
    key: "burst", name: "우선권 주장", icon: "⏱️", tag: "변수", kind: "rule",
    desc: "웨이브 개시 후 8초 동안 전체 공속 2배",
    detail: "우선일을 앞당겨 심사를 먼저 받는다. 웨이브가 시작되고 8초 동안 모든 냥타워의 공격 속도가 두 배가 된다. " +
      "선두 무리를 초반에 지워버리는 용도라, 물량이 앞에서 몰려오는 웨이브에서 값이 크다.",
  },
  divisional: {
    key: "divisional", name: "분할출원", icon: "🧾", tag: "즉시", kind: "instant",
    desc: "가장 비싼 냥타워 1명을 그 자리에서 복제",
    detail: "하나의 출원을 둘로 쪼갠다. 판 위에서 가장 비싼 냥타워와 똑같은 냥타워가 공짜로 하나 더 생긴다 " +
      "(빈 터가 없으면 대기열로 들어간다). 이미 국제출원냥·변리사냥을 세워 둔 판일수록 이득이 크다.",
  },
};

/**
 * 증강을 고르는 웨이브 — 지금은 없다.
 * 증강 선택은 걷어냈고, 모든 스테이지가 끝나면 스테이지 강화 효과만 고른다.
 * (AUGMENTS 정의와 augSet 을 보는 계산식은 그대로 남겨 둔다 — 아무도 고를 수 없으니
 *  전부 꺼진 상태로 동작하고, 되살릴 때는 이 배열에 웨이브 번호만 다시 채우면 된다.)
 */
const AUGMENT_WAVES = [];

/**
 * 1:1 대전 라운드가 열리는 라운드 — **4 · 7 · 10, 세 번**.
 *
 * 세 라운드마다 한 번씩 돌아오고, **마지막 10라운드가 곧 판의 끝**이다. 침입자를 막는 것은
 * 덱을 만드는 과정이고, 만든 덱이 값을 하는지는 대전에서만 판가름 난다 —
 * 그 판가름을 판의 마지막 자리에 놓아 「마지막 한 판」이 되게 했다.
 *
 * 이 라운드에는 침입자가 오지 않고, 별도의 대전장(DUEL)에서 서로가 지금까지 만든 냥타워를
 * 통째로 붙인다. 승패는 특허료가 아니라 **최종 랭킹 점수**로만 돌아온다 (RANK 참고).
 */
const DUEL_WAVES = [4, 7, 10];

/**
 * 1:1 대전(DUEL) — **오토배틀러**. 서로의 덱을 통째로 맞대 본다.
 *
 * 판(9×9 청사)이 아니라 별도의 대전장으로 옮겨 간다. 화면은 옆에서 본 한 줄짜리 전장이고,
 * 양끝에 진영 깃발이 하나씩 선다. 시작하면 **지금까지 만든 냥타워가 한 명도 빠짐없이**
 * 진형을 짜고 서서 저절로 진군한다 — 특허료도, 출격 카드도, 누를 것도 없다.
 *
 * **성채는 없다. 두들길 것은 서로의 냥타워뿐이고, 먼저 전멸하는 쪽이 진다.**
 * 지킬 건물이 따로 있으면 「무엇을 만들었는가」가 아니라 「누가 먼저 벽을 뚫었는가」로
 * 승부가 새기 때문이다. 여기서는 덱과 덱만 남는다.
 *
 * 그래서 이 라운드에서 승부를 가르는 것은 **오직 「무엇을 만들었는가」** 하나다.
 * 증강 · 스테이지 강화 · 합성 레벨이 전부 실린 내 덱과 상대 덱을 그대로 붙여 자웅을 가린다.
 * 손이 빠른 쪽이 아니라 잘 키운 쪽이 이긴다.
 *
 * w/h        대전장 크기(px). 캔버스 좌표계 그대로다
 * ground     지면선 y — 유닛의 발이 닿는 높이
 * campX      진영 기준선 x (반대편은 w - campX). spawnPad 만큼 앞에서 진형이 시작되고,
 *            유닛이 이 선 너머로 걸어 나가지 않게 붙잡는 벽 노릇도 한다
 * rangeMul   청사 판(84px 간격) 사거리를 대전장으로 옮기는 배율
 * moveSpd    걷는 속도(px/s)
 * hp*        유닛 체력 = (hpBase + 임용가 × hpPerCost) × hpLv^(레벨-1) × (승진이면 hpPromo)
 * aide*      비전투 변리사냥이 대전장에서 맡는 역할 — 가장 다친 아군을 회복시킨다
 * rows       진형의 줄 수. 한 칸(열)에 이만큼씩 쌓아 세우고, 줄 번호가 곧 깊이(dep)가 된다
 *            — 뒤로 얼마나 물러나 서는지는 아래 depthRise·depthScale 이 정한다
 * colGap     열 사이의 가로 간격(px). 덱이 크면 이 값을 줄여 진형을 formDepth 안에 욱여넣는다
 * formDepth  진형이 차지하는 최대 깊이(px). 앞줄은 양쪽 다 **같은 자리**에서 시작하고
 *            덱이 클수록 뒤로(진영 쪽으로) 늘어난다 — 덱 크기가 시작 거리를 바꾸면 불공평해진다
 * timeLimit  이 시간을 넘겨도 양쪽이 살아 있으면 **남은 병력 비율**이 높은 쪽이 이긴다
 * prize      승리 보상(특허료) · drawPrize 무승부 보상
 * leak*      패배 시 등록원부 내구 손실 = leakBase + 살아남은 상대 유닛 수 × leakPer.
 *            30 은 시작 내구 80의 3할이 넘는다 — 대전 라운드는 한 판의 향방을 가르는 자리이고,
 *            두 번 다 지면 다음 웨이브를 버티기 어려워지도록 일부러 무겁게 잡았다.
 * solo*      솔로 플레이에서 붙는 쥐 침입단의 세기 배율
 */
const DUEL = {
  w: 1000, h: 420,
  ground: 332,
  campX: 76, spawnPad: 34,
  rangeMul: 0.76,
  moveSpd: 46,
  timeLimit: 90,
  waitSecs: 12,           // 상대 명세를 기다리는 최대 시간. 넘기면 쥐 침입단으로 대신한다
  dt: 1 / 60,             // 고정 시간간격 — 프레임이 흔들려도 싸움의 속도는 같다
  hpBase: 60, hpPerCost: 1.1, hpLv: 1.9, hpPromo: 1.3,
  aideHeal: 7, aideHealR: 150,
  /* rows 를 5로, formDepth 를 260으로 늘린 것은 스케치의 모양을 맞추기 위해서다 —
   * 진형이 자기 **영역의 절반쯤을 채우고** 가운데가 비어 있어야 「두 영역이 마주 본다」로 읽힌다.
   * 예전(4줄·170px)에는 양 끝에 뭉쳐 서서 화면 한가운데가 통째로 비어 있었다. */
  rows: 5, colGap: 34, formDepth: 260,
  /* 대전 승리 보상에서 **특허료를 뺐다** (prize 90·drawPrize 40 → 0).
   * 이긴 쪽이 특허료까지 받으면 더 좋은 덱을 사서 다음 대전도 이기고, 그 눈덩이가 세 번
   * 굴러가면 4라운드 한 판으로 판이 끝나 버린다. 대전의 승패는 이제 **최종 랭킹 점수로만**
   * 돌아온다 (RANK.duelWin/duelDraw) — 판 안의 자원 격차가 아니라 성적표에 남는다. */
  prize: 0, drawPrize: 0,
  leakBase: 30, leakPer: 0,
  soloBase: 0.95, soloPerWave: 0.015,

  /* ── 화면 (영역 2분할 + 원근감 지면) ──
   * 예전에는 유닛이 4줄짜리 일직선으로 딱 붙어 서서, 스물몇 명이 나와도 「줄 선 종이 타일」로만
   * 보였다. 지금은 **깊이(dep 0~1)** 를 하나 더 두어 진형이 안쪽으로 흩어져 서고,
   * 지면 자체가 왼쪽이 낮고 오른쪽이 높게 **비스듬히** 깔린다. 뒤에 선 유닛일수록
   * 위에 작게 그려지므로 같은 인원도 진형이 깊게 보인다.
   *
   * tilt       지면 기울기(px). 화면 왼쪽 끝이 +tilt/2 아래, 오른쪽 끝이 그만큼 위
   * depthRise  가장 뒷줄(dep=1)이 앞줄보다 위로 올라가는 높이(px)
   * depthScale 가장 뒷줄이 작아지는 정도 (1 − 이 값 = 뒷줄의 크기 배율)
   * horizon    하늘과 땅이 만나는 선 — 지면 띠는 여기서부터 아래로 깔린다
   * zoneMine/zoneFoe  영역 바닥에 옅게 까는 진영색. 가운데 **전선**을 기준으로 갈린다 */
  /* 지평선을 화면의 36%까지 끌어올렸다(208 → 150). 208 일 때는 **하늘이 화면의 절반**을 먹고
   * 진형이 그 아래 좁은 띠에 눌려 들어가, 스물몇 명이 나와도 작게 뭉쳐 보였다.
   * 대신 깊이를 84 → 108 로 키워 진형이 그 넓어진 땅을 실제로 쓰게 했다. */
  tilt: 44,
  depthRise: 108,
  depthScale: 0.32,
  horizon: 150,
  zoneMine: "rgba(74,136,178,.28)",
  zoneFoe: "rgba(196,50,42,.23)",
};

/**
 * 랭킹 점수(RANK) — 한 판이 끝나면 **네 항목을 합쳐 한 숫자**로 낸다.
 *
 * 이 게임은 「12라운드를 버텼는가」로 끝나는 생존 게임이 아니라 **10라운드 동안 얼마나 좋은
 * 덱을 만들었는가**를 재는 오토배틀러다. 그래서 승패를 O/X 로 내지 않고 점수로 낸다 —
 * 같은 「클리어」 안에서도 잘한 판과 겨우 넘긴 판이 갈려야 다시 할 이유가 생긴다.
 *
 * 네 항목은 서로 다른 것을 잰다. 하나만 잘해서는 높은 점수가 나오지 않는다.
 *   ⚔️ 대전   만든 덱이 **남의 덱을 이기는가** (4·7·10 라운드 세 판)
 *   🏗️ 덱파워  10라운드가 끝난 시점에 **무엇을 쥐고 있는가** (√(총 체력 × 총 화력))
 *   ⏱️ 속도   각 전투 라운드를 **얼마나 빨리 끝냈는가** — 판을 얼마나 촘촘히 짰는지의 지표다
 *   🏛️ 생존   등록원부를 얼마나 지켰는가
 *
 * ── 속도를 어떻게 재나 ──
 * 게임 **시간**으로 잰다(실시간이 아니다). 배속을 걸면 실시간은 줄지만 게임 시간은 그대로라,
 * ×3 을 눌러 점수를 벌 수 없다. 라운드마다 **파 타임(par)** 을 잡고 par 이내면 만점,
 * 그보다 오래 걸릴수록 반비례로 깎는다. par 은 「그 라운드의 마지막 침입자가 나오는 시각 +
 * parPad」다 — 스폰이 다 끝나기 전에 라운드를 끝낼 수는 없으므로, 이게 이론상 최속이다.
 */
const RANK = {
  duelWin: 1200, duelDraw: 500, duelLose: 0,
  deckMul: 0.8,              // 덱 지수 1점당 점수
  speedPerWave: 600,         // 전투 라운드 하나의 속도 만점
  parPad: 9,                 // 파 타임 = 마지막 스폰 시각 + 이 여유(초)
  hpMul: 10,                 // 남은 등록원부 내구 1당 점수
  /** 등급 컷 — 위에서부터 먼저 걸리는 것을 쓴다 */
  grades: [
    { at: 9000, g: "S", col: "#ffd782", say: "특허청이 통째로 당신 것입니다." },
    { at: 7200, g: "A", col: "#7fbf6a", say: "빈틈이 거의 없는 판이었습니다." },
    { at: 5400, g: "B", col: "#69b6d6", say: "탄탄합니다. 한 계열만 더 밀었다면." },
    { at: 3600, g: "C", col: "#c9b26a", say: "덱의 축이 아직 흐릿합니다." },
    { at: 0,    g: "D", col: "#e0574d", say: "무엇을 모을지부터 정해 봅시다." },
  ],
};

/** 밸런스 상수. 시뮬레이터가 이 객체를 통째로 덮어써서 스윕할 수 있다. */
const BAL = {
  cellSize: 80, cellGap: 4,
  startGold: 130, startHp: 80,         // 난이도 상향 — 시작 자금·체력을 줄여 초반부터 신중하게
  /* 웨이브당 적 체력 배율 증가.
   * 0.26 → 0.30 으로 올린 것은 빌드 계열(계열 3·5단계)과 합성 냥타워의 고유 스킬이 들어오면서
   * 후반 화력이 통째로 한 단계 올라갔기 때문이다. 냥타워 수치를 한 발에 몰아 담은 것도 같이
   * 작용한다 — 방어는 명중마다 깎이므로, 한 방이 무거워진 출원냥·특허범위냥은 방어 8짜리
   * 무효심판 청구인 앞에서 예전의 약 두 배를 낸다.
   * 전투 라운드가 일곱뿐이라 뒤로 갈수록 가파르게 잡았다 — 라운드 9 기준 적 체력 3.4배. */
  hpPerWave: 0.30,
  incomeBase: 10, incomePerWave: 3,    // 수입도 줄여서 후반 화력 스노우볼을 억제
  catCostMul: 1.0,           // 같은 종류를 더 배치해도 가격은 그대로 — 임용 비용은 항상 정가다
  pierceCap: 70, slowCap: 70,
  spawnGap: 0.52, spawnGapBoss: 2.0,   // 더 촘촘하게 몰아친다
  waveCount: 10,          // 한 판은 10라운드 — 그중 4·7·10 은 1:1 대전 (DUEL_WAVES)
  prepSecs: 15,              // 양쪽 모두 준비 단계에 들어선 뒤 주어지는 최대 준비시간(초)
  choiceSecs: 15,            // 패시브·증강 선택 제한시간(초). 넘기면 첫 번째가 자동으로 선택된다
  burstSecs: 8,              // 「우선권 주장」 증강의 지속시간(초)
  critCap: 0.75,             // 치명타 확률 상한 (증강으로도 이 위로는 못 올라간다)
  /* ── 승진 = 합성의 마지막 단계 ──
   * 예전에는 특허료를 내고 냥타워를 하나씩 「승진 임명」했다. 뽑기와 합성이 들어오면서
   * 「특허료를 들여 한 명을 키운다」는 자리가 합성과 그대로 겹쳐 버려서, 승진을 따로
   * 사는 것이 아니라 **합성의 마지막 단계**로 옮겼다.
   * 최고 레벨(promoteLv)에 닿은 냥타워는 저절로 승진냥이 된다 —
   * 선글라스 원화 · 샷건 · 방사 피해 · 치명타 보정이 레벨 보정 위에 얹힌다. */
  promoteLv: 3,              // 이 레벨에 닿으면 승진냥이 된다 (maxLv 와 같게 두는 것이 기본)
  promoteDmg: 1.25,          // 승진 시 공격력 배율
  promoteCritC: 0.12,        // 승진 시 치명타 확률 +12%p
  promoteCritM: 0.5,         // 승진 시 치명타 배율 +0.5
  promoteSplashR: 118,       // 승진냥 방사 피해 반경(px, 1칸 = 84px → 약 1.4칸)
  promoteSplash: 0.7,        // 방사 피해 비율 (직격 피해의 70%)

  /* ── 방해 공작 뽑기 ──
   * 무엇이 나갈지 고르지 않는다. 정액을 내고 다섯 중 하나를 무작위로 뽑아 상대 판에 던진다.
   * sabotageCost 는 다섯 공작의 가중 평균가(약 117)와 거의 같게 잡아, 뽑기 자체로는 손해도
   * 이득도 아니게 했다. sabotageDraws 는 한 웨이브 주기(준비 + 그 웨이브)에 뽑을 수 있는 횟수. */
  sabotageCost: 115,
  sabotageDraws: 2,

  /* ── 합성 ──
   * 같은 종류 · 같은 레벨 mergeNeed 명 → 한 단계 위 냥타워 하나.
   * 레벨이 오르면 공격력이 크게(lvDmg), 공속·사거리는 조금만(lvRate·lvRange) 오른다 —
   * 사거리까지 크게 늘리면 배치를 고민할 이유가 사라지기 때문이다.
   * 최고 레벨(maxLv)에 닿으면 그대로 승진냥이 되고, 더 합쳐지지 않는다. */
  mergeNeed: 3,
  maxLv: 3,
  lvDmg: 1.85, lvRate: 1.12, lvRange: 1.06,
  lvAura: 1.15,              // 변리사냥 보좌 배율은 레벨당 이만큼 곱해진다

  /* ── 빌드 계열 ──
   * 스테이지 강화는 열여섯 장이고 매번 passiveOffer 장만 뽑혀 나온다.
   * 이미 밀고 있는 계열의 카드가 더 잘 뽑히도록 가중치를 준다(lineBias) — 빌드가 흩어지지 않고
   * 모이도록, 그래서 「완성」이라는 것이 실제로 손에 닿도록 하기 위해서다. */
  passiveOffer: 4,
  lineBias: 0.7,             // 그 계열에 쌓은 점수 1점당 뽑힐 가중치 +0.7
  commonBias: 1.25,          // 계열 없는 공통 강화의 기본 가중치

  /* 조건부 강화가 보는 기준선 — 「무거운 한 방」·「연사」·「장사거리」의 경계 */
  refRange: 118,                       // 「기본 사거리」의 기준선(px, 약 1.4칸) — 📐 5단계가 이걸 넘는 만큼 값을 매긴다
  heavyRate: 1.35, heavyDmg: 0.40,     // 기본 공속 ≤1.35회/초 → 공격력 +40%/장
  rapidRate: 3.0,  rapidCrit: 0.16,    // 기본 공속 ≥3회/초  → 치명타 확률 +16%p/장
  longRange: 200,  longDmg: 0.35,      // 실제 사거리 ≥200px → 공격력 +35%/장
  auraDmgUp: 0.22, auraRateUp: 0.14,   // 「대리인 증원」 한 장당 보좌 배율 상승폭
  stunDur: 0.45,                       // 「보정기간 연장」으로 얻는 정지의 지속시간

  /* 계열 특수효과(3단계·5단계)가 푸는 상한과 값 */
  critCapHi: 1.0,            // 🎯 입증 3단계 — 치명타 확률 상한이 풀린다
  pierceCapHi: 100,          // 📐 권리범위 3단계 — 방어무시 상한이 풀린다
  slowCapHi: 90,             // ⏳ 절차 5단계 — 둔화 상한이 오른다
  tierRangeUp: 0.20,         // 📐 권리범위 3단계 — 사거리 +20%
  tierLongDmg: 0.14,         // 📐 권리범위 5단계 — 기본 사거리 초과분 100px 당 공격력 +14%
  tierSplashR: 0.50,         // 💥 침해 5단계 — 방사 반경 +50%
  tierSplashF: 0.50,         // 💥 침해 5단계 — 방사 피해 비율 +50%p
  tierSlowDmg: 0.30,         // ⏳ 절차 3단계 — 둔화된 침입자가 받는 피해 +30%
  tierStunC: 0.10,           // ⏳ 절차 5단계 — 모든 명중에 붙는 정지 확률
  tierStunD: 0.5,            // 그 정지의 지속시간
  tierCritCd: 0.40,          // 🎯 입증 5단계 — 치명타가 터지면 재장전 40% 단축
  tierAuraMul: 1.4,          // 💼 대리 5단계 — 보좌 배율 자체가 1.4배
};

return { AUGMENTS, AUGMENT_WAVES, BAL, CATS, CAT_SKILLS, CAT_WEIGHT_TOTAL, catDrawChance,
         DRAW_KEYS, DUEL, DUEL_WAVES, ENEMIES, LINES, LINE_TIER_AT, PASSIVES, PASSIVE_BY_KEY,
         RANK, RECIPES, SABOTAGE, SKILL_CD_LV, SKILL_MUL_LV, WAVES };
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
    ".TTT#T.T.",   // 3  둘째 터 — 가운데 한 칸은 조형물 꼭대기(전구·원자로)가 걸쳐 있어 비워 둔다
    ".T..X#.T.",   // 4  등록원부 — 나선의 끝. 좌우는 배경 원화의 조형물 자리(#)
    ".T.###.T.",   // 5  조형물 아랫단 — 심사관을 세울 수 없다
    ".T.....T.",   // 6  셋째 통로
    ".TTTTTTT.",   // 7
    ".........",   // 8  바깥 통로 (남)
  ],
  /**
   * 배경 원화 한가운데 조형물이 깔고 앉은 칸 — 몸통 6칸(x 3~5 × y 4~5)과 꼭대기 한 칸(4,3).
   * 판정상으로는 벽(#)이라 심사관을 세울 수 없고, 화면에는 원화가 그대로 보이도록
   * 벽 무늬 대신 투명하게 그린다 (buildBoardCells 가 .mon 을 붙인다).
   * 등록원부(4,4)와 마지막 진입 통로(3,4)도 같은 조형물 위라 함께 적어 둔다.
   */
  deco: [[4, 3], [3, 4], [4, 4], [5, 4], [3, 5], [4, 5], [5, 5]],
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
 *            uid:number, lv?:number, reg?:number,
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

/** 심사관과 맞닿은 유물들 */
function adjRelics(b, cat) {
  const s = adjCells(b, cat);
  return relics(b).filter((p) => s.has(`${p.x},${p.y}`));
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
const {CATS, BAL, CAT_SKILLS, SKILL_CD_LV, SKILL_MUL_LV} = __req("core/data.js");
const {cats, adjCellsLR} = __req("core/board.js");

/**
 * 「심사 병합」 증강용 넓은 보좌 범위 — 조각을 둘러싼 반경 r칸(대각선 포함).
 * 기본 보좌(adjCellsLR)는 변을 맞댄 터만 잡기 때문에, 나선 통로 하나를 사이에 둔
 * 안쪽/바깥쪽 줄에는 닿지 않는다. 반경 2면 통로를 건너 옆 줄까지 보좌가 퍼진다.
 */
function adjCellsWide(b, piece, r) {
  const s = new Set();
  for (let y = piece.y - r; y <= piece.y + piece.h - 1 + r; y++) {
    if (y < 0 || y >= b.rows) continue;
    for (let x = piece.x - r; x <= piece.x + piece.w - 1 + r; x++) {
      if (x < 0 || x >= b.cols) continue;
      if (x >= piece.x && x < piece.x + piece.w && y >= piece.y && y < piece.y + piece.h) continue;
      s.add(`${x},${y}`);
    }
  }
  return s;
}
/**
 * 이 냥타워의 실제 보좌 범위. 판 위 강조 표시도 같은 함수를 쓴다.
 * 「심사 병합」 증강, 또는 💼 대리 계열 5단계(특허법인 설립)에 닿으면 반경 2칸으로 퍼진다.
 */
const auraCells = (b, piece) =>
  ((b.augSet && b.augSet.has("auraWide")) || (b.lineTier && b.lineTier.aide >= 2))
    ? adjCellsWide(b, piece, 2) : adjCellsLR(b, piece);

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
  const live = cats(b);
  const bonus = b.bonus || {};
  /** 누적된 강화값 하나 (없으면 0) */
  const B = (k) => bonus[k] || 0;
  const bMul = (k) => Math.max(0.2, 1 + B(k));
  const ATTACK_RATE_MULT = 2.2;   // 공속 상향 — 균형을 위해 WAVES 스폰 수도 함께 늘렸다
  /** 선택한 증강 (Set). 증강이 없으면 아래 분기는 전부 건너뛴다. */
  const AUG = b.augSet || new Set();
  /** 계열 단계 — {splash:0|1|2, crit:…} . 3점에 1단계, 5점에 2단계가 열린다 */
  const TR = b.lineTier || {};
  const tier = (k) => TR[k] || 0;

  // 「선행기술 총동원」 — 같은 종류를 몇 명이나 세웠는지 미리 센다
  const sameKind = {};
  if (AUG.has("mono")) for (const c of live) sameKind[c.key] = (sameKind[c.key] || 0) + 1;

  // 기본 스탯 (+ 증강으로 바뀐 규칙 + 패시브로 누적된 자기강화/상대약화 배율)
  for (const c of live) {
    const base = CATS[c.key];
    let dmg = base.dmg, rate = base.rate, range = base.range;
    let pierce = base.pierce || 0;
    let critC = base.critC || 0, critM = base.critM || 1;
    let auraDmg = base.auraDmg || 0, auraRate = base.auraRate || 0;
    const isAide = !!(auraDmg || auraRate);   // 보좌 능력을 가진 냥 (변리사냥)

    /* ── 합성 레벨 ──
     * 같은 종류 셋을 합치면 레벨이 하나 오른다. 공격력은 크게, 공속·사거리는 조금만 오른다 —
     * 사거리까지 크게 늘리면 어디에 세울지 고민할 이유가 사라지기 때문이다.
     * 비전투 변리사냥에는 dmg/rate/range 가 0이라 아무 일도 일어나지 않으므로,
     * 보좌 배율(auraDmg·auraRate)을 대신 레벨만큼 키워 준다. */
    const lv = Math.max(1, c.lv || 1);
    if (lv > 1) {
      const n = lv - 1;
      dmg *= Math.pow(BAL.lvDmg, n);
      rate *= Math.pow(BAL.lvRate, n);
      range *= Math.pow(BAL.lvRange, n);
      if (auraDmg) auraDmg = 1 + (auraDmg - 1) * Math.pow(BAL.lvAura, n);
      if (auraRate) auraRate = 1 + (auraRate - 1) * Math.pow(BAL.lvAura, n);
    }

    // ── 증강: 규칙 자체를 바꾸는 것들 ──
    if (AUG.has("agentWar")) {
      // 변리사 개업 — 보좌형이 최전선에 서고, 나머지는 대리인에게 맡긴 채 손을 놓는다.
      // 개업 화력에도 합성 레벨을 얹는다 — 안 그러면 애써 합성한 변리사냥이 1레벨과 똑같아진다.
      if (isAide) {
        dmg = Math.max(dmg, 32 * Math.pow(BAL.lvDmg, lv - 1));
        rate = Math.max(rate, 1.1 * Math.pow(BAL.lvRate, lv - 1));
        range = Math.max(range, 210 * Math.pow(BAL.lvRange, lv - 1));
      } else dmg *= 0.65;
    }
    if (AUG.has("overwork")) { rate *= 1.65; dmg *= 0.8; }
    if (AUG.has("longspec")) range *= 1.4;
    if (AUG.has("isr")) pierce += 40;
    if (AUG.has("precision")) { critC += 0.15; critM += 0.6; }
    if (AUG.has("mono") && sameKind[c.key] >= 3) dmg *= 1.5;
    const golden = AUG.has("golden") && b.goldenUid === c.uid;
    if (golden) dmg *= 3;
    if (AUG.has("auraWide") && isAide) { auraDmg = Math.max(auraDmg, 1.55); auraRate = Math.max(auraRate, 1.35); }

    /* ── 승진 = 합성의 마지막 단계 ──
     * 최고 레벨(BAL.promoteLv)에 닿으면 저절로 승진냥이 되어 선글라스·샷건이 붙는다.
     * 단 **실제로 사격하는 냥만** 승진한다 — 쏘지 않는 변리사냥에게 샷건을 쥐여 줘도 쓸 데가 없고,
     * 판에서만 「승」 딱지가 붙어 헷갈린다. 「변리사 개업」으로 직접 싸우게 됐다면 그때는 승진한다.
     * 증강을 다 반영한 뒤에 계산하는 이유가 이것이다.
     * (레벨이 오른 비전투 변리사냥은 대신 보좌 배율이 세진다 — 위 auraDmg/auraRate 참고) */
    const promoted = lv >= BAL.promoteLv && dmg > 0 && rate > 0 && range > 0;
    if (promoted) { dmg *= BAL.promoteDmg; critC += BAL.promoteCritC; critM += BAL.promoteCritM; }

    /* ══ 빌드 계열 — 스테이지 강화로 쌓은 것이 여기서 냥타워에 실린다 ══
     *
     * 조건부 강화(무거운 한 방 · 연사 · 장사거리)는 **CATS 에 적힌 기본 공속**을 기준으로 본다.
     * 레벨·증강·보좌로 흔들리는 실제 공속을 보면 「지금 이 냥이 무거운 냥인가」가 프레임마다
     * 뒤집혀, 무엇이 걸렸는지 화면에서 읽을 수 없게 된다. 사거리만은 예외로 **실제 사거리**를
     * 본다 — 「명세서 보정」으로 사거리를 늘려 원래 짧던 냥을 조건에 밀어 넣는 것이
     * 📐 권리범위 덱의 재미 그 자체이기 때문이다. */
    const baseRate = base.rate || 0;
    // 🔨 손해액 산정 — 한 방이 무거운 냥일수록 배상액이 크다
    if (B("heavy") && baseRate > 0 && baseRate <= BAL.heavyRate) dmg *= 1 + BAL.heavyDmg * B("heavy");
    // 🩸 고의 입증 — 여러 건을 들이대야 고의가 드러난다 (연사형 전용)
    if (B("rapid") && baseRate >= BAL.rapidRate) critC += BAL.rapidCrit * B("rapid");

    // 사거리를 먼저 확정한다 — 아래 두 줄이 「확정된 사거리」를 보고 값을 매기기 때문이다
    range *= bMul("range");
    if (tier("pierce") >= 1) range *= 1 + BAL.tierRangeUp;      // 📐 3단계 「균등론」
    // 🔍 선행조사 — 멀리까지 뒤져 본 만큼 날카롭다
    if (B("longR") && range >= BAL.longRange) dmg *= 1 + BAL.longDmg * B("longR");
    // 📐 5단계 「원천특허」 — 기본 사거리를 넘긴 만큼 그대로 공격력이 된다
    if (tier("pierce") >= 2 && range > BAL.refRange)
      dmg *= 1 + (range - BAL.refRange) / 100 * BAL.tierLongDmg;

    // 🌍 국제조사보고서 — 방어무시. 📐 3단계에 닿으면 상한이 풀린다
    pierce += B("pierce");
    const pierceCap = tier("pierce") >= 1 ? BAL.pierceCapHi : BAL.pierceCap;

    // 🎯 핵심청구항 · ⚖️ 3배 배상 — %가 아니라 확률·배율에 그대로 더하는 절대값이다.
    // 🎯 3단계에 닿으면 확률 상한(75%)이 100% 까지 풀린다.
    critC += B("critC"); critM += B("critM");
    const critCap = tier("crit") >= 1 ? BAL.critCapHi : BAL.critCap;

    // ⏳ 절차 지연 — 둔화가 없던 냥타워도 둔화를 얻는다. ⏳ 5단계에 닿으면 상한이 90% 로 오른다
    const slowCap = tier("control") >= 2 ? BAL.slowCapHi : BAL.slowCap;
    const slow = Math.min(slowCap, (base.slow || 0) + B("slow"));

    // 🌐 공동출원 · 💼 3단계 「공동대리」 — 한 번에 조준하는 수가 늘어난다
    const targets = (base.targets || 1) + B("targets") + (tier("aide") >= 1 ? 1 : 0);

    // 💼 대리인 증원 · 💼 5단계 「특허법인 설립」 — 보좌 배율. 변리사냥이 없으면 아무 일도 없다
    if (isAide && B("aura")) {
      if (auraDmg) auraDmg += BAL.auraDmgUp * B("aura");
      if (auraRate) auraRate += BAL.auraRateUp * B("aura");
    }
    if (isAide && tier("aide") >= 2) {
      if (auraDmg) auraDmg = 1 + (auraDmg - 1) * BAL.tierAuraMul;
      if (auraRate) auraRate = 1 + (auraRate - 1) * BAL.tierAuraMul;
    }

    /* 방사 피해 — 예전에는 **승진냥 전용**이라 「방사 빌드」라는 것이 아예 없었다.
     * 지금은 💥 균등침해로 누구나 얻을 수 있고, 승진은 그 위에 더 얹히는 식이다.
     * 🧨 폐기명령은 **이미 가진 것을 키우기만** 한다 — 먼저 방사를 얻어 두어야 값을 한다. */
    let splashR = B("splashR"), splashF = B("splashF");
    if (promoted) { splashR += BAL.promoteSplashR; splashF += BAL.promoteSplash; }
    if (splashR > 0) {
      if (B("splashUpR")) { splashR *= 1 + B("splashUpR"); splashF += B("splashUpF"); }
      if (tier("splash") >= 2) { splashR *= 1 + BAL.tierSplashR; splashF += BAL.tierSplashF; }   // 💥 5단계
    }

    /* 정지 — ⏱️ 보정기간 연장과 ⏳ 5단계는 **정지가 없던 냥에게도** 확률을 준다.
     * 원래 정지를 가진 조기공개냥은 자기 지속시간(0.6초)을 그대로 지킨다. */
    let stunC = (base.stunC || 0) * Math.pow(1.2, lv - 1);
    let stunD = base.stunD || 0;
    const addStun = B("stunC") + (tier("control") >= 2 ? BAL.tierStunC : 0);
    if (addStun > 0) { stunC += addStun; if (!stunD) stunD = BAL.stunDur; }

    /* 고유 스킬 — 합성으로만 나오는 특수 냥타워 다섯만 갖는다.
     * 쿨이 차면 저절로 터지고, 그때 화면 아래에 캐릭터 컷인이 뜬다. */
    const skDef = CAT_SKILLS[c.key];
    const skill = skDef ? {
      key: c.key, cd: skDef.cd * Math.pow(SKILL_CD_LV, lv - 1),
      mul: (skDef.mul || 0) * Math.pow(SKILL_MUL_LV, lv - 1),
      rMul: skDef.rMul || 1, n: skDef.n || 0,
      slow: skDef.slow || 0, slowD: skDef.slowD || 0, stun: skDef.stun || 0,
      exec: skDef.exec || 0, bossHp: skDef.bossHp || 0,
      gold: skDef.gold || 0, goldD: skDef.goldD || 0,
    } : null;

    c.st = {
      dmg: dmg * bMul("dmg"), rate: rate * ATTACK_RATE_MULT * bMul("rate"), range,
      pierce: Math.min(pierceCap, pierce),
      targets,
      critC: Math.min(critCap, Math.max(0, critC)),
      critM: Math.max(1, critM),
      slow,
      auraDmg, auraRate,
      // 실제로 사격을 하는가. 변리사냥은 평소 0이지만 「변리사 개업」을 고르면 이 값이 켜진다.
      atk: dmg > 0 && rate > 0 && range > 0,
      golden, promoted, lv,
      // {r: 반경(px), f: 직격 대비 비율} — 둘 다 있어야 방사가 성립한다
      splash: (splashR > 0 && splashF > 0) ? { r: splashR, f: splashF } : null,
      /* ── 계열 특수효과 중 「전투 중에 판정하는」 것들 ──
       * 능력치가 아니라 규칙이라 여기 깃발로 실어 combat/duel 양쪽이 같은 것을 본다. */
      splashPierce: tier("splash") >= 1,          // 💥 3단계 — 방사가 방어를 완전히 무시한다
      critPierce: tier("crit") >= 1,              // 🎯 3단계 — 치명타가 방어를 무시한다
      critCd: tier("crit") >= 2 ? BAL.tierCritCd : 0,   // 🎯 5단계 — 치명타가 재장전을 당긴다
      slowDmg: tier("control") >= 1 ? BAL.tierSlowDmg : 0, // ⏳ 3단계 — 둔화된 적에게 더 아프게
      skill,
      /* ── 특수 냥타워의 규칙 ── (이종 합성으로만 얻는다. 없으면 전부 0/null 이라 분기가 통째로 꺼진다)
       * chain   명중이 근처 적으로 튄다 {n:튀는 수, r:반경(px), f:피해 비율}. 레벨이 오르면 한 번 더 튄다
       * stunC/D 명중 시 확률 stunC 로 stunD 초 완전 정지 (가처분과 같은 묶임)
       * exec    체력이 최대치의 이 비율 이하인 침입자를 즉시 제거 (보스는 예외)
       * bounty  이 냥이 처치했을 때의 특허료 추가 배율 */
      chain: base.chain ? { n: base.chain.n + (lv - 1), r: base.chain.r * Math.pow(BAL.lvRange, lv - 1),
                            f: base.chain.f } : null,
      stunC: Math.min(0.85, stunC),
      stunD,
      exec: Math.min(0.4, (base.exec || 0) * Math.pow(1.25, lv - 1)),
      bounty: (base.bounty || 0) * Math.pow(1.3, lv - 1),
      buffDmg: 1, buffRate: 1,
    };
    // 연쇄가 또 연쇄를 부르면 한 발이 판 전체를 쓸어버린다 — 튄 피해에 쓸 사본을 미리 만들어 둔다
    // (매 발 객체를 새로 만들면 초당 수백 개가 쌓인다)
    if (c.st.chain) c.st.chainSrc = Object.assign({}, c.st, { chain: null, splash: null });
  }

  // 인접 보좌 — 실제로 이어진 터 칸에만 배율을 곱한다.
  // 「심사 병합」 증강을 고르면 통로를 건너 반경 2칸까지 퍼진다.
  for (const a of live) {
    if (!a.st.auraDmg && !a.st.auraRate) continue;
    const adjSet = auraCells(b, a);
    for (const c of live) {
      if (c === a) continue;
      if (pieceCells(c).some((k) => adjSet.has(k))) {
        c.st.buffDmg *= a.st.auraDmg || 1;
        c.st.buffRate *= a.st.auraRate || 1;
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

return { auraCells, computeStats };
})();
__mods["core/combat.js"] = (function(){
// @ts-check
const {ENEMIES, BAL} = __req("core/data.js");
const {cats, pieceCenter, posOnPath} = __req("core/board.js");
/**
 * 적 하나에 피해를 준다. 처치 시 보상 지급 + 이벤트.
 * @param {any} g 게임 상태
 * @param {any} e 적
 * @param {number} amt
 * @param {any} src 공격자의 st (또는 {})
 * @param {boolean} [crit] 이 명중이 치명타였는가 (🎯 3단계가 이걸 본다)
 * @param {boolean} [isSplash] 직격이 아니라 방사 피해인가 (💥 3단계가 이걸 본다)
 */
function damage(g, e, amt, src, crit, isSplash) {
  /* ── 계열 특수효과: 방어를 어떻게 뚫는가 ──
   * 💥 3단계「간접침해」는 방사가, 🎯 3단계「입증책임 전환」은 치명타가 방어를 통째로 무시한다.
   * 방어는 명중마다 깎이는 값이라, 이 둘은 방어 13짜리 특허괴물 앞에서 특히 크게 벌어진다. */
  let pierce = src.pierce || 0;
  if (isSplash && src.splashPierce) pierce = 100;
  if (crit && src.critPierce) pierce = 100;
  // ⏳ 3단계「절차 중지」 — 이미 둔화에 걸려 있는 적에게 더 아프게 들어간다
  // (이번 명중이 거는 둔화는 아래에서 걸리므로, 여기서 보는 것은 「직전까지의 상태」다)
  if (src.slowDmg && e.slowT > 0) amt *= 1 + src.slowDmg;

  const def = ENEMIES[e.t].def * (1 - pierce / 100);
  e.hp -= Math.max(1, amt - def);

  if (src.slow) { e.slowT = 1.6; e.slowPct = Math.min(BAL.slowCap, src.slow) / 100; }

  // ── 특수 냥타워 (이종 합성) ──
  // 조기공개냥 — 명중마다 확률로 그 자리에 묶는다. 가처분과 같은 묶임이라 피해는 그대로 들어간다.
  if (src.stunC && Math.random() < src.stunC) {
    e.freezeT = Math.max(e.freezeT || 0, src.stunD || 0);
    if (!e.dead) g.events.push({ t: "stun", x: e.x, y: e.y });
  }
  // 무효사유냥 — 다 죽어가는 침입자는 흠을 찾아 그 자리에서 끝낸다.
  // 특허괴물만은 예외다 — 최종 보스를 체력 18%에서 지워 버리면 보스전이 성립하지 않는다.
  if (src.exec && !e.dead && e.hp > 0 && e.t !== "boss" && e.hp <= e.max * src.exec) {
    e.hp = 0;
    g.events.push({ t: "exec", x: e.x, y: e.y });
  }

  if (e.hp <= 0 && !e.dead) {
    e.dead = true;
    // 수수료징수냥이 잡으면 특허료가 그만큼 더 들어온다
    // 「수수료 환급」(g.goldMul)과 수수료징수냥(src.bounty)이 겹쳐 실린다
    // 「수수료 환급」(g.goldMul) · 수수료징수냥(src.bounty) · 그 냥의 스킬 「과징금 부과」(g.feeMul)가
    // 전부 겹쳐 실린다
    const reward = ENEMIES[e.t].rw * (1 + g.econ.killGold / 100) *
                   (1 + (src.bounty || 0)) * (g.goldMul || 1) * (g.feeMul || 1);
    g.gold += reward;
    g.killed++;
    // k/face 는 사망 연출용 — 어느 쥐가 어느 쪽을 보고 쓰러졌는지 알아야 사망 3컷을 맞게 그린다
    g.events.push({ t: "kill", x: e.x, y: e.y, reward: Math.round(reward), k: e.t, face: e._face === -1 ? -1 : 1 });
  }
}

/**
 * 특수 냥타워(합성으로만 나오는 다섯)의 **고유 스킬**을 한 번 터뜨린다.
 *
 * 누를 것이 없다 — 쿨이 차 있고 사거리 안에 표적이 있으면 저절로 터진다. 표적이 하나도 없으면
 * 쿨을 0에 붙잡아 두고 기다리므로, 침입자가 들어오는 그 순간에 터진다 (허공에 새지 않는다).
 *
 * @param {any} g @param {any} c 냥타워 조각 @param {any} sk c.st.skill
 * @param {any[]} list 이 스킬이 실제로 때릴 침입자들 @param {number} cx @param {number} cy
 * @param {number} reach 이 스킬이 닿은 거리(px) — 연출용 고리의 반지름
 */
function fireSkill(g, c, sk, list, cx, cy, reach) {
  const amount = c.st.dmg * (sk.mul || 0);
  // 컷인·고리 연출은 렌더러가 맡는다. 판정은 여기서 이미 다 끝난다.
  g.events.push({ t: "skill", key: c.key, uid: c.uid, x: cx, y: cy, r: reach,
                  lv: c.st.lv, n: list.length });
  for (const e of list) {
    if (e.dead) continue;
    if (sk.stun) e.freezeT = Math.max(e.freezeT || 0, sk.stun);
    if (sk.slow) { e.slowT = sk.slowD; e.slowPct = Math.min(BAL.slowCap, sk.slow) / 100; }
    if (sk.exec) {
      // 무효 심결 — 흠이 있는 것은 지운다. 특허괴물만은 지워지지 않고 최대 체력의 일부만 잃는다
      // (100 특허료도 아닌 자동 스킬로 최종 보스를 삭제하면 보스전이 성립하지 않는다).
      if (e.t === "boss") damage(g, e, e.max * sk.bossHp, { pierce: 100 });
      else if (e.hp > 0 && e.hp <= e.max * sk.exec) {
        e.hp = 0;
        g.events.push({ t: "exec", x: e.x, y: e.y });
      }
    }
    if (amount > 0) damage(g, e, amount, c.st);
    e.hitT = 0.22;
    e.hitCrit = true;
    e.hitAng = Math.atan2(e.y - cy, e.x - cx);
  }
  // 과징금 부과 — 잠깐 동안 처치 보상이 불어난다 (대전장에는 처치 보상이 없어 실리지 않는다)
  if (sk.gold) { g.feeMul = 1 + sk.gold; g.feeT = sk.goldD; }
}

/**
 * 전투 한 틱. 시간이 흐르는 유일한 곳.
 * @param {any} g
 * @param {number} dt 초
 * @param {number} now ms (애니메이션 프레임 계산용)
 */
function step(g, dt, now) {
  if (!g.lanes.length) return;

  // 「우선권 주장」 증강 — 웨이브 개시 직후 잠깐 동안 전체 공속 2배
  const burst = (g.augSet && g.augSet.has("burst") && g.waveTime < BAL.burstSecs) ? 2 : 1;

  // 상대가 건 방해 공작 — 전투가 흐르는 동안에만 닳는다.
  // (준비 단계에서 맞았다면 다음 웨이브가 시작되는 순간부터 흐르기 시작한다는 뜻이다.)
  const fx = g.fx;
  if (fx.hasteT > 0) fx.hasteT = Math.max(0, fx.hasteT - dt);
  if (fx.fogT > 0) fx.fogT = Math.max(0, fx.fogT - dt);
  const hasteMul = g.enemySpeedMul;
  const rangeMul = g.catRangeMul;

  // 「과징금 부과」로 불어난 특허료 배율 — 전투가 흐르는 동안에만 닳는다
  if (g.feeT > 0) { g.feeT -= dt; if (g.feeT <= 0) { g.feeT = 0; g.feeMul = 1; } }

  /* ── 고유 스킬 ── 사격보다 먼저 본다.
   * 사격 재장전과 별개의 시계라, 평소 쏘느라 바쁜 냥도 쿨이 차면 그 자리에서 터뜨린다. */
  for (const c of cats(g)) {
    const sk = c.st && c.st.skill;
    if (!sk || !c.st.atk) continue;          // 쏘지 못하는 냥은 스킬도 못 쓴다 (대전장과 같은 규칙)
    if (c.skCd == null) c.skCd = sk.cd;      // 판에 서자마자 터지지 않도록 한 번은 채워 두고 시작한다
    if (c.skCd > 0) { c.skCd -= dt; continue; }
    const [sx, sy] = pieceCenter(c);
    const reach = c.st.range * rangeMul * (sk.rMul || 1);
    const list = [];
    for (const e of g.enemies) {
      if (e.dead) continue;
      if (Math.hypot(e.x - sx, e.y - sy) > reach) continue;
      list.push(e);
    }
    if (!list.length) { c.skCd = 0; continue; }   // 표적이 없다 — 쿨을 붙잡아 두고 기다린다
    list.sort((a, b) => b.dist - a.dist);         // 가장 앞선 적부터
    c.skCd = sk.cd;
    fireSkill(g, c, sk, sk.n ? list.slice(0, sk.n) : list, sx, sy, reach);
  }

  // ── 사격 ──
  for (const c of cats(g)) {
    // 실제로 사격하는가는 st.atk 가 정한다 — 「변리사 개업」을 고르면 보좌형도 여기에 들어온다
    if (!c.st || !c.st.atk) continue;
    c.cd = (c.cd || 0) - dt;
    if (c.cd > 0) continue;

    const [cx, cy] = pieceCenter(c);
    const reach = c.st.range * rangeMul;      // 「심사 방해 연막」을 맞으면 사거리가 줄어든다
    const inRange = [];
    for (const e of g.enemies) {
      if (e.dead) continue;
      if (Math.hypot(e.x - cx, e.y - cy) > reach) continue;
      inRange.push(e);
    }
    if (!inRange.length) continue;
    inRange.sort((a, b) => b.dist - a.dist); // 가장 앞선 적부터

    c.cd = 1 / (c.st.rate * burst);
    c.atkEnd = now + g.atkTotal;
    const col = c.st.slow ? "#79b7d8" : "#69b6d6";
    const n = Math.min(c.st.targets, inRange.length);
    const isLong = c.key === "claim";          // 특허범위냥 — 장거리 미사일 전용 연출
    let anyCrit = false;                       // 한 번 쏘는 동안 치명타가 하나라도 났는가
    for (let i = 0; i < n; i++) {
      const target = inRange[i];
      const crit = Math.random() < c.st.critC;
      if (crit) anyCrit = true;
      const dist = Math.hypot(target.x - cx, target.y - cy);
      const life = isLong ? Math.min(0.7, Math.max(0.26, dist / 620)) : 0.13;
      const amount = c.st.dmg * (crit ? c.st.critM : 1);

      if (c.st.splash) {
        // 승진냥 — 샷건. 탄이 퍼지는 궤적을 몇 가닥 더 그리고, 명중 지점 둘레에 방사 피해를 준다.
        const ang = Math.atan2(target.y - cy, target.x - cx);
        for (let k = -1; k <= 1; k++) {
          if (!k) continue;
          const a = ang + k * 0.13;
          g.shots.push({ x1: cx, y1: cy, x2: cx + Math.cos(a) * dist, y2: cy + Math.sin(a) * dist,
                         col: "#ffcf8a", w: 1.4, life: 0.1, max: 0.1, crit: false, long: false });
        }
        g.shots.push({ ring: true, x1: target.x, y1: target.y, r: c.st.splash.r,
                       col: "#ff9a5c", life: 0.2, max: 0.2 });
      }

      g.shots.push({ x1: cx, y1: cy, x2: target.x, y2: target.y,
                     col: crit ? "#cda43a" : col, w: crit ? 3 : 2, life, max: life, crit, long: isLong });
      damage(g, target, amount, c.st, crit);
      // 명중 연출 — 몸통이 잠깐 번쩍이고 살짝 튕긴다. 타이밍은 발사와 동시(즉발 데미지),
      // 미사일이 날아가는 건 순수 연출이라 실제 피격 반응은 여기서 바로 건다.
      target.hitT = crit ? 0.22 : 0.14;
      target.hitCrit = crit;
      target.hitAng = Math.atan2(target.y - cy, target.x - cx);

      // 방사 피해 — 직격을 맞은 적 주변까지 함께 쓸어 버린다
      if (c.st.splash) {
        for (const e2 of g.enemies) {
          if (e2 === target || e2.dead) continue;
          if (Math.hypot(e2.x - target.x, e2.y - target.y) > c.st.splash.r) continue;
          damage(g, e2, amount * c.st.splash.f, c.st, false, true);
          e2.hitT = Math.max(e2.hitT, 0.12);
          e2.hitAng = Math.atan2(e2.y - target.y, e2.x - target.x);
        }
      }

      // 연쇄 — 인용문헌냥. 명중한 자리에서 가장 가까운 적으로 차례차례 튄다.
      // 튄 피해에는 chainSrc(연쇄를 뺀 사본)를 쓴다 — 안 그러면 한 발이 판 전체를 쓸어 버린다.
      if (c.st.chain) {
        const hopped = [target];
        let from = target, dmgLeft = amount * c.st.chain.f;
        for (let h = 0; h < c.st.chain.n; h++) {
          let next = null, best = c.st.chain.r;
          for (const e2 of g.enemies) {
            if (e2.dead || hopped.includes(e2)) continue;
            const d2 = Math.hypot(e2.x - from.x, e2.y - from.y);
            if (d2 < best) { best = d2; next = e2; }
          }
          if (!next) break;
          g.shots.push({ x1: from.x, y1: from.y, x2: next.x, y2: next.y,
                         col: "#6fe0d0", w: 1.6, life: 0.16, max: 0.16, crit: false, long: false });
          damage(g, next, dmgLeft, c.st.chainSrc);
          next.hitT = Math.max(next.hitT, 0.12);
          next.hitAng = Math.atan2(next.y - from.y, next.x - from.x);
          hopped.push(next);
          from = next;
          dmgLeft *= c.st.chain.f;   // 튈수록 약해진다
        }
      }
    }
    // 치명타! — 쏜 냥타워 자리에 붉은 글씨가 떠오른다 (연출은 렌더러가 맡는다)
    if (anyCrit) {
      g.events.push({ t: "crit", uid: c.uid, x: cx, y: cy });
      // 🎯 5단계「고의침해 인정」 — 치명타가 재장전을 당긴다. 확률이 높을수록 이게 더 자주
      // 걸리므로, 치명타를 쌓은 만큼 실제 공속까지 같이 올라간다 (치명타가 치명타를 부른다).
      if (c.st.critCd) c.cd *= 1 - c.st.critCd;
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
    e.dist += ENEMIES[e.t].spd * (e.slowT > 0 ? 1 - e.slowPct : 1) * hasteMul * dt;

    if (e.dist >= lane.segs.total) {
      e.dead = true;
      const d = ENEMIES[e.t];
      g.hp -= d.leak;
      g.leaked++;
      g.events.push({ t: "leak", x: e.x, y: e.y, enemy: e.t, hp: g.hp });
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
    // 「무효자료 보강」을 맞은 웨이브는 여기서 체력이 통째로 부풀려진다
    const scale = (1 + BAL.hpPerWave * (g.wave - 1)) * g.waveFx.hp;
    const lane = g.lanes[q.lane] || g.lanes[0];
    g.enemies.push({
      t: q.t, lane: q.lane ?? 0, hp: d.hp * scale, max: d.hp * scale, dist: 0,
      x: lane.pathPx[0][0], y: lane.pathPx[0][1],
      slowT: 0, slowPct: 0, freezeT: 0, hitT: 0, hitCrit: false, hitAng: 0,
    });
  }
  g.waveTime += dt;
}

return { damage, step };
})();
__mods["core/duel.js"] = (function(){
// @ts-check
/**
 * 1:1 대전(DUEL) — **오토배틀러**. 덱 대 덱.
 *
 * ── 어떤 싸움인가 ──
 * 옆에서 본 한 줄짜리 전장이다. 양끝에 진영 깃발이 하나씩 서 있고, 시작하면 양쪽이 지금까지
 * 만든 냥타워가 **한 명도 빠짐없이** 진형을 짜고 서서 저절로 진군한다. 마주친 적이 사거리에
 * 들어오면 멈춰 서서 쏜다.
 *
 * **성채는 없다.** 두들길 것은 서로의 냥타워뿐이고, **먼저 전멸하는 쪽이 진다.**
 * 지킬 건물이 따로 있으면 「무엇을 만들었는가」가 아니라 「누가 먼저 벽을 뚫었는가」로
 * 승부가 새기 때문이다. 여기서는 덱과 덱만 남는다.
 *
 * 손댈 것이 아무것도 없다 — 특허료도 없고 출격 카드도 없다. 그래서 승부를 가르는 것은
 * **오직 「무엇을 만들었는가」** 하나다: 증강 · 스테이지 강화 · 합성 레벨이 전부 실린
 * 두 덱을 그대로 붙여 자웅을 가리는 자리다.
 *
 * 진형은 **사거리 순**으로 선다 — 짧은 냥이 앞에서 몸으로 막고, 긴 냥이 뒤에서 쏘고,
 * 비전투 변리사냥은 맨 뒤에서 다친 아군을 손본다. 그래서 무엇을 얼마나 뽑았는지뿐 아니라
 * **덱의 구성**(앞을 세울 것이 있는지, 뒤에서 때릴 것이 있는지)도 그대로 승부에 실린다.
 *
 * ── 결과를 어떻게 맞추나 ──
 * 서버는 전투를 계산하지 않는다(중계만 한다). 이제는 사람이 손댈 일이 없어 시뮬레이션이 완전히
 * 결정적이므로, 같은 명세 · 같은 시드를 넣은 두 화면은 원래 같은 결과에 닿는다. 그래도
 * **승패는 p1 쪽 계산을 정본으로 삼는다** — 브라우저마다 Math.pow 같은 초월함수의 끝자리가
 * 다를 수 있어, 「나는 이겼는데 상대도 이겼다」가 만에 하나라도 생기지 않게 못 박아 둔다.
 * (솔로에서는 붙을 사람이 없으니 내 계산이 곧 정본이다.)
 *
 * 시간간격은 여전히 고정(DUEL.dt)이다 — 프레임이 끊겨도 싸움의 속도가 달라지지 않도록.
 */
const {Rng} = __req("core/rng.js");
const {CATS, ENEMIES, BAL, DUEL} = __req("core/data.js");
const {cats} = __req("core/board.js");

const W = DUEL.w, DT = DUEL.dt;
/** 진영 기준선 x. a 는 왼쪽, b 는 오른쪽. 진형이 여기서부터 앞으로 서고, 벽 노릇도 한다. */
const campX = (side) => (side === "a" ? DUEL.campX : W - DUEL.campX);
/** 그 편이 나아가는 방향 (+1 오른쪽 / −1 왼쪽) */
const dirOf = (side) => (side === "a" ? 1 : -1);

/**
 * 내 판을 대전장 명세로 옮긴다.
 *
 * 여기서 나오는 객체가 그대로 상대에게 전송되고, 내 시뮬레이션에도 그대로 들어간다.
 * 키를 짧게 쓴 것은 판을 가득 채우면 27명이라 그냥 두면 payload 가 꽤 커지기 때문이다.
 *
 * 방어무시(pierce)는 대전장에서 쓸 데가 없다 — 유닛에는 침입자 같은 방어력이 없다.
 * 그렇다고 특허범위냥의 특성과 「국제조사보고서」 증강을 통째로 죽이면 아까우니,
 * 방어무시 100%p 당 공격력 +50% 로 환산해 공격력에 미리 녹여 둔다.
 *
 * @param {any} game
 * @returns {any[]}
 */
function makeRoster(game) {
  return cats(game).filter((c) => c.st).map((c) => {
    const d = CATS[c.key], s = c.st, lv = s.lv || 1;
    const hp = Math.round((DUEL.hpBase + d.cost * DUEL.hpPerCost) *
      Math.pow(DUEL.hpLv, lv - 1) * (s.promoted ? DUEL.hpPromo : 1));
    const r3 = (v) => +(+v).toFixed(3);
    return {
      k: c.key, lv, pr: !!s.promoted, hp,
      // 값어치 — 청사에서의 임용가에 합성 레벨을 얹은 값. 싸움에는 쓰이지 않고,
      // 「내 덱이 얼마짜리인가」를 덱 표시줄에 적는 데만 쓴다.
      cost: Math.round(d.cost * Math.pow(BAL.mergeNeed, lv - 1)),
      dmg: r3(s.dmg * (1 + (s.pierce || 0) / 200)),
      rate: r3(s.rate),
      range: Math.round(s.range * DUEL.rangeMul),
      tg: s.targets || 1,
      cc: r3(s.critC), cm: r3(s.critM),
      sl: s.slow || 0,
      sp: s.splash ? Math.round(s.splash.r * DUEL.rangeMul) : 0,
      spf: s.splash ? r3(s.splash.f) : 0,
      // 특수 냥타워의 규칙은 대전장에서도 그대로 산다 — 연쇄는 옆 유닛으로 튀고,
      // 정지는 그 유닛의 차례를 통째로 건너뛰게 하고, 즉사는 다 죽어가는 유닛을 끝낸다.
      // 징수(bounty)만은 대전장에 처치 보상이 없어 빠진다.
      ch: s.chain ? { n: s.chain.n, r: Math.round(s.chain.r * DUEL.rangeMul), f: r3(s.chain.f) } : null,
      stC: r3(s.stunC || 0), stD: r3(s.stunD || 0),
      ex: r3(s.exec || 0),
      /* ── 빌드 계열 중 대전장에서도 뜻이 있는 것들 ──
       * 방어를 뚫는 효과(💥 3단계·🎯 3단계)는 여기서는 실을 곳이 없다 — 대전장 유닛에는
       * 침입자 같은 방어력이 아예 없고, 방어무시는 이미 위에서 공격력으로 환산해 녹였다.
       * 반면 둔화 피해 증폭(sd)과 치명타 재장전 단축(ccd)은 그대로 산다. */
      sd: r3(s.slowDmg || 0),
      ccd: r3(s.critCd || 0),
      /* 합성 냥타워의 고유 스킬. 사거리 관련 값만 대전장 배율로 옮겨 담는다 —
       * 이게 실려야 「애써 합성한 것」이 대전 라운드에서도 눈에 보인다. */
      sk: s.skill ? {
        k: s.skill.key, cd: r3(s.skill.cd), mul: r3(s.skill.mul), rMul: r3(s.skill.rMul),
        n: s.skill.n, sl: s.skill.slow, slD: r3(s.skill.slowD), st: r3(s.skill.stun),
        ex: r3(s.skill.exec), bh: r3(s.skill.bossHp),
      } : null,
      atk: !!s.atk,
    };
  });
}

/**
 * 유닛 번호에서 뽑는 **결정적인** 흔들림 0~1.
 *
 * 진형을 자로 잰 듯한 행렬이 아니라 조금씩 흩어져 서게 하는 데 쓴다. 여기서 나온 값이
 * 유닛의 x 좌표를 미세하게 옮기므로 **판정에 영향을 준다** — 그래서 Math.random 은 물론
 * Math.sin 같은 초월함수도 쓰면 안 된다. 브라우저마다 끝자리가 다를 수 있어 두 화면이
 * 어긋나기 때문이다. 정수 연산만으로 섞는다.
 * @param {number} n
 */
function jitter01(n) {
  let h = Math.imul(n + 0x9e3779b9, 2654435761) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 3266489917) >>> 0;
  return (h >>> 8) / 16777216;
}

/**
 * 솔로 플레이(그리고 상대가 응답하지 않을 때)의 대전 상대 — **쥐 침입단**.
 *
 * 청사에 쳐들어오던 침입자 넷(도용업자·벤치마킹업체·무효심판 청구인·특허괴물)이
 * **무작위로 편성돼** 대전장에 선다. 나올 때마다 조합이 달라지고, 무효심판 청구인이 많은
 * 판은 단단하고 벤치마킹업체가 많은 판은 빠르게 몰아친다.
 *
 * 세기는 조합이 아니라 **내 냥타워를 재서** 정한다 — 침입단 전체의 체력·화력 총량을
 * 내 총량 × 스테이지 배율로 잡고, 그 총량을 뽑힌 종류들의 몫(hpS·dpsS)대로 나눠 준다.
 * 그래서 잘 키웠든 못 키웠든 붙어 볼 만한 싸움이 되고, 스테이지가 오를수록 버거워진다.
 *
 * @param {any[]} mine 내 명세 @param {number} wave 스테이지 번호
 * @param {number} seed 편성용 시드 (같은 시드면 같은 조합이 나온다)
 * @param {boolean} [forceBoss] 특허괴물을 반드시 한 마리 끼워 넣는다 (마지막 대전 스테이지)
 */
function mobRoster(mine, wave, seed, forceBoss) {
  const rng = new Rng(seed >>> 0);
  const keys = Object.keys(ENEMIES);
  const wsum = keys.reduce((a, k) => a + ENEMIES[k].duel.w, 0);
  const pick = () => {
    let r = rng.next() * wsum;
    for (const k of keys) { r -= ENEMIES[k].duel.w; if (r <= 0) return k; }
    return keys[0];
  };

  // ── 얼마나 세게 나올 것인가 ── 내 총량을 재서 거기에 맞춘다
  const mul = DUEL.soloBase + wave * DUEL.soloPerWave;
  let hpSum = 0, dpsSum = 0;
  for (const u of mine) {
    hpSum += u.hp;
    if (u.atk) dpsSum += u.dmg * u.rate * (u.tg || 1) * (1 + (u.cc || 0) * ((u.cm || 1) - 1));
  }
  // 판이 텅 비어 있어도 상대는 서 있어야 한다 — 그때는 스테이지만 보고 최소치를 잡는다
  if (hpSum <= 0) hpSum = 260 * (1 + 0.3 * wave);
  if (dpsSum <= 0) dpsSum = 90 * (1 + 0.3 * wave);
  const hpTotal = hpSum * mul, dpsTotal = dpsSum * mul;

  // ── 몇 마리로 나눌 것인가 ── 내 인원 언저리에서 흔들리게 둔다.
  // 총량이 같다면 **적은 수로 나눌수록 유리하다** — 덩치가 커서 늦게 죽고, 그만큼 화력이
  // 오래 남는다. 그래서 인원을 내 쪽에 바짝 붙여 잡는다. 세기 조절은 mul 로만 한다.
  const base = Math.max(4, mine.length || 5);
  const n = Math.max(4, Math.min(24, base + rng.int(5) - 2));
  const squad = [];
  if (forceBoss) squad.push("boss");
  while (squad.length < n) squad.push(pick());

  const hpShare = squad.reduce((a, k) => a + ENEMIES[k].duel.hpS, 0);
  const dpsShare = squad.reduce((a, k) => a + ENEMIES[k].duel.dpsS, 0);
  const r3 = (v) => +(+v).toFixed(3);

  return squad.map((k) => {
    const d = ENEMIES[k].duel;
    const hp = Math.max(20, Math.round(hpTotal * d.hpS / hpShare));
    const dps = dpsTotal * d.dpsS / dpsShare;
    return {
      k, mob: true, lv: 1, pr: false, hp,
      // 침입자에게는 임용가가 없다 — 덩치에서 값어치를 뽑는다 (덱 표시줄에만 쓴다)
      cost: Math.round(40 + hp * 0.32),
      dmg: r3(Math.max(1, dps / d.rate)),
      rate: r3(d.rate), range: d.range, tg: 1,
      cc: 0.1, cm: 1.5, sl: d.sl || 0,
      sp: d.sp || 0, spf: d.spf || 0,
      ch: null, stC: 0, stD: 0, ex: 0,
      atk: true,
    };
  });
}

/**
 * 명세를 **덱 표시줄**용으로 묶는다. 같은 종류·같은 레벨은 한 칸으로 합쳐지고 그 수가 적힌다.
 * 싸움에는 쓰이지 않는다 — 유닛은 명세 그대로 전부 판에 서고, 이건 「무엇을 데려왔는지」를
 * 양쪽 다 한눈에 보라고 화면 아래에 늘어놓는 용도다.
 */
function deckGroups(roster) {
  /** @type {Record<string, any>} */
  const by = {};
  roster.forEach((u, i) => {
    const id = `${u.k}:${u.lv || 1}`;
    if (!by[id]) by[id] = { id, k: u.k, lv: u.lv || 1, mob: !!u.mob, cost: u.cost, n: 0, order: i };
    by[id].n++;
  });
  return Object.values(by).sort((a, b) => b.cost - a.cost || a.order - b.order);
}

/**
 * 덱의 세기를 한 숫자로 잰다 — 「총 체력 × 총 화력」의 제곱근.
 *
 * 오토배틀러에서 군대의 값어치는 체력과 화력의 **곱**에 가깝다(란체스터). 한쪽만 높은 덱은
 * 실제로도 약하고, 이 식은 그걸 그대로 반영한다. 제곱근을 씌우는 것은 눈에 익은 자릿수로
 * 내리기 위해서일 뿐이다. 화면의 「덱 지수」와 시작 로그에 쓴다 — 판정에는 관여하지 않는다.
 */
function deckPower(roster) {
  let hp = 0, dps = 0;
  for (const u of roster) {
    hp += u.hp;
    if (u.atk) dps += u.dmg * u.rate * (u.tg || 1) * (1 + (u.cc || 0) * ((u.cm || 1) - 1));
  }
  return Math.round(Math.sqrt(hp * dps));
}

class DuelSim {
  /**
   * @param {any[]} rosterA p1 의 명세 @param {any[]} rosterB p2 의 명세
   * @param {number} seed 공유 시드 (치명타·정지 판정에 쓴다 — 양쪽 화면이 같아야 한다)
   */
  constructor(rosterA, rosterB, seed) {
    this.rng = new Rng(seed >>> 0);
    this.t = 0;
    this._id = 0;
    /** @type {any[]} */ this.units = [];
    /** @type {any[]} 화면 연출용 탄환 (판정에 영향을 주지 않는다) */ this.shots = [];
    /** @type {any[]} 렌더러가 꺼내가는 연출 이벤트 */ this.events = [];
    this.over = false;
    /** @type {"a"|"b"|null} */ this.winner = null;
    this.reason = "";

    /** 화면 아래 덱 표시줄에 쓰는 요약 (싸움에는 관여하지 않는다) */
    this.deck = { a: deckGroups(rosterA), b: deckGroups(rosterB) };
    /** 덱 지수 — 두 덱의 세기를 한 숫자로 비교해 보여 주는 값 */
    this.power = { a: deckPower(rosterA), b: deckPower(rosterB) };

    // ── 전군 배치 ── 오토배틀러라 여기서 한 번에 다 세우고, 그 뒤로는 손댈 것이 없다
    this.form(rosterA, "a");
    this.form(rosterB, "b");

    /* 시작 병력 — 「남은 병력 비율」의 분모다. 덱이 크든 작든 같은 잣대로 재려면
     * 절대량이 아니라 **자기 시작 병력 대비 얼마가 남았는가**로 봐야 한다. */
    this.startHp = { a: this.armyHp("a"), b: this.armyHp("b") };
    this.startN = { a: this.alive("a").length, b: this.alive("b").length };
  }

  /**
   * 한 편의 진형을 짠다 — 명세에 있는 **전부**를 판에 세운다.
   *
   * 서는 순서는 **사거리 순**이다. 짧은 냥이 앞줄에서 몸으로 막고, 긴 냥이 뒷줄에서 쏘고,
   * 비전투 변리사냥은 맨 뒤에서 다친 아군을 손본다. 그래서 「무엇을 뽑았는가」만이 아니라
   * 「앞을 세울 것이 있는가」까지 덱의 성적에 들어온다.
   *
   * 이 줄 세우기는 시작 모양일 뿐이고, 진군하는 동안 **저절로 다시 정렬된다** —
   * 사거리에 든 유닛은 멈추고 아직 못 닿는 유닛은 계속 걸으므로, 긴 냥은 뒤에서 멈추고
   * 짧은 냥은 앞까지 걸어 나간다. 그래서 진형이 조금 깊어도 싸움 모양은 흐트러지지 않는다.
   *
   * 앞줄은 **양쪽 다 같은 자리**에서 시작하고, 덱이 클수록 뒤(진영 쪽)로 늘어난다.
   * 앞줄을 덱 크기에 따라 움직이면 큰 덱이 그만큼 먼저 닿아 두 번 유리해지기 때문이다.
   * 열이 많아 진형이 formDepth 를 넘칠 것 같으면 열 간격을 좁혀 그 안에 욱여넣는다.
   *
   * @param {any[]} roster @param {"a"|"b"} side
   */
  form(roster, side) {
    const dir = dirOf(side);
    // 비전투(변리사냥)를 맨 뒤로 밀고, 나머지는 사거리 오름차순. 동률은 명세 순서로 못 박는다.
    const order = roster.map((u, i) => ({ u, i })).sort((p, q) =>
      (p.u.atk === q.u.atk ? 0 : p.u.atk ? -1 : 1) ||
      ((p.u.range || 0) - (q.u.range || 0)) || (p.i - q.i));

    const rows = DUEL.rows;
    const cols = Math.max(1, Math.ceil(order.length / rows));
    const gap = cols > 1 ? Math.min(DUEL.colGap, DUEL.formDepth / (cols - 1)) : 0;
    const frontX = campX(side) + dir * (DUEL.spawnPad + DUEL.formDepth);
    const seed = side === "a" ? 0 : 977;

    order.forEach((o, n) => {
      const col = Math.floor(n / rows), row = n % rows;
      const u = o.u;
      /* 깊이(dep 0~1) — 0이 맨 앞(아래·크게), 1이 맨 뒤(위·작게).
       * 줄 번호를 그대로 쓰면 네 줄이 자로 잰 듯 늘어서서 「종이 타일 행렬」로만 보인다.
       * 번호에서 뽑은 흔들림을 얹어 영역 안에 흩어져 서게 한다 (jitter01 참고 — 난수가 아니다). */
      const j = jitter01(n * 2 + seed), j2 = jitter01(n * 2 + 1 + seed);
      const dep = Math.min(1, Math.max(0, (row + 0.22 + j * 0.56) / rows));
      this.units.push({
        id: this._id++, side, k: u.k, lv: u.lv || 1, pr: !!u.pr, mob: !!u.mob,
        x: frontX - dir * (col * gap + (j2 - 0.5) * 12), dir, dep,
        hp: u.hp, max: u.hp,
        dmg: u.dmg, rate: u.rate, range: u.range, tg: u.tg || 1,
        cc: u.cc || 0, cm: u.cm || 1, sl: u.sl || 0,
        sp: u.sp || 0, spf: u.spf || 0, atk: !!u.atk,
        ch: u.ch || null, stC: u.stC || 0, stD: u.stD || 0, ex: u.ex || 0,
        sd: u.sd || 0, ccd: u.ccd || 0,
        // 합성 냥타워의 고유 스킬. 판에 서자마자 터지지 않도록 쿨을 한 번 채워 두고 시작한다.
        sk: u.sk || null, skCd: u.sk ? u.sk.cd : 0, skT: 0,
        // 뒷줄일수록 첫 발이 아주 조금 늦다 — 한 틱에 전군이 동시에 쏘면 화면이 번쩍이기만 한다
        cd: col * 0.05, slowT: 0, slowPct: 0, hitT: 0, atkT: 0, healT: 0, freezeT: 0,
        dead: false, walking: true,
      });
    });
  }

  alive(side) { return this.units.filter((u) => u.side === side && !u.dead); }
  /** 아직 판에 남아 있는 병력의 체력 합 */
  armyHp(side) { return this.alive(side).reduce((a, u) => a + Math.max(0, u.hp), 0); }
  /**
   * 남은 병력 비율 (0~1) — 자기 시작 병력 대비 지금 얼마가 남았는가.
   * 시간이 다 됐을 때의 승패 기준이다. 절대량이 아니라 비율로 재야 큰 덱과 작은 덱을
   * 같은 잣대로 볼 수 있다 (큰 덱은 남은 체력의 절대량도 그냥 크다).
   */
  ratio(side) {
    const s = this.startHp ? this.startHp[side] : 0;
    return s > 0 ? this.armyHp(side) / s : 0;
  }

  /**
   * 지금 상태로 승패가 갈렸는지 본다.
   *
   * **성채가 없다** — 이기는 길은 상대를 전멸시키는 것 하나뿐이다.
   * 시간 안에 결판이 안 나면 **남은 병력 비율**이 높은 쪽을 올린다.
   */
  settle() {
    const na = this.alive("a").length, nb = this.alive("b").length;
    if (!na && !nb) { this.finish(null, "양쪽 전멸"); return; }
    if (!na) { this.finish("b", "전멸"); return; }
    if (!nb) { this.finish("a", "전멸"); return; }
    if (this.t >= DUEL.timeLimit) this.judge("시간 종료");
  }

  /** 남은 병력 비율 → 남은 체력 순으로 우열을 가린다 */
  judge(why) {
    const ra = this.ratio("a"), rb = this.ratio("b");
    if (Math.abs(ra - rb) > 1e-9) { this.finish(ra > rb ? "a" : "b", `${why} · 남은 병력 우세`); return; }
    const ha = this.armyHp("a"), hb = this.armyHp("b");
    if (Math.abs(ha - hb) > 1e-9) { this.finish(ha > hb ? "a" : "b", `${why} · 남은 체력 우세`); return; }
    this.finish(null, `${why} · 완전히 대등`);
  }
  finish(winner, reason) {
    if (this.over) return;
    this.over = true; this.winner = winner; this.reason = reason;
  }

  /** @returns {{winner:"a"|"b"|null, reason:string, aliveA:number, aliveB:number,
   *             ratioA:number, ratioB:number}} */
  result() {
    return {
      winner: this.winner, reason: this.reason,
      aliveA: this.alive("a").length, aliveB: this.alive("b").length,
      ratioA: this.ratio("a"), ratioB: this.ratio("b"),
    };
  }

  /**
   * 한 유닛에게 피해를 준다.
   * @param {any} u @param {number} amt @param {boolean} crit
   * @param {number} fromX @param {number} [exec] 무효사유냥 — 체력이 최대치의 이 비율 이하면 끝낸다
   */
  hurt(u, amt, crit, fromX, exec) {
    if (u.dead) return;
    u.hp -= amt;
    u.hitT = crit ? 0.2 : 0.12;
    if (exec && u.hp > 0 && u.hp <= u.max * exec) {
      u.hp = 0;
      this.events.push({ t: "exec", x: u.x, side: u.side, dep: u.dep });
    }
    if (u.hp <= 0) {
      u.dead = true; u.hp = 0;
      this.events.push({ t: "die", x: u.x, side: u.side, dep: u.dep, k: u.k });
    }
    void fromX;
  }

  /**
   * ⏳ 절차 3단계「절차 중지」 — 이미 둔화에 걸린 표적에게 더 아프게 들어가는 배율.
   * 청사 판의 combat.damage 와 같은 규칙을 본다 (이번 명중이 거는 둔화는 아직 반영되지 않는다).
   */
  ampSlow(u, f) { return (u.sd && f.slowT > 0) ? 1 + u.sd : 1; }

  /**
   * 고정 시간간격 한 걸음.
   *
   * 한 틱은 **결정 → 적용** 두 마디로 나뉜다. 훑는 순서대로 피해를 곧바로 넣으면
   * 배열 앞쪽이 반 틱 먼저 때리게 되어, 완전히 똑같은 두 진영이 붙어도 한쪽이 이긴다.
   * 결정을 모아 두었다가 한꺼번에 적용하면 그 편향이 사라진다 — 이동·회복도 같은 이유로 미룬다.
   */
  tick() {
    if (this.over) return;
    this.t += DT;

    /** @type {any[]} [유닛, dx] */ const moves = [];
    /** @type {any[]} [유닛, 피해, 치명타, 발사 x, 즉사기준] */ const hits = [];
    /** @type {any[]} [유닛, 둔화율, 지속(초)] */ const slows = [];
    /** @type {any[]} [유닛, 정지시간] */ const stuns = [];
    /** @type {any[]} [유닛, 회복량] */ const heals = [];

    for (const u of this.units) {
      if (u.dead) continue;
      // 시간 계열은 유닛 자기 것이라 서로 간섭하지 않는다 — 여기서 바로 줄여도 된다
      if (u.slowT > 0) u.slowT -= DT;
      if (u.hitT > 0) u.hitT -= DT;
      if (u.atkT > 0) u.atkT -= DT;
      if (u.skT > 0) u.skT -= DT;
      // 조기공개냥에 묶이면 이번 차례를 통째로 건너뛴다 (걷지도 쏘지도 못한다)
      if (u.freezeT > 0) { u.freezeT -= DT; u.walking = false; continue; }
      const slow = u.slowT > 0 ? Math.max(0.2, 1 - u.slowPct) : 1;

      /* ── 합성 냥타워의 고유 스킬 ── 사격 재장전과 별개의 시계다.
       * 청사 판(combat.fireSkill)과 같은 규칙으로 돈다 — 쿨이 차 있고 사거리 안에 적이 있으면
       * 저절로 터진다. 누를 것이 없는 라운드라, 애써 합성한 것이 값을 하는 유일한 통로다. */
      if (u.sk && u.atk) {
        if (u.skCd > 0) u.skCd -= DT;
        else {
          const reach = u.range * (u.sk.rMul || 1);
          const marks = [];
          for (const f of this.units) {
            if (f.dead || f.side === u.side) continue;
            if (Math.abs(f.x - u.x) > reach) continue;
            marks.push(f);
          }
          if (marks.length) {
            marks.sort((p, q) => (Math.abs(p.x - u.x) - Math.abs(q.x - u.x)) || (p.id - q.id));
            const pick = u.sk.n ? marks.slice(0, u.sk.n) : marks;
            u.skCd = u.sk.cd;
            u.skT = 0.5;
            this.events.push({ t: "skill", key: u.sk.k, x: u.x, dep: u.dep, side: u.side,
                               id: u.id, r: reach, n: pick.length, lv: u.lv });
            const amt = u.dmg * (u.sk.mul || 0);
            for (const f of pick) {
              if (u.sk.st) stuns.push([f, u.sk.st]);
              if (u.sk.sl) slows.push([f, u.sk.sl / 100, u.sk.slD]);
              if (u.sk.ex) {
                // 무효 심결 — 특허괴물만은 지워지지 않고 최대 체력의 일부만 잃는다
                if (f.mob && f.k === "boss") hits.push([f, f.max * u.sk.bh, true, u.x, 0]);
                else hits.push([f, 0, true, u.x, u.sk.ex]);
              }
              if (amt > 0) hits.push([f, amt * this.ampSlow(u, f), true, u.x, u.ex]);
            }
          }
        }
      }

      // 비전투 변리사냥 — 대전장에서는 아군 뒤를 따라다니며 가장 다친 아군을 손봐 준다.
      // 청사 판의 보좌(화력·공속)는 이미 명세의 숫자에 녹아 있으므로 여기서 또 얹지 않는다.
      if (!u.atk) {
        let worst = null, worstGap = 0;
        for (const f of this.units) {
          if (f.dead || f.side !== u.side || f === u) continue;
          if (Math.abs(f.x - u.x) > DUEL.aideHealR) continue;
          const gap = f.max - f.hp;
          if (gap > worstGap || (gap === worstGap && worst && f.id < worst.id)) { worstGap = gap; worst = f; }
        }
        u.healT -= DT;
        if (u.healT <= 0 && worst) {
          u.healT = 0.5;
          heals.push([worst, Math.min(worstGap, DUEL.aideHeal * 0.5 * Math.pow(1.35, u.lv - 1))]);
        }
        // 손볼 아군이 없으면 앞으로 따라간다 (뒤에 처져 있으면 아무 일도 못 한다)
        if (!worst) { moves.push([u, DUEL.moveSpd * 0.8 * slow * DT * u.dir]); u.walking = true; }
        else u.walking = false;
        continue;
      }

      // 표적 — 내 앞쪽(진행 방향)에 있는 적 중 가까운 순. 동률이면 id 로 못 박는다.
      const foes = [];
      for (const f of this.units) {
        if (f.dead || f.side === u.side) continue;
        foes.push([Math.abs(f.x - u.x), f]);
      }
      foes.sort((p, q) => (p[0] - q[0]) || (p[1].id - q[1].id));

      const near = foes.length ? foes[0][0] : Infinity;

      if (near > u.range) {
        // 아직 아무에게도 못 닿는다 — 계속 걸어간다 (두들길 성채 같은 것은 없다)
        moves.push([u, DUEL.moveSpd * slow * DT * u.dir]);
        u.walking = true;
        continue;
      }
      u.walking = false;   // 멈춰 서서 쏜다

      u.cd -= DT * slow;      // 둔화는 이동뿐 아니라 공속도 늦춘다
      if (u.cd > 0) continue;
      u.cd = 1 / u.rate;
      u.atkT = 0.42;

      const n = Math.min(u.tg, foes.length);
      let anyCrit = false;
      for (let i = 0; i < n; i++) {
        const [d, target] = foes[i];
        if (d > u.range) break;
        const crit = this.rng.next() < u.cc;
        if (crit) anyCrit = true;
        const raw = u.dmg * (crit ? u.cm : 1);
        this.shots.push({ x1: u.x, dep1: u.dep, x2: target.x, dep2: target.dep,
                          side: u.side, crit, life: 0.13, max: 0.13 });
        hits.push([target, raw * this.ampSlow(u, target), crit, u.x, u.ex]);
        if (crit) this.events.push({ t: "crit", x: u.x, side: u.side, dep: u.dep, id: u.id });
        if (u.sl) slows.push([target, u.sl / 100]);
        // 조기공개냥 — 확률로 상대 유닛을 그 자리에 묶는다
        if (u.stC && this.rng.next() < u.stC) stuns.push([target, u.stD]);
        if (u.sp) {
          // 방사 피해 — 승진냥의 샷건, 그리고 💥 침해 계열로 얻은 방사. 직격 주변까지 쓸어 버린다
          this.shots.push({ ring: true, x1: target.x, dep1: target.dep, r: u.sp,
                            side: u.side, life: 0.2, max: 0.2 });
          for (const f of this.units) {
            if (f.dead || f === target || f.side === u.side) continue;
            if (Math.abs(f.x - target.x) > u.sp) continue;
            hits.push([f, raw * u.spf * this.ampSlow(u, f), false, target.x, u.ex]);
          }
        }
        // 인용문헌냥 연쇄 — 명중한 자리에서 가장 가까운 적으로 차례차례 튄다
        if (u.ch) {
          const hopped = [target];
          let from = target, left = raw * u.ch.f;
          for (let h = 0; h < u.ch.n; h++) {
            let next = null, best = u.ch.r;
            for (const f of this.units) {
              if (f.dead || f.side === u.side || hopped.includes(f)) continue;
              const d2 = Math.abs(f.x - from.x);
              if (d2 < best) { best = d2; next = f; }
            }
            if (!next) break;
            this.shots.push({ x1: from.x, dep1: from.dep, x2: next.x, dep2: next.dep,
                              side: u.side, crit: false, chain: true, life: 0.16, max: 0.16 });
            hits.push([next, left * this.ampSlow(u, next), false, from.x, u.ex]);
            hopped.push(next); from = next; left *= u.ch.f;
          }
        }
      }
      // 🎯 입증 5단계「고의침해 인정」 — 치명타가 재장전을 당긴다 (청사 판과 같은 규칙)
      if (anyCrit && u.ccd) u.cd *= 1 - u.ccd;
    }

    // ── 적용 ── 이 순간까지는 아무도 죽지 않았다. 같은 틱에 서로를 눕히는 것도 그래서 가능하다.
    for (const [u, dx] of moves) {
      u.x += dx;
      // 상대 진영선을 지나쳐 화면 밖으로 걸어 나가지 않게 붙잡는다.
      // (표적은 방향을 가리지 않고 가장 가까운 적이라, 적이 살아 있는 한 여기까지 올 일은
      //  거의 없다 — 화면 밖으로 새는 것만 막는 안전장치다.)
      const lim = campX(u.side === "a" ? "b" : "a");
      u.x = u.dir > 0 ? Math.min(u.x, lim) : Math.max(u.x, lim);
    }
    for (const [u, amt] of heals) { u.hp = Math.min(u.max, u.hp + amt);
                                    this.events.push({ t: "heal", x: u.x, side: u.side, dep: u.dep, amt: Math.round(amt) }); }
    for (const [u, pct, dur] of slows) { u.slowT = dur || 1.6; u.slowPct = pct; }
    for (const [u, d] of stuns) u.freezeT = Math.max(u.freezeT, d);
    for (const [u, amt, crit, fx, ex] of hits) this.hurt(u, amt, crit, fx, ex);

    for (const s of this.shots) s.life -= DT;
    this.shots = this.shots.filter((s) => s.life > 0);
    this.units = this.units.filter((u) => !u.dead || (u.deadT = (u.deadT || 0) + DT) < 0.5);
    this.settle();
  }

  drainEvents() { const e = this.events; this.events = []; return e; }
}

return { DuelSim, campX, dirOf, makeRoster, mobRoster, deckGroups, deckPower };
})();
__mods["core/game.js"] = (function(){
// @ts-check
const {Rng} = __req("core/rng.js");
const {WAVES, BAL, CATS, DRAW_KEYS, RECIPES, SABOTAGE, AUGMENTS, AUGMENT_WAVES,
       DUEL, DUEL_WAVES, PASSIVES, LINE_TIER_AT, RANK} = __req("core/data.js");
const {getMap, parseMap} = __req("core/maps.js");
const B = __req("core/board.js");
const {computeStats} = __req("core/stats.js");
const {step} = __req("core/combat.js");
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
    // 판 전용 난수. 전투 중에 굴려야 할 일이 생기면 이걸 쓴다.
    this.rng = new Rng(this.seed);
    // 웨이브 구성과 증강 후보는 rng 와 따로 굴린다 — 전투 쪽에서 몇 번을 굴렸는지에 따라
    // 난수열이 밀리면 그 어긋남이 웨이브 구성까지 흔들어 대전이 불공평해지기 때문이다.
    this.waveRng = new Rng((this.seed ^ 0x85ebca6b) >>> 0);
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
    /* ── 스테이지 강화로 누적된 보정 ──
     * 열여섯 장 각각이 여기 어느 칸 하나를 올린다. 어떤 칸이 무슨 뜻인지는 data.js 의
     * PASSIVES 주석에 stat 별로 적혀 있고, 이 값을 실제 능력치로 옮기는 곳은 stats.js 하나뿐이다.
     * (0 인 칸은 계산에서 통째로 건너뛰므로 미리 다 적어 둘 필요는 없다 — B(k) 가 0을 돌려준다.) */
    this.bonus = { dmg: 0, rate: 0, range: 0, critC: 0, critM: 0 };
    this.myPassives = [];  // 지금까지 고른 스테이지 강화 효과 로그

    /* ── 빌드 계열 ──
     * 강화를 고를 때마다 그 계열 점수가 1 오르고, 3점·5점(LINE_TIER_AT)에 닿으면 단계가 열린다.
     * lineTier 는 stats.js 가 매 계산마다 들여다보는 값이라, 여기서 갱신하는 즉시 판에 실린다.
     * lineNew 는 「방금 무엇이 열렸는가」 — 열린 순간에만 채워지고 UI가 축포를 쏜 뒤 비운다. */
    this.lineScore = {};
    this.lineTier = {};
    this.lineNew = null;
    /** 이번 스테이지에 뽑혀 나온 강화 넷 (다시 그려도 같은 넷이 나오도록 붙잡아 둔다) */
    this.passiveOffer = null;

    /* 「수수료 환급」으로 이번 라운드 동안만 걸리는 처치 보상 배율. 라운드가 끝나면 1로 돌아간다. */
    this.goldMul = 1;
    /* 수수료징수냥의 스킬 「과징금 부과」로 잠깐 걸리는 배율 — feeT 초 동안만 산다 */
    this.feeMul = 1;
    this.feeT = 0;
    this.awaitingPassive = false;

    /* ── 증강 ──
     * 후보 12장을 판 시작 때 한 번 섞어 두고 3장씩 끊어 준다.
     * 양쪽 플레이어가 같은 시드를 받으므로 후보 목록도 완전히 같고, 이미 고른 것이 후보에서
     * 빠지는 식(선택 이력에 따라 풀이 달라지는 식)이 아니라서 두 판의 후보가 어긋나지 않는다. */
    this.augments = [];                  // 고른 순서대로의 증강 키
    this.augSet = new Set();             // 빠른 조회용 (stats/combat 이 이걸 본다)
    this.augDeck = new Rng((this.seed ^ 0x9e3779b9) >>> 0).shuffle(Object.keys(AUGMENTS));
    this.awaitingAugment = false;
    this.goldenUid = 0;                  // 「직권보정」으로 이번 웨이브 동안 3배가 된 냥타워
    this.merged = 0;                     // 합성을 몇 번 했는가 (레벨업 + 이종 합성)
    this.crafted = 0;                    // 그중 특수 냥타워를 만든 횟수
    /** 1:1 대전 라운드 전적 [승, 무, 패] */
    this.duelRecord = [0, 0, 0];
    /* ── 랭킹 점수 재료 ──
     * waveLog  전투 라운드마다 {라운드, 걸린 게임시간, 파 타임} — ⏱️ 속도 점수의 원장
     * duelLog  대전 라운드마다 {라운드, 승/무/패} — ⚔️ 대전 점수의 원장
     * wavePar  지금 굴러가는 라운드의 파 타임 (startWave 가 채우고 endWave 가 적어 넣는다)
     * finalDeck 10라운드가 끝난 시점의 덱 지수 — web 쪽이 계산해 넣어 준다
     *           (core 는 대전 명세를 만들 줄 모른다. duel.js 의 deckPower 가 그 일을 한다) */
    this.waveLog = [];
    this.duelLog = [];
    this.wavePar = 0;
    this.finalDeck = 0;

    /* ── 방해 공작 ──
     * sabDrawn 이번 웨이브 주기(준비 + 그 웨이브)에 이미 뽑은 횟수 — 라운드가 끝나면 0으로 돌아간다
     * sabSent  내가 상대에게 던진 공작 로그 (표시용)
     * fx       상대가 나에게 건 실시간 공작. 전투가 흐르는 동안에만 닳는다
     * waveMods 다음 웨이브 구성을 바꾸는 예약분 — 웨이브를 개시하는 순간 waveFx 로 옮겨간다
     * waveFx   지금 굴러가는 웨이브에 실제로 적용된 값 */
    this.sabDrawn = 0;
    this.sabSent = [];
    this.fx = { hasteT: 0, hasteMul: 1, fogT: 0, fogMul: 1 };
    this.waveMods = { hp: 1, count: 1, elite: 0 };
    this.waveFx = { hp: 1 };

    this.enemies = []; this.shots = []; this.spawnQueue = [];
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

  /** 상대의 「기름」이 흐르는 동안 침입자가 그만큼 빨라진다 */
  get enemySpeedMul() { return this.fx.hasteT > 0 ? this.fx.hasteMul : 1; }
  /** 상대의 「연막」이 흐르는 동안 냥타워 사거리가 그만큼 줄어든다 */
  get catRangeMul() { return this.fx.fogT > 0 ? this.fx.fogMul : 1; }

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
    // 「선사용권」 증강만이 이 가격을 건드린다.
    const aug = this.augSet.has("cheap") ? 0.6 : 1;
    return Math.round(CATS[key].cost * (this.bal.catCostMul ?? 1) * aug);
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
  /**
   * 새 냥타워 조각 하나. 빈 터가 있으면 그 자리에, 없으면 대기열에 놓는다.
   * @param {string} key @param {number} [lv]
   */
  spawnCat(key, lv = 1) {
    const p = { kind: "cat", key, x: -1, y: -1, w: 1, h: 1, uid: this.uid(), lv };
    const spot = B.firstLegalSpot(this, p);
    if (spot) { p.x = spot[0]; p.y = spot[1]; this.pieces.push(p); }
    else this.tray.push(p);
    return p;
  }

  /** @param {string} key 심사관 타입 (CATS 의 키). 빈 자리가 있으면 즉시 배치되고, 없으면 대기열에 놓인다. */
  buyCat(key) {
    const c = this.catCost(key);
    if (this.phase !== "prep" || this.gold < c) return null;
    const p = this.spawnCat(key);
    this.gold -= c;
    this.recompute();
    this.events.push({ t: "buy", what: "cat", key, name: CATS[key].name, cost: c });
    return p;
  }

  // ── 합성 ──
  /**
   * 지금 합성할 수 있는 묶음들.
   *
   * 같은 종류 · 같은 레벨이 BAL.mergeNeed 명 이상 모이면 한 묶음이 된다.
   * 최고 레벨(= 승진냥)은 더 합쳐지지 않으므로 여기 뜨지 않는다.
   * 판 위든 대기열이든 상관없이 재료가 되고, 결과물은 재료 중 판에 놓여 있던 첫 조각 자리에 선다.
   *
   * @returns {{key:string, lv:number, have:number, need:number, pieces:any[]}[]}
   */
  mergeOffers() {
    /** @type {Record<string, any[]>} */
    const bucket = {};
    for (const p of this.pieces.concat(this.tray)) {
      if (p.kind !== "cat") continue;
      const lv = Math.max(1, p.lv || 1);
      if (lv >= BAL.maxLv) continue;                 // 더 올라갈 곳이 없다 (이미 승진냥이다)
      (bucket[`${p.key}:${lv}`] ||= []).push(p);
    }
    const out = [];
    for (const id in bucket) {
      const list = bucket[id];
      if (list.length < BAL.mergeNeed) continue;
      const [key, lv] = [id.slice(0, id.lastIndexOf(":")), +id.slice(id.lastIndexOf(":") + 1)];
      // 판에 놓인 것을 앞에 둔다 — 결과물이 대기열이 아니라 판 위에 서도록
      list.sort((a, b) => (b.x >= 0 ? 1 : 0) - (a.x >= 0 ? 1 : 0) || a.uid - b.uid);
      out.push({ key, lv, have: list.length, need: BAL.mergeNeed, pieces: list });
    }
    // 레벨이 높은 것 → 비싼 종류 순으로. 우측 상단 칸에서 눈에 먼저 띄어야 할 순서다.
    out.sort((a, b) => (b.lv - a.lv) || (CATS[b.key].cost - CATS[a.key].cost));
    return out;
  }

  /**
   * 같은 종류·같은 레벨 셋을 합쳐 한 단계 위 냥타워 하나로 만든다.
   * 재료 중 판에 놓여 있던 첫 조각을 남겨 그 자리에서 레벨만 올리고, 나머지는 치운다 —
   * 새로 만들어 놓으면 애써 잡아 둔 자리가 풀려 엉뚱한 데로 밀려나기 때문이다.
   * @param {string} key @param {number} lv
   * @returns {any|null} 승격된 조각
   */
  mergeCats(key, lv) {
    if (this.phase !== "prep") return null;
    const offer = this.mergeOffers().find((o) => o.key === key && o.lv === lv);
    if (!offer) return null;
    const use = offer.pieces.slice(0, BAL.mergeNeed);
    const keep = use[0];
    const eaten = use.slice(1);
    this.pieces = this.pieces.filter((p) => !eaten.includes(p));
    this.tray = this.tray.filter((p) => !eaten.includes(p));
    keep.lv = lv + 1;
    // 대기열에 있던 것이 승격됐다면 이참에 빈 터를 한 번 찾아 준다
    if (keep.x < 0) {
      const spot = B.firstLegalSpot(this, keep);
      if (spot) { this.tray = this.tray.filter((p) => p !== keep); this.pieces.push(keep);
                  keep.x = spot[0]; keep.y = spot[1]; }
    }
    this.merged++;
    this.recompute();
    this.events.push({ t: "merge", key, name: CATS[key].name, icon: CATS[key].icon,
                       lv: keep.lv, promoted: keep.lv >= BAL.promoteLv,
                       used: BAL.mergeNeed, x: keep.x, y: keep.y, placed: keep.x >= 0 });
    return keep;
  }

  // ── 이종 합성 (특수 냥타워) ──
  /**
   * 지금 만들 수 있는 특수 냥타워 처방들.
   *
   * 같은 종류를 셋 모으는 레벨업과 달리, 이쪽은 **서로 다른 종류**를 정해진 조합대로 태워
   * 없던 규칙(연쇄·정지·즉사·징수)을 가진 냥타워를 만든다. 재료는 전부 Lv1 이어야 한다 —
   * 애써 올려 둔 Lv2·Lv3 이 말없이 빨려 들어가면 합성 단추를 누르는 일이 도박이 되어 버린다.
   *
   * @param {boolean} [all] 재료가 모자란 처방까지 전부 (도감 표시용)
   * @returns {{kind:"recipe", key:string, need:string[], have:Record<string,number>,
   *            ready:boolean, pieces:any[]}[]}
   */
  recipeOffers(all) {
    // Lv1 재고를 종류별로 센다 (판 위든 대기열이든 재료가 된다)
    /** @type {Record<string, any[]>} */
    const stock = {};
    for (const p of this.pieces.concat(this.tray)) {
      if (p.kind !== "cat" || Math.max(1, p.lv || 1) !== 1) continue;
      (stock[p.key] ||= []).push(p);
    }
    for (const k in stock) stock[k].sort((a, b) => (b.x >= 0 ? 1 : 0) - (a.x >= 0 ? 1 : 0) || a.uid - b.uid);

    const out = [];
    for (const r of RECIPES) {
      /** @type {Record<string, number>} */
      const want = {};
      for (const k of r.need) want[k] = (want[k] || 0) + 1;
      const have = {};
      let ready = true;
      for (const k in want) { have[k] = (stock[k] || []).length; if (have[k] < want[k]) ready = false; }
      if (!ready && !all) continue;
      const pieces = ready ? Object.keys(want).flatMap((k) => stock[k].slice(0, want[k])) : [];
      out.push({ kind: "recipe", key: r.key, need: r.need.slice(), have, ready, pieces });
    }
    // 비싼(= 센) 처방이 위로. 우측 상단 칸에서 눈에 먼저 띄어야 할 순서다.
    out.sort((a, b) => CATS[b.key].cost - CATS[a.key].cost);
    return out;
  }

  /**
   * 처방대로 재료를 태워 특수 냥타워 하나를 만든다.
   * 결과물은 재료 중 판에 놓여 있던 첫 조각 자리에 선다 (레벨 합성과 같은 규칙).
   * @param {string} key 처방(= 결과 냥타워) 키
   */
  craftRecipe(key) {
    if (this.phase !== "prep") return null;
    const offer = this.recipeOffers().find((o) => o.key === key && o.ready);
    if (!offer) return null;
    const use = offer.pieces;
    // 판에 놓인 재료가 있으면 그 자리를 물려받는다
    const seat = use.find((p) => p.x >= 0);
    this.pieces = this.pieces.filter((p) => !use.includes(p));
    this.tray = this.tray.filter((p) => !use.includes(p));

    const made = { kind: "cat", key, x: -1, y: -1, w: 1, h: 1, uid: this.uid(), lv: 1 };
    if (seat && B.legal(this, made, seat.x, seat.y, made)) {
      made.x = seat.x; made.y = seat.y; this.pieces.push(made);
    } else {
      const spot = B.firstLegalSpot(this, made);
      if (spot) { made.x = spot[0]; made.y = spot[1]; this.pieces.push(made); }
      else this.tray.push(made);
    }

    this.merged++;
    this.crafted = (this.crafted || 0) + 1;
    this.recompute();
    this.events.push({ t: "craft", key, name: CATS[key].name, icon: CATS[key].icon,
                       used: use.map((p) => p.key), desc: CATS[key].desc,
                       x: made.x, y: made.y, placed: made.x >= 0 });
    return made;
  }

  // ── 승진 ──
  /**
   * 지금 판에 서 있는 승진냥(최고 레벨) 수.
   *
   * 예전에는 특허료를 내고 한 명씩 「승진 임명」했고 그 수를 따로 세어 뒀다.
   * 승진이 합성의 마지막 단계로 바뀌면서, 세어 둘 것이 아니라 판을 보면 알 수 있는 값이 됐다.
   */
  get promoted() { return B.cats(this).filter((c) => (c.lv || 1) >= BAL.promoteLv).length; }

  /** uid 로 판 위 냥타워를 되짚는다 (UI 카드가 조각을 다시 찾을 때 쓴다) */
  catByUid(uid) { return B.cats(this).find((c) => c.uid === uid) || null; }

  // ── 증강 ──
  /** 이 웨이브가 증강을 고르는 웨이브인가 (클리어 직후 기준) */
  isAugmentWave(wave) { return AUGMENT_WAVES.includes(wave); }

  /**
   * 이번 증강 라운드에 제시할 3장.
   * 섞어 둔 덱을 3장씩 끊어 주므로 한 판에서 같은 증강이 두 번 나오지 않고,
   * 시드가 같은 상대에게도 정확히 같은 3장이 나온다.
   * @returns {{key:string,name:string,icon:string,tag:string,desc:string,detail:string}[]}
   */
  augOffer() {
    const i = AUGMENT_WAVES.indexOf(this.wave);
    if (i < 0) return [];
    return this.augDeck.slice(i * 3, i * 3 + 3).map((k) => AUGMENTS[k]).filter(Boolean);
  }

  /** 고른 증강을 적용한다. 즉시형은 여기서 한 번에 처리한다. @param {string} key */
  applyAugment(key) {
    const d = AUGMENTS[key];
    this.awaitingAugment = false;
    if (!d || this.augSet.has(key)) return false;
    this.augments.push(key);
    this.augSet.add(key);

    if (key === "fortify") {
      this.maxHp += 30;
      this.hp = Math.min(this.maxHp, this.hp + 30);
    }
    if (key === "cheap") this.gold += 120;
    if (key === "divisional") this.cloneBestCat();

    this.recompute();
    this.events.push({ t: "augment", key, name: d.name, icon: d.icon, desc: d.desc });
    return true;
  }

  /**
   * 「분할출원」 — 판에서 가장 값나가는 냥타워와 같은 종류를 하나 더 만든다. 빈 터가 없으면 대기열로.
   * 복제본은 언제나 1레벨이다 — 3레벨을 그대로 복제하면 뽑기 아홉 번어치가 공짜로 나와
   * 다른 증강과 견줄 수 없이 세진다. 대신 곧바로 합성 재료로 쓸 수 있다.
   */
  cloneBestCat() {
    const src = this.bestCat();
    if (!src) return null;
    const p = this.spawnCat(src.key, 1);
    this.events.push({ t: "clone", key: p.key, name: CATS[p.key].name, placed: p.x >= 0 });
    return p;
  }

  /** 이 종류가 실제로 사격을 하는가 (변리사냥은 「변리사 개업」을 골랐을 때만) */
  canFight(key) {
    const d = CATS[key];
    if (!d) return false;
    return d.dmg > 0 || (this.augSet.has("agentWar") && !!(d.auraDmg || d.auraRate));
  }

  /**
   * 조각 하나의 값어치. 임용가에 합성 레벨을 얹은 값이다 —
   * 레벨을 무시하면 3레벨 출원냥(뽑기 아홉 번어치)이 1레벨 국제출원냥보다 싸게 잡힌다.
   * @param {any} p
   */
  catValue(p) {
    return CATS[p.key].cost * Math.pow(BAL.mergeNeed, Math.max(1, p.lv || 1) - 1);
  }

  /**
   * 판에서 가장 값나가는 냥타워 (같은 값이면 먼저 놓은 쪽). 「분할출원」의 복제 대상을 고를 때 쓴다.
   * @param {boolean} [fighterOnly] 사격하는 냥타워만
   */
  bestCat(fighterOnly) {
    let pool = B.cats(this);
    if (fighterOnly) pool = pool.filter((c) => this.canFight(c.key));
    if (!pool.length) return null;
    return pool.reduce((a, c) => (this.catValue(c) > this.catValue(a) ? c : a));
  }

  // ── 방해 공작 뽑기 ──
  /** 뽑기 한 번의 값 (정액). 「선사용권」 증강이 걸리면 여기도 같이 싸진다. */
  sabotageCost() {
    return Math.round(BAL.sabotageCost * (this.augSet.has("cheap") ? 0.6 : 1));
  }
  /** 이번 웨이브 주기에 남은 뽑기 횟수 */
  get sabotageLeft() { return Math.max(0, BAL.sabotageDraws - this.sabDrawn); }

  /**
   * 지금 공작을 뽑을 수 있는가. 못 뽑으면 이유를 문자열로, 되면 null.
   * UI가 버튼에 그대로 띄울 수 있게 말로 돌려준다.
   * @returns {string|null}
   */
  sabotageBlocked() {
    if (this.phase === "won" || this.phase === "lost") return "판 종료";
    if (this.phase === "duel") return "대전 중";   // 상대 청사에는 지금 아무 일도 일어나지 않는다
    if (!this.sabotageLeft) return "이번 웨이브 소진";
    if (this.gold < this.sabotageCost()) return "특허료 부족";
    return null;
  }

  /**
   * 특허료를 내고 방해 공작 하나를 **무작위로 뽑아** 상대 판에 던진다.
   *
   * 여기서는 값만 치르고 무엇이 나왔는지 기록한다 — 실제 효과는 상대 클라이언트가
   * receiveSabotage 로 자기 판에 적용한다.
   *
   * 난수는 시드 고정 rng 가 아니라 Math.random 을 쓴다. rng 는 상대와 공유하는 시드라
   * 그걸로 뽑으면 두 사람이 정확히 같은 순서로 같은 공작을 받게 되어 뽑기의 의미가 사라진다.
   * @returns {string|null} 뽑힌 공작의 키
   */
  drawSabotage() {
    if (this.sabotageBlocked()) return null;
    const keys = Object.keys(SABOTAGE);
    let roll = Math.random() * keys.reduce((a, k) => a + SABOTAGE[k].weight, 0);
    let key = keys[0];
    for (const k of keys) { roll -= SABOTAGE[k].weight; if (roll <= 0) { key = k; break; } }

    const cost = this.sabotageCost();
    const d = SABOTAGE[key];
    this.gold -= cost;
    this.sabDrawn++;
    this.sabSent.push(key);
    this.events.push({ t: "sabotage", key, name: d.name, icon: d.icon, cost,
                       tag: d.tag, desc: d.desc, left: this.sabotageLeft });
    return key;
  }

  /**
   * 상대가 나에게 건 공작을 내 판에 실제로 적용한다.
   *
   * 실시간(live)형은 전투가 흐르는 동안에만 닳으므로, 준비 단계에서 맞으면 고스란히 다음
   * 웨이브 첫머리에 얹힌다. 다음 웨이브(next)형은 예약해 두었다가 startWave 가 꺼내 쓴다.
   * @param {string} key
   */
  receiveSabotage(key) {
    const d = SABOTAGE[key];
    if (!d) return false;
    if (d.kind === "haste") { this.fx.hasteMul = 1 + d.amount; this.fx.hasteT = Math.max(this.fx.hasteT, d.dur); }
    if (d.kind === "fog")   { this.fx.fogMul = Math.max(0.3, 1 - d.amount); this.fx.fogT = Math.max(this.fx.fogT, d.dur); }
    if (d.kind === "tough") this.waveMods.hp *= 1 + d.amount;
    if (d.kind === "swarm") this.waveMods.count *= 1 + d.amount;
    if (d.kind === "elite") this.waveMods.elite += d.amount;
    this.recompute();
    this.events.push({ t: "sabotaged", key, name: d.name, icon: d.icon, when: d.when, desc: d.desc });
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

  // ── 1:1 대전 라운드 ──
  /** 이 스테이지가 침입자 대신 상대와 붙는 라운드인가 @param {number} wave */
  isDuelWave(wave) { return DUEL_WAVES.includes(wave); }
  /** 다음 라운드가 1:1 대전인가 (준비 단계 안내가 이걸 보고 문구를 바꾼다) */
  get nextIsDuel() { return this.isDuelWave(this.wave + 1); }

  /**
   * 대전 라운드를 연다. 침입자는 오지 않고, 실제 싸움은 web 쪽 대전장(DuelSim)이 굴린다 —
   * 여기서는 판의 상태만 "duel" 로 옮기고 스킬·공작·뽑기를 잠근다.
   */
  startDuel() {
    if (this.phase !== "prep" || this.awaitingPassive || this.awaitingAugment) return false;
    this.recompute();
    this.wave++;
    this.phase = "duel";
    this.waveTime = 0;
    this.enemies = []; this.spawnQueue = []; this.shots = [];
    this.events.push({ t: "duel_start", wave: this.wave });
    return true;
  }

  /**
   * 대전 결과를 판에 반영하고 준비 단계로 돌아온다.
   *
   * 진 쪽은 등록원부 내구를 잃는다 — 기본 손실에 **살아남은 상대 유닛 수**가 얹히므로,
   * 이길 수 없는 판이어도 몇 명이라도 더 눕히면 손실이 줄어든다.
   * @param {"win"|"lose"|"draw"} outcome
   * @param {number} foeAlive 살아남은 상대 유닛 수
   */
  endDuel(outcome, foeAlive) {
    if (this.phase !== "duel") return false;
    /* 이긴 쪽에게 **특허료를 주지 않는다.** 주면 더 좋은 덱을 사서 다음 대전도 이기고,
     * 그 눈덩이가 세 번 굴러가면 첫 대전 한 판으로 판이 끝난다. 승패는 최종 랭킹 점수로만
     * 돌아온다 (rankScore 의 ⚔️ 항목). 진 쪽의 내구 손실은 그대로 둔다 —
     * 이쪽은 「졌으니 다음 라운드가 버겁다」는 압박이지 자원 격차가 아니다. */
    let dmg = 0;
    const prize = outcome === "lose" ? DUEL.prize : DUEL.drawPrize;   // 둘 다 0
    if (outcome === "lose") { dmg = DUEL.leakBase + foeAlive * DUEL.leakPer; this.hp -= dmg; }
    if (prize) this.gold += prize;
    this.duelRecord[outcome === "win" ? 0 : outcome === "draw" ? 1 : 2]++;
    this.duelLog.push({ wave: this.wave, outcome });
    this.events.push({ t: "duel_end", wave: this.wave, outcome, dmg, prize, foeAlive,
                       points: outcome === "win" ? RANK.duelWin
                             : outcome === "draw" ? RANK.duelDraw : RANK.duelLose });

    if (this.hp <= 0) {
      this.phase = "lost"; this.shots = [];
      this.events.push({ t: "over", win: false });
      return true;
    }
    this.closeRound(true);
    return true;
  }

  // ── 웨이브 ──
  startWave() {
    if (this.phase !== "prep" || this.awaitingPassive || this.awaitingAugment) return false;
    this.recompute();
    if (!this.lanes.length) return false;

    // 「직권보정」 — 이번 웨이브 동안 공격력 3배가 될 냥타워를 뽑는다.
    // 뽑고 나서 다시 계산해야 그 냥의 st 에 배율이 실린다.
    if (this.augSet.has("golden")) {
      const pool = B.cats(this).filter((c) => c.st && c.st.atk);
      this.goldenUid = pool.length ? pool[this.waveRng.int(pool.length)].uid : 0;
      this.recompute();
      const pick = pool.find((c) => c.uid === this.goldenUid);
      if (pick) this.events.push({ t: "golden", name: CATS[pick.key].name, x: pick.x, y: pick.y });
    }

    this.wave++;
    this.phase = "wave";
    this.waveTime = 0;
    this.spawnQueue = [];

    // 상대가 걸어 둔 다음 웨이브 공작을 여기서 꺼내 쓰고 예약분은 비운다
    const mods = this.waveMods;
    this.waveMods = { hp: 1, count: 1, elite: 0 };
    this.waveFx = { hp: mods.hp };

    const def = WAVES[this.wave - 1];
    const scale = (this.bal.waveScale ?? 1) * mods.count;   // 「이의신청 대량제출」이 물량을 부풀린다
    let list = [];
    for (const k in def) {
      const n = k === "boss" ? def[k] : Math.max(1, Math.round(def[k] * scale));
      for (let i = 0; i < n; i++) list.push(k);
    }
    for (let i = 0; i < mods.elite; i++) list.push("tank");   // 「전문가 증인 투입」
    list = this.waveRng.shuffle(list);
    list.sort((a, b) => (a === "boss" ? 1 : 0) - (b === "boss" ? 1 : 0));

    // 진입구가 여럿이면 돌아가며 분배한다
    const nLanes = this.lanes.length;
    let at = 0, laneCursor = this.waveRng.int(nLanes);
    for (const t of list) {
      const lane = t === "boss" ? this.waveRng.int(nLanes) : (laneCursor++ % nLanes);
      this.spawnQueue.push({ t, at, lane });
      at += t === "boss" ? BAL.spawnGapBoss : BAL.spawnGap;
    }
    /* ── 파 타임 ── 이 라운드를 얼마나 빨리 끝냈는지를 재는 잣대(랭킹 ⏱️ 항목).
     * **마지막 침입자가 나오는 시각 + 여유**다. 스폰이 다 끝나기 전에는 라운드가 끝날 수
     * 없으므로 이게 이론상 최속이고, 물량 공작(「이의신청 대량제출」)으로 스폰이 길어지면
     * par 도 같이 늘어난다 — 맞은 쪽이 그 때문에 점수를 잃지 않도록. */
    this.wavePar = (this.spawnQueue.length ? this.spawnQueue[this.spawnQueue.length - 1].at : 0)
                   + RANK.parPad;

    this.events.push({
      t: "wave_start", wave: this.wave, count: list.length, par: this.wavePar,
      cover: this.cover, path: this.totalPath, covered: this.coveredPath, gates: nLanes,
      hpMod: mods.hp, countMod: mods.count, elite: mods.elite,
    });
    return true;
  }

  /**
   * 랭킹 점수를 낸다 — 판이 끝났을 때(그리고 진행 중 미리보기로) 부르는 한 곳.
   *
   * 네 항목이 서로 다른 것을 재므로, 하나만 잘해서는 높은 점수가 나오지 않는다.
   * 계산에 쓰는 원장(waveLog·duelLog·finalDeck·hp)은 전부 이 클래스 안에 쌓여 있고,
   * 여기서는 **읽기만 한다** — 점수를 보려고 부른다고 판이 달라지면 안 된다.
   *
   * @param {number} [deckPower] 지금 덱 지수. 안 주면 마지막으로 기록된 값(finalDeck)을 쓴다
   * @returns {{total:number, grade:string, gradeCol:string, say:string,
   *            duel:number, deck:number, speed:number, hp:number,
   *            waves:{wave:number,secs:number,par:number,pts:number}[],
   *            duels:{wave:number,outcome:string,pts:number}[]}}
   */
  rankScore(deckPower) {
    const deckIdx = deckPower == null ? this.finalDeck : deckPower;

    // ⚔️ 대전 — 세 판의 승/무/패
    const duels = this.duelLog.map((d) => ({
      wave: d.wave, outcome: d.outcome,
      pts: d.outcome === "win" ? RANK.duelWin : d.outcome === "draw" ? RANK.duelDraw : RANK.duelLose,
    }));
    const duel = duels.reduce((a, d) => a + d.pts, 0);

    /* ⏱️ 속도 — 라운드마다 par 이내면 만점, 그보다 오래 걸릴수록 반비례로 깎는다.
     * par 의 두 배가 걸리면 절반이 되는 식이라, 늦는다고 0점이 되지는 않는다 —
     * 「겨우 막아냈다」도 막아낸 것이기 때문이다. */
    const waves = this.waveLog.map((w) => ({
      wave: w.wave, secs: w.secs, par: w.par,
      pts: Math.round(RANK.speedPerWave * Math.min(1, w.par / Math.max(w.par, w.secs))),
    }));
    const speed = waves.reduce((a, w) => a + w.pts, 0);

    const deck = Math.round(Math.max(0, deckIdx) * RANK.deckMul);
    const hp = Math.round(Math.max(0, this.hp) * RANK.hpMul);
    const total = duel + deck + speed + hp;
    const g = RANK.grades.find((x) => total >= x.at) || RANK.grades[RANK.grades.length - 1];
    return { total, grade: g.g, gradeCol: g.col, say: g.say, duel, deck, speed, hp, waves, duels };
  }

  endWave() {
    /* 라운드를 끝낸 시각을 **게임 시간**으로 남긴다 (실시간이 아니다).
     * waveTime 은 tick 이 dt 만큼 더하는 값이라 배속을 걸어도 같은 속도로 흐른다 —
     * ×3 을 눌러 속도 점수를 벌 수 없다. */
    this.waveLog.push({ wave: this.wave, secs: this.waveTime, par: this.wavePar || 1 });
    this.closeRound(false);
  }

  /**
   * 라운드 하나를 마무리한다 — 침입자 웨이브든 1:1 대전이든 뒤처리는 똑같다.
   * (수입 지급 · 실시간 공작 해제 · 공작/스킬 대기 초기화 · 다음 선택지 예약)
   * @param {boolean} isDuel 방금 끝난 것이 대전 라운드였는가 (로그 문구만 달라진다)
   */
  closeRound(isDuel) {
    this.phase = "prep";
    // 상대가 걸어 둔 실시간 공작(기름·연막)은 웨이브와 함께 끝난다 — 준비 단계까지 끌고 가지 않는다
    this.fx.hasteT = 0; this.fx.fogT = 0;
    // 방해 공작 뽑기는 웨이브 주기마다 다시 찬다
    this.sabDrawn = 0;
    // 이번 웨이브에서 날아가던 미사일이 남아있으면 웨이브가 끝나도 화면에 얼어붙은 채 남는 잔상 버그가
    // 있었다 — step()이 phase==="wave"일 때만 돌아서 s.life가 더는 줄지 않기 때문. 웨이브가 끝나면
    // 무조건 정리한다.
    this.shots = [];
    const income = Math.round(this.bal.incomeBase + this.wave * this.bal.incomePerWave);
    this.gold += income;
    this.goldenUid = 0;        // 「직권보정」의 3배는 그 웨이브 안에서만 산다
    this.goldMul = 1;          // 「수수료 환급」의 2배도 그 라운드 안에서만 산다
    this.feeMul = 1; this.feeT = 0;   // 「과징금 부과」도 웨이브를 넘겨 끌고 가지 않는다
    this.recompute();
    this.events.push({ t: "wave_end", wave: this.wave, income, bonus: 0, duel: !!isDuel });
    if (this.wave >= BAL.waveCount) {
      this.phase = "won";
      this.events.push({ t: "over", win: true });
    } else if (this.isAugmentWave(this.wave)) {
      // 증강 웨이브에서는 패시브 대신 증강을 고른다 — 두 모달을 연달아 띄우면 대기가 너무 길어진다
      this.awaitingAugment = true;
    } else {
      this.awaitingPassive = true;
    }
  }

  /**
   * 이번 스테이지에 **뽑혀 나올 강화 넷**을 고른다.
   *
   * 예전에는 넷뿐이었고 매번 그 넷이 전부 나왔다 — 고를 것이 없으니 고민도 없었다.
   * 지금은 열여섯 장 중 넷만 나오므로, **무엇을 포기할 것인가**가 매번 생긴다.
   *
   * 뽑기는 고르게 하지 않는다. **이미 밀고 있는 계열의 카드가 더 잘 뽑힌다**(BAL.lineBias) —
   * 완전히 고르게 뽑으면 열두 번을 골라도 계열 점수가 흩어져 5점(2단계)에 좀처럼 닿지 못하고,
   * 그러면 「완성」이라는 것이 이름만 남는다. 계열을 정하는 것은 여전히 플레이어이고
   * (안 고르면 점수가 안 오르니 편향도 안 생긴다), 뽑기는 그 결정을 **밀어줄** 뿐이다.
   *
   * 같은 넷을 붙잡아 두는 것(this.passiveOffer)은 모달을 다시 그려도 후보가 바뀌지 않게
   * 하기 위해서다 — 창을 껐다 켜서 다시 뽑는 일이 없어야 한다.
   *
   * 난수는 시드 고정 rng 가 아니라 Math.random 을 쓴다. rng 는 상대와 공유하는 시드라
   * 그걸로 뽑으면 두 사람이 매 스테이지 정확히 같은 넷을 받아, 서로 다른 덱을 만드는
   * 재미가 통째로 사라진다.
   * @returns {any[]} 강화 정의 넷
   */
  passiveOffers() {
    if (this.passiveOffer) return this.passiveOffer;
    const pool = PASSIVES.slice();
    const out = [];
    const n = Math.min(BAL.passiveOffer, pool.length);
    for (let i = 0; i < n; i++) {
      const w = pool.map((p) => p.line
        ? 1 + BAL.lineBias * (this.lineScore[p.line] || 0)
        : BAL.commonBias);
      let roll = Math.random() * w.reduce((a, v) => a + v, 0);
      let idx = 0;
      for (let k = 0; k < pool.length; k++) { roll -= w[k]; if (roll <= 0) { idx = k; break; } }
      out.push(pool.splice(idx, 1)[0]);
    }
    this.passiveOffer = out;
    return out;
  }

  /**
   * 스테이지 강화 효과를 적용한다.
   *
   * 전부 **내 냥타워를 키우는** 효과라 상대에게 걸 것이 없다 (상대를 흔드는 일은 방해 공작
   * 뽑기가 통째로 맡는다). 상대에게 중계할 필요가 없다는 뜻이지 내 판에서만 산다는 뜻은
   * 아니다 — 냥타워의 능력치·규칙 자체를 바꾸므로 **1:1 대전장에도 그대로 실린다.**
   *
   * gold2x 만 성격이 다르다 — 쌓이지 않고 **다음 한 스테이지 동안만** 처치 보상을 두 배로 만들며,
   * 처치 보상이 없는 대전장에는 실리지 않는다.
   * @param {{key:string,stat:string,amount:any,line:string|null}} def
   */
  applyPassive(def) {
    if (def.stat === "gold2x") {
      // 다음 라운드 한 번만. 그 라운드가 끝나면 closeRound 가 도로 1로 돌려놓는다.
      this.goldMul = def.amount;
    } else if (def.stat === "splash") {
      // 방사는 반경과 비율 두 값이 함께 움직인다 — 하나만 올리면 방사가 성립하지 않는다
      this.bonus.splashR = (this.bonus.splashR || 0) + def.amount.r;
      this.bonus.splashF = (this.bonus.splashF || 0) + def.amount.f;
    } else if (def.stat === "splashUp") {
      // 「폐기명령」은 반경을 배율로, 비율을 절대값으로 올린다 — 칸을 나눠 두어야 stats 가 헷갈리지 않는다
      this.bonus.splashUpR = (this.bonus.splashUpR || 0) + def.amount;
      this.bonus.splashUpF = (this.bonus.splashUpF || 0) + 0.08;
    } else {
      this.bonus[def.stat] = Math.max(-0.7, (this.bonus[def.stat] || 0) + def.amount);
    }
    this.myPassives.push(def);

    /* ── 계열 점수 ── 고른 순간 점수가 오르고, 3점·5점에 닿으면 단계가 열린다.
     * 열린 단계는 lineNew 에 적어 두었다가 UI가 축포를 쏘고 지운다 — 「빌드를 완성했다」가
     * 화면에서 한 번은 크게 터져야 쌓은 보람이 손에 잡힌다. */
    if (def.line) {
      const score = (this.lineScore[def.line] || 0) + 1;
      this.lineScore[def.line] = score;
      const was = this.lineTier[def.line] || 0;
      let now = 0;
      for (const need of LINE_TIER_AT) if (score >= need) now++;
      this.lineTier[def.line] = now;
      if (now > was) {
        this.lineNew = { line: def.line, tier: now };
        this.events.push({ t: "line_tier", line: def.line, tier: now, score });
      }
    }

    this.passiveOffer = null;      // 다음 스테이지에는 새로 넷을 뽑는다
    this.recompute();
    this.awaitingPassive = false;
  }

  /**
   * 시간을 dt초 진행. 웨이브 중에만 의미가 있다.
   * @returns {boolean} 아직 진행 중인가
   */
  tick(dt, now) {
    if (this.phase !== "wave") return false;
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
      promoted: this.promoted,
      merged: this.merged, crafted: this.crafted,
      specials: B.cats(this).filter((c) => CATS[c.key].special).map((c) => c.key),
      maxLv: B.cats(this).reduce((a, c) => Math.max(a, c.lv || 1), 0),
      duelRecord: this.duelRecord.slice(),
      augments: this.augments.slice(),
      sabotage: this.sabSent.slice(),
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

/* 예전에는 여기에 「승진냥 전용 스프라이트」(선글라스 낀 흰 냥, img/cat-promoted.png)가 있었다.
 * 최고 레벨에 닿으면 원화가 통째로 그 그림으로 갈아 끼워졌는데, **내가 키운 그 냥이 아니게**
 * 보이는 것이 문제였다 — 여섯 종을 애써 갈라 놓고 마지막에 전부 같은 흰 냥으로 수렴했다.
 * 지금은 레벨이 올라도 **기본 1단계 원화를 그대로** 쓰고, 금빛 테두리와 Lv 딱지로만 갈린다.
 * (파일은 저장소에 그대로 남아 있으니 되살리려면 이 자리에 다시 넣으면 된다.) */

/**
 * 냥 종류별 전용 스프라이트 — 각각 4프레임 한 줄 (tools/cut-cat-sheet.js 가 원화에서 뽑는다).
 * 0번 칸이 평상시 자세이고, 0→1→2→3 을 한 번 훑으면 제자리 공격 모션이 된다.
 * 네 칸 모두 같은 배율·같은 바닥선으로 구워 두었으므로, 프레임이 넘어가도 발이 뜨지 않는다.
 *
 * 색보정(filter)은 걸지 않는다 — 시트마다 이미 제 색으로 그려져 있다. 예전에는 냥 한 벌을
 * `filter: hue-rotate(...)` 로 물들여 여섯 종을 만들었는데, 전용 시트가 있는 종류는 원화
 * 그대로가 그 냥의 얼굴이다.
 *
 * 시트가 아직 없는(또는 못 읽은) 종류는 예전 공용 스프라이트 시트로 알아서 되돌아간다 —
 * 파일을 하나씩 넣는 동안에도 판이 멀쩡히 돌아간다.
 */
const CAT_SHEET_SRC = {
  spec:  "img/cat_attack1.png",   // 출원냥
  claim: "img/cat_attack2.png",   // 특허범위냥
  agent: "img/cat_attack3.png",   // 변리사냥
  pct:   "img/cat_attack4.png",   // 국제출원냥
  fast:  "img/cat_attack5.png",   // 우선심사냥
  delay: "img/cat_attack6.png",   // 보정명령냥

  /* ── 특수(합성) 냥타워도 **기본 냥 원화를 그대로** 쓴다 ──
   * 예전에는 전용 원화가 없어 공용 스프라이트에 hue-rotate 를 걸어 물들였는데, 그 결과
   * 여섯 기본 냥만 제 얼굴이 있고 애써 합성한 다섯은 오히려 흐릿한 색 덩어리로 보였다.
   * 지금은 **재료 중 그 냥의 성격을 물려준 한 마리**의 원화를 그대로 쓰고, 합성했다는 표시는
   * 청록 테두리와 Lv 딱지로만 한다 — 판에서 구분이 되면 그걸로 충분하고,
   * 없는 원화를 색으로 지어내는 것보다 있는 원화를 쓰는 편이 언제나 낫다.
   * 다섯이 서로 다른 원화를 쓰도록 갈라 두어 한 판에 여럿을 세워도 헷갈리지 않는다. */
  panel:    "img/cat_attack4.png",   // ⚖️ 심판합의체냥 ← 🌐 국제출원냥 (다중조준을 물려받았다)
  invalid:  "img/cat_attack3.png",   // ☠️ 무효사유냥   ← 💼 변리사냥
  citation: "img/cat_attack2.png",   // 🔗 인용문헌냥   ← 📐 특허범위냥
  rush:     "img/cat_attack5.png",   // ⏱️ 조기공개냥   ← ⚡ 우선심사냥
  fee:      "img/cat_attack1.png",   // 💰 수수료징수냥 ← 📄 출원냥
};
/** 종류 → Image. 시트를 못 찾아도 판이 죽지 않게 로드 실패는 그냥 삼킨다 */
const catSheets = {};
for (const key of Object.keys(CAT_SHEET_SRC)) {
  const im = new Image();
  im.addEventListener("error", () => { catSheets[key] = null; }, { once: true });
  im.src = CAT_SHEET_SRC[key];
  catSheets[key] = im;
}
/**
 * 점프 모션 시트 — 웨이브가 도는 동안 제자리에서 뛰는 냥만 여기에 적는다.
 * 지금은 **변리사냥 하나뿐**이다. 비공격 보좌형이라 공격 모션이 돌 일이 거의 없어
 * 판이 돌아가는 내내 0번 칸에 굳어 있었는데, 그 자리를 점프가 채운다.
 *
 * 파일은 `tools/cut-cat-jump-sheet.js` 가 굽고 여섯 종이 다 준비돼 있다
 * (`cat_jump1`~`cat_jump6`). 여기에 한 줄 더 적으면 그 종류도 뛴다.
 * 공격 시트와 **형식이 완전히 같아서**(160px 셀 × 4컷) 모션이 바뀌어도 크기가 변하지 않는다.
 */
const CAT_JUMP_SRC = {
  agent: "img/cat_jump3.png",   // 변리사냥
};
/** 종류 → Image. 공격 시트와 같은 방식으로 로드 실패는 그냥 삼킨다 (그 냥은 안 뛴다) */
const catJumps = {};
for (const key of Object.keys(CAT_JUMP_SRC)) {
  const im = new Image();
  im.addEventListener("error", () => { catJumps[key] = null; }, { once: true });
  im.src = CAT_JUMP_SRC[key];
  catJumps[key] = im;
}
/**
 * 점프 한 바퀴 — 4컷을 뛰고 나서 잠깐 쉰다.
 *
 * 쉬는 참(REST)이 없으면 한 번도 안 쉬고 계속 통통 튀어 판 위에서 눈에 거슬린다.
 * 4컷 × 100ms(=400ms) 뛰고 520ms 쉬는 920ms 짜리다. 시트의 컷 순서는
 * 앉은 자세(0) → 살짝 뜸(1) → 정점(2) → 착지(3) 라서, 쉬는 동안은 0번 칸에 앉아 있는다.
 *
 * 공격 모션(SPEC_FRAME_MS)과 달리 공속에 맞출 것이 없어 값을 따로 잡았다 —
 * 이건 「판이 도는 동안 살아 있어 보이는가」만 보면 된다.
 */
const JUMP_FRAME_MS = 100;
/** 한 번 뛴 뒤 0번 칸에 앉아 쉬는 시간(ms) */
const JUMP_REST_MS = 520;
/** 이 종류의 점프 시트를 지금 쓸 수 있는가 */
const jumpOf = (key) => catJumps[key] || null;
const jumpReady = (key) => {
  const im = jumpOf(key);
  return !!im && im.complete && im.naturalWidth > 0;
};
/** 전용 시트 한 칸의 크기(px) — 시트를 아직 못 읽었을 때만 쓰는 대비값 */
const SPEC_CELL = 160;
/** 전용 시트 공격 모션의 프레임 수 — 모든 종류가 가로 1행 4프레임으로 같다 */
const SPEC_FRAMES = 4;
/**
 * 프레임당 유지 시간(ms) — 4프레임 220ms. **종류에 상관없이 같은 값을 쓴다.**
 * 공격 모션이 냥마다 다른 속도로 돌면 판 위에서 눈에 거슬리고, 아래처럼 「한 사격 안에
 * 네 칸이 다 들어가는가」로 잡은 값이라 공속이 다른 냥에게도 그대로 통한다.
 *
 * 출원냥의 실제 공속은 CATS.spec.rate(2.0) 가 아니라 거기에 stats.js 의 ATTACK_RATE_MULT(2.2)
 * 가 곱해진 초당 4.4회다. 곧 227ms 마다 한 발이 나가므로, 프레임당 80ms(=320ms)로 잡으면
 * 3번째 칸에서 다음 공격에 잘려 네 칸이 끝까지 돌지 못한다. 한 사격 안에 다 들어가도록 줄였다.
 * (보좌·증강으로 더 빨라지면 남은 칸이 잘리고 1번 칸부터 다시 도는데, 이건 연타로 보여 자연스럽다.)
 */
const SPEC_FRAME_MS = 55;
/** 이 종류의 전용 시트를 지금 쓸 수 있는가 */
const sheetOf = (key) => catSheets[key] || null;
const sheetReady = (key) => {
  const im = sheetOf(key);
  return !!im && im.complete && im.naturalWidth > 0;
};
/**
 * 시트에서 실제로 잰 한 칸의 크기.
 * 가로는 전체 너비를 프레임 수로 나눈 값, 세로는 시트 높이 그대로다 — 종류마다 원본 해상도가
 * 달라도, 또 시트를 다른 크기로 다시 구워도 프레임 경계가 어긋나거나 옆 칸이 묻어 나오지 않는다.
 */
const cellW = (im) => (im && im.naturalWidth ? im.naturalWidth / SPEC_FRAMES : SPEC_CELL);
const cellH = (im) => (im && im.naturalHeight ? im.naturalHeight : SPEC_CELL);
const sheetCellW = (key) => cellW(sheetReady(key) ? sheetOf(key) : null);
const sheetCellH = (key) => cellH(sheetReady(key) ? sheetOf(key) : null);

/**
 * 지금 이 냥이 그려야 할 칸 — [시트 이미지, 칸 번호].
 * 점프 시트가 있고 뛰어도 되는 참이면 점프 시트에서, 아니면 공격 시트에서 가져온다
 * (공격 시트의 0번 칸이 평상시 자세다).
 *
 * 뛰는 참을 냥마다 uid 로 어긋나게 둔다 — 변리사냥을 둘 이상 세웠을 때 똑같이 맞춰 뛰면
 * 살아 있는 것보다 기계처럼 보인다.
 *
 * @param {string} key @param {number} uid
 * @param {number} atkFrame 공격 모션의 현재 칸 (0 이면 평상시 자세)
 * @param {boolean} canJump 지금 뛰어도 되는가 — 부르는 쪽이 판단한다 (웨이브 중 · 공격 중 아님)
 * @param {number} now performance.now()
 */
function motionFrame(key, uid, atkFrame, canJump, now) {
  if (canJump && jumpReady(key)) {
    const hop = SPEC_FRAMES * JUMP_FRAME_MS;
    const cycle = hop + JUMP_REST_MS;
    const t = (now + (uid * 137) % cycle) % cycle;
    // 쉬는 참에는 0번 칸에 앉아 있는다
    return [jumpOf(key), t < hop ? Math.min(SPEC_FRAMES - 1, Math.floor(t / JUMP_FRAME_MS)) : 0];
  }
  return [sheetOf(key), atkFrame];
}

/** 로드 완료 시 콜백 (이미 로드됐으면 즉시) */
function onSpriteReady(fn) {
  if (sprite.complete && sprite.naturalWidth) fn();
  else sprite.addEventListener("load", fn, { once: true });
  for (const key of Object.keys(CAT_SHEET_SRC)) {
    const im = sheetOf(key);                       // 이미 로드에 실패한 종류는 null 이다
    if (im && !sheetReady(key)) im.addEventListener("load", fn, { once: true });
  }
  for (const key of Object.keys(CAT_JUMP_SRC)) {
    const im = jumpOf(key);
    if (im && !jumpReady(key)) im.addEventListener("load", fn, { once: true });
  }
}

return { SPEC_CELL, SPEC_FRAMES, SPEC_FRAME_MS,
         sheetOf, sheetReady, sheetCellW, sheetCellH, cellW, cellH,
         jumpOf, jumpReady, motionFrame,
         onSpriteReady, sprite };
})();
__mods["web/main.js"] = (function(){
// @ts-check
const {Game, frameOf} = __req("core/game.js");
const {CATS, CAT_SKILLS, ENEMIES, BAL, LINES, LINE_TIER_AT, PASSIVES, PASSIVE_BY_KEY,
       RANK, SABOTAGE, AUGMENTS, AUGMENT_WAVES,
       DUEL, DUEL_WAVES, DRAW_KEYS, RECIPES, catDrawChance} = __req("core/data.js");
const {DuelSim, campX, makeRoster, mobRoster, deckPower} = __req("core/duel.js");
const {MAPS} = __req("core/maps.js");
const B = __req("core/board.js");
const {auraCells} = __req("core/stats.js");
const {sprite, onSpriteReady,
       SPEC_FRAMES, SPEC_FRAME_MS,
       sheetOf, sheetReady, sheetCellW, sheetCellH, cellW, cellH,
       motionFrame} = __req("web/sprite.js");
const $ = (s) => /** @type {HTMLElement} */ (document.querySelector(s));
const CS = BAL.cellSize, GAP = BAL.cellGap;

/** @type {any} 방에 입장해서 대전이 시작되어야 만들어진다 */
let game = null;
let speed = 1;
let dragging = null;
/** 심사관 uid → 스프라이트 캔버스. 렌더러 소유 상태. @type {Map<number,HTMLCanvasElement>} */
const catCanvas = new Map();

/* ═══════ 네트워킹 ═══════ */
let ws = null, youAre = null;
let oppSnapshot = null;   // 상대에게서 마지막으로 받은 보드 스냅샷
let lastStateSentAt = 0;
let matchSeed = 0;        // 서버가 정해 준 판 시드 — 양쪽이 같은 웨이브·같은 증강 후보를 받는다
let soloMode = false;     // 솔로 플레이 — 상대도, 서버도 없다. 대기·준비·상대 화면이 전부 사라진다

/* ── 웨이브 동시 개시 ──
 * 예전에는 「웨이브 개시」를 누르는 즉시 내 판에서만 웨이브가 굴러가서, 먼저 누르고 먼저 끝내는 쪽이
 * 계속 앞서 나가는 구조였다. 이제 개시 버튼은 "준비 완료" 신호일 뿐이고, 실제 개시는 서버가
 * 양쪽에게 동시에 알린다 — 둘 다 준비되면 바로, 아니면 준비시간 15초가 끝나는 순간에.
 */
let iReady = false;        // 내가 준비를 눌렀는가
let oppReady = false;      // 상대가 준비를 눌렀는가
let oppInPrep = false;     // 상대도 준비 단계에 들어섰는가 (아직 웨이브를 돌고 있으면 false)
let prepEndsAt = 0;        // 준비시간 마감 시각(performance.now 기준). 0이면 아직 카운트다운 전
let prepSentWave = 0;      // "준비 단계에 들어섰다"를 서버에 알린 웨이브 번호 (중복 전송 방지)
let oppAugs = [];          // 상대가 고른 증강 키 목록 (스냅샷에서 받아온다)

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
function sendWS(obj) { if (soloMode) return; if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }

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
      matchSeed = msg.seed || 0;
      beginBattle();
      break;
    case "oppState":
      oppSnapshot = msg.snap;
      $("#oppHp").textContent = `${Math.max(0, Math.ceil(msg.snap.hp))}/${msg.snap.maxHp}`;
      $("#oppWave").textContent = `${msg.snap.wave}/${BAL.waveCount}`;
      syncOppAugs(msg.snap.augs || []);
      break;

    /* ── 동시 개시 ── */
    case "prepState": {      // 서버가 보내 주는 양쪽의 준비 상황 (항상 전체 상태)
      if (!game || msg.wave !== game.wave + 1) break;
      const me = youAre === "p1" ? 0 : 1;
      const was = oppReady;
      iReady = !!msg.ready[me];
      oppReady = !!msg.ready[1 - me];
      oppInPrep = !!msg.prep[1 - me];
      if (oppReady !== was) log(oppReady ? "상대가 <b>준비 완료</b>했습니다." : "상대가 준비를 취소했습니다.");
      break;
    }
    case "prepSync":         // 양쪽 다 준비 단계 — 여기서부터 15초를 잰다
      oppInPrep = true;
      prepEndsAt = performance.now() + (msg.secs || BAL.prepSecs) * 1000;
      break;
    case "waveGo":           // 서버의 개시 신호 — 양쪽이 같은 순간에 웨이브를 시작한다
      if (game && game.wave + 1 === msg.wave) doStartWave();
      break;
    // 스테이지 강화 효과는 넷 다 자기 냥타워를 키우는 것이라 상대에게 걸 것이 없다
    // (상대를 흔드는 일은 아래 방해 공작 뽑기가 맡는다). 중계할 게 없다는 뜻일 뿐,
    // 공격력·공속·치명타는 1:1 대전장까지 그대로 따라간다.
    case "oppSabotage":
      if (game) game.receiveSabotage(msg.key);
      break;
    case "oppDuel":      // 상대의 대전 명세 — 이게 도착해야 대전장을 굴릴 수 있다
      receiveDuelRoster(msg.wave, msg.roster);
      break;
    case "oppDuelResult":   // p1 이 내린 판정 (p2 는 이것을 따른다)
      receiveDuelResult(msg.wave, msg.outcome, msg.foeAlive, msg.reason);
      break;
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
      // 배경 원화의 조형물이 깔고 앉은 칸 — 판정은 그대로 두고 칠만 벗겨 원화가 드러나게 한다
      const mon = (game.map.deco || []).some(([dx, dy]) => dx === x && dy === y);
      const d = document.createElement("div");
      d.className = "cell" +
        (gate ? " gate" : "") + (goal ? " goal" : "") +
        (fixed ? " fixed" : "") + (opened ? " annex" : "") +
        (tower ? " tower" : "") + (road ? " road" : "") + (mon ? " mon" : "");
      d.dataset.x = String(x); d.dataset.y = String(y);
      // 진입구·등록원부에는 글자를 얹지 않는다 — 배경 원화가 그 자리에 문(북문)과 조형물(등록원부)을
      // 이미 그려 두어서, 그 위에 이름표까지 올리면 그림만 가린다
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
  fitArena(true);        // 판을 새로 짰으니 화면 높이에 다시 맞춘다
}

/** 칸을 새로 만들지 않고, 칸 위에 붙는 클래스(인접 강조 / 부속 구역 개방)만 갱신한다 */
function syncBoardCells() {
  const baseFixed = new Set(baseFixedCells());
  const adj = new Set();
  for (const c of B.cats(game)) {
    if (!c.st || (!c.st.auraDmg && !c.st.auraRate)) continue;
    for (const k of auraCells(game, c)) adj.add(k);   // 「심사 병합」 증강이면 범위가 넓어진다
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
  renderPromoteList();
  renderHud();
  fitArena();      // 대기열이 생기거나 사라지면 판에 남는 높이가 달라진다 (크기가 그대로면 바로 빠진다)
}

function pieceEl(p, onBoard) {
  const el = document.createElement("div");
  // 변리사냥의 보좌를 받고 있으면 배경이 은은하게 반짝인다 (실제로 이어진 터에만 적용됨)
  const buffed = p.st && (p.st.buffDmg > 1 || p.st.buffRate > 1);
  const lv = Math.max(1, p.lv || 1);
  const promoted = lv >= BAL.promoteLv;      // 승진은 합성의 마지막 단계다 (별도 플래그가 아니다)
  el.className = "piece cat" + (buffed ? " buffed" : "") + (lv > 1 ? " lv" + lv : "") +
    (CATS[p.key].special ? " special" : "") +
    (promoted ? " promoted" : "") + (p.st && p.st.golden ? " golden" : "");
  el.dataset.uid = String(p.uid);

  if (onBoard) {
    el.style.left = B.px(p.x) + "px";
    el.style.top = B.px(p.y) + "px";
    el.style.width = (p.w * CS + (p.w - 1) * GAP) + "px";
    el.style.height = (p.h * CS + (p.h - 1) * GAP) + "px";
  }

  const cv = document.createElement("canvas");
  /**
   * 전용 시트를 쓰는 냥만 캔버스를 화면 픽셀 밀도만큼 크게 잡는다.
   * 64px 캔버스를 배율 200% 화면에 그대로 얹으면 브라우저가 두 배로 늘리는데,
   * 부드러운 일러스트라 그때 외곽선이 계단처럼 깨진다. **표시 크기는 64px 그대로**라
   * 화면에서 보이는 크기·위치는 달라지지 않는다 — idle 과 공격 프레임이 같은 캔버스·같은
   * 표시 크기를 쓰므로 공격이 시작돼도 크기나 선 두께가 변하지 않는다.
   * (전용 시트가 없어 공용 스프라이트로 그리는 냥은 예전처럼 64×64 그대로 둔다.)
   */
  const smooth = useSpecSheet(p.key);
  const hi = smooth ? Math.min(3, Math.max(1, Math.ceil(window.devicePixelRatio || 1))) : 1;
  cv.width = 64 * hi; cv.height = 64 * hi;
  cv.style.width = "64px"; cv.style.height = "64px";
  if (smooth) cv.classList.add("smooth");   // 픽셀아트가 아니므로 pixelated 를 걷어 낸다
  catCanvas.set(p.uid, cv);        // 코어 객체를 오염시키지 않는다
  el.appendChild(cv);

  const BADGE = (side) => `position:absolute;${side}:-3px;bottom:-3px;font-size:20px;line-height:1;` +
    "background:#f2ecdb;border:2px solid #2b2418;border-radius:50%;width:26px;height:26px;" +
    "display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:5";
  const badge = document.createElement("span");
  badge.textContent = CATS[p.key].icon;
  badge.style.cssText = BADGE("right");

  /* 합성 레벨 — 왼쪽 위. 무엇이 몇 레벨인지 판을 훑기만 해도 보여야 합성 계획이 선다.
   * 예전에는 최고 레벨에만 따로 「승」 계급장을 달았는데, 원화까지 갈아타던 시절의 잔재다.
   * 지금은 원화가 그대로이므로 **표시도 Lv 딱지 하나로 통일**한다 — 같은 것을 두 가지 방식으로
   * 말하면 어느 쪽이 진짜인지 판에서 되묻게 된다. 최고 레벨은 금빛 테두리로 갈린다. */
  if (lv > 1) {
    const tag = document.createElement("span");
    tag.className = "lvtag";
    tag.textContent = "Lv" + lv;
    el.appendChild(tag);
  }
  el.appendChild(badge);

  el.addEventListener("pointerdown", (e) => startDrag(e, p));
  el.addEventListener("pointerenter", (e) => showTip(e, p));
  el.addEventListener("pointerleave", hideTip);
  return el;
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
  // 등록번호 칸(머릿글)은 걷어냈다 — 남아 있는 판에만 찍는다.
  // 없는 칸에 그대로 쓰면 renderHud 가 통째로 터져서 그 아래(전장 원화·개시 단추·합성 묶음)가
  // 전부 멈춘다. 실제로 웨이브를 눌러도 침입자가 나오지 않던 원인이었다.
  const regEl = $("#regHead");
  if (regEl) regEl.textContent = String(game.reg);

  renderScore();
  applyStageTheme();         // 스테이지 구간이 넘어가면 전장 원화도 같이 갈린다
  const prep = game.phase === "prep";
  renderReadyBar();          // 개시 버튼의 상태는 이제 준비 상황이 정한다
  renderMergeDock();         // 합성 가능한 묶음이 생기면 판 우측 상단에 저절로 뜬다
  updateSabotageBar();
}

/**
 * 지금까지의 랭킹 점수 — 판이 도는 내내 보여 준다.
 *
 * 10라운드가 끝나면 **이 숫자가 곧 결과**다. 끝나고서야 처음 보면 무엇을 잘못했는지 알 수 없으니,
 * 진행 중에도 네 항목이 각각 얼마씩 쌓였는지 계속 깔아 둔다 — 「대전은 이겼는데 속도가 안 나오네」가
 * 판 안에서 보여야 다음 라운드에 손을 쓸 수 있다.
 *
 * 덱 파워는 **지금 판을 재서** 넣는다 (마지막 라운드의 확정값 finalDeck 과 달리 실시간이다).
 * 대전 라운드 중에는 판이 접혀 있으므로 확정값을 그대로 쓴다.
 */
let scoreSig = "";
function renderScore() {
  const box = $("#sScore");
  if (!box) return;
  const live = game.phase === "duel" ? (game.finalDeck || 0) : deckPower(makeRoster(game));
  const r = game.rankScore(live);
  const sig = `${r.total}|${r.grade}`;
  if (sig === scoreSig) return;          // 매 프레임 불려도 바뀐 게 없으면 DOM을 건드리지 않는다
  scoreSig = sig;
  box.textContent = r.total.toLocaleString();
  box.style.color = r.gradeCol;
  const g = $("#sGrade");
  if (g) { g.textContent = r.grade; g.style.color = r.gradeCol; }
  const legs = $("#sScoreLegs");
  if (legs) legs.innerHTML =
    `<span>⚔️ ${r.duel.toLocaleString()}</span><span>🏗️ ${r.deck.toLocaleString()}</span>` +
    `<span>⏱️ ${r.speed.toLocaleString()}</span><span>🏛️ ${r.hp.toLocaleString()}</span>`;
}
const btn = (s) => /** @type {HTMLButtonElement} */ ($(s));

/* ═══════ 웨이브 동시 개시 ═══════ */
/** 지금 준비 버튼을 누를 수 있는 상태인가 (준비 단계 + 고를 것이 남아 있지 않음) */
const canPrep = () => !!game && game.phase === "prep" && !game.awaitingPassive && !game.awaitingAugment;
const online = () => !soloMode && !!ws && ws.readyState === 1;
/**
 * 이 라운드를 상대와 맞춰서 시작해야 하는가 — **1v1 에서는 언제나 그렇다.**
 *
 * 한때는 첫 라운드만 맞추고 그 뒤로는 각자 원할 때 개시하게 두었다. 「준비를 빨리 끝낸 쪽이
 * 상대를 기다리며 멈춰 있을 이유가 없다」는 이유였는데, **1:1 대전이 세 번(4·7·10)으로 늘면서
 * 그 자유가 판을 어긋나게 만든다.** 한쪽이 앞서 나가면 그쪽이 라운드 4 대전에 들어섰을 때
 * 상대는 아직 라운드 3을 돌고 있고, 명세가 오지 않아 12초를 기다리다 **쥐 침입단으로 대체**된다 —
 * 사람과 붙으라고 만든 라운드가 혼자 노는 라운드가 된다.
 *
 * 이제 **모든 라운드가 「둘 다 준비」로 열립니다.** 둘 다 누르면 곧바로, 아니면 준비시간
 * (BAL.prepSecs)이 끝나면 자동으로 — 서버가 판정하고 양쪽에 동시에 알린다.
 * 그래서 두 사람의 라운드 번호가 판이 끝날 때까지 한 번도 어긋나지 않는다.
 *
 * 솔로에는 맞출 상대가 없으므로 이 함수를 보지 않고 곧바로 개시한다 (호출부에서 거른다).
 * @param {number} wave 시작하려는 라운드 번호
 */
const needsSync = (wave) => { void wave; return true; };

/**
 * 준비 단계에 들어섰다는 사실을 서버에 한 번만 알린다.
 * 서버는 양쪽이 다 들어온 순간부터 준비시간을 재기 시작한다 — 상대가 아직 웨이브를 돌고 있으면
 * 카운트다운도 시작되지 않으므로, 먼저 끝냈다고 해서 앞서 나갈 수가 없다.
 */
function syncPrepState() {
  if (!game || soloMode) return;   // 솔로에는 맞춰야 할 상대가 없다
  const next = game.wave + 1;
  if (canPrep() && needsSync(next) && prepSentWave !== next) {
    prepSentWave = next;
    // 상대 쪽 상태는 건드리지 않는다 — 서버가 곧바로 prepState 로 전체 상황을 다시 알려준다.
    // (내가 늦게 들어왔을 때 이미 준비를 마친 상대를 "대기 중"으로 지워버리면 안 된다)
    iReady = false; prepEndsAt = 0;
    sendWS({ t: "prep", wave: next });
  }
}

/** 개시 버튼 + 준비 표시줄. 매 프레임 불린다. */
function renderReadyBar() {
  if (!game) return;
  const b = btn("#btnGo");
  const next = game.wave + 1;
  const bar = $("#readyBar");
  if (!bar) return;

  const duelNext = game.nextIsDuel;
  // 솔로에는 맞출 상대가 없다 — 「개시」 버튼 하나로 끝난다
  const sync = !soloMode && needsSync(next);
  if (game.phase === "duel") {
    b.disabled = true; b.textContent = "1:1 대전 중…";
  } else if (game.phase === "wave") {
    b.disabled = true; b.textContent = "심사 중…";
  } else if (game.awaitingAugment) {
    b.disabled = true; b.textContent = "증강 선택 중";
  } else if (game.awaitingPassive) {
    b.disabled = true; b.textContent = "효과 선택 중";
  } else if (game.phase === "prep") {
    b.disabled = false;
    // 솔로에서는 "준비"가 아니라 곧바로 개시다 — 기다릴 상대가 없다.
    // 다음이 대전 라운드면 무엇이 시작되는지 버튼에 그대로 적는다.
    b.textContent = duelNext
      ? (!sync ? `⚔ 라운드 ${next} 1:1 대전 개시` : iReady ? "준비 취소" : `⚔ 라운드 ${next} 1:1 대전 준비`)
      : (!sync ? `라운드 ${next} 개시` : iReady ? "준비 취소" : `라운드 ${next} 준비 완료`);
  } else {
    b.disabled = true;
  }
  b.classList.toggle("duelnext", duelNext && game.phase === "prep");

  // 배속은 대전 라운드에서 잠긴다 — 양쪽이 같은 속도로 봐야 같은 장면이 된다
  const sp = btn("#btnSpeed");
  if (sp) {
    const lock = game.phase === "duel";
    sp.disabled = lock;
    sp.textContent = lock ? "배속 없음" : "속도 ×" + speed;
  }
  b.classList.toggle("waiting", sync && iReady && game.phase === "prep");

  // 준비 표시줄 — 1v1 에서는 매 라운드 뜬다 (모든 라운드가 「둘 다 준비」로 열린다)
  if (!sync) { bar.classList.add("hidden"); return; }
  const show = game.phase === "prep";
  bar.classList.toggle("hidden", !show);
  if (!show) return;

  const left = prepEndsAt ? Math.max(0, (prepEndsAt - performance.now()) / 1000) : 0;
  $("#rdyMe").className = "rdy " + (iReady ? "on" : "off");
  $("#rdyMe").querySelector("b").textContent = iReady ? "준비 완료" : "준비 중";
  $("#rdyOpp").className = "rdy " + (oppReady ? "on" : oppInPrep ? "off" : "away");
  $("#rdyOpp").querySelector("b").textContent =
    oppReady ? "준비 완료" : oppInPrep ? "준비 중" : "라운드 진행 중";

  const t = $("#rdyTimer");
  if (!online()) t.textContent = "서버 연결 끊김 — 혼자 진행합니다";
  else if (!prepEndsAt) t.textContent = "상대가 웨이브를 끝내면 준비시간이 시작됩니다";
  else t.textContent = `준비시간 ${left.toFixed(1)}초`;
  /** @type {HTMLElement} */ ($("#rdyFill")).style.width =
    prepEndsAt ? `${Math.min(100, (left / BAL.prepSecs) * 100)}%` : "0%";
}

/** 실제 개시. 서버의 waveGo 신호(또는 서버가 없을 때의 직접 개시)로만 들어온다. */
function doStartWave() {
  iReady = false; oppReady = false; oppInPrep = false; prepEndsAt = 0;
  // 라운드 4·7·10 은 침입자가 아니라 상대와 붙는다
  if (game.nextIsDuel) { startDuelRound(); return; }
  if (!game.startWave()) { log("동선이 막혀 있습니다."); return; }
  render();
}

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

/**
 * 한 구간에서 예외가 나도 그 구간만 건너뛰고 나머지는 계속 그린다.
 *
 * 예전에는 그리기 도중 한 번만 터져도 그 뒤(침입자·미사일·연출)가 통째로 안 그려졌다.
 * 전투는 화면과 무관하게 계속 돌기 때문에, 판이 멀쩡해 보이는 채로 침입자가 보이지 않고
 * 그대로 돌파당해 냥타워가 줄줄이 무효가 되는 최악의 형태로 나타난다.
 * 같은 오류는 한 번만 알리고(로그 + 콘솔), 판은 계속 굴러가게 한다.
 */
const errShown = new Set();
function safe(what, fn) {
  try { fn(); }
  catch (e) {
    if (errShown.has(what)) return;
    errShown.add(what);
    console.error(`[${what}]`, e);
    log(`<b style="color:#e0574d">${what} 오류</b> ${e && e.message ? e.message : e} — F12 콘솔에 자세한 내용이 남았습니다`);
  }
}

function draw(now) {
  const cv = fxCanvas();
  const g = cv.getContext("2d");
  // 앞 프레임에서 save/restore 가 어긋났더라도 여기서 원점으로 되돌린다
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.clearRect(0, 0, cv.width, cv.height);

  g.save();
  if (shakeT > 0) {
    const k = shakeMag * (shakeT / 0.16 > 1 ? 1 : shakeT / 0.16); // 끝에 갈수록 잦아든다
    g.translate((Math.random() - 0.5) * 2 * k, (Math.random() - 0.5) * 2 * k);
  }

  safe("냥타워 그리기", () => drawCats(g, now));
  // 시신은 살아 있는 침입자 아래에 깔린다 — 뒤따라오는 쥐가 시신에 가려지지 않도록
  safe("침입자 그리기", () => { drawCorpses(g); drawEnemies(g, now); });
  safe("탄환 그리기", () => { for (const s of game.shots) drawMissile(g, s); });
  safe("연출 그리기", () => { drawCrumbs(g); drawSparks(g); drawSkillRings(g); drawFloaters(g); });
  g.restore(); // 화면 흔들림 여기까지 — 이 아래는 화면에 고정된 UI라 흔들리지 않는다
}

/**
 * 이 냥이 전용 시트를 쓸 차례인가 — 승진하면 승진냥 원화가 우선하고,
 * 전용 시트가 없는 종류(특수 냥타워 등)는 예전 공용 스프라이트로 되돌아간다.
 * @param {string} key @param {boolean} promoted
 */
/* 전용 원화를 쓰는가. **합성·승진 여부를 보지 않는다** —
 * 레벨이 오르거나 이종 합성으로 나온 냥도 **기본 1단계 냥의 원화를 그대로** 쓰고,
 * 합성했다는 표시는 테두리(아우라)와 Lv 딱지로만 한다. 예전에는 승진냥만 전용 원화
 * (선글라스 낀 흰 냥)로 갈아탔는데, 원래 쓰던 냥과 얼굴이 통째로 달라져 「내가 키운 그 냥」이
 * 아니게 보였다. */
const useSpecSheet = (key) => sheetReady(key);

/**
 * 그 냥의 현재 공격 프레임. 공격 중이 아니면 0(평상시 자세)이다.
 *
 * 총알은 combat.js 가 조준에 성공한 그 자리에서 바로 만든다 — 발사를 뒤로 미루면
 * 사거리 밖으로 빠져나간 적을 향해 쏘거나, 판이 끝난 뒤에 총알이 남는 문제가 생긴다.
 * 그래서 발사 로직은 그대로 두고, 모션만 발사 시각에 맞춰 1프레임부터 다시 시작한다.
 * 발사 시각 = atkEnd − atkTotal (combat.js 가 atkEnd 를 그렇게 잡는다).
 *
 * 220ms 짜리라 출원냥 기본 공속(초당 4.4회 = 227ms)에서는 네 칸이 딱 다 재생되고,
 * 보좌·증강으로 더 빨라지면 다 끝나기 전에 다음 공격이 들어와 1프레임부터 다시 돈다.
 */
function specFrame(cat, now) {
  if (!cat.atkEnd || !game) return 0;
  const t = now - (cat.atkEnd - game.atkTotal);   // 발사 뒤 흐른 시간(ms)
  if (t < 0 || t >= SPEC_FRAMES * SPEC_FRAME_MS) return 0;
  return Math.min(SPEC_FRAMES - 1, Math.floor(t / SPEC_FRAME_MS));
}

/** 냥타워 — 사거리 원과, 각 조각이 들고 있는 64×64 캔버스의 스프라이트 */
function drawCats(g, now) {
  for (const c of B.cats(game)) {
    if (!c.st) continue;
    if (c.st.atk) {   // 「변리사 개업」을 고르면 보좌형에게도 사거리 원이 생긴다
      const [cx, cy] = B.pieceCenter(c);
      // 상대의 「심사 방해 연막」이 걸려 있으면 실제로 줄어든 사거리를 그대로 그린다
      g.beginPath(); g.arc(cx, cy, c.st.range * game.catRangeMul, 0, 7);
      g.fillStyle = c.st.golden ? "rgba(205,164,58,.12)" : "rgba(105,182,214,.07)"; g.fill();
      g.strokeStyle = c.st.golden ? "rgba(205,164,58,.6)" : "rgba(60,106,138,.32)"; g.lineWidth = 1; g.stroke();
    }
    const cc = catCanvas.get(c.uid);
    if (!cc) continue;
    const cg = cc.getContext("2d");
    const [row, fr] = frameOf(c, now);
    // 캔버스를 화면 픽셀 밀도만큼 크게 잡은 조각(전용 시트를 쓰는 냥)은 그 배율만큼 확대해 그린다.
    // 아래 그리는 코드는 예전처럼 64×64 좌표계 그대로 두면 된다.
    const k = cc.width / 64;
    cg.setTransform(k, 0, 0, k, 0, 0);
    cg.imageSmoothingEnabled = true;          // 부드러운 일러스트라 NEAREST 로 늘리면 외곽선이 깨진다
    cg.imageSmoothingQuality = "high";
    cg.clearRect(0, 0, 64, 64);
    if (useSpecSheet(c.key)) {
      // 전용 시트를 가진 냥 — 평상시 0번 칸, 공격하는 동안만 0→1→2→3 (색보정 없이 원화 그대로).
      // 네 칸이 같은 배율·같은 바닥선으로 구워져 있어 칸이 넘어가도 중심과 발끝이 그대로다.
      //
      // 점프 시트가 있는 냥(변리사냥)은 **웨이브가 도는 동안** 공격하지 않는 참에 제자리에서
      // 뛴다. 두 시트가 같은 셀·같은 배율로 구워져 있어 시트를 갈아타도 크기가 튀지 않는다.
      //
      // 「공격 중이 아님」은 공격 프레임이 0인지가 아니라 atkEnd 로 본다 — 공격 프레임은 발사
      // 직후 첫 55ms 동안에도 0이라, 그걸로 갈랐다면 쏘기 시작하는 순간 한 컷 떠올랐다가
      // 공격 자세로 튀는 깜빡임이 생긴다 (「변리사 개업」으로 보좌형이 쏘게 되는 경우).
      const canJump = game.phase === "wave" && !(c.atkEnd && now < c.atkEnd);
      const [im, fi] = motionFrame(c.key, c.uid, specFrame(c, now), canJump, now);
      const cw = cellW(im), ch = cellH(im);
      cg.drawImage(im, fi * cw, 0, cw, ch, 0, 0, 64, 64);
    } else if (sprite.complete) {
      cg.filter = CATS[c.key].filter || "none";
      cg.drawImage(sprite, fr * 64, row * 64, 64, 64, 0, 0, 64, 64);
      cg.filter = "none";
    }
  }
}

/** 침입자 + 머리 위 체력줄 */
function drawEnemies(g, now) {
  for (const e of game.enemies) {
    const d = ENEMIES[e.t];
    if (!d) continue;
    drawMonster(g, e, d, now);
    const w = d.r * 1.5, hp = Math.max(0, e.hp / e.max), by = -d.r * 1.05;
    g.fillStyle = "rgba(0,0,0,.5)"; g.fillRect(e.x - w / 2, e.y + by, w, 2.4);
    g.fillStyle = hp > .5 ? "#7fbf6a" : hp > .25 ? "#cda43a" : "#c4322a";
    g.fillRect(e.x - w / 2, e.y + by, w * hp, 2.4);
  }
}
/**
 * 합성 냥타워의 스킬이 훑고 간 범위 — 안쪽에서 바깥으로 번지는 고리 두 겹.
 * 「무엇이 맞았는가」를 그 자리에서 보여 주는 유일한 표시라, 컷인보다 이쪽이 정보다.
 */
function drawSkillRings(g) {
  for (const r of skillRings) {
    const a = Math.max(0, r.life / r.max);
    const p = 1 - a;                            // 0 → 1 로 퍼진다
    g.save();
    g.globalAlpha = a * .85;
    g.strokeStyle = r.col;
    g.lineWidth = 4 * a + 1;
    g.beginPath(); g.arc(r.x, r.y, r.r * (0.25 + 0.75 * p), 0, 7); g.stroke();
    g.globalAlpha = a * .35;
    g.lineWidth = 2;
    g.beginPath(); g.arc(r.x, r.y, r.r, 0, 7); g.stroke();
    g.restore();
  }
}

/**
 * 떠오르며 사라지는 글씨들.
 * 「Critical!」처럼 눈에 띄어야 하는 것(big)은 처음에 살짝 작게 나타났다가 커지면서 떠오르고,
 * 마지막 구간에서 서서히 사라진다. 종이 판 위에서도 읽히도록 검은 테두리를 두른다.
 */
function drawFloaters(g) {
  g.textAlign = "center"; g.textBaseline = "alphabetic";
  for (const f of floaters) {
    const max = f.max || 0.8;
    const p = 1 - Math.max(0, f.life) / max;          // 0 → 1
    const rise = (f.rise ?? 22) * p;
    // 앞 15%는 나타나고, 뒤 40%는 사라진다
    const alpha = Math.min(1, p / 0.15) * Math.min(1, Math.max(0, (1 - p) / 0.4));
    const scale = f.big ? 0.72 + Math.min(1, p / 0.22) * 0.38 : 1;

    g.save();
    g.globalAlpha = Math.max(0, alpha);
    g.translate(f.x, f.y - rise);
    if (scale !== 1) g.scale(scale, scale);
    g.font = f.big ? "bold 16px 'Jua','Gowun Dodum',ui-monospace,monospace"
                   : "bold 11px ui-monospace,monospace";
    if (f.big) {
      g.lineWidth = 3.4; g.strokeStyle = "rgba(24,16,10,.85)";
      g.lineJoin = "round";
      g.strokeText(f.txt, 0, 0);
    }
    g.fillStyle = f.col;
    g.fillText(f.txt, 0, 0);
    g.restore();
  }
  g.globalAlpha = 1;
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

/** 침입자 원화 — 종류마다 투명 배경 PNG 한 장. 아직 안 올라왔으면 아래 벡터 실루엣으로 대체한다. */
const MOB_SRC = { copy: "img/mob-copy.png", fast: "img/mob-fast.png", tank: "img/mob-tank.png", boss: "img/mob-boss.png" };
/** @type {Record<string,HTMLImageElement>} */
const MOB_IMG = {};
for (const t in MOB_SRC) { const im = new Image(); im.src = MOB_SRC[t]; MOB_IMG[t] = im; }

/**
 * 달리기 8컷(img/mouse-run-v4.png) · 사망 3컷(img/mouse-sheet-v2.png) — 스타일시트에서 잘라 낸 가로 스트립.
 * 셀 폭은 늘 (그림 가로 ÷ 컷 수)로 나눠 쓰므로, 시트를 다시 뽑아 스트립만 갈아 끼워도 코드는 그대로다.
 */
const MOB_STRIP = { run: 8, die: 3 };

/**
 * 달리기 8컷의 도약 높이(0=발이 땅, 1=가장 높이 떠 있음).
 * 컷 그림의 무게중심 높이를 종류별로 재서 평균 낸 값이다 — 8컷 안에 도약이 두 번 들어 있다.
 * 그림자와 발밑 먼지가 이 값을 따라가야 컷과 어긋나지 않는다. 몸의 오르내림은 그림이 이미 갖고
 * 있으므로 코드로 또 띄우지 않는다 — 그러면 발이 땅에 안 붙고 둥둥 떠 보인다.
 */
const RUN_LIFT = [0.26, 0.48, 0.63, 0.25, 1.00, 0.29, 0, 0.18];

/** 컷 사이를 이어 준 도약 높이. 컷은 뚝뚝 넘어가도 그림자와 먼지는 이어져야 눈에 안 걸린다.
 *  @param {number} fp 소수점까지의 컷 번호 (정수부가 지금 컷, 소수부가 다음 컷까지의 진행도) */
function liftAt(fp) {
  const n = RUN_LIFT.length;
  const i = Math.floor(fp), f = fp - i;
  const at = (k) => RUN_LIFT[((k % n) + n) % n];
  return at(i) + (at(i + 1) - at(i)) * f;
}
/** @type {Record<string,Record<string,HTMLImageElement>>} */
const MOB_ANIM = { run: {}, die: {} };
for (const kind in MOB_STRIP) {
  for (const t in MOB_SRC) {
    const im = new Image(); im.src = `img/mob-${t}-${kind}.png`;
    MOB_ANIM[kind][t] = im;
  }
}
/** 아직 안 올라온 그림은 쓰지 않는다 (반쯤 그려진 채로 캔버스에 올라가지 않도록) */
function imgReady(im) { return im && im.complete && im.naturalWidth ? im : null; }

/** 그릴 준비가 끝난 원화만 돌려준다 (로딩 중이면 null → 벡터 실루엣으로 폴백) */
function mobArt(t) { return imgReady(MOB_IMG[t]); }

/**
 * 이번에 그릴 컷 하나.
 * kind가 "run"·"die"면 그 스트립의 i번째 컷을, 그 밖(예: "hero")이면 서 있는 원화 한 장을 돌려준다.
 * 스트립이 아직 안 올라왔을 때도 원화로 흘러가므로, 화면이 비는 순간은 없다.
 * @returns {{im:HTMLImageElement,sx:number,sy:number,sw:number,sh:number}|null}
 */
function mobFrame(t, kind, i) {
  const n = MOB_STRIP[kind];
  const st = n ? imgReady(MOB_ANIM[kind][t]) : null;
  if (st) {
    const cw = st.naturalWidth / n;
    return { im: st, sx: cw * (((i % n) + n) % n), sy: 0, sw: cw, sh: st.naturalHeight };
  }
  const im = mobArt(t);
  return im ? { im, sx: 0, sy: 0, sw: im.naturalWidth, sh: im.naturalHeight } : null;
}

/**
 * 달리기 리듬. freq는 "이동 거리 1px당 걸음 위상"이라 빠른 쥐일수록 발이 저절로 빨라진다.
 * 위상 2π가 달리기 8컷 한 바퀴(= 두 걸음)이고, π/4마다 컷이 한 장 넘어간다.
 * rise·tilt·squash는 달리기 컷이 아직 안 올라왔을 때 쓰는 벡터 실루엣용 흔들림이다 —
 * 진짜 컷에는 도약이 이미 그려져 있어서 얹지 않는다.
 */
const GAIT = {
  // freq는 보폭의 역수다 — π/freq 픽셀마다 한 걸음. 초당 걸음 수 = 이동속도 × freq ÷ π
  //
  // 보폭은 화면에 그려지는 몸길이에 맞춰 잡는다. 이게 짧으면 발이 땅을 스치며 헛돌아
  // (한 걸음에 몸길이의 반도 못 가면 눈에 띄게 어색하다) 쳇바퀴 돌듯 보인다 —
  // 예전에는 컷이 빨리 넘어가는 쪽만 보고 보폭을 0.3~0.6 몸길이로 줄여 놨던 게 그 꼴이었다.
  // 지금은 한 걸음이 몸길이의 0.6~1.2배다. 그만큼 컷은 천천히 넘어가지만, 발이 땅을 붙잡는다.
  copy: { freq: 0.065, rise: 0.28, tilt: 0.09, squash: 0.10, dust: 0.9 },  // 보폭 48px(몸 0.9배) · 초당 9컷
  fast: { freq: 0.057, rise: 0.38, tilt: 0.13, squash: 0.12, dust: 1.3 },  // 전력질주 — 보폭 55px(1.2배) · 13컷
  tank: { freq: 0.057, rise: 0.14, tilt: 0.05, squash: 0.08, dust: 1.1 },  // 묵직하게 — 보폭 55px(0.8배) · 6컷
  boss: { freq: 0.051, rise: 0.10, tilt: 0.04, squash: 0.06, dust: 1.5 },  // 보폭 62px(0.6배) · 초당 4컷
};
const GAIT_DEFAULT = GAIT.copy;

/** 지금 걸음의 위상을 뽑는다. hop 0=발이 땅에 닿는 순간 → 1=도약 정점
 *  k는 흔들림의 세기 — 진짜 달리기 컷이 있으면 그림 자체가 이미 뛰고 있으므로 절반만 얹는다. */
function gaitOf(e, r, k = 1) {
  const p = e.dist * (GAIT[e.t] || GAIT_DEFAULT).freq;
  const d = GAIT[e.t] || GAIT_DEFAULT;
  const hop = Math.abs(Math.sin(p));
  return {
    hop,
    rise: hop * r * d.rise * k,
    // 도약할 때 앞으로 숙였다가 착지하며 젖혀진다 — 걸음마다 한 번씩 까딱인다
    tilt: Math.sin(p * 2) * d.tilt * k,
    squash: d.squash * k,
    dust: d.dust,
  };
}

/** 원화 컷 하나(mobFrame 결과)를 반지름 r 기준 크기로, 발이 바닥 그림자에 닿도록 (0,0) 중심에 그린다.
 *  스트립의 컷은 전부 바닥선을 공유하도록 잘라 놨으므로, 셀 아래쪽을 지면에 맞추면 컷이 넘어가도 발이 뜨지 않는다.
 *  원화는 전부 오른쪽을 보고 있어서 왼쪽으로 갈 때는 face=-1로 뒤집는다.
 *  mo(gaitOf 결과)를 주면 도약·착지 스쿼시까지 얹어 달리는 모션이 된다.
 *  slowed면 얼음빛으로 물들여 둔화 상태를 표시한다 (벡터 실루엣의 푸른 톤과 같은 역할). */
function drawMobArt(g, fr, r, slowed, face, mo) {
  const k = (r * 2.9) / Math.max(fr.sw, fr.sh);
  const w = fr.sw * k, h = fr.sh * k;
  g.save();
  if (face === -1) g.scale(-1, 1);
  if (mo) {
    // 발끝(y=r)을 축으로 삼아야 눌리든 기울든 발이 바닥에서 떨어지지 않는다
    const land = 1 - mo.hop;               // 1 = 막 착지한 순간
    g.translate(0, r);
    g.rotate(mo.tilt);
    g.scale(1 + land * mo.squash, 1 - land * mo.squash);
    g.translate(0, -r - mo.rise);
  }
  if (slowed) g.filter = "grayscale(.6) sepia(.55) hue-rotate(165deg) saturate(1.8) brightness(1.05)";
  g.drawImage(fr.im, fr.sx, fr.sy, fr.sw, fr.sh, -w / 2, r - h, w, h);
  g.restore();
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

/** 방사 피해의 범위 — 명중 지점에서 퍼지는 주황 고리 한 겹. */
function drawBlastRing(g, s) {
  const p = 1 - Math.max(0, s.life / s.max);
  g.save();
  g.globalAlpha = (1 - p) * 0.75;
  g.strokeStyle = s.col; g.lineWidth = 2.6 * (1 - p) + 0.8;
  g.beginPath(); g.arc(s.x1, s.y1, s.r * (0.45 + p * 0.7), 0, 7); g.stroke();
  g.globalAlpha = (1 - p) * 0.16;
  g.fillStyle = s.col;
  g.beginPath(); g.arc(s.x1, s.y1, s.r * (0.45 + p * 0.7), 0, 7); g.fill();
  g.restore();
}

/** 미사일 발사 이펙트 — 타워→적을 잇는 직선 대신, 살짝 포물선을 그리며 날아가는 발광 구슬 + 궤적 + 명중 폭발.
 *  s.life가 s.max에서 0으로 줄어드는 걸 진행도로 삼는다 (0=발사 직후, 1=명중). */
function drawMissile(g, s) {
  if (s.ring) return drawBlastRing(g, s);
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

/* ═══════ 사망 연출 — 쓰러진 침입자와 사방으로 튀는 치즈 ═══════ */
/** 쓰러져 사라지는 침입자들. 사망 3컷을 차례로 넘긴 뒤 스르르 사라진다. */
let corpses = [];
const CORPSE_LIFE = 1.15;        // 전체 지속(초) — 3컷 재생 + 페이드
/** 침입자 하나가 쓰러졌다. 시신 한 구 + 흘린 치즈 조각을 그 자리에 뿌린다. */
function spawnCorpse(t, x, y, face) {
  const d = ENEMIES[t];
  if (!d) return;
  if (corpses.length > 60) corpses.shift();   // 물량 웨이브에서 시신이 쌓여 프레임을 잡아먹지 않도록
  corpses.push({ t, x, y, face: face === -1 ? -1 : 1, life: CORPSE_LIFE });
  spawnCrumbs(x, y, d.r);
}
function stepCorpses(dt) {
  for (const c of corpses) c.life -= dt;
  corpses = corpses.filter((c) => c.life > 0);
}
function drawCorpses(g) {
  for (const c of corpses) {
    const r = ENEMIES[c.t].r;
    const p = 1 - c.life / CORPSE_LIFE;                          // 0(막 쓰러짐) → 1(사라짐)
    // 앞 두 컷은 0.2초씩 넘기고, 마지막 컷(완전히 누운 자세)으로 남아 페이드아웃한다
    const fr = mobFrame(c.t, "die", Math.min(2, Math.floor(p / 0.17)));
    if (!fr) continue;
    const fade = Math.min(1, Math.max(0, (1 - p) / 0.32));
    const pop = Math.max(0, 1 - p / 0.12);                        // 쓰러지는 첫 순간 납작하게 눌린다

    g.save();
    g.translate(c.x, c.y);
    // 바닥 그림자 — 서 있을 때보다 넓고 옅게 깔린다
    g.globalAlpha = fade * 0.2; g.fillStyle = "#0c1524";
    g.beginPath(); g.ellipse(0, r * 0.92, r * 0.62, r * 0.16, 0, 0, 7); g.fill();
    // 넘어지며 발밑에서 확 퍼지는 먼지
    if (p < 0.3) {
      const q = p / 0.3;
      g.globalAlpha = fade * 0.3 * (1 - q); g.fillStyle = "#a8977c";
      for (let i = -1; i <= 1; i++) {
        g.beginPath();
        g.ellipse(i * r * (0.45 + q * 0.9), r * 0.85, r * (0.2 + q * 0.2), r * (0.13 + q * 0.09), 0, 0, 7);
        g.fill();
      }
    }
    g.globalAlpha = fade;
    g.scale(1 + pop * 0.18, 1 - pop * 0.18);
    drawMobArt(g, fr, r, false, c.face, null);
    g.restore();
  }
  g.globalAlpha = 1;
}

/** 훔쳐 가던 치즈가 사방으로 튄다 — 사망 순간에만 뿌리고, 바닥에서 한 번 튀고 사라진다. */
let crumbs = [];
function spawnCrumbs(x, y, r) {
  const n = 4 + Math.round(r / 7);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.3;
    const spd = 55 + Math.random() * 95;
    crumbs.push({
      x, y: y - r * 0.2, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
      rot: Math.random() * 7, vr: (Math.random() - 0.5) * 13,
      sz: r * (0.11 + Math.random() * 0.09),
      life: 0.55 + Math.random() * 0.3, ground: y + r * 0.9,
    });
  }
}
function stepCrumbs(dt) {
  for (const c of crumbs) {
    c.vy += 620 * dt;                                             // 중력
    c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vr * dt;
    if (c.y > c.ground) { c.y = c.ground; c.vy *= -0.42; c.vx *= 0.6; c.vr *= 0.5; }
    c.life -= dt;
  }
  crumbs = crumbs.filter((c) => c.life > 0);
}
function drawCrumbs(g) {
  for (const c of crumbs) {
    g.save();
    g.globalAlpha = Math.min(1, c.life / 0.3);
    g.translate(c.x, c.y); g.rotate(c.rot);
    // 삼각 치즈 한 조각 — 구멍 하나까지
    g.fillStyle = "#f4c53c"; g.strokeStyle = "#8a5f16"; g.lineWidth = 0.7; g.lineJoin = "round";
    g.beginPath();
    g.moveTo(-c.sz, c.sz * 0.72); g.lineTo(c.sz, c.sz * 0.72); g.lineTo(-c.sz, -c.sz * 0.72);
    g.closePath(); g.fill(); g.stroke();
    g.fillStyle = "#dfa41e";
    g.beginPath(); g.arc(-c.sz * 0.26, c.sz * 0.24, c.sz * 0.2, 0, 7); g.fill();
    g.restore();
  }
  g.globalAlpha = 1;
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
  // 진행 방향 — 직전 프레임의 x와 비교해 좌우 반전 여부를 정한다 (원화는 전부 오른쪽을 봄)
  if (e._px !== undefined && Math.abs(e.x - e._px) > 0.05) e._face = e.x < e._px ? -1 : 1;
  e._px = e.x;
  const face = e._face === -1 ? -1 : 1;
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

  // 실제로 나아가는 중일 때만 걸음을 굴린다 (가처분에 묶였으면 첫 컷에서 멈춰 선다)
  const moving = e.dist > 0 && !(e.freezeT > 0);
  // 달리기 8컷 — 위상 2π가 한 바퀴, 즉 π/4마다 컷이 한 장 넘어간다.
  // 위상이 이동 거리에서 나오므로 빠른 쥐일수록 컷도 저절로 빨리 넘어가고, 발이 헛돌지 않는다.
  const phase = e.dist * (GAIT[e.t] || GAIT_DEFAULT).freq;
  const fp = phase / (Math.PI / 4);            // 소수점까지의 컷 번호
  const cut = moving ? Math.floor(fp) : 0;
  const art = mobFrame(e.t, "run", cut);
  const framed = !!imgReady(MOB_ANIM.run[e.t]);
  // 진짜 컷에는 도약이 그려져 있다 — 코드로 또 띄우면 발이 땅을 안 딛고 둥둥 떠 보인다.
  // 그래서 흔들림은 컷이 없을 때(벡터 실루엣)만 얹고, 대신 그림자·먼지를 컷의 도약 높이에 맞춘다.
  const mo = art && moving && !framed ? gaitOf(e, r, 1) : null;
  const lift = !moving ? 0 : framed ? liftAt(fp) : mo ? mo.hop : 0;
  // 컷은 뚝뚝 넘어가도 몸이 뜨고 내려앉는 것만은 이어 준다 — 컷 그림에 이미 들어 있는 도약 높이와
  // 이어 준 높이의 차이만큼만 위아래로 옮긴다. 컷이 느린 큰 놈일수록 이게 있고 없고가 크다.
  const tween = framed && moving
    ? { hop: lift, rise: (lift - RUN_LIFT[((cut % RUN_LIFT.length) + RUN_LIFT.length) % RUN_LIFT.length]) * r * 0.2,
        tilt: 0, squash: 0 }
    : mo;

  // 바닥 그림자 — 캐릭터가 판 위에 실제로 서 있는 느낌.
  // 뛰어오른 만큼 작고 옅어져야 발이 땅에서 떨어진 게 보인다.
  g.save();
  g.globalAlpha = 0.24 * (1 - lift * 0.5); g.fillStyle = "#0c1524";
  const shk = 1 - lift * 0.34;
  g.beginPath(); g.ellipse(0, r * 0.92, r * 0.5 * shk, r * 0.16 * shk, 0, 0, 7); g.fill();
  g.restore();

  // 원화는 drawMobArt가 걸음 리듬을 직접 잡는다 — 여기서 흔드는 건 벡터 실루엣뿐
  if (!art) g.translate(0, bob);

  if (punch > 0) {
    // 몸통 번쩍임 — 흰색(일반) / 금색(치명타) 실루엣 플래시로 "맞았다"를 즉시 알린다
    g.save();
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = punch * 0.85;
    g.fillStyle = e.hitCrit ? "#ffd782" : "#ffffff";
    g.beginPath(); g.arc(0, 0, r * 1.05, 0, 7); g.fill();
    g.restore();
  }

  if (art) {
    // 발끝 먼지 — 발이 땅에 닿는 컷에서만 뒤쪽으로 툭 피어오른다 (컷의 도약 높이를 따라간다)
    if (moving && lift < 0.45) {
      const puff = (0.45 - lift) / 0.45;
      const dust = (GAIT[e.t] || GAIT_DEFAULT).dust;
      g.save();
      // 컷 그림에도 흰 먼지가 그려져 있으므로 여기서는 옅게만 깔아 어두운 바닥에서의 접지감만 보탠다
      g.globalAlpha = 0.22 * puff; g.fillStyle = "#a8977c";
      for (let i = 0; i < 2; i++) {
        const px = -face * (r * (0.35 + i * 0.4) + puff * r * 0.5 * dust);
        g.beginPath(); g.ellipse(px, r * 0.86, r * (0.16 + i * 0.05) * dust, r * 0.11 * dust, 0, 0, 7); g.fill();
      }
      g.restore();
    }
    // 원화가 올라왔으면 종류별 연출만 얹고 그림은 원화로 그린다
    if (e.t === "fast") {
      // 잔상 + 속도선 — 전력질주 느낌. 잔상은 한 컷 전 자세라 실제로 지나온 모습이 남는다.
      g.save();
      g.globalAlpha = 0.24; g.translate(-face * r * 0.75, 0);
      drawMobArt(g, mobFrame(e.t, "run", cut - 1) || art, r * 0.95, slowed, face, tween);
      g.restore();
      g.strokeStyle = "rgba(12,21,36,.45)"; g.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const x0 = -face * (r * 1.05 + i * 4), x1 = -face * (r * 1.5 + i * 4);
        g.beginPath(); g.moveTo(x0, -r * 0.2 + i * 7); g.lineTo(x1, -r * 0.2 + i * 7); g.stroke();
      }
    }
    if (e.t === "boss") {
      // 국기색 위성(각국 소송팀)이 주위를 맴돈다
      const flagCols = ["#c4322a", "#5bc8e8", "#e8ddc4"];
      for (let i = 0; i < 3; i++) {
        const a = now * 0.0016 + i * (Math.PI * 2 / 3), ox = Math.cos(a) * r * 1.15, oy = Math.sin(a) * r * 0.7;
        g.save();
        g.globalAlpha = 0.9; g.fillStyle = flagCols[i]; g.strokeStyle = "rgba(12,21,36,.8)"; g.lineWidth = 0.8;
        g.beginPath(); g.arc(ox, oy, r * 0.14, 0, 7); g.fill(); g.stroke();
        g.restore();
      }
    }
    drawMobArt(g, art, r, slowed, face, tween);
  } else switch (e.t) {   // 원화 로딩 전 — 예전 벡터 실루엣으로 그린다
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
/** @param {{big?:boolean, rise?:number, life?:number}} [opt] */
function addFloater(x, y, txt, col, opt = {}) {
  const life = opt.life ?? 0.8;
  floaters.push({ x, y, txt, col, life, max: life, big: !!opt.big, rise: opt.rise });
}

/** 합성 냥타워의 스킬이 훑고 간 범위 — 판 위에 고리 하나가 번졌다 사라진다 */
const skillRings = [];

/** 대전장이 열려 있는 동안 도착한 「판 종료」 — 대전장을 접을 때 꺼내 쓴다 */
let pendingOver = null;

/** 치명타 글씨를 마지막으로 띄운 시각 (냥타워 uid → ms). 연사 냥타워가 화면을 도배하지 않도록 */
const critShownAt = new Map();

/* ═══════ 이벤트 → 연출 ═══════ */
function consumeEvents() {
  for (const ev of game.drainEvents()) {
    switch (ev.t) {
      case "kill":
        addFloater(ev.x, ev.y, "+" + ev.reward, "#cda43a");
        spawnCorpse(ev.k, ev.x, ev.y, ev.face);
        break;
      case "leak":
        addFloater(ev.x, ev.y, "돌파!", "#e0574d");
        break;
      case "crit": {
        // 치명타! — 쏜 냥타워 바로 위에 붉은 글씨가 떠오른다.
        // 우선심사냥처럼 초당 10발을 쏘는 냥은 치명타도 자주 나므로, 같은 냥은 0.45초에 한 번만 띄운다.
        const last = critShownAt.get(ev.uid) || 0;
        const t = performance.now();
        if (t - last < 450) break;
        critShownAt.set(ev.uid, t);
        addFloater(ev.x, ev.y - 26, "Critical!", "#e0574d", { big: true, life: 1.0, rise: 30 });
        break;
      }
      case "fee":
        addFloater(ev.x, ev.y, `−${ev.amount}`, "#e0574d", { life: 1.0 });
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
      /*
       * 웨이브가 끝나면 여기서 이 스테이지의 선택지를 연다.
       * 이게 빠지면 core 는 awaitingPassive 를 세워 둔 채로 멈추고, 화면에는 「효과 선택 중」만
       * 남은 채 아무 모달도 뜨지 않는다 — 그 상태에서는 임용·합성·개시가 전부 잠겨 판이 죽는다
       * (canPrep 이 awaitingPassive 를 막는다). 모달을 여는 곳은 여기와 closeDuelRound 둘뿐이다.
       */
      case "wave_end":
        log(ev.duel
          ? `라운드 ${ev.wave} 대전 종료 · 수입 <b>+${ev.income}</b>`
          : `라운드 ${ev.wave} 방어 완료 · 수입 <b>+${ev.income}</b>`);
        // 대전 라운드라면 결과 화면을 읽는 동안은 모달을 띄우지 않는다 —
        // 대전장을 접을 때(closeDuelRound) 이어서 연다.
        if (duel) break;
        if (game.awaitingAugment) openAugmentModal();
        else if (game.awaitingPassive) openPassiveModal();
        break;
      case "merge": {
        log(ev.promoted
          ? `<b style="color:#cda43a">합성 · 승진</b> ${ev.icon} ${ev.name} <b>Lv${ev.lv}</b> — 선글라스·샷건, 방사 피해가 붙습니다`
          : `<b style="color:#cda43a">합성</b> ${ev.icon} ${ev.name} ${ev.used}명 → <b>Lv${ev.lv}</b>`);
        if (ev.placed) {
          const [mx, my] = B.cellCenter(ev.x, ev.y);
          stamp(...boardToScreen(mx, my), ev.promoted ? "승 진" : "합 성", `${ev.name} Lv${ev.lv}`);
          addFloater(mx, my - 24, ev.promoted ? "승진!" : `Lv${ev.lv}!`, "#cda43a",
                     { big: true, life: 1.1, rise: 28 });
        }
        break;
      }
      case "craft": {
        const mats = ev.used.map((k) => `${CATS[k].icon} ${CATS[k].name}`).join(" + ");
        log(`<b style="color:#6fe0d0">이종 합성</b> ${mats} → <b>${ev.icon} ${ev.name}</b> — ${ev.desc}`);
        if (ev.placed) {
          const [cx2, cy2] = B.cellCenter(ev.x, ev.y);
          stamp(...boardToScreen(cx2, cy2), "특 수", ev.name);
          addFloater(cx2, cy2 - 24, ev.name, "#6fe0d0", { big: true, life: 1.3, rise: 30 });
        }
        break;
      }
      case "stun":
        addFloater(ev.x, ev.y - 16, "정지", "#c9a8ff", { life: .5, rise: 14 });
        break;
      case "exec":
        addFloater(ev.x, ev.y - 18, "무효!", "#e0574d", { big: true, life: .8, rise: 24 });
        break;
      /* 합성 냥타워의 고유 스킬이 터졌다 — 판 위에 범위 고리를 하나 남기고,
       * 화면 아래에 캐릭터 컷인을 파칭 하고 띄운다. */
      case "skill": {
        const sk = CAT_SKILLS[ev.key];
        if (!sk) break;
        skillRings.push({ x: ev.x, y: ev.y, r: ev.r, col: sk.col, life: .6, max: .6 });
        addFloater(ev.x, ev.y - 30, sk.name, sk.col, { big: true, life: 1.1, rise: 30 });
        cutIn(ev.key, ev.lv, ev.n);
        addShake(5, .2);
        break;
      }
      case "line_tier":
        // 배너는 applyPassive 를 부른 쪽(선택 모달)이 띄운다 — 여기서는 판이 조용히 넘어가도 되도록
        // 아무것도 하지 않는다. 두 곳에서 띄우면 축포가 두 번 터진다.
        break;
      case "duel_start":
        log(`<b style="color:#cda43a">⚔ 1:1 대전</b> 라운드 ${ev.wave} — 침입자 대신 <b>내 덱 전부</b>가 상대 덱과 붙습니다. (자동 진행 · 배속 없음)`);
        break;
      case "duel_end":
        log(ev.outcome === "win"
          ? `<b style="color:#cda43a">대전 승리</b> — 랭킹 점수 <b>+${ev.points.toLocaleString()}</b>`
          : ev.outcome === "draw"
            ? `<b>대전 무승부</b> — 랭킹 점수 <b>+${ev.points.toLocaleString()}</b>`
            : `<b class="warn">대전 패배</b> — 등록원부 내구 <b>−${ev.dmg}</b> (점수 가산 없음)`);
        if (ev.outcome === "lose") addShake(8, .35);
        renderHud();
        break;
      case "augment":
        log(`<b style="color:#cda43a">증강 ${ev.icon} ${ev.name}</b> — ${ev.desc}`);
        break;
      case "clone":
        log(`<b>분할출원</b> ${ev.name} 하나가 ${ev.placed ? "판에 추가되었습니다" : "대기열에 놓였습니다"}`);
        break;
      case "sabotage": {
        log(`<b style="color:#c3a8f5">방해 공작 뽑기</b> ${ev.icon} <b>${ev.name}</b> (${ev.tag}) — 상대 판에 던졌습니다 (−${ev.cost} · 남은 ${ev.left}회)`);
        // 심사현황 로그가 화면에서 빠졌으므로, 나갔다는 사실은 상대 청사 위에 도장으로 남긴다
        const opp = $("#oppCv");
        if (opp) {
          const ob = opp.getBoundingClientRect();
          stamp(ob.left + ob.width / 2, ob.top + ob.height / 2, "방 해", ev.name);
        }
        break;
      }
      case "sabotaged": {
        log(`<b class="warn">상대 공작</b> ${ev.icon} ${ev.name} — ${ev.desc}`);
        const { w, h } = fxCanvasSize();
        addFloater(w / 2, h / 2, `${ev.icon} ${ev.name}`, "#e0574d", { big: true, life: 1.4, rise: 34 });
        addShake(5, .24);
        renderHud();
        break;
      }
      case "golden":
        log(`<b style="color:#cda43a">직권보정</b> ${ev.name} — 이번 웨이브 동안 공격력 3배`);
        break;
      /* 판이 끝났다. 다만 **마지막 10라운드가 곧 대전**이라, 대전장이 열려 있는 채로
       * 여기에 닿는다 — 그대로 종료 화면을 띄우면 방금 붙은 결과 도장을 읽을 틈도 없이
       * 화면이 덮인다. 대전 중이면 붙잡아 두었다가 대전장을 접을 때(closeDuelRound) 띄운다. */
      case "over":
        if (duel) { pendingOver = ev; break; }
        finishOver(ev);
        break;
    }
  }
}

/* ═══════ 1:1 대전 라운드 (오토배틀러) ═══════
 * 라운드 4·7·10 은 침입자가 오지 않는다. 대신 청사 판을 접어 두고 별도의 대전장으로 옮겨,
 * 지금까지 만든 냥타워를 **통째로** 상대 덱과 맞붙인다.
 *
 * 진행은 세 마디다.
 *   1) 명세 교환 — 내 냥타워의 완성된 스탯을 뽑아 서버로 보내고 상대 것을 기다린다 (최대 12초)
 *   2) 전투 — 양쪽 전군이 진형을 짜고 저절로 진군한다. **누를 것이 하나도 없다**
 *   3) 정산 — 진 쪽이 등록원부 내구를 잃고, 이긴 쪽은 특허료를 받는다. 그리고 준비 단계로.
 * 배속(×2·×3)은 여기서 잠긴다 — 양쪽이 같은 속도로 봐야 같은 판이 된다.
 *
 * ── 승패는 왜 p1 이 정하나 ──
 * 사람이 손댈 일이 없어 시뮬레이션은 완전히 결정적이다 — 같은 명세 · 같은 시드면 두 화면은
 * 원래 같은 결과에 닿는다. 그래도 **p1 쪽 계산을 정본으로 삼는다**: 브라우저마다 Math.pow
 * 같은 초월함수의 끝자리가 다를 수 있어, 만에 하나라도 「둘 다 이겼다」가 나오지 않게
 * 못 박아 두는 장치다. 솔로에서는 내 계산이 곧 정본이다.
 */
/** @type {{wave:number, sim:any, mine:any[], theirs:any[]|null, foeMob:boolean, phase:string,
 *          waitT:number, acc:number, endT:number, res:any, floats:any[],
 *          verdictT:number}|null} */
let duel = null;
/** 상대 명세가 내가 라운드에 들어서기 전에 먼저 도착하는 경우가 있어 따로 받아 둔다 */
let pendingDuelRoster = { wave: 0, roster: null };

const duelOn = () => !!game && game.phase === "duel";
/** 내가 대전장의 어느 쪽인가. 서버가 정해 준 p1/p2 로 못 박는다 (화면에서는 늘 왼쪽에 보인다). */
const mySide = () => (youAre === "p2" ? "b" : "a");
/** 내가 승패를 정하는 쪽인가 (p1 또는 솔로) */
const duelAuthority = () => soloMode || youAre !== "p2";

/** 대전 라운드를 연다 (waveGo 신호가 대전 스테이지에 떨어졌을 때) */
function startDuelRound() {
  if (!game.startDuel()) { log("대전 라운드를 열지 못했습니다."); return; }
  const mine = makeRoster(game);
  /* 대전 중에는 청사 판이 접혀 있어 덱을 다시 잴 수 없다. 라운드에 들어서는 지금 재어 두지
   * 않으면 랭킹의 🏗️ 항목이 대전 내내 0으로 떨어져, 화면의 점수가 대전에 들어설 때마다
   * 뚝 내려갔다가 끝나면 도로 올라간다 — 보는 사람 입장에서는 그냥 버그다. */
  game.finalDeck = deckPower(mine);
  duel = { wave: game.wave, sim: null, mine, theirs: null, foeMob: false, phase: "wait",
           waitT: 0, acc: 0, endT: 0, res: null, floats: [], skRings: [], verdictT: 0 };
  $("#duelStage").classList.remove("hidden");
  $("#duelResult").classList.add("hidden");
  document.body.classList.add("dueling");
  clearDuelDecks();
  render();

  if (soloMode) {
    // 솔로에는 붙을 사람이 없다 — 청사에 쳐들어오던 쥐들이 무작위로 편성돼 대전장에 선다
    beginDuelSim(makeMobSquad(), true);
    return;
  }
  sendWS({ t: "duel", wave: game.wave, roster: mine });
  // 내가 늦게 들어와서 상대 명세가 먼저 와 있었다면 그대로 쓴다
  if (pendingDuelRoster.wave === game.wave && pendingDuelRoster.roster) {
    beginDuelSim(pendingDuelRoster.roster);
    pendingDuelRoster = { wave: 0, roster: null };
  }
}

/** 서버가 중계해 준 상대 명세 */
function receiveDuelRoster(wave, roster) {
  if (!Array.isArray(roster)) return;
  if (duel && duel.wave === wave && duel.phase === "wait") { beginDuelSim(roster); return; }
  pendingDuelRoster = { wave, roster };   // 아직 내가 라운드에 못 들어왔다 — 들어오면 꺼내 쓴다
}

/**
 * 쥐 침입단을 편성한다 (솔로 · 상대 무응답용).
 * 시드에 실제 시각을 섞어, 같은 판을 다시 해도 매번 다른 조합이 나오게 한다 —
 * 「쥐들이 알아서 조합해서 나온다」가 이 라운드의 재미다.
 * 마지막 대전 스테이지에는 특허괴물을 반드시 한 마리 끼워 넣는다.
 */
function makeMobSquad() {
  const last = DUEL_WAVES[DUEL_WAVES.length - 1];
  return mobRoster(duel.mine, duel.wave, (Math.random() * 0xffffffff) >>> 0, duel.wave >= last);
}

/**
 * 양쪽 명세가 모였다. 시뮬레이션을 시작한다.
 * @param {any[]} theirs @param {boolean} [isMob] 상대가 사람이 아니라 쥐 침입단인가
 */
function beginDuelSim(theirs, isMob) {
  if (!duel || duel.sim) return;
  duel.theirs = theirs;
  duel.foeMob = !!isMob;
  // 편을 p1 → p2 로 못 박는다. 화면에서 내가 왼쪽에 보이는 것은 그리기 단계의 일이다.
  const me = mySide();
  const [a, b] = me === "a" ? [duel.mine, theirs] : [theirs, duel.mine];
  duel.sim = new DuelSim(a, b, ((matchSeed || game.seed) ^ (duel.wave * 0x9e3779b1)) >>> 0);
  duel.phase = "fight";
  duel.acc = 0;
  $("#duelFoeLabel").textContent = isMob ? "쥐 침입단" : "상대 병력";
  renderDuelDecks();
  if (isMob) {
    // 어떤 조합이 나왔는지 로그에 남긴다 — 조합이 매번 다른 것이 이 라운드의 재미다
    const tally = {};
    for (const u of theirs) tally[u.k] = (tally[u.k] || 0) + 1;
    const list = Object.keys(tally).map((k) => `${ENEMIES[k].icon} ${ENEMIES[k].nm} ${tally[k]}`).join(" · ");
    log(`<b style="color:#cda43a">1:1 대전 개시</b> — 내 냥타워 ${duel.mine.length}명 대 쥐 침입단 ${theirs.length}마리`);
    log(`<b class="warn">침입단 편성</b> ${list}`);
  } else {
    log(`<b style="color:#cda43a">1:1 대전 개시</b> — 내 냥타워 ${duel.mine.length}명 대 상대 ${theirs.length}명`);
  }
  // 붙기 전에 두 덱의 지수를 나란히 적어 준다 — 이 라운드가 재는 것이 그것이기 때문이다
  const mp = deckPower(duel.mine), tp = deckPower(theirs);
  log(`<b>덱 지수</b> 내 <b style="color:var(--blue)">${mp}</b> 대 ` +
      `${isMob ? "침입단" : "상대"} <b style="color:var(--seal-soft)">${tp}</b> — ` +
      (mp > tp ? "내 덱이 우세합니다." : mp < tp ? "내 덱이 열세입니다." : "팽팽합니다.") +
      ` <i style="font-style:normal;color:var(--muted)">체력과 화력을 함께 잰 값입니다.</i>`);
  log(`전군이 저절로 진군합니다 — <b>누를 것은 없습니다.</b> ` +
      `<b>상대 냥타워를 먼저 전멸시키는 쪽이 이깁니다.</b>`);
}

/** 매 프레임. 대전장을 진행하고 그린다. */
function stepDuel(dt) {
  if (!duel) return;

  if (duel.phase === "wait") {
    duel.waitT += dt;
    // 상대가 끝내 응답하지 않는다 (연결이 끊겼거나 창을 닫았다). 쥐 침입단을 세워 라운드를 넘긴다.
    if (duel.waitT >= DUEL.waitSecs) {
      log(`<b class="warn">상대 명세가 오지 않았습니다</b> — 쥐 침입단으로 대신 진행합니다.`);
      beginDuelSim(makeMobSquad(), true);
    }
    return;
  }

  if (duel.phase === "fight") {
    // 고정 시간간격으로만 밟는다 — 프레임이 흔들려도 싸움의 속도는 달라지지 않는다.
    // 한 프레임에 몰아 밟는 수를 제한해 탭을 오래 비웠다가 돌아와도 화면이 얼지 않게 한다.
    duel.acc += Math.min(0.25, dt);
    let steps = 0;
    while (duel.acc >= DUEL.dt && steps < 12 && !duel.sim.over) {
      duel.sim.tick(); duel.acc -= DUEL.dt; steps++;
    }
    if (duel.acc > DUEL.dt * 12) duel.acc = 0;
    for (const ev of duel.sim.drainEvents()) consumeDuelEvent(ev);
    if (duel.sim.over) finishDuelRound();
  }

  // 내 계산은 끝났는데 아직 p1 의 판정이 안 왔다 — 조금 기다렸다가 안 오면 내 결과로 간다
  if (duel.phase === "verdict") {
    duel.verdictT -= dt;
    if (duel.verdictT <= 0) {
      log(`<b class="warn">상대의 판정이 오지 않았습니다</b> — 내 화면의 결과로 마칩니다.`);
      applyDuelOutcome(localDuelOutcome());
    }
  }

  for (let i = duel.floats.length - 1; i >= 0; i--) {
    duel.floats[i].life -= dt;
    if (duel.floats[i].life <= 0) duel.floats.splice(i, 1);
  }
  for (let i = duel.skRings.length - 1; i >= 0; i--) {
    duel.skRings[i].life -= dt;
    if (duel.skRings[i].life <= 0) duel.skRings.splice(i, 1);
  }

  if (duel.phase === "done") {
    duel.endT -= dt;
    if (duel.endT <= 0) closeDuelRound();
  }
}

/** 시뮬레이션이 내놓는 연출 이벤트 → 대전장 위의 글씨·고리·컷인 */
function consumeDuelEvent(ev) {
  const y = duelY(ev.x, ev.dep) - 58;
  if (ev.t === "crit") duelFloat(ev.x, y, "Critical!", "#e0574d", true);
  else if (ev.t === "heal") duelFloat(ev.x, y, `+${ev.amt}`, "#7fbf6a", false);
  else if (ev.t === "exec") duelFloat(ev.x, y, "무효!", "#e0574d", true);
  // 내 냥이 쓰러지면 화면이 살짝 흔들린다 — 전멸이 곧 패배라 한 명 한 명이 무겁다
  else if (ev.t === "die" && ev.side === mySide()) addShake(3, .12);
  else if (ev.t === "skill") {
    const sk = CAT_SKILLS[ev.key];
    if (!sk) return;
    duel.skRings.push({ x: ev.x, dep: ev.dep, r: ev.r, col: sk.col, life: .55, max: .55 });
    duelFloat(ev.x, y - 14, sk.name, sk.col, true);
    // 컷인은 **내 냥이 터뜨렸을 때만** 띄운다 — 양쪽 것을 다 띄우면 화면 아래가 쉴 새 없이 번쩍인다
    if (ev.side === mySide()) cutIn(ev.key, ev.lv, ev.n);
    addShake(ev.side === mySide() ? 4 : 2, .16);
  }
}

function duelFloat(x, y, txt, col, big) {
  duel.floats.push({ x, y, txt, col, big, life: big ? 0.9 : 0.7, max: big ? 0.9 : 0.7 });
}

/** 내 화면의 계산으로 본 결과 */
function localDuelOutcome() {
  const r = duel.sim.result();
  const me = mySide();
  return {
    outcome: r.winner === null ? "draw" : r.winner === me ? "win" : "lose",
    foeAlive: me === "a" ? r.aliveB : r.aliveA,
    reason: r.reason,
  };
}

/**
 * 싸움이 끝났다.
 * 내가 판정하는 쪽(p1 또는 솔로)이면 그대로 정산하고 상대에게 결과를 알린다.
 * 아니면 p1 의 판정이 올 때까지 잠깐 기다린다 — 두 화면이 어긋났을 때
 * 「둘 다 이겼다」가 나오지 않게 하는 장치다.
 */
function finishDuelRound() {
  if (!duel || duel.phase === "done" || duel.phase === "verdict") return;
  if (duelAuthority()) {
    const res = localDuelOutcome();
    // 내 결과를 상대 입장으로 뒤집어 보낸다
    sendWS({ t: "duelResult", wave: duel.wave,
             outcome: res.outcome === "win" ? "lose" : res.outcome === "lose" ? "win" : "draw",
             foeAlive: duel.sim.alive(mySide()).filter((u) => !u.dead).length,
             reason: res.reason });
    applyDuelOutcome(res);
  } else {
    duel.phase = "verdict";
    duel.verdictT = 5;
  }
}

/** 상대(p1)가 보내 준 판정 */
function receiveDuelResult(wave, outcome, foeAlive, reason) {
  if (!duel || duel.wave !== wave) return;
  if (duel.phase === "done") return;
  applyDuelOutcome({ outcome, foeAlive: foeAlive || 0, reason: reason || "" });
}

/** 결과를 판에 반영하고 잠깐 결과 화면을 보여 준다 */
function applyDuelOutcome(res) {
  if (!duel || duel.phase === "done") return;
  duel.res = { ...res };
  duel.phase = "done";
  duel.endT = 3.4;                                  // 결과를 읽을 틈
  /* 랭킹의 🏗️ 덱 파워 항목은 **마지막 라운드(10)가 끝난 시점**의 덱 지수를 쓴다.
   * core 는 대전 명세를 만들 줄 모르므로(그 일은 duel.js 가 한다) 여기서 넣어 준다.
   * 대전 중에는 판이 달라지지 않으니 라운드 개시 때 만든 명세가 곧 종료 시점의 덱이다. */
  game.finalDeck = deckPower(duel.mine);
  game.endDuel(res.outcome, res.foeAlive);          // 내구 정산·전적 기록은 코어가 한다
  renderDuelResult();
}

/** 성적표에 적는 「무슨 덱이었나」 한 줄 — 계열 점수와 열린 단계 */
function lineSummaryHtml() {
  const keys = Object.keys(LINES).filter((k) => (game.lineScore && game.lineScore[k]) > 0)
    .sort((a, b) => game.lineScore[b] - game.lineScore[a]);
  if (!keys.length) return "";
  const txt = keys.map((k) => {
    const L = LINES[k], t = game.lineTier[k] || 0;
    return `<span style="color:${L.col}">${L.icon} ${L.name} ${game.lineScore[k]}점${t ? ` (${t}단계)` : ""}</span>`;
  }).join(" · ");
  return `<span>빌드 계열</span><b>${txt}</b>`;
}

/** 판이 끝났다 — 상대에게 알리고 성적표를 띄운다 */
function finishOver(ev) {
  pendingOver = null;
  sendWS({ t: ev.win ? "won" : "lost" });
  endMatch(ev.win, ev.win
    ? "10라운드를 모두 마쳤습니다. 성적을 냅니다."
    : "등록원부가 무너졌습니다.");
}

/** 대전장을 접고 청사 판으로 돌아온다 */
function closeDuelRound() {
  duel = null;
  pendingDuelRoster = { wave: 0, roster: null };
  $("#duelStage").classList.add("hidden");
  document.body.classList.remove("dueling");
  $("#duelResult").classList.add("hidden");
  render();
  // 마지막 대전이었다면 여기가 판의 끝이다 — 붙잡아 둔 종료를 이제 띄운다
  if (pendingOver) { finishOver(pendingOver); return; }
  // 대전 라운드도 한 라운드다 — 대전장을 접고 나서 이 스테이지의 선택지를 연다.
  // (결과 도장을 읽는 동안 모달이 덮치면 무엇을 보고 있었는지 알 수 없어진다)
  if (game.awaitingAugment) openAugmentModal();
  else if (game.awaitingPassive) openPassiveModal();
}

/* ══ 대전장 그리기 — 영역 2분할 + 원근감 지면 ══
 *
 * 예전에는 유닛이 네 줄짜리 일직선으로 딱 붙어 서서, 스물몇 명이 나와도 「줄 세운 종이 타일」로만
 * 보였다. 판이 어느 쪽으로 기울고 있는지도 위쪽 숫자를 봐야 알았다.
 *
 * 지금은 셋이 달라졌다.
 *   ① **비스듬한 지면** — 지평선을 긋고 먼 산을 세운 뒤, 지면 띠를 왼쪽이 낮고 오른쪽이 높게
 *      기울여(DUEL.tilt) 깐다. 평평한 가로줄이 아니라 「땅」으로 보인다.
 *   ② **깊이** — 유닛마다 dep(0~1)이 있어 뒤에 선 놈일수록 위에 작게 그려진다. 같은 인원도
 *      진형이 깊어 보이고, 앞줄이 뒷줄을 가리지 않는다.
 *   ③ **영역 2분할** — 양 진영 최전선의 한가운데에 **전선**이 그어지고 그 좌우 바닥이 진영색으로
 *      옅게 물든다. 밀고 밀리는 것이 색으로 그대로 보인다 — 숫자를 안 봐도 된다.
 *
 * 내가 늘 왼쪽에 보이도록 좌표만 뒤집는다(계산은 p1/p2 순서 그대로). 그래서 「내 진영은 늘 왼쪽,
 * 내 냥은 오른쪽으로 걸어간다」가 판마다 변하지 않는다. */
const duelX = (x) => (mySide() === "a" ? x : DUEL.w - x);
/** 그 화면 좌표에서의 지면 높이 — 왼쪽이 낮고 오른쪽이 높은 비스듬한 땅 */
const duelGroundY = (sx) => DUEL.ground + DUEL.tilt * (0.5 - sx / DUEL.w);
/** 유닛이 서는 높이 — 지면에서 깊이(dep)만큼 뒤로 물러난다 */
const duelYAt = (sx, dep) => duelGroundY(sx) - (dep || 0) * DUEL.depthRise;
/** 뒤로 물러난 만큼 작게 — 원근의 나머지 절반 */
const duelScale = (dep) => 1 - (dep || 0) * DUEL.depthScale;
/** 이벤트·탄환이 쓰는 편의 함수 (전장 좌표를 화면 좌표로 뒤집어 받는다) */
const duelY = (x, dep) => duelYAt(duelX(x), dep);

/**
 * 지금 **전선**이 어디인가 — 양 진영 최전선 유닛의 중간 지점(화면 좌표).
 * 살아 있는 유닛만 보고 잡으므로, 밀면 색이 따라 밀린다. 아직 안 붙었으면 화면 한가운데다.
 */
function duelFrontLine() {
  if (!duel || !duel.sim) return DUEL.w / 2;
  const me = mySide();
  let mineMax = -Infinity, foeMin = Infinity;
  for (const u of duel.sim.units) {
    if (u.dead) continue;
    const sx = duelX(u.x);
    if (u.side === me) mineMax = Math.max(mineMax, sx);
    else foeMin = Math.min(foeMin, sx);
  }
  if (mineMax === -Infinity || foeMin === Infinity) return DUEL.w / 2;
  return Math.max(70, Math.min(DUEL.w - 70, (mineMax + foeMin) / 2));
}

/** 하늘·먼 산·기운 지면 세 겹, 그리고 그 위에 영역을 가르는 전선. */
function drawDuelField(g) {
  const H = DUEL.h, HZ = DUEL.horizon;

  // ── 하늘 ── 지평선까지
  const sky = g.createLinearGradient(0, 0, 0, HZ + 30);
  sky.addColorStop(0, "#79c8ec"); sky.addColorStop(.65, "#a9dff3"); sky.addColorStop(1, "#dff2f7");
  g.fillStyle = sky; g.fillRect(0, 0, DUEL.w, HZ + 30);

  const t = duel && duel.sim ? duel.sim.t : 0;
  // 구름 — 아주 천천히 흐른다
  g.fillStyle = "rgba(255,255,255,.85)";
  const drift = (t * 7) % (DUEL.w + 260);
  for (const [cx, cy, s] of [[120, 52, 1], [430, 34, .8], [700, 66, 1.15], [900, 42, .7]]) {
    const x = ((cx - drift) % (DUEL.w + 260) + DUEL.w + 260) % (DUEL.w + 260) - 130;
    g.beginPath();
    g.arc(x, cy, 22 * s, 0, 7); g.arc(x + 24 * s, cy - 8 * s, 27 * s, 0, 7);
    g.arc(x + 52 * s, cy, 20 * s, 0, 7); g.rect(x, cy, 52 * s, 20 * s);
    g.fill();
  }

  // ── 먼 산 ── 지평선을 받쳐 주는 실루엣 두 겹. 깊이가 있어 보이게 하는 값싼 장치다.
  // 높이는 x 에서 뽑은 고정값이라 매 프레임 같은 산이 선다 (흔들리면 눈에 거슬린다).
  for (const [amp, base, col] of [[52, HZ + 10, "rgba(112,156,142,.55)"],
                                  [32, HZ + 22, "rgba(86,130,116,.68)"]]) {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, base + 60);
    for (let x = 0; x <= DUEL.w; x += 50) {
      g.lineTo(x, base - amp * (0.55 + 0.45 * (((x * 7919) % 97) / 97)));
    }
    g.lineTo(DUEL.w, base + 60);
    g.closePath(); g.fill();
  }

  /* ── 지면 ── 띠 하나의 위 모서리를 duelGroundY 로 긋는다.
   * 세 겹이 같은 기울기로 나란히 누워야 「기운 땅」으로 읽힌다. */
  const band = (dy, col) => {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, duelGroundY(0) + dy);
    g.lineTo(DUEL.w, duelGroundY(DUEL.w) + dy);
    g.lineTo(DUEL.w, H); g.lineTo(0, H);
    g.closePath(); g.fill();
  };
  // 지평선과 진형 사이의 먼 들판 — 여기는 평평하게 받쳐 준다
  g.fillStyle = "#9ad275"; g.fillRect(0, HZ + 12, DUEL.w, H - HZ - 12);
  band(-DUEL.depthRise - 8, "#8ec96a");   // 진형이 서는 잔디 (맨 뒷줄까지 덮는다)
  band(28, "#7ab857");                    // 앞잔디
  band(52, "#a5764a");                    // 흙

  // 흙띠 위쪽의 톱니 — 원화의 그 테두리. 기운 지면을 그대로 따라간다
  g.fillStyle = "#a5764a";
  for (let x = 0; x < DUEL.w; x += 18) {
    g.beginPath();
    g.moveTo(x, duelGroundY(x) + 52);
    g.lineTo(x + 9, duelGroundY(x + 9) + 42);
    g.lineTo(x + 18, duelGroundY(x + 18) + 52);
    g.fill();
  }

  /* ── 영역 2분할 ── 전선 좌우로 바닥을 진영색으로 옅게 물들인다. */
  const fx = duelFrontLine();
  const zone = (x0, x1, col) => {
    g.beginPath();
    g.moveTo(x0, duelGroundY(x0) - DUEL.depthRise - 8);
    g.lineTo(x1, duelGroundY(x1) - DUEL.depthRise - 8);
    g.lineTo(x1, duelGroundY(x1) + 52); g.lineTo(x0, duelGroundY(x0) + 52);
    g.closePath();
    g.fillStyle = col; g.fill();
  };
  zone(0, fx, DUEL.zoneMine);
  zone(fx, DUEL.w, DUEL.zoneFoe);

  // 전선 — 세로 점선 한 줄. 밀리면 이 선이 내 쪽으로 밀려온다
  const topY = duelGroundY(fx) - DUEL.depthRise - 34;
  g.save();
  g.setLineDash([7, 6]);
  g.lineWidth = 2;
  g.strokeStyle = "rgba(43,36,24,.34)";
  g.beginPath();
  g.moveTo(fx, topY); g.lineTo(fx, duelGroundY(fx) + 52);
  g.stroke();
  g.restore();
  g.textAlign = "center"; g.textBaseline = "alphabetic";
  g.font = "bold 11px 'Jua','Gowun Dodum',sans-serif";
  g.fillStyle = "rgba(43,36,24,.5)";
  g.fillText("전선", fx, topY - 5);
}

/**
 * 진영 깃발 하나 — 양끝에 꽂힌 표식이다.
 *
 * **두들길 수 있는 물건이 아니다.** 성채가 있던 자리지만, 지킬 건물이 있으면 승부가
 * 「누가 먼저 벽을 뚫었는가」로 새기 때문에 전부 걷어냈다. 남은 것은 여기가 누구 진영인지
 * 알려 주는 깃대 하나뿐이다 — 내 쪽은 청사 톤(푸른 기), 상대 쪽은 붉은 기.
 */
function drawDuelCamp(g, side) {
  const mine = side === mySide();
  const x = duelX(campX(side));
  const GY = duelGroundY(x);      // 기운 지면 위에 꽂힌다 — 공중에 떠 있으면 바로 눈에 띈다
  const main = mine ? "#5b8fb0" : "#c4322a";
  const dark = mine ? "#3c6a8a" : "#8a2a24";
  // 깃발이 안쪽(전장 쪽)을 향해 날리도록 — 화면에서 내 진영은 늘 왼쪽이다
  const face = mine ? 1 : -1;
  const t = duel && duel.sim ? duel.sim.t : 0;

  g.save();
  g.translate(x, GY);
  // 깃대 밑동 — 흙무더기
  g.fillStyle = "rgba(43,36,24,.22)";
  g.beginPath(); g.ellipse(0, 1, 22, 6, 0, 0, 7); g.fill();
  // 깃대
  g.fillStyle = "#7a6a44";
  g.fillRect(-3, -118, 6, 118);
  g.strokeStyle = "#2b2418"; g.lineWidth = 1.5; g.strokeRect(-3, -118, 6, 118);
  // 깃면 — 바람에 아주 조금 물결친다
  const wave = Math.sin(t * 2.2) * 4;
  g.beginPath();
  g.moveTo(0, -114);
  g.lineTo(face * 58, -108 + wave);
  g.lineTo(face * 58, -74 + wave);
  g.lineTo(0, -68);
  g.closePath();
  g.fillStyle = main; g.fill();
  g.strokeStyle = "#2b2418"; g.lineWidth = 2; g.stroke();
  // 인장 — 깃면 가운데의 붉은/푸른 점
  g.fillStyle = dark;
  g.beginPath(); g.arc(face * 30, -91 + wave * .6, 9, 0, 7); g.fill();
  g.restore();
}

/** 유닛 하나 — 내 냥은 스프라이트, 쥐 침입단은 청사에서 보던 그 원화 그대로 */
function drawDuelUnit(g, u, ms) {
  const mine = u.side === mySide();
  const x = duelX(u.x), y = duelYAt(x, u.dep);
  const hit = u.hitT > 0;
  // 화면에서 내 편은 늘 오른쪽을 보고, 상대는 왼쪽을 본다
  const facing = mine ? 1 : -1;
  const fade = u.dead ? Math.max(0, 1 - (u.deadT || 0) / 0.5) : 1;
  // 원근 — 뒤에 선 유닛일수록 작다. 그림자·체력줄까지 같은 배율을 타야 따로 놀지 않는다
  const sc = duelScale(u.dep);

  g.save();
  g.globalAlpha = fade;
  g.translate(x, y);
  if (hit) g.translate((Math.random() - .5) * 3, (Math.random() - .5) * 3);
  if (u.dead) { g.translate(0, (1 - fade) * 12); g.rotate((1 - fade) * 0.5 * facing); }
  g.scale(sc, sc);
  // 발밑 그림자
  g.fillStyle = "rgba(43,36,24,.22)";
  g.beginPath(); g.ellipse(0, 2, 20, 6, 0, 0, 7); g.fill();

  /* 스킬을 막 터뜨린 냥은 발밑에서 빛기둥이 솟는다 — 컷인이 화면 아래에 뜨는 동안
   * 「판 위의 누가 터뜨린 것인가」가 같이 보여야 연출이 따로 놀지 않는다. */
  if (u.skT > 0) {
    const a = Math.min(1, u.skT / 0.5);
    const sk = CAT_SKILLS[u.k];
    g.save();
    g.globalAlpha = fade * a * .75;
    const grd = g.createLinearGradient(0, 0, 0, -96);
    grd.addColorStop(0, (sk && sk.col) || "#ffd782"); grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(-17, -96, 34, 96);
    g.globalAlpha = fade * a;
    g.strokeStyle = (sk && sk.col) || "#ffd782"; g.lineWidth = 2;
    g.beginPath(); g.ellipse(0, 2, 30 * (1.4 - a * .4), 9 * (1.4 - a * .4), 0, 0, 7); g.stroke();
    g.restore();
  }

  if (u.mob) {
    const d = ENEMIES[u.k];
    // 걸음걸이는 시뮬레이션 시각에서 뽑는다 — 프레임 시간과 무관해야 양쪽이 같이 움직인다
    const art = mobFrame(u.k, "run", u.walking ? Math.floor(duel.sim.t * 7 + u.id) : 0);
    const r = (d ? d.r : 18) * 1.05;
    g.save();
    g.scale(facing, 1);
    g.translate(0, -r);   // drawMobArt 는 발끝을 y=r 에 맞춘다 — 발이 지면선에 닿게 올린다
    if (art) drawMobArt(g, art, r, u.slowT > 0, 1, null);
    else drawRatSilhouette(g, r, u.slowT > 0);
    g.restore();
    if (hit) { g.globalAlpha = fade * .45; g.fillStyle = "#fff";
               g.beginPath(); g.arc(0, -r, r, 0, 7); g.fill(); g.globalAlpha = fade; }
  } else {
    const S = 52;
    // 걸을 때는 살짝 위아래로 튄다 — 멈춰 서서 쏠 때는 가만히 있는다
    const bob = u.walking ? Math.abs(Math.sin(duel.sim.t * 7 + u.id)) * 3 : 0;
    g.translate(0, -bob);
    // 종이 타일 — 내 편은 푸른 테두리, 상대는 붉은 테두리
    g.fillStyle = "#f2ecdb";
    g.fillRect(-S / 2, -S, S, S);
    g.lineWidth = u.pr ? 3 : 2;
    g.strokeStyle = u.pr ? "#cda43a" : mine ? "#3c6a8a" : "#c4322a";
    g.strokeRect(-S / 2, -S, S, S);

    const fake = { key: u.k, uid: u.id * 97, atkEnd: u.atkT > 0 ? ms + u.atkT * 1000 : 0 };
    const [row, fr] = frameOf(fake, ms);
    const art = catFrameCanvas(u.k, row, fr);
    g.save();
    g.scale(facing, 1);
    if (art) g.drawImage(art, -25, -50, 50, 50);
    else { g.fillStyle = mine ? "#5bc8e8" : "#e0574d"; g.beginPath(); g.arc(0, -25, 16, 0, 7); g.fill(); }
    g.restore();
    if (hit) { g.fillStyle = "rgba(255,255,255,.5)"; g.fillRect(-S / 2, -S, S, S); }
    if (u.slowT > 0) { g.fillStyle = "rgba(121,183,216,.34)"; g.fillRect(-S / 2, -S, S, S); }
    if (u.freezeT > 0) { g.fillStyle = "rgba(160,120,255,.34)"; g.fillRect(-S / 2, -S, S, S); }
    if (u.lv > 1) {
      g.fillStyle = "#2b2418"; g.fillRect(-S / 2, -S - 12, 26, 12);
      g.fillStyle = "#ffd782"; g.font = "bold 9px ui-monospace,monospace";
      g.textAlign = "center"; g.textBaseline = "alphabetic";
      g.fillText("Lv" + u.lv, -S / 2 + 13, -S - 3);
    }
  }
  g.restore();

  if (u.dead) return;
  // 체력줄 — 머리 위. 몸이 작아진 만큼 같이 작아진다
  const top = y - (u.mob ? (ENEMIES[u.k] ? ENEMIES[u.k].r : 18) * 2.2 : 66) * sc;
  const hp = Math.max(0, u.hp / u.max), bw = 40 * sc;
  g.globalAlpha = 1;
  g.fillStyle = "rgba(0,0,0,.5)"; g.fillRect(x - bw / 2, top, bw, 4);
  g.fillStyle = hp > .5 ? "#7fbf6a" : hp > .25 ? "#cda43a" : "#c4322a";
  g.fillRect(x - bw / 2, top, bw * hp, 4);
}

function drawDuel(now) {
  const cv = /** @type {HTMLCanvasElement} */ ($("#duelCv"));
  if (!cv) return;
  const g = cv.getContext("2d");
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.clearRect(0, 0, DUEL.w, DUEL.h);
  drawDuelField(g);

  if (!duel) return;
  if (!duel.sim) {   // 명세를 기다리는 중
    g.textAlign = "center"; g.textBaseline = "alphabetic";
    g.fillStyle = "rgba(24,16,10,.6)";
    g.font = "16px 'Jua','Gowun Dodum',sans-serif";
    const left = Math.max(0, DUEL.waitSecs - duel.waitT);
    g.fillText(`상대의 냥타워가 도착하기를 기다리는 중… ${left.toFixed(1)}초`, DUEL.w / 2, DUEL.h / 2);
    return;
  }

  drawDuelCamp(g, "a"); drawDuelCamp(g, "b");

  // 유닛 — 깊은 쪽(뒤)부터 그려 앞에 선 놈이 위에 오게 한다
  const ms = duel.sim.t * 1000;
  const order = duel.sim.units.slice().sort((p, q) => (q.dep || 0) - (p.dep || 0));
  for (const u of order) drawDuelUnit(g, u, ms);

  // 스킬 고리 — 합성 냥타워가 터뜨린 범위가 바닥에 타원으로 번진다
  for (const r of duel.skRings) {
    const a = Math.max(0, r.life / r.max);
    const sx = duelX(r.x), sy = duelYAt(sx, r.dep);
    g.save();
    g.globalAlpha = a * .8;
    g.strokeStyle = r.col; g.lineWidth = 3;
    const rr = r.r * (1.05 - a * 0.75);
    g.beginPath(); g.ellipse(sx, sy, rr, rr * 0.3, 0, 0, 7); g.stroke();
    g.restore();
  }
  g.globalAlpha = 1;

  // 탄환
  for (const s of duel.sim.shots) {
    const a = Math.max(0, s.life / s.max);
    const x1 = duelX(s.x1), y1 = duelYAt(x1, s.dep1) - 26 * duelScale(s.dep1);
    if (s.ring) {
      g.globalAlpha = a * 0.7; g.strokeStyle = "#ff9a5c"; g.lineWidth = 2;
      g.beginPath(); g.ellipse(x1, y1, s.r * (1.15 - a * 0.15), s.r * (1.15 - a * 0.15) * 0.45, 0, 0, 7);
      g.stroke();
      g.globalAlpha = 1; continue;
    }
    const x2 = duelX(s.x2), y2 = duelYAt(x2, s.dep2) - 26 * duelScale(s.dep2);
    g.globalAlpha = a;
    g.strokeStyle = s.chain ? "#6fe0d0" : s.crit ? "#cda43a" : s.side === mySide() ? "#2f6f9a" : "#c4322a";
    g.lineWidth = s.crit ? 3 : 1.8;
    g.beginPath();
    g.moveTo(x1, y1); g.lineTo(x2, y2);
    g.stroke();
  }
  g.globalAlpha = 1;

  // 떠오르는 글씨
  g.textAlign = "center";
  for (const f of duel.floats) {
    const p = 1 - Math.max(0, f.life) / f.max;
    g.save();
    g.globalAlpha = Math.min(1, p / .15) * Math.min(1, Math.max(0, (1 - p) / .4));
    g.translate(duelX(f.x), f.y - 22 * p);
    g.font = f.big ? "bold 15px 'Jua',sans-serif" : "bold 11px ui-monospace,monospace";
    g.lineWidth = 3; g.strokeStyle = "rgba(24,16,10,.85)"; g.lineJoin = "round";
    g.strokeText(f.txt, 0, 0);
    g.fillStyle = f.col; g.fillText(f.txt, 0, 0);
    g.restore();
  }
  g.globalAlpha = 1;
  void now;
}

/* ── 덱 표시줄 (화면 아래) ──
 * 누를 것이 없는 라운드다. 그래서 이 자리에는 조작 대신 **양쪽이 무엇을 데려왔는지**를
 * 나란히 놓는다 — 종류·레벨별로 한 칸씩, 몇 명인지와 함께. 위에는 덱 지수를 적어
 * 지금 붙고 있는 두 덱의 우열이 한눈에 보이게 한다.
 * 싸움이 시작될 때 한 번만 그린다 (구성이 도중에 바뀌지 않는다).
 */
function clearDuelDecks() {
  for (const id of ["#duelDeckMine", "#duelDeckFoe"]) {
    const el = $(id);
    if (el) el.innerHTML = "";
  }
  const pw = $("#duelPower");
  if (pw) pw.textContent = "—";
}

/** 한 편의 덱을 칸으로 늘어놓는다 */
function deckChips(groups) {
  if (!groups.length) return `<span class="dempty">비어 있음</span>`;
  return groups.map((c) => {
    const d = c.mob ? ENEMIES[c.k] : CATS[c.k];
    const nm = d ? (c.mob ? d.nm : d.name) : c.k;
    const ic = d ? d.icon : "🐭";
    return `<span class="dchip${c.lv > 1 ? " lv" : ""}">
      <b>${ic}</b><i>${nm}${c.lv > 1 ? ` Lv${c.lv}` : ""}</i><em>×${c.n}</em></span>`;
  }).join("");
}

function renderDuelDecks() {
  if (!duel || !duel.sim) return;
  const me = mySide(), foe = me === "a" ? "b" : "a";
  const sim = duel.sim;
  $("#duelDeckMine").innerHTML = deckChips(sim.deck[me]);
  $("#duelDeckFoe").innerHTML = deckChips(sim.deck[foe]);
  $("#duelDeckFoeLbl").textContent = duel.foeMob ? "쥐 침입단" : "상대 덱";
  const mp = sim.power[me], fp = sim.power[foe];
  const pw = $("#duelPower");
  pw.innerHTML = `<b class="me">${mp}</b><span>덱 지수</span><b class="foe">${fp}</b>`;
  pw.className = mp > fp ? "up" : mp < fp ? "down" : "even";
}

/**
 * 대전장 위쪽 표시줄 — 남은 시간 · 양쪽 병력.
 *
 * 성채가 없으니 지켜볼 숫자는 **남은 병력** 하나다. 머릿수와 함께 체력 막대를 얹는데,
 * 막대는 자기 시작 병력 대비 비율이다 — 시간이 다 됐을 때 승패를 가르는 잣대가 그것이라
 * 화면에 보이는 것과 판정 기준이 같아야 한다.
 */
function renderDuelBar() {
  if (!duel) return;
  const me = mySide(), foe = me === "a" ? "b" : "a";
  const sim = duel.sim;
  const show = (side) => sim ? `${sim.alive(side).length}/${sim.startN[side]}` : "-";
  $("#duelMine").textContent = show(me);
  $("#duelTheirs").textContent = sim ? show(foe) : "대기";
  for (const [id, side] of [["#duelMineFill", me], ["#duelTheirsFill", foe]]) {
    /** @type {HTMLElement} */ ($(id)).style.width = sim ? `${sim.ratio(side) * 100}%` : "100%";
  }
  const left = sim ? Math.max(0, DUEL.timeLimit - sim.t) : DUEL.timeLimit;
  $("#duelTimer").textContent = `${left.toFixed(1)}초`;
  /** @type {HTMLElement} */ ($("#duelFill")).style.width = `${(left / DUEL.timeLimit) * 100}%`;
}

function renderDuelResult() {
  const r = duel.res;
  const won = r.outcome === "win", drew = r.outcome === "draw";
  const box = $("#duelResult");
  box.className = won ? "win" : drew ? "draw" : "lose";
  /* 보상은 **특허료가 아니라 점수**다 — 이긴 쪽이 자원까지 가져가면 눈덩이가 굴러
   * 첫 대전 한 판으로 판이 끝난다. 진 쪽의 내구 손실만 판 안에 남는다. */
  const pts = won ? RANK.duelWin : drew ? RANK.duelDraw : RANK.duelLose;
  box.innerHTML = `<b>${won ? "대전 승리" : drew ? "무승부" : "대전 패배"}</b>
    <i>${r.reason}</i>
    <span>랭킹 점수 <b>+${pts.toLocaleString()}</b>${
      won || drew ? "" : ` · 등록원부 내구 −${DUEL.leakBase + r.foeAlive * DUEL.leakPer}`}</span>`;
  box.classList.remove("hidden");
}

/* ═══════ 루프 ═══════ */
let last = 0;
function loop() {
  if (!game) return;
  const now = performance.now();
  const dt = Math.min(.05, (now - (last || now)) / 1000);
  last = now;

  // 대전 라운드에서는 청사 전투가 돌지 않는다 — 대전장이 대신 굴러간다 (배속도 여기서는 안 먹는다)
  if (duelOn() || duel) {
    safe("대전 진행", () => { stepDuel(dt); renderHud(); });
    safe("대전장 그리기", () => { drawDuel(now); renderDuelBar(); });
    safe("이벤트 처리", () => consumeEvents());
    safe("상태 전송", () => maybeSendState(now));
    return;
  }

  safe("전투 진행", () => {
    if (game.phase !== "wave") return;
    for (let i = 0; i < speed; i++) {
      if (!game.tick(dt, now)) break;
    }
    renderHud();
  });
  for (let i = floaters.length - 1; i >= 0; i--) {
    floaters[i].life -= dt;
    if (floaters[i].life <= 0) floaters.splice(i, 1);
  }
  for (let i = skillRings.length - 1; i >= 0; i--) {
    skillRings[i].life -= dt;
    if (skillRings[i].life <= 0) skillRings.splice(i, 1);
  }
  stepSparks(dt);
  stepCorpses(dt);
  stepCrumbs(dt);
  stepShake(dt);

  // 각 단계를 따로 감싼다 — 한 군데가 터져도 나머지 화면은 계속 살아 있어야 한다
  safe("이벤트 처리", () => consumeEvents());
  safe("준비 표시", () => { syncPrepState(); renderReadyBar(); renderFxTags(); });
  draw(now);
  safe("상대 청사", () => drawOpponent(now));
  safe("상태 전송", () => maybeSendState(now));
}

/** 상대에게 내 보드 스냅샷을 초당 몇 번만 보낸다 (전투 자체는 각자 클라이언트가 계산) */
function maybeSendState(now) {
  if (soloMode) return;
  if (now - lastStateSentAt < 350) return;
  lastStateSentAt = now;
  const snap = {
    hp: game.hp, maxHp: game.maxHp, wave: game.wave, phase: game.phase,
    augs: game.augments,
    pieces: B.placed(game).map((p) => ({ k: p.key, lv: Math.max(1, p.lv || 1),
                                         pr: Math.max(1, p.lv || 1) >= BAL.promoteLv, x: p.x, y: p.y })),
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
  const [bx, by] = boardPoint(e);            // 판이 줄어 있어도 원래 크기 기준 좌표로 돌려받는다
  const x = Math.floor(bx / (CS + GAP));
  const y = Math.floor(by / (CS + GAP));
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
      stamp(/** @type {PointerEvent} */ (e).clientX, /** @type {PointerEvent} */ (e).clientY, "임 용", CATS[p.key].name);
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
  const s = p.st;
  // 판에 놓이기 전(패널 카드)에는 st 가 없으므로 정의값을 그대로 보여준다
  const critC = s ? s.critC : (d.critC || 0), critM = s ? s.critM : (d.critM || 1);
  const lv = Math.max(1, p.lv || (s && s.lv) || 1);
  const slow = s ? s.slow : (d.slow || 0);
  t.innerHTML = `<b>${d.name}${lv > 1 ? ` <span style="color:#ffd782">Lv${lv}</span>` : ""}</b> — ${d.tag}<i>${d.desc}</i>
    ${s && s.atk ? `<i>공격력 ${s.dmg.toFixed(1)} · 공속 ${s.rate.toFixed(2)}/s · 사거리 ${(s.range/(CS+GAP)).toFixed(1)}칸</i>` : "<i>1칸짜리 벽이기도 하다.</i>"}
    ${slow ? `<i style="color:#79b7d8">둔화 ${Math.round(slow)}% · 1.6초</i>` : ""}
    ${critC ? `<i style="color:#cda43a">치명타 ${Math.round(critC * 100)}% · 피해 ×${critM.toFixed(1)}</i>` : ""}
    ${specialTipHtml(p.key, s)}
    ${d.special ? `<i style="color:#6fe0d0">이종 합성 전용 — ${(RECIPES.find((r) => r.key === p.key) || { need: [] }).need.map((k) => CATS[k].name).join(" + ")}</i>` : ""}
    ${lv < BAL.maxLv ? `<i style="color:#8a7c5e">같은 종류 Lv${lv} ${BAL.mergeNeed}명을 모으면 Lv${lv + 1}로 합성됩니다${lv + 1 >= BAL.promoteLv ? " (승진냥)" : ""}</i>` : ""}
    ${s && s.splash ? `<i style="color:#ff9a5c">승진냥 — 샷건 방사 피해 ${Math.round(s.splash.f * 100)}% (반경 ${(s.splash.r/(CS+GAP)).toFixed(1)}칸)</i>` : ""}
    ${s && s.golden ? `<i style="color:#cda43a">직권보정 — 이번 웨이브 공격력 3배</i>` : ""}`;
  t.style.display = "block";
  t.style.left = Math.min(e.clientX + 14, innerWidth - 244) + "px";
  t.style.top = Math.min(e.clientY + 14, innerHeight - 120) + "px";
}
const hideTip = () => { $("#tip").style.display = "none"; };

/**
 * 특수 냥타워의 규칙을 말풍선에 적는다.
 * 판에 놓이기 전(처방표·확률표)에는 st 가 없으므로 정의값(CATS)을 대신 읽는다.
 * @param {string} key @param {any} [s] 계산이 끝난 스탯
 */
function specialTipHtml(key, s) {
  const d = CATS[key] || {};
  const src = s || d;
  const line = (txt) => `<i style="color:#6fe0d0">${txt}</i>`;
  let out = "";
  const ch = src.chain || d.chain;
  if (ch) out += line(`연쇄 — 명중이 근처 ${ch.n}마리로 튄다 (피해 ${Math.round(ch.f * 100)}%씩 감소)`);
  const stC = src.stunC || d.stunC;
  if (stC) out += line(`정지 — 명중마다 ${Math.round(stC * 100)}% 확률로 ${(src.stunD || d.stunD).toFixed(1)}초 완전 정지`);
  const ex = src.exec || d.exec;
  if (ex) out += line(`즉사 — 체력 ${Math.round(ex * 100)}% 이하 침입자 즉시 제거 (특허괴물 제외)`);
  const bt = src.bounty || d.bounty;
  if (bt) out += line(`징수 — 이 냥이 처치하면 특허료 +${Math.round(bt * 100)}%`);
  const tg = (s ? s.targets : d.targets) || 1;
  if (tg > 1) out += line(`동시조준 ${tg}마리`);
  const sp = s && s.splash;
  if (sp) out += line(`방사 — 반경 ${(sp.r / 84).toFixed(1)}칸 안에 직격의 ${Math.round(sp.f * 100)}% 피해`);
  /* 고유 스킬 — 합성으로만 나오는 다섯이 가진 「한 수」. 쿨은 레벨을 타므로
   * 실제 계산이 끝난 st(s)가 있으면 그 값을, 없으면 정의된 기본값을 적는다. */
  const sk = CAT_SKILLS[key];
  if (sk) {
    const cd = (s && s.skill) ? s.skill.cd : sk.cd;
    out += `<i style="color:${sk.col}"><b>${sk.icon} ${sk.name}</b> · ${cd.toFixed(1)}초마다 자동</i>
            <i style="color:${sk.col};opacity:.85">${sk.desc}</i>`;
  }
  return out;
}

function endMatch(iWon, reasonText) {
  clearChoiceTimer();
  // 대전장이 열린 채로 판이 끝날 수 있다 (대전에서 져 내구가 0이 된 경우). 먼저 접는다.
  duel = null;
  $("#duelStage").classList.add("hidden");
  document.body.classList.remove("dueling");
  const s = game.summary();
  /* 성적표 — 한 판의 결말은 O/X 가 아니라 **점수**다.
   * 판이 도중에 끝났다면(내구 0) 덱 지수는 지금 판을 재서 넣는다 — 마지막 대전까지 가지
   * 못했으므로 game.finalDeck 이 비어 있기 때문이다. */
  const rank = game.rankScore(game.finalDeck || deckPower(makeRoster(game)));
  const bar = (label, pts, max, col) => `
    <div class="rkrow">
      <span class="rklbl">${label}</span>
      <span class="rktrack"><i style="width:${Math.min(100, pts / max * 100).toFixed(1)}%;background:${col}"></i></span>
      <span class="rkpts">${pts.toLocaleString()}</span>
    </div>`;
  const maxSpeed = Math.max(1, rank.waves.length * RANK.speedPerWave);
  const maxDuel = Math.max(1, DUEL_WAVES.length * RANK.duelWin);

  $("#sheet").innerHTML = `<div class="end">
    <h3 style="color:${iWon ? "#cda43a" : "#e0574d"}">${iWon ? "심사 종료 — 성적표" : "거절결정 — 판 중단"}</h3>
    <p style="color:var(--muted);font-size:12.5px;margin:0 0 12px">${reasonText}</p>

    <div class="rankbox" style="--rc:${rank.gradeCol}">
      <div class="rkgrade">${rank.grade}</div>
      <div class="rktotal"><b>${rank.total.toLocaleString()}</b><i>점</i></div>
      <div class="rksay">${rank.say}</div>
    </div>
    <div class="rankbars">
      ${bar(`⚔️ 1:1 대전 <em>${s.duelRecord[0]}승 ${s.duelRecord[1]}무 ${s.duelRecord[2]}패</em>`, rank.duel, maxDuel, "#e0574d")}
      ${bar(`🏗️ 덱 파워 <em>지수 ${Math.round(game.finalDeck || 0).toLocaleString()}</em>`, rank.deck, 4000, "#6fe0d0")}
      ${bar(`⏱️ 클리어 속도 <em>${rank.waves.length}개 라운드</em>`, rank.speed, maxSpeed, "#cda43a")}
      ${bar(`🏛️ 등록원부 <em>${Math.max(0, Math.round(game.hp))}/${game.maxHp}</em>`, rank.hp, Math.max(1, game.maxHp * RANK.hpMul), "#7fbf6a")}
    </div>
    ${rank.waves.length ? `<div class="rkwaves"><i>라운드별 클리어 (파 타임 대비)</i>
      ${rank.waves.map((w) => `<span class="${w.pts >= RANK.speedPerWave ? "par" : ""}">
        <b>R${w.wave}</b>${w.secs.toFixed(1)}초 <em>/ ${w.par.toFixed(0)}초</em> <u>${w.pts}</u></span>`).join("")}
      </div>` : ""}

    <div class="kv" style="max-width:280px;margin:14px auto 16px;text-align:left">
      <span>처치</span><b>${s.killed}</b><span>돌파 허용</span><b>${s.leaked}</b>
      <span>배치 심사관</span><b>${s.cats}명 (최고 Lv${s.maxLv || 1})</b>
      <span>합성</span><b>${s.merged}회 (특수 ${s.crafted})</b>
      ${s.specials.length ? `<span>특수 냥타워</span><b>${[...new Set(s.specials)].map((k) => `${CATS[k].icon} ${CATS[k].name}`).join(" · ")}</b>` : ""}
      ${lineSummaryHtml()}
      <span>방해 공작</span><b>${s.sabotage.length ? s.sabotage.map((k) => `${SABOTAGE[k].icon} ${SABOTAGE[k].short}`).join(" · ") : "없음"}</b>
      </div>
    <button class="go" id="again" style="padding:10px 26px">로비로</button></div>`;
  $("#modal").classList.add("on");
  $("#again").addEventListener("click", () => location.reload());
}

/* ═══════ 판을 화면 높이에 맞추기 ═══════ */
/**
 * 판이 화면에 들어가도록 줄여 놓은 배율 (1 = 원래 크기).
 * 판은 9×9 × 84px 고정이라 낮은 화면에서는 그대로 두면 넘친다. 칸 수나 픽셀 좌표를 건드리는 대신
 * 액자째 CSS 로 축소하고, 화면 좌표를 판 좌표로 되돌릴 때만 이 값으로 나눈다 —
 * 전투 계산은 언제나 원래 크기 그대로다.
 */
let boardScale = 1;
let fitKey = "";
/** @param {boolean} [force] 액자 두께가 바뀌었을 때(전장 원화 교체)는 크기가 같아 보여도 다시 잰다 */
function fitArena(force) {
  const box = $("#arenaFit"), a = $("#arena");
  if (!box || !a) return;
  const key = `${box.clientWidth}x${box.clientHeight}`;
  if (!force && key === fitKey) return;
  fitKey = key;
  a.style.transform = "none";                       // 원래 크기를 재려면 배율을 먼저 풀어야 한다
  const w = a.offsetWidth, h = a.offsetHeight;
  if (!w || !h || !box.clientHeight) return;
  boardScale = Math.min(1, box.clientWidth / w, box.clientHeight / h);
  if (boardScale < 1) a.style.transform = `scale(${boardScale})`;
}
addEventListener("resize", () => fitArena(true));

/** 판 좌표(px) → 화면 좌표. 판이 줄어 있으면 그만큼 곱해야 도장이 제자리에 찍힌다. */
function boardToScreen(cx, cy) {
  const bb = $("#board").getBoundingClientRect();
  return [bb.left + cx * boardScale, bb.top + cy * boardScale];
}

/** 보드 기준 픽셀 좌표 — fx 캔버스와 좌표계가 정확히 같다 */
function boardPoint(e) {
  const bb = $("#board").getBoundingClientRect();
  return [(e.clientX - bb.left) / boardScale, (e.clientY - bb.top) / boardScale];
}

/* ═══════ 방해 공작 (상대 판에 거는 훼방) ═══════ */
/**
 * 공작 버튼도 스킬처럼 판이 시작될 때 한 번만 만든다.
 * 솔로에는 훼방을 놓을 상대가 없으므로 패널 자체를 감춘다.
 */
function buildSabotageBar() {
  const panel = $("#sabPanel");
  const el = $("#sabBar");
  if (!panel || !el) return;
  panel.classList.toggle("hidden", soloMode);
  if (soloMode) return;

  const total = Object.keys(SABOTAGE).reduce((a, k) => a + SABOTAGE[k].weight, 0);
  el.innerHTML = `
    <button id="btnSab" class="sabdraw" type="button">
      <span class="ic">🎲</span>
      <span class="meta"><b>방해 공작 뽑기</b><i class="state">준비 중</i></span>
      <span class="right">
        <span class="cost">₩${game.sabotageCost().toLocaleString()}</span>
        <span class="left">남은 <b id="sabLeft">${game.sabotageLeft}</b>회</span>
      </span>
    </button>
    <div id="sabFlash" class="sabflash hidden"></div>
    <div class="sabpool">${Object.keys(SABOTAGE).map((k) => {
      const d = SABOTAGE[k];
      return `<div class="srow" data-k="${k}">
        <span class="ic">${d.icon}</span>
        <span class="meta"><b>${d.name}</b><i>${d.tag}</i></span>
        <span class="pct">${Math.round((d.weight / total) * 100)}%</span>
      </div>`;
    }).join("")}</div>`;

  $("#btnSab").addEventListener("click", onSabotageDraw);
  el.querySelectorAll(".srow").forEach((row) => {
    const key = /** @type {HTMLElement} */ (row).dataset.k;
    row.addEventListener("pointerenter", (e) => showSabotageTip(e, SABOTAGE[key]));
    row.addEventListener("pointerleave", hideTip);
  });
  updateSabotageBar();
}

/** 뽑기 단추의 상태만 손본다 (매 프레임 불린다 — innerHTML 을 다시 쓰지 않는다) */
function updateSabotageBar() {
  if (!game || soloMode) return;
  const b = /** @type {HTMLButtonElement} */ ($("#btnSab"));
  if (!b) return;
  const blocked = game.sabotageBlocked();
  const why = blocked || (online() ? null : "서버 연결 끊김");
  b.disabled = !!why;
  const state = b.querySelector(".state");
  if (state) state.textContent = why || "무작위 1개 · 상대 판에 즉시";
  const left = $("#sabLeft");
  if (left) left.textContent = String(game.sabotageLeft);
}

function showSabotageTip(e, d) {
  if (dragging) return;
  const t = $("#tip");
  t.innerHTML = `<b>${d.name}</b> — ${d.tag}<i>${d.desc}</i>`;
  t.style.display = "block";
  t.style.left = Math.min(e.clientX + 14, innerWidth - 264) + "px";
  t.style.top = Math.min(e.clientY + 14, innerHeight - 150) + "px";
}

/**
 * 특허료를 내고 방해 공작 하나를 무작위로 뽑아 상대 판에 던진다.
 * 무엇이 나갔는지는 패널 안의 큰 칸(#sabFlash)과 상대 청사 위 도장으로 크게 알린다 —
 * 뽑기라서 「방금 뭐가 나갔지?」를 놓치면 안 되기 때문이다.
 */
function onSabotageDraw() {
  const blocked = game.sabotageBlocked();
  if (blocked) { log(`<b>방해 공작 뽑기</b> 불가 — ${blocked}`); return; }
  if (!online()) { log(`<b>방해 공작 뽑기</b> 불가 — 서버 연결이 끊겨 상대에게 닿지 않습니다`); return; }
  const key = game.drawSabotage();
  if (!key) return;
  sendWS({ t: "sabotage", key });
  flashSabotage(key);
  renderHud();
}

/** 뽑힌 공작을 패널 안에 큼직하게 남긴다 */
function flashSabotage(key) {
  const d = SABOTAGE[key];
  const box = $("#sabFlash");
  if (!box) return;
  box.innerHTML = `<span class="ic">${d.icon}</span>
    <span class="meta"><b>${d.name}</b><i>${d.tag}</i><em>${d.desc}</em></span>`;
  box.classList.remove("hidden");
  // 같은 것이 연달아 나와도 새로 뽑았다는 게 보이도록 등장 애니메이션을 다시 태운다
  box.classList.remove("pop");
  void box.offsetWidth;
  box.classList.add("pop");
}

/** 상대가 나에게 걸어 둔 공작을 판 아래에 표시한다. 매 프레임 불린다. */
function renderFxTags() {
  const el = $("#fxTags");
  if (!el || !game) return;
  const tags = [];
  const fx = game.fx, mods = game.waveMods;
  if (fx.hasteT > 0)
    tags.push(`<span>🛢️ 침입자 이동속도 +${Math.round((fx.hasteMul - 1) * 100)}% · ${fx.hasteT.toFixed(1)}초</span>`);
  if (fx.fogT > 0)
    tags.push(`<span>🌫️ 냥타워 사거리 −${Math.round((1 - fx.fogMul) * 100)}% · ${fx.fogT.toFixed(1)}초</span>`);
  if (mods.hp > 1) tags.push(`<span>💊 다음 웨이브 체력 +${Math.round((mods.hp - 1) * 100)}%</span>`);
  if (mods.count > 1) tags.push(`<span>📨 다음 웨이브 물량 +${Math.round((mods.count - 1) * 100)}%</span>`);
  if (mods.elite) tags.push(`<span>⚖️ 다음 웨이브 정예 ${mods.elite}마리 추가</span>`);
  el.innerHTML = tags.join("");
  el.classList.toggle("hidden", !tags.length);
}

/* ═══════ 승진 임명 ═══════ */
/**
 * 판에 서 있는 냥타워를 레벨별로 모아 보여준다.
 *
 * 승진은 이제 따로 사는 것이 아니라 합성의 마지막 단계라, 「누구를 승진시킬까」를 고르는 목록이
 * 필요 없어졌다. 대신 지금 무엇이 몇 명 · 몇 레벨로 서 있는지가 합성의 판단 재료라서,
 * 그 자리에 **보유 현황**을 놓았다. 합성이 실제로 가능한 묶음은 판 우측 상단(#mergeDock)에 뜬다.
 */
function renderPromoteList() {
  const el = $("#promoteList");
  if (!el) return;
  const pool = B.cats(game).concat(game.tray);
  if (!pool.length) {
    el.innerHTML = `<div class="prnone">아직 냥타워가 없습니다 — 위에서 랜덤 임용을 돌리세요.</div>`;
    return;
  }
  /** @type {Record<string, number>} */
  const count = {};
  for (const c of pool) count[`${c.key}:${Math.max(1, c.lv || 1)}`] = (count[`${c.key}:${Math.max(1, c.lv || 1)}`] || 0) + 1;

  el.innerHTML = Object.keys(count).sort((a, b) => {
    const [ka, la] = a.split(":"), [kb, lb] = b.split(":");
    // 특수 냥타워를 맨 위로 — 판에 무엇이 있는지 중 가장 먼저 알아야 할 것이다
    return (!!CATS[kb].special - !!CATS[ka].special) || (+lb - +la) || (CATS[kb].cost - CATS[ka].cost);
  }).map((id) => {
    const key = id.slice(0, id.lastIndexOf(":")), lv = +id.slice(id.lastIndexOf(":") + 1);
    const d = CATS[key];
    const top = lv >= BAL.promoteLv;
    const need = BAL.mergeNeed - (count[id] % BAL.mergeNeed);
    return `<div class="prow2 lvrow${top ? " top" : ""}${d.special ? " spec" : ""}" data-k="${key}">
      <span class="ic">${d.icon}</span>
      <span class="meta"><b>${d.name} <em>Lv${lv}</em></b>
        <i>${d.special ? `특수 · ${d.tag}` : top ? "승진냥 — 샷건 방사 피해" : `합성까지 ${need}명`}</i></span>
      <span class="pct">×${count[id]}</span>
    </div>`;
  }).join("");
}

/**
 * 냥타워 패널 — 카드를 탭하면 그 자리에서 바로 임용·배치한다.
 *
 * **무엇을 세울지는 내가 고른다.** 무작위는 상대를 흔드는 쪽(방해 공작 뽑기)이 맡는다 —
 * 내 판은 내가 짓고 상대 판은 던져 본다, 로 성격을 갈라 두었다.
 * 특수 냥타워(DRAW_KEYS 에 없는 것)는 여기 나오지 않는다. 합성으로만 얻는다.
 */
function renderCatRoster() {
  const el = $("#catRoster");
  const prep = game.phase === "prep" && !game.awaitingPassive && !game.awaitingAugment;
  el.innerHTML = DRAW_KEYS.map((k) => {
    const d = CATS[k];
    const cost = game.catCost(k);
    const afford = prep && game.gold >= cost;
    return `<div class="pick catpick${afford ? "" : " off"}" data-k="${k}">
      ${prep && !afford ? '<span class="nogold">자금 부족</span>' : ""}
      <div class="row1">
        <span class="ic">${d.icon}</span>
        <div class="who">
          <span class="nm">${d.name}</span>
          <span class="ef">${d.tag}${d.kind === "buff"
            ? (game.augSet.has("agentWar") ? " · 전투참전" : " · 비공격")
            : d.slow ? ` · 둔화 ${d.slow}%` : ` · 치명타 ${Math.round((d.critC || 0) * 100)}%`}</span>
        </div>
        <span class="cost">₩${cost.toLocaleString()}</span>
      </div>
      <span class="fl">${d.desc}</span>
    </div>`;
  }).join("") + recipeBookHtml();

  el.querySelectorAll(".catpick").forEach((card) => {
    const key = /** @type {HTMLElement} */ (card).dataset.k;
    card.addEventListener("click", () => {
      if (game.phase !== "prep" || game.awaitingPassive || game.awaitingAugment) return;
      if (game.gold < game.catCost(key)) return;
      const p = game.buyCat(key);
      if (!p) return;
      render();
      if (p.x >= 0) {
        const [cx, cy] = B.pieceCenter(p);
        stamp(...boardToScreen(cx, cy), "임 용", CATS[key].name);
      } else {
        log(`<b>심사관 임용</b> ${CATS[key].name} — 판이 가득 차서 대기열에 놓였습니다. 드래그해서 배치하세요.`);
      }
    });
  });
  el.querySelectorAll(".catpick, .rbrow").forEach((row) => {
    row.addEventListener("pointerenter", (e) => showTip(e, { key: /** @type {HTMLElement} */ (row).dataset.k }));
    row.addEventListener("pointerleave", hideTip);
  });
}

/**
 * 합성 처방표 — 어떤 조합이 무엇을 만드는지.
 *
 * 처방은 처음부터 전부 펼쳐 두고, 재료가 다 모인 줄만 초록으로 띄운다
 * (실제로 누르는 단추는 판 우측 상단에 뜬다).
 */
function recipeBookHtml() {
  const offers = game.recipeOffers(true);
  return `<div class="recipebook">
    <i>이종 합성 <b>RECIPES</b></i>
    <div class="rbnote">서로 <b>다른 종류 Lv1</b> 을 처방대로 태우면 임용으로는 살 수 없는
      <b>특수 냥타워</b>가 나옵니다. 다섯은 저마다 <b style="color:#ffd782">쿨마다 저절로 터지는
      고유 스킬</b>을 하나씩 갖습니다 — 무엇을 향해 모으는지가 여기에 적혀 있습니다.
      재료가 모이면 판 우측 상단에 합성 단추가 뜹니다.</div>
    ${offers.map((o) => {
      const d = CATS[o.key];
      const sk = CAT_SKILLS[o.key];
      const mats = o.need.map((k) => {
        const have = (o.have[k] || 0) >= o.need.filter((x) => x === k).length;
        return `<span class="mat${have ? " have" : ""}" title="${CATS[k].name}">${CATS[k].icon}</span>`;
      }).join(`<span class="plus">+</span>`);
      return `<div class="rbrow${o.ready ? " ready" : ""}" data-k="${o.key}">
        <span class="mats">${mats}</span>
        <span class="arrow">→</span>
        <span class="out">${d.icon}</span>
        <span class="meta"><b>${d.name}</b><i>${d.tag} — ${d.desc}</i>
          ${sk ? `<u style="color:${sk.col}">${sk.icon} ${sk.name} · ${sk.cd}초마다 자동</u>` : ""}</span>
      </div>`;
    }).join("")}
  </div>`;
}

/* ═══════ 합성 (판 우측 상단) ═══════
 * 같은 종류·같은 레벨이 셋 모이면 저절로 여기에 뜬다. 누르면 그 자리에서 합쳐진다 —
 * 재료를 직접 겹쳐 끌어다 놓게 하면 어떤 조합이 되는지 판을 뒤져야 알 수 있고,
 * 그 손질이 뽑기를 도입한 이유(손 덜 가게)를 도로 무너뜨린다.
 */
let mergeDockSig = "";
function renderMergeDock() {
  const el = $("#mergeDock");
  if (!el || !game) return;
  // 합성은 준비 단계에만. 웨이브 중에 냥이 사라지면 쏘던 자리가 그대로 뚫린다.
  const open = game.phase === "prep" && !game.awaitingPassive && !game.awaitingAugment;
  // 특수 냥타워(이종 합성)를 먼저 보여준다 — 레벨업은 언제든 되지만 처방은 재료가 흩어지면
  // 다음 뽑기에서 다시 모아야 하고, 무엇보다 판이 달라지는 쪽이라 눈에 먼저 띄어야 한다.
  const recipes = open ? game.recipeOffers() : [];
  const levels = open ? game.mergeOffers().filter((o) => o.have >= o.need) : [];
  const sig = (open ? "" : "off|") +
    recipes.map((o) => `R${o.key}`).join("|") + "//" +
    levels.map((o) => `${o.key}.${o.lv}x${o.have}`).join("|");
  if (sig === mergeDockSig) return;     // 매 프레임 불려도 바뀐 게 없으면 손대지 않는다
  mergeDockSig = sig;

  const total = recipes.length + levels.length;
  el.classList.toggle("hidden", !total);
  if (!total) { el.innerHTML = ""; return; }

  const recipeChips = recipes.map((o) => {
    const d = CATS[o.key];
    const mats = o.need.map((k) => CATS[k].icon).join("");
    return `<button class="mchip special" type="button" data-r="${o.key}">
      <span class="ic">${d.icon}</span>
      <span class="meta"><b>${d.name}</b><i>${mats} → 특수 · ${d.tag}</i></span>
      <span class="go">합성</span>
    </button>`;
  }).join("");
  const levelChips = levels.map((o) => {
    const d = CATS[o.key];
    return `<button class="mchip" type="button" data-k="${o.key}" data-lv="${o.lv}">
      <span class="ic">${d.icon}</span>
      <span class="meta"><b>${d.name}</b><i>Lv${o.lv} ×${o.need} → Lv${o.lv + 1}</i></span>
      <span class="go">합성</span>
    </button>`;
  }).join("");
  el.innerHTML = `<div class="mhead">합성 가능 <b>${total}</b></div>` + recipeChips + levelChips;

  el.querySelectorAll(".mchip").forEach((b) => {
    b.addEventListener("click", () => {
      const h = /** @type {HTMLElement} */ (b);
      const okDone = h.dataset.r ? game.craftRecipe(h.dataset.r)
                                 : game.mergeCats(h.dataset.k, +h.dataset.lv);
      if (okDone) render();
    });
  });
}

/* ═══════ 선택 모달 (패시브 · 증강) ═══════ */
/**
 * 선택 제한시간.
 * 웨이브 개시가 양쪽 합의로 바뀌었으므로, 한 쪽이 모달을 켜 둔 채 자리를 비우면 상대까지 묶인다.
 * 제한시간이 끝나면 첫 번째 후보가 자동으로 선택된다.
 */
let choiceTimer = null;
function clearChoiceTimer() {
  if (choiceTimer) { clearInterval(choiceTimer); choiceTimer = null; }
}
function startChoiceTimer(onExpire) {
  clearChoiceTimer();
  if (soloMode) return;   // 자동 선택은 상대를 기다리게 하지 않으려는 장치 — 솔로에는 재촉할 이유가 없다
  const total = BAL.choiceSecs * 1000;
  const end = performance.now() + total;
  const tick = () => {
    const left = Math.max(0, end - performance.now());
    const fill = /** @type {HTMLElement} */ ($("#sheet").querySelector(".choicebar i"));
    const lbl = $("#sheet").querySelector(".choicebar b");
    if (fill) fill.style.width = `${(left / total) * 100}%`;
    if (lbl) lbl.textContent = `${(left / 1000).toFixed(1)}초 뒤 자동 선택`;
    if (left <= 0) { clearChoiceTimer(); onExpire(); }
  };
  choiceTimer = setInterval(tick, 100);
  tick();
}
const choiceBarHtml = () => soloMode ? "" :
  `<div class="choicebar"><b>${BAL.choiceSecs.toFixed(1)}초 뒤 자동 선택</b><span class="track"><i></i></span></div>`;

/** 선택이 끝났을 때 공통으로 하는 뒷정리 */
function closeChoiceModal() {
  clearChoiceTimer();
  $("#modal").classList.remove("on");
  renderPassiveTags();
  renderAugTags();
  render();
}

/**
 * 계열 진행도 한 줄 — `🎯 입증 ●●●○○ 3/5` 과 열린 단계.
 * 선택 모달 위쪽과 헤더의 「스테이지 강화」 칸이 같은 함수를 쓴다 — 두 곳이 어긋나면
 * 「내가 지금 몇 점인가」를 화면마다 다시 세어 봐야 한다.
 * @param {string} key 계열 키 @param {boolean} full 열린 단계의 이름까지 적을 것인가
 */
function lineRowHtml(key, full) {
  const L = LINES[key];
  const score = (game.lineScore && game.lineScore[key]) || 0;
  const tier = (game.lineTier && game.lineTier[key]) || 0;
  const max = LINE_TIER_AT[LINE_TIER_AT.length - 1];
  let dots = "";
  for (let i = 1; i <= max; i++) dots += `<i class="${i <= score ? "on" : ""}"></i>`;
  const steps = full ? LINE_TIER_AT.map((need, i) => {
    const t = i === 0 ? L.t1 : L.t2;
    const got = tier > i;
    return `<span class="lstep ${got ? "on" : ""}"><b>${got ? "✔" : need + "점"}</b>
      <i>${t.name}</i><em>${t.desc}</em></span>`;
  }).join("") : "";
  return `<div class="lrow ${tier ? "lit" : ""}" style="--lc:${L.col}">
    <span class="lname">${L.icon} ${L.name}</span>
    <span class="ldots">${dots}</span>
    <span class="lnum">${score}/${max}</span>
    ${steps ? `<div class="lsteps">${steps}</div>` : ""}
  </div>`;
}

/**
 * 스테이지 강화 효과 선택 모달 — 웨이브를 클리어할 때마다 뜬다.
 *
 * 예전에는 넷뿐이었고 **매번 그 넷이 전부** 나왔다. 고를 것이 없으니 고민도 없었다.
 * 지금은 열여섯 장 중 **넷만 뽑혀 나오고**, 각 장에 계열 딱지가 붙어 있다 —
 * 무엇을 고를 것인가가 아니라 **무엇을 포기할 것인가**가 매번 생긴다.
 * 위쪽에는 지금 계열 점수가 어디까지 왔는지, 다음 단계가 무엇을 열어 주는지를 펼쳐 둔다.
 */
function openPassiveModal() {
  const offer = game.passiveOffers();
  const lines = Object.keys(LINES).map((k) => lineRowHtml(k, false)).join("");
  $("#sheet").innerHTML = `<h3>라운드 ${game.wave} 클리어 — 강화 넷 중 하나를 고르세요</h3>
    <div class="upnote">같은 <b>계열</b>을 모을수록 그 계열의 카드가 더 잘 나옵니다.
      <b>3점</b>과 <b>5점</b>에 닿으면 그 계열에만 있는 <b>특수효과</b>가 열립니다 —
      숫자가 오르는 게 아니라 <b>규칙이 하나 바뀝니다</b>.
      고른 것은 합성과 함께 쌓여 <b>1:1 대전장에도 그대로 실립니다</b>
      (수수료 환급만 청사 판 전용입니다).</div>
    <div class="linebar">${lines}</div>
    <div class="picks upgrades">${offer.map((def) => {
      const L = def.line ? LINES[def.line] : null;
      const sc = def.line ? (game.lineScore[def.line] || 0) : 0;
      const next = LINE_TIER_AT.find((n) => n > sc);
      return `
      <div class="pick up ${L ? "lined" : ""}" data-k="${def.key}" style="${L ? `--lc:${L.col}` : ""}">
        <span class="ltag">${L ? `${L.icon} ${L.name} ${sc}→${sc + 1}` : "공통"}</span>
        <span class="ic">${def.icon}</span>
        <span class="nm">${def.name}</span>
        <span class="ef">${def.desc}</span>
        <span class="fl">${def.detail}</span>
        ${L && next ? `<span class="lnext">${next === sc + 1
          ? `<b>이걸 고르면 ${next}점 — ${next === LINE_TIER_AT[0] ? L.t1.name : L.t2.name} 개방!</b>`
          : `${next}점에서 ${next === LINE_TIER_AT[0] ? L.t1.name : L.t2.name}`}</span>` : ""}
      </div>`;
    }).join("")}</div>${choiceBarHtml()}`;
  $("#modal").classList.add("on");
  const choose = (key) => {
    const def = PASSIVE_BY_KEY[key];
    if (!def || !game.awaitingPassive) return;
    game.applyPassive(def);
    log(`<b>${def.icon} ${def.name}</b> 선택 — ${def.desc}`);
    // 계열 단계가 열렸으면 축포를 쏜다 — 「빌드를 완성했다」가 한 번은 크게 터져야 한다
    if (game.lineNew) { lineTierBanner(game.lineNew); game.lineNew = null; }
    closeChoiceModal();
  };
  $("#sheet").querySelectorAll(".pick").forEach((el) => {
    el.addEventListener("click", () => choose(/** @type {HTMLElement} */ (el).dataset.k));
  });
  startChoiceTimer(() => choose(offer[0].key));
}

/**
 * 계열 단계가 열린 순간의 축포 — 화면 한가운데에 크게 한 번 터졌다 사라진다.
 *
 * 강화 하나하나는 +12% 짜리 잔돈이지만 이 순간만은 **규칙이 바뀐다.** 모달이 닫히면서
 * 조용히 지나가면 무엇이 열렸는지 모른 채 판이 계속되므로, 여기서만 판을 잠깐 멈춰 세운다.
 * @param {{line:string, tier:number}} info
 */
function lineTierBanner(info) {
  const L = LINES[info.line];
  if (!L) return;
  const t = info.tier === 1 ? L.t1 : L.t2;
  const el = document.createElement("div");
  el.className = "tierpop";
  el.style.setProperty("--lc", L.col);
  el.innerHTML = `<i>${L.icon}</i>
    <b>${L.name} 계열 ${LINE_TIER_AT[info.tier - 1]}점 — ${info.tier}단계 개방</b>
    <strong>${t.name}</strong><em>${t.desc}</em>`;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add("out"), 2400);
  setTimeout(() => el.remove(), 3000);
  log(`<b style="color:${L.col}">${L.icon} ${L.name} ${info.tier}단계 개방 — ${t.name}</b> · ${t.desc}`);
  addShake(6, .3);
}

/**
 * 증강 선택 모달 — 2~3 웨이브에 한 번, 패시브 대신 뜬다.
 * 후보 3장은 시드에서 나오므로 상대에게도 똑같은 3장이 간다.
 */
function openAugmentModal() {
  const offer = game.augOffer();
  if (!offer.length) { game.awaitingAugment = false; return; }
  const round = AUGMENT_WAVES.indexOf(game.wave) + 1;
  $("#sheet").innerHTML = `<h3 class="augtitle">증강 ${round}차 — 판을 뒤집을 하나를 고르세요</h3>
    <div class="augnote">패시브와 달리 <b>규칙 자체가 바뀝니다</b>. 이번 판에서 같은 증강은 다시 나오지 않습니다.
      ${soloMode ? "" : "상대에게도 같은 3장이 갔습니다."}</div>
    <div class="picks augpicks">${offer.map((d) => `
      <div class="pick aug" data-k="${d.key}">
        <span class="ic">${d.icon}</span>
        <span class="nm">${d.name}</span>
        <span class="augtag">${d.tag}</span>
        <span class="ef">${d.desc}</span>
        <span class="fl">${d.detail}</span>
      </div>`).join("")}</div>${choiceBarHtml()}`;
  $("#modal").classList.add("on");
  const choose = (key) => {
    if (!game.awaitingAugment) return;
    game.applyAugment(key);     // 실패하더라도(있을 수 없지만) 모달은 반드시 닫는다 — 상대가 묶이면 안 된다
    closeChoiceModal();
  };
  $("#sheet").querySelectorAll(".pick").forEach((el) => {
    el.addEventListener("click", () => choose(/** @type {HTMLElement} */ (el).dataset.k));
  });
  startChoiceTimer(() => choose(offer[0].key));
}

/** 내가 고른 증강 · 상대가 고른 증강을 태그로 보여준다 */
function renderAugTags() {
  const mine = game.augments.map((k) => AUGMENTS[k])
    .map((d) => `<span class="aug"><b>${d.icon} ${d.name}</b><i>${d.desc}</i></span>`).join("");
  const my = $("#myAugTags");   // 증강을 걷어내면서 이 칸은 화면에서 빠졌다
  if (my) my.innerHTML = mine || `<span class="none">없음</span>`;
  const theirs = oppAugs.map((k) => AUGMENTS[k]).filter(Boolean)
    .map((d) => `<span class="aug"><b>${d.icon} ${d.name}</b><i>${d.desc}</i></span>`).join("");
  const box = $("#oppAugTags");
  if (box) box.innerHTML = theirs || `<span class="none">아직 없음</span>`;
}

/** 상대 스냅샷에 실려 온 증강 목록을 반영한다 (새로 늘어난 것만 기록에 남긴다) */
function syncOppAugs(list) {
  if (!game || list.length === oppAugs.length) return;
  for (const k of list.slice(oppAugs.length)) {
    const d = AUGMENTS[k];
    if (d) log(`<b class="warn">상대 증강</b> ${d.icon} ${d.name} — ${d.desc}`);
  }
  oppAugs = list.slice();
  renderAugTags();
}
/**
 * 지금까지 고른 스테이지 강화 효과를 헤더에 쌓아 보여준다.
 *
 * 같은 것을 여러 번 고를 수 있으므로 종류별로 묶어 「×3」처럼 센다 — 넷뿐이라 그냥 늘어놓으면
 * 같은 이름이 줄줄이 붙어 무엇을 얼마나 쌓았는지가 오히려 안 보인다.
 * 「수수료 환급」은 한 라운드짜리라 지금 걸려 있을 때만 남긴다.
 */
function renderPassiveTags() {
  /** @type {Record<string, number>} */
  const count = {};
  for (const d of game.myPassives) {
    if (d.stat === "gold2x") continue;
    count[d.key] = (count[d.key] || 0) + 1;
  }
  /* 계열 진행도를 **맨 위에** 놓는다 — 「내가 무슨 덱을 만들고 있는가」가 개별 강화 목록보다
   * 훨씬 중요한 정보이고, 다음에 무엇을 고를지도 이 줄을 보고 정하기 때문이다.
   * 아직 한 점도 없는 계열은 접어 둔다 (다섯 줄이 늘 떠 있으면 진행도가 오히려 안 보인다). */
  const lines = Object.keys(LINES)
    .filter((k) => (game.lineScore && game.lineScore[k]) > 0)
    .sort((a, b) => game.lineScore[b] - game.lineScore[a])
    .map((k) => lineRowHtml(k, false)).join("");

  const parts = PASSIVES.filter((d) => count[d.key]).map((d) => {
    const n = count[d.key];
    const abs = d.stat === "critC" || d.stat === "critM" || d.stat === "pierce" ||
                d.stat === "slow" || d.stat === "stunC";
    const cond = d.stat === "heavy" || d.stat === "rapid" || d.stat === "longR" ||
                 d.stat === "aura" || d.stat === "splash" || d.stat === "splashUp" ||
                 d.stat === "targets";
    const total = cond ? `×${n}`
      : d.stat === "critM" ? `+${(d.amount * n).toFixed(2)}`
      : abs ? `+${Math.round(d.amount * n * (d.stat === "critC" ? 100 : 1))}%p`
      : `+${Math.round(d.amount * n * 100)}%`;
    return tagHtml(`${d.icon} ${d.name}`, `${total}${n > 1 && !cond ? ` (×${n})` : ""}`);
  });
  if (game.goldMul > 1) parts.push(tagHtml("💰 수수료 환급", "이번 스테이지 특허료 2배"));
  $("#myPassiveTags").innerHTML =
    (lines ? `<div class="linebar mini">${lines}</div>` : "") +
    (parts.join("") || (lines ? "" : `<span class="none">없음</span>`));
}
/** 효과 태그 한 칸 — 이름과 실제로 무엇이 바뀌는지를 같이 보여준다 */
function tagHtml(name, desc, bad) {
  return `<span class="${bad ? "bad" : ""}"><b>${name}</b><i>${desc}</i></span>`;
}

/* ══ 스킬 컷인 — 화면 아래에 캐릭터 창이 「파칭!」 하고 뜬다 ══
 *
 * 합성 냥타워의 고유 스킬은 저절로 터진다. 저절로 터지는 것은 **터진 줄 모르고 지나가기
 * 쉬우므로**, 무엇이 터졌는지를 판 밖에서 한 번 더 크게 말해 준다 — 애써 재료를 모아 만든
 * 보람이 숫자가 아니라 사건으로 돌아오도록.
 *
 * 초상화는 그 냥의 스프라이트를 종류별 색보정까지 입혀 구운 캔버스(catFrameCanvas)를
 * 그대로 키워 쓴다. 특수 냥타워 다섯은 전용 원화가 없어 이 길밖에 없고, 판 위의 모습과
 * 같은 그림이라 「저 냥이구나」가 바로 이어진다.
 *
 * 같은 순간에 여럿이 터지면 줄을 세운다 — 겹쳐 띄우면 마지막 것만 보인다. */
const cutQueue = [];
let cutBusy = false;

/**
 * 컷인을 하나 예약한다.
 * @param {string} key 냥타워 종류 @param {number} lv 합성 레벨 @param {number} n 맞은 수
 */
function cutIn(key, lv, n) {
  const sk = CAT_SKILLS[key];
  if (!sk) return;
  // 밀려 있는 게 많으면 버린다 — 후반에 특수냥을 여럿 세우면 컷인만 계속 돌아 판이 안 보인다
  if (cutQueue.length >= 2) return;
  cutQueue.push({ key, lv: lv || 1, n: n || 0 });
  if (!cutBusy) nextCutIn();
}

function nextCutIn() {
  const box = $("#cutin");
  if (!box) return;
  const job = cutQueue.shift();
  if (!job) { cutBusy = false; box.classList.remove("on"); return; }
  cutBusy = true;

  const c = CATS[job.key], sk = CAT_SKILLS[job.key];
  box.style.setProperty("--sc", sk.col);
  box.innerHTML = `
    <div class="cutport"><canvas width="128" height="128"></canvas>
      ${job.lv > 1 ? `<b class="cutlv">Lv${job.lv}</b>` : ""}</div>
    <div class="cutbody">
      <span class="cutwho">${c.icon} ${c.name}</span>
      <span class="cutname">${sk.icon} ${sk.name}</span>
      <span class="cutquote">"${sk.quote}"</span>
      ${job.n ? `<span class="cuthit">${job.n}명 적중</span>` : ""}
    </div>
    <div class="cutlines"><i></i><i></i><i></i></div>`;

  // 초상화 — 판 위와 같은 스프라이트·같은 색보정을 키워서 얹는다 (없으면 아이콘으로 대신한다)
  const cv = /** @type {HTMLCanvasElement} */ (box.querySelector("canvas"));
  const art = catFrameCanvas(job.key, CATS[job.key].row, 0);
  const cg = cv.getContext("2d");
  cg.imageSmoothingEnabled = true;
  cg.imageSmoothingQuality = "high";
  if (art) cg.drawImage(art, 0, 0, 128, 128);
  else { cg.font = "72px serif"; cg.textAlign = "center"; cg.textBaseline = "middle";
         cg.fillText(c.icon, 64, 68); }

  // 애니메이션을 처음부터 다시 돌린다 — 같은 스킬이 연달아 터져도 「새로 떴다」가 보여야 한다
  box.classList.remove("on");
  void box.offsetWidth;
  box.classList.add("on");
  setTimeout(() => { box.classList.remove("on"); setTimeout(nextCutIn, 140); }, 1500);
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

  /* 전용 원화가 있으면 **그쪽을 먼저 쓴다** — 판 위·대전장·미니맵·컷인이 전부 이 함수를 거치므로,
   * 여기서 갈라 놓지 않으면 같은 냥이 화면마다 다른 얼굴로 나온다. 특수(합성) 냥타워도 이제
   * 재료 냥의 원화를 쓰므로(CAT_SHEET_SRC) 색보정으로 물들이던 시절과 달리 여기서 다 해결된다.
   * 전용 시트는 4컷이라 공용 시트의 프레임 번호(0~5)가 넘칠 수 있어 마지막 칸으로 잘라 준다. */
  if (sheetReady(key)) {
    const im = sheetOf(key), cw = sheetCellW(key), ch = sheetCellH(key);
    const cells = Math.max(1, Math.round(im.naturalWidth / cw));
    const cv = document.createElement("canvas");
    cv.width = 64; cv.height = 64;
    const cg = cv.getContext("2d");
    cg.imageSmoothingEnabled = true;
    cg.imageSmoothingQuality = "high";
    cg.drawImage(im, Math.min(frame, cells - 1) * cw, 0, cw, ch, 0, 0, 64, 64);
    catFrameCache.set(id, cv);
    return cv;
  }

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
  if (soloMode) return;   // 상대 청사 패널 자체가 없다
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
    // 내 판과 같은 원화로 그린다. 최고 레벨(승진)도 원화는 그대로고 금빛 테두리로만 갈린다.
    const spec = useSpecSheet(p.k);
    const img = spec ? null : catFrameCanvas(p.k, row, fr);
    if (p.pr) {
      g.strokeStyle = "#cda43a"; g.lineWidth = Math.max(1, cell * 0.06);
      g.strokeRect(cx - tile / 2, cy - tile / 2, tile, tile);
    }
    if (spec) {
      // 전용 시트를 쓰는 냥 — 내 판과 같은 원화. 스냅샷에는 공격 시각이 없으니 평상시 자세(0번 칸)
      const sz = tile * 1.02;
      g.drawImage(sheetOf(p.k), 0, 0, sheetCellW(p.k), sheetCellH(p.k),
                  cx - sz / 2, cy - sz / 2, sz, sz);
    } else if (img) {
      const sz = tile * 1.02;
      g.drawImage(img, cx - sz / 2, cy - sz / 2, sz, sz);
    } else {
      g.fillStyle = def.kind === "buff" ? "#f4b740" : "#5bc8e8";
      g.beginPath(); g.arc(cx, cy, cell * 0.26, 0, 7); g.fill();
    }
    // 합성 레벨 — 상대가 어디까지 모았는지가 대전 라운드 전에 알아야 할 정보다
    if ((p.lv || 1) > 1) {
      const w = cell * 0.46, h = cell * 0.3;
      g.fillStyle = "#2b2418";
      g.fillRect(cx - tile / 2, cy - tile / 2, w, h);
      g.fillStyle = "#ffd782";
      g.font = `bold ${Math.max(6, cell * 0.22)}px ui-monospace,monospace`;
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(String(p.lv), cx - tile / 2 + w / 2, cy - tile / 2 + h / 2);
      g.textBaseline = "alphabetic";
    }
  }
  // 침입자 — 실제 쥐 실루엣 그대로 (작게)
  for (const e of s.enemies) {
    const d = ENEMIES[e.t]; if (!d) continue;
    const cx = (e.x / (BAL.cellSize + BAL.cellGap)) * cell, cy = (e.y / (BAL.cellSize + BAL.cellGap)) * cell;
      g.save();
      g.translate(cx, cy);
      g.scale(cell / 64, cell / 64);
      // 상대 판은 스냅샷이라 이동 거리를 모른다 — 달리기 첫 컷으로 고정해 그린다
      const art = mobFrame(e.t, "run", 0);
      if (art) drawMobArt(g, art, 15 * (d.r / 18), false, 1, null);
      else drawRatSilhouette(g, 15 * (d.r / 18), false);
      g.restore();
    }
  g.restore();
}

/* ═══════ 스테이지 전장 원화 ═══════ */
/**
 * 스테이지(웨이브) 구간마다 판 아래에 깔리는 전장 원화가 바뀐다.
 *   1~5   아이디어 캠퍼스 · 6~10 연구 개발 단지 · 11~ 우주 기술 기지
 * pad 는 [위, 오른쪽, 아래, 왼쪽] 픽셀 — 원화마다 액자 두께가 달라서, 액자를 뺀 안쪽 타일밭에
 * 9×9 판(752px)이 앉도록 테마별로 따로 잡아 둔 값이다. 원화의 타일밭도 정확히 9×9라서,
 * 이 값이 맞으면 냥타워 한 칸이 원화의 네모 한 칸에 그대로 겹친다.
 * 냥타워 타일은 84px 간격 안의 80px짜리라, 칸의 왼쪽·위에 붙어 그려진다 —
 * 그래서 원화 격자를 판보다 2px 바깥에서 시작시켜야 타일이 네모 한가운데에 앉는다.
 *
 * 타일밭 격자는 원화의 이음매(그라우트)를 찾아 최소제곱으로 맞춘 값이다 — 바깥 테두리 선은
 * 액자와 겹쳐 안쪽으로 밀려 잡히므로, 안쪽 선 8개만 써서 시작점과 간격을 낸 뒤 양끝으로 늘렸다.
 * 눈대중으로 바깥 테두리를 재면 세로 길이가 9px쯤 짧게 잡혀, 아래쪽 줄로 갈수록 6px 넘게 어긋난다.
 *   캠퍼스   x 28.5 + 132.58k · y 125.7 + 119.02k   (1254×1254)
 *   연구단지 x 37.4 + 130.74k · y 124.1 + 118.73k   (1254×1254)
 *   우주기지 x 63.2 + 131.90k · y 114.5 + 112.80k   (1312×1199)
 */
/* 세 전장이 판을 셋으로 나눈다. 한 판이 12라운드에서 **10라운드**로 줄면서 경계도 같이 당겼다 —
 * 3/7 로 끊으면 대전 라운드(4·7·10) 직전마다 전장이 바뀌어, 「전장이 바뀌면 곧 대전」이 된다. */
const STAGE_THEMES = [
  { to: 3,        id: "idea_campus",      name: "아이디어 캠퍼스", img: "map/Idea_campus.png",      pad: [91, 23, 42, 20] },
  { to: 7,        id: "research_complex", name: "연구 개발 단지",  img: "map/research_complex.png", pad: [90, 28, 45, 26] },
  { to: Infinity, id: "space_base",       name: "우주 기술 기지",  img: "map/space_base.png",       pad: [87, 42, 54, 42] },
];
const themeForStage = (n) => STAGE_THEMES.find((t) => n <= t.to) || STAGE_THEMES[STAGE_THEMES.length - 1];
/** 지금 보여줄 스테이지 번호 — 준비 단계에서는 곧 치를 다음 웨이브의 전장을 미리 보여준다 */
const stageNo = () => !game ? 1
  : Math.min(BAL.waveCount, Math.max(1, game.phase === "prep" ? game.wave + 1 : game.wave));

let stageTheme = null;
/** 스테이지가 다음 구간으로 넘어갔으면 전장 원화를 갈아 끼운다. 매 프레임 불려도 값이 같으면 바로 빠진다. */
function applyStageTheme() {
  const th = themeForStage(stageNo());
  if (th === stageTheme) return;
  const first = !stageTheme;
  stageTheme = th;
  const a = $("#arena");
  a.style.setProperty("--map-art", `url("${th.img}")`);
  a.style.setProperty("--map-pad", th.pad.map((v) => v + "px").join(" "));
  a.dataset.stage = th.id;
  $("#mapName").textContent = th.name;
  fitArena(true);        // 원화마다 액자 두께가 달라 판 전체 크기가 바뀐다
  if (!first) log(`<b>전장 변경</b> — 라운드 ${stageNo()}부터는 <b>${th.name}</b>입니다.`);
}
/** 원화가 장당 2MB 남짓이라, 전환하는 순간 빈 판이 보이지 않도록 미리 한 장씩 받아 둔다 */
function preloadStageArt() {
  STAGE_THEMES.forEach((th, i) => setTimeout(() => { new Image().src = th.img; }, i * 4000));
}

/* ═══════ 대전 시작 ═══════ */
function beginBattle() {
  $("#lobby").classList.add("hidden");
  $("#gameRoot").classList.remove("hidden");
  document.body.classList.toggle("solo", soloMode);
  // 뒤로가기가 먹고 갈 기록을 하나 쌓아 둔다 (아래 popstate 참고)
  history.pushState({ ingame: true }, "");

  // 시드는 서버가 정해 양쪽에게 같이 내려준다 — 웨이브 구성도 증강 후보도 완전히 같아진다
  // (솔로는 맞출 상대가 없으니 시드를 비워 매번 다른 판이 나오게 둔다)
  game = new Game({ map: "complex", seed: matchSeed || undefined });
  floaters.length = 0;
  critShownAt.clear();
  errShown.clear();     // 새 판에서는 오류 보고도 새로 시작한다
  sparks = [];
  corpses = []; crumbs = [];
  shakeT = 0; shakeMag = 0;
  iReady = false; oppReady = false; oppInPrep = false;
  prepEndsAt = 0; prepSentWave = 0; oppAugs = [];
  duel = null; pendingDuelRoster = { wave: 0, roster: null }; mergeDockSig = "";
  $("#duelStage").classList.add("hidden");
  $("#duelResult").classList.add("hidden");
  document.body.classList.remove("dueling");
  stageTheme = null;        // 새 판이면 전장 원화도 1스테이지 것부터 다시 깐다
  applyStageTheme();
  preloadStageArt();
  $("#oppLabel").textContent = youAre === "p1" ? "OPPONENT (후)" : "OPPONENT (선)";
  log(soloMode
    ? `<b>솔로 플레이</b> — 상대 없이 ${BAL.waveCount}라운드를 치르고 랭킹 점수를 받습니다.`
    : `<b>1v1 대전</b> — 상대와 같은 판·같은 웨이브를 동시에 치릅니다.`);
  log(`<b>${game.map.name}</b> 방위 개시 · ${game.map.desc}`);
  if (!soloMode) log(`<b>방해 공작</b>은 종류를 고르지 않습니다 — 특허료를 내고 <b>무작위로 하나를 뽑아</b> ` +
    `상대 판에 던집니다 (웨이브 주기마다 ${BAL.sabotageDraws}회).`);
  log(`같은 종류·같은 레벨 <b>${BAL.mergeNeed}명</b>이 모이면 판 우측 상단에 <b>합성</b> 단추가 뜹니다. ` +
      `Lv${BAL.promoteLv}이 되면 <b>승진냥</b>(선글라스·샷건·방사 피해)이 됩니다.`);
  log(`<b style="color:#6fe0d0">다른 종류끼리도 합성</b>됩니다 — 처방 ${RECIPES.length}가지로 ` +
      `연쇄·정지·즉사·징수 같은 <b>특수 냥타워</b>를 만들 수 있습니다 (뽑기로는 나오지 않습니다).`);
  log(`스테이지 <b>${DUEL_WAVES.join(" · ")}</b>는 침입자 대신 <b>1:1 대전</b>입니다 — ` +
      `별도의 대전장에서 <b>내 냥타워 전부</b>가 상대 덱과 저절로 붙습니다 (누를 것 없음). ` +
      `지는 쪽은 등록원부 내구 <b>${DUEL.leakBase}</b>을 잃습니다.`);
  if (!soloMode) log(`<b>방해 공작</b>으로 상대 판에 기름·연막·정예 투입을 걸 수 있습니다 (웨이브 주기마다 종류별 1회).`);
  log(`전장은 스테이지 <b>1~5 ${STAGE_THEMES[0].name}</b> · <b>6~10 ${STAGE_THEMES[1].name}</b> · <b>11~ ${STAGE_THEMES[2].name}</b> 순으로 바뀝니다.`);
  buildBoardCells();
  buildSabotageBar();
  render();
  renderPassiveTags();
  renderAugTags();
  setInterval(loop, 1000 / 60);
}

/**
 * 개시 버튼 = 준비 신호.
 * 서버에 붙어 있으면 상대도 누를 때까지(또는 준비시간이 끝날 때까지) 실제로 시작되지 않는다.
 * 연결이 끊긴 상태에서는 예전처럼 혼자 바로 시작한다 — 아무것도 못 하게 막을 이유는 없다.
 */
$("#btnGo").addEventListener("click", () => {
  if (!canPrep()) return;
  // 서버가 없거나, 맞출 필요가 없는 웨이브(첫 스테이지 이후)라면 곧바로 시작한다
  if (!online() || !needsSync(game.wave + 1)) { doStartWave(); return; }
  iReady = !iReady;
  sendWS({ t: "ready", ready: iReady, wave: game.wave + 1 });
  log(iReady ? "<b>준비 완료</b> — 상대가 준비하면 바로 개시됩니다." : "준비를 취소했습니다.");
  renderReadyBar();
});
$("#btnSpeed").addEventListener("click", (e) => {
  if (game && game.phase === "duel") return;   // 대전 라운드에는 배속이 없다
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
    const t = /** @type {HTMLElement} */ (cv).dataset.t;
    paintBeast(/** @type {HTMLCanvasElement} */ (cv), t, null);
    // 마우스를 올린 동안만 달리기 8컷을 돌린다 — 도감에서도 어떻게 뛰어오는지 눈으로 보인다
    let raf = 0;
    cv.addEventListener("mouseenter", () => {
      if (raf) return;
      const t0 = performance.now();
      const spin = () => {
        paintBeast(/** @type {HTMLCanvasElement} */ (cv), t, Math.floor((performance.now() - t0) / 110));
        raf = requestAnimationFrame(spin);
      };
      raf = requestAnimationFrame(spin);
    });
    cv.addEventListener("mouseleave", () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      paintBeast(/** @type {HTMLCanvasElement} */ (cv), t, null);
    });
  });
}

/** 도감 초상화 한 칸. frame이 null이면 서 있는 원화, 숫자면 그 번호의 달리기 컷을 그린다. */
function paintBeast(cv, t, frame) {
  const d = ENEMIES[t];
  const ctx = cv.getContext("2d");
  const PORT = cv.width, cx = PORT / 2, cy = PORT / 2 + 6;
  ctx.clearRect(0, 0, PORT, PORT);
  ctx.beginPath(); ctx.arc(cx, cy - 4, PORT * 0.42, 0, 7);
  ctx.fillStyle = d.col + "26"; ctx.fill();
  // 초상화 칸(72px)에 맞게 반지름을 눌러 담는다 — 특허괴물(r 34)은 원화 그대로면 잘린다
  const r = Math.min(d.r, 21);
  const fr = mobFrame(t, frame === null ? "hero" : "run", frame || 0);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.globalAlpha = 0.22; ctx.fillStyle = "#0c1524";
  ctx.beginPath(); ctx.ellipse(0, r * 0.92, r * 0.5, r * 0.15, 0, 0, 7); ctx.fill();
  ctx.globalAlpha = 1;
  if (fr) drawMobArt(ctx, fr, r, false, 1, null);
  else drawRatSilhouette(ctx, r, false);
  ctx.restore();
}
renderBestiary();
// 원화는 비동기로 올라온다 — 다 올라온 뒤 도감을 한 번 더 그려야 이모지 대신 실제 그림이 남는다
for (const t in MOB_IMG) MOB_IMG[t].addEventListener("load", () => renderBestiary(), { once: true });

/* ── 도감 여닫기 ──
 * 도감은 판 패널 머릿글의 물음표에 접어 두었다. 판 위에 겹쳐 뜨는 말풍선이라
 * 열어 둔 채로도 침입자가 오는 것이 보인다.
 */
function toggleBestiary(on) {
  const pop = $("#beastPop"), btn = $("#btnBestiary");
  const open = on === undefined ? pop.classList.contains("hidden") : on;
  pop.classList.toggle("hidden", !open);
  btn.setAttribute("aria-expanded", String(open));
  if (open) placeBestiary();
}

/**
 * 도감 말풍선을 물음표 바로 아래에 놓는다.
 * 판 패널 안에 절대배치로 두면 오른쪽 칸 패널들에 덮여 가려지므로, 화면 기준(fixed)으로
 * 띄우고 자리만 여기서 잡는다 — 화면 밖으로 넘치면 안쪽으로 끌어당긴다.
 */
function placeBestiary() {
  const pop = /** @type {HTMLElement} */ ($("#beastPop"));
  const btn = $("#btnBestiary");
  if (!pop || !btn || pop.classList.contains("hidden")) return;
  const r = btn.getBoundingClientRect();
  const w = pop.offsetWidth;
  const GAP = 10, EDGE = 8;
  // 기본은 물음표에서 오른쪽 아래로. 다리(::before)가 물음표를 덮도록 살짝 왼쪽에서 시작한다.
  let left = r.left - 22;
  const flip = left + w > innerWidth - EDGE;
  if (flip) left = innerWidth - w - EDGE;   // 넘치면 화면 오른쪽 끝에 붙인다
  pop.classList.toggle("flip", flip);
  pop.style.left = `${Math.max(EDGE, left)}px`;
  pop.style.top = `${r.bottom + GAP}px`;
}
// 창이 움직이면 물음표도 움직인다 — 열려 있는 동안에는 따라간다
addEventListener("resize", placeBestiary);
addEventListener("scroll", placeBestiary, true);
/* 마우스를 얹으면 펼쳐지고 물음표·말풍선 어느 쪽에서도 벗어나면 접힌다.
 * 벗어나자마자 접으면 물음표에서 말풍선으로 건너가는 짧은 사이에 꺼져 버리므로 잠깐 여유를 둔다. */
let bestiaryHideT = 0;
function holdBestiary() { clearTimeout(bestiaryHideT); toggleBestiary(true); }
function releaseBestiary() {
  clearTimeout(bestiaryHideT);
  bestiaryHideT = setTimeout(() => toggleBestiary(false), 160);
}
// 손가락으로 쓰는 화면에는 「올려 두기」가 없다 — 거기서는 눌러서 여닫는 것만 남긴다
if (matchMedia("(hover: hover)").matches) {
  for (const el of [$("#btnBestiary"), $("#beastPop")]) {
    el.addEventListener("mouseenter", holdBestiary);
    el.addEventListener("mouseleave", releaseBestiary);
  }
} else {
  $("#btnBestiary").addEventListener("click", (e) => { e.stopPropagation(); toggleBestiary(); });
}
// 판이나 다른 패널을 누르면 알아서 접힌다 — 닫으려고 물음표를 다시 찾아갈 일은 없어야 한다
document.addEventListener("pointerdown", (e) => {
  if ($("#beastPop").classList.contains("hidden")) return;
  if (/** @type {HTMLElement} */ (e.target).closest("#beastPop, #btnBestiary")) return;
  toggleBestiary(false);
});
addEventListener("keydown", (e) => { if (e.key === "Escape") toggleBestiary(false); });

/* ═══════ 로비 ═══════ */
connectWS();
/** 솔로 플레이 — 대전용 연결을 아예 끊고 혼자 시작한다 (방/코드/준비 대기가 전부 필요 없다) */
$("#btnSolo").addEventListener("click", () => {
  if (game) return;
  soloMode = true;
  youAre = null; matchSeed = 0; oppSnapshot = null;
  if (ws) { try { ws.close(); } catch (_) {} ws = null; }
  beginBattle();
});
/**
 * 나가기 — 판을 접고 첫 화면으로 돌아간다.
 * 브라우저 뒤로가기는 이 페이지가 첫 기록이라 탭째로 닫혀 버려서, 판 안에는 나갈 길이 없었다.
 *
 * 판 하나에 걸려 있는 것이 한둘이 아니다 — 60fps 전투 루프, 선택 제한시간, 서버 연결,
 * 시신·부스러기·연출 찌꺼기. 하나씩 되돌리는 대신 판을 새로 연다.
 * 승부가 끝났을 때 뜨는 「로비로」 버튼도 같은 방식이다.
 */
$("#btnExit").addEventListener("click", () => {
  if (!game) return;
  if (!confirm(exitMsg())) return;
  location.reload();
});
const exitMsg = () => soloMode ? "솔로 플레이를 종료합니다." : "대전을 중단하고 나갑니다.";

/* ── 뒤로가기로 판이 날아가는 것 막기 ──
 * 이 페이지는 히스토리의 첫 기록이라, 판 안에서 뒤로가기를 누르면 돌아갈 곳이 없어
 * 탭이 그대로 닫혀 버렸다. 판에 들어설 때(beginBattle) 기록을 하나 쌓아 두면
 * 뒤로가기가 그 기록을 먹고 popstate 로 돌아온다 — 페이지는 살아 있고, 물어볼 틈이 생긴다.
 */
addEventListener("popstate", () => {
  if (!game) return;                        // 로비에서는 평소대로 뒤로가기가 동작한다
  history.pushState({ ingame: true }, "");  // 먹힌 기록을 도로 채운다 (안 채우면 다음 뒤로가기에 떠난다)
  if (confirm(exitMsg())) location.reload();
});
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
