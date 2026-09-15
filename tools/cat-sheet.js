// @ts-check
/**
 * 냥 스타일시트(가로 N컷) → 게임용 프레임 스트립. 모션별 도구가 같이 쓰는 몸통이다.
 *
 *   node tools/cut-cat-sheet.js        공격 모션  cat_N.png    → cat_attackN.png
 *   node tools/cut-cat-jump-sheet.js   점프 모션  catN_jump.png → cat_jumpN.png
 *
 * 시트에는 같은 고양이가 여러 자세로 늘어서 있다 (흰 배경이어도 되고, 이미 배경을 지운
 * 투명 PNG 여도 된다 — 아래 alreadyCut 참고). 컷을 순서대로 재생하면 한 모션이 된다.
 *
 * 컷은 모두 **같은 배율**로 줄여 셀 가로 가운데에 놓는다. 세로 맞춤은 모션마다 다르다
 * (MOTIONS 의 align 참고) — 제자리 공격은 발끝을 같은 바닥선에, 점프는 시트의 높이차를
 * 그대로 살린다.
 *
 * 시트를 새로 뽑았다면 아래 상수와 MOTIONS 만 다시 보면 된다.
 * PNG 읽기·쓰기는 png.js, 배경 지우기는 sprite.js 가 맡는다.
 */
const fs = require("fs");
const path = require("path");
const { decode, encode } = require("./png");
const { cutout } = require("./sprite");

/** 원화는 public/img/src, 구운 게임용 시트는 public/img/game 에 둔다 */
const SRC_DIR = path.join(__dirname, "../public/img/src");
const OUT_DIR = path.join(__dirname, "../public/img/game");
/** 인자를 안 주면 이 번호들 중 원화가 있는 것을 전부 굽는다 */
const ALL = [1, 2, 3, 4, 5, 6];

/* ═══════ 모션 ═══════ */

/**
 * 모션별 짝과 세로 맞춤.
 *
 * `n`     컷 수 — 시트가 이 개수로 갈리지 않으면 굽지 않고 알려 준다.
 * `align` 세로 맞춤.
 *   - `"base"`  컷마다 발끝을 공통 바닥선(BASE)에 맞춘다. 컷마다 몸높이가 달라도
 *              (2컷은 납작하게 웅크린다) 발이 뜨거나 가라앉지 않는다 — 제자리 모션이라
 *              바닥선이 흔들리면 바로 눈에 띈다.
 *   - `"sheet"` 시트에서의 높이차를 배율만 맞춰 그대로 옮긴다. 가장 낮은 컷의 발끝이
 *              바닥선에 놓이고 나머지는 그만큼 떠 있다. **점프는 이쪽이어야 한다** —
 *              발끝을 전부 바닥선에 맞춰 버리면 도약 자체가 사라져 제자리 뜀박질이 된다.
 * `src`   원화 파일명, `out` 게임용 시트 파일명 (번호 → 이름).
 * `num`   원화 파일명에서 번호를 읽는 규칙 — 시트 하나만 구울 때 출력 이름을 짐작하는 데 쓴다.
 */
const MOTIONS = {
  attack: {
    n: 4,
    align: "base",
    src: (i) => `cat_${i}.png`,
    out: (i) => `cat_attack${i}.png`,
    num: /^cat_(\d+)\.png$/i,
  },
  jump: {
    n: 4,
    align: "sheet",
    src: (i) => `cat${i}_jump.png`,
    out: (i) => `cat_jump${i}.png`,
    num: /^cat(\d+)_jump\.png$/i,
  },
};

/* ═══════ 시트 좌표 — 시트를 새로 뽑으면 여기만 다시 잰다 ═══════ */

/**
 * 한 칸의 크기(px) — 모든 냥이 모든 모션에서 같은 값으로 구워진다.
 *
 * 판 위 냥타워는 64px 로 보이지만 시트는 그보다 크게 굽는다 — 64px 셀에 맞추면 컷이 0.38배로
 * 줄어들어, 배율 200% 화면에서 다시 늘릴 디테일이 남지 않는다. 픽셀아트가 아니라 부드러운
 * 일러스트라 그 상태로 확대하면 외곽선이 거칠어진다.
 *
 * 160 은 배율 200% 화면(64×2=128)을 덮고도 남으면서, 원화 cat_1.png 를 **확대하지 않는**
 * 최대치다 — 그 시트의 한 컷이 157×154 이라 배율 0.94 로 줄이기만 하면 된다.
 * 원화가 이보다 크면 그냥 더 많이 줄어들 뿐이라 그대로 두면 되고, 반대로 더 작으면
 * 없는 디테일을 늘리게 되므로 아래에서 경고를 띄운다.
 *
 * **모든 냥이 같은 CELL 을 쓰는 것이 중요하다** — 종류마다 셀이 다르면 판 위에서 냥마다
 * 크기가 달라 보인다. 모션끼리도 같아야 한다 — 공격 시트와 점프 시트의 셀이 다르면
 * 모션이 바뀌는 순간 냥이 커지거나 작아진다. 아래 FIT/BASE 도 64 셀 때와 같은 비율이라
 * 칸 안의 배치(가운데 정렬·공통 바닥선)는 예전 그대로다.
 */
const CELL = 160;
/** 셀 안에서 그림이 차지할 최대 크기 (가로, 세로) — 64 셀의 60/58 과 같은 비율 */
const FIT_W = 150, FIT_H = 145;
/** 발끝이 놓일 바닥선 (셀 위에서부터 px) */
const BASE = 155;
/** 세로 잉크 합이 이 값을 넘는 열만 그림으로 본다 — 배경 지우고 남은 옅은 얼룩을 걸러 낸다 */
const INK_GAP = 20;
/** 컷 하나의 최소 너비 — 이보다 좁은 덩어리는 얼룩으로 보고 버린다 */
const MIN_W = 60;
/** 컷 경계 상자를 잡을 때의 알파 문턱 */
const ALPHA = 24;
/** 한 줄(또는 한 칸)이 그림으로 인정받는 데 필요한 잉크 픽셀 수 — 떨어져 나온 점을 무시한다 */
const MIN_INK = 3;
/**
 * 배경을 지우고도 남는 옅은 잔상을 걷어 낼 알파 바닥.
 * 이 시트는 흰 배경에 흰 고양이라 경계가 애매해서, 배경 쪽에 알파가 6% 안팎으로 남는다.
 * 그냥 두면 종이 판 위에 캐릭터를 감싼 네모난 자국이 비친다.
 * 잘라 내기만 하면 테두리가 거칠어지므로, 바닥을 빼고 다시 펴서 경사는 살린다.
 */
const ALPHA_FLOOR = 48;

/* ═══════ 컷 나누기 ═══════ */

/** 세로 줄별 알파 합으로 한 줄을 컷 n개로 가른다 (좁은 얼룩은 버린다) */
function columns(img, n) {
  const col = new Float64Array(img.w);
  for (let x = 0; x < img.w; x++) {
    let s = 0;
    for (let y = 0; y < img.h; y++) s += img.data[(y * img.w + x) * 4 + 3];
    col[x] = s / 255;
  }
  const runs = [];
  let st = -1;
  for (let x = 0; x <= img.w; x++) {
    const on = x < img.w && col[x] > INK_GAP;
    if (on && st < 0) st = x;
    else if (!on && st >= 0) { if (x - st >= MIN_W) runs.push([st, x - 1]); st = -1; }
  }
  if (runs.length !== n) {
    throw new Error(`컷이 ${runs.length}개로 갈렸습니다 (기대 ${n}) — INK_GAP/MIN_W 를 다시 보세요`);
  }
  return runs;
}

/**
 * 주어진 x 범위 안에서 그림이 실제로 놓인 경계 상자.
 *
 * 픽셀 하나로 판단하지 않고 줄·칸마다 잉크 수를 세어 MIN_INK 이상인 곳만 그림으로 본다.
 * 시트에는 그림에서 떨어진 점 하나가 남아 있는 경우가 있는데(3컷 아래쪽),
 * 그걸 그림으로 세면 상자가 통째로 늘어나 그 컷만 위로 떠 버린다 — 바닥선이 어긋나는 원인이다.
 */
function boxOf(img, a, b) {
  const ink = (x, y) => img.data[(y * img.w + x) * 4 + 3] > ALPHA;
  let x0 = -1, y0 = -1, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) {
    let n = 0;
    for (let x = a; x <= b; x++) if (ink(x, y)) n++;
    if (n >= MIN_INK) { if (y0 < 0) y0 = y; y1 = y; }
  }
  for (let x = a; x <= b; x++) {
    let n = 0;
    for (let y = 0; y < img.h; y++) if (ink(x, y)) n++;
    if (n >= MIN_INK) { if (x0 < 0) x0 = x; x1 = x; }
  }
  if (x1 < 0 || y1 < 0) throw new Error("빈 컷입니다");
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * 원본의 box 영역을 dw×dh 로 줄여 out 의 (dx,dy) 에 얹는다.
 * 색은 알파를 곱해 평균 낸 뒤 되돌린다 — 그냥 평균 내면 투명한 바깥쪽의 흰색이
 * 섞여 들어와 검은 테두리가 하얗게 바랜다.
 */
function blit(src, box, out, dx, dy, dw, dh) {
  const sw = box.w / dw, sh = box.h / dh;
  for (let j = 0; j < dh; j++) {
    const ya = box.y0 + j * sh, yb = box.y0 + (j + 1) * sh;
    for (let i = 0; i < dw; i++) {
      const xa = box.x0 + i * sw, xb = box.x0 + (i + 1) * sw;
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let y = Math.floor(ya); y < Math.ceil(yb); y++) {
        if (y < 0 || y >= src.h) continue;
        for (let x = Math.floor(xa); x < Math.ceil(xb); x++) {
          if (x < 0 || x >= src.w) continue;
          const p = (y * src.w + x) * 4, al = src.data[p + 3] / 255;
          r += src.data[p] * al; g += src.data[p + 1] * al; b += src.data[p + 2] * al;
          a += al; n++;
        }
      }
      if (!n || a <= 0) continue;
      const q = ((dy + j) * out.w + (dx + i)) * 4;
      out.data[q] = Math.round(r / a);
      out.data[q + 1] = Math.round(g / a);
      out.data[q + 2] = Math.round(b / a);
      out.data[q + 3] = Math.round((a / n) * 255);
    }
  }
}

/** 알파 바닥 아래를 0으로 눌러 잔상을 걷고, 남은 구간을 0~255 로 다시 편다 */
function deflare(img) {
  for (let i = 3; i < img.data.length; i += 4) {
    const a = img.data[i];
    img.data[i] = a <= ALPHA_FLOOR ? 0 : Math.round(((a - ALPHA_FLOOR) / (255 - ALPHA_FLOOR)) * 255);
  }
  return img;
}

/**
 * 원화가 이미 배경을 지운 투명 PNG인가 — 테두리 한 바퀴가 전부 투명하면 그렇게 본다.
 *
 * 이런 시트에는 cutout 을 걸면 안 된다. cutout 은 **테두리 픽셀의 색**을 배경색으로 잡고
 * 거기서 번져 들어가며 비슷한 색을 지우는데, 투명한 픽셀의 RGB 는 보통 0,0,0 이라
 * 「배경은 검정」으로 읽힌다 — 검은 냥(cat_3) 이 통째로 파먹히는 사고가 여기서 난다.
 *
 * **deflare 는 건너뛰지 않는다.** 잔상을 걷어 내는 일 말고도 남은 알파를 0~255 로 다시 펴는
 * 일을 같이 하는데, cat_1.png 처럼 전체가 반투명한(최대 알파 240) 원화는 이걸 빼면 냥이
 * 통째로 희미해진다.
 */
function alreadyCut(img) {
  const a = (x, y) => img.data[(y * img.w + x) * 4 + 3];
  for (let x = 0; x < img.w; x++) if (a(x, 0) > 8 || a(x, img.h - 1) > 8) return false;
  for (let y = 0; y < img.h; y++) if (a(0, y) > 8 || a(img.w - 1, y) > 8) return false;
  return true;
}

/* ═══════ 굽기 ═══════ */

/** 시트 한 장을 모션 규칙대로 구워 out_ 에 쓴다 */
function bake(src, out_, motion) {
  const { n, align } = motion;
  const raw = decode(src);
  const clean = alreadyCut(raw);
  const cut = deflare(clean ? raw : cutout(raw));
  const boxes = columns(cut, n).map(([a, b]) => boxOf(cut, a, b));

  // 컷 전부가 같은 배율을 쓴다 — 가장 넓은 컷과, 모션이 세로로 차지하는 폭이 셀 안에 들어가는 배율.
  // align:"base" 는 컷을 각자 바닥선에 앉히므로 가장 높은 컷만 보면 되지만,
  // align:"sheet" 는 뜬 컷까지 한 셀에 담아야 하므로 컷 전체를 아우르는 높이로 잡는다.
  const maxW = Math.max(...boxes.map((b) => b.w));
  const top = Math.min(...boxes.map((b) => b.y0));
  const floor = Math.max(...boxes.map((b) => b.y1));
  const spanH = align === "sheet" ? floor - top + 1 : Math.max(...boxes.map((b) => b.h));
  const scale = Math.min(FIT_W / maxW, FIT_H / spanH);

  const out = { w: CELL * n, h: CELL, data: Buffer.alloc(CELL * n * CELL * 4) };
  boxes.forEach((box, i) => {
    const dw = Math.max(1, Math.round(box.w * scale));
    const dh = Math.max(1, Math.round(box.h * scale));
    const dx = i * CELL + Math.round((CELL - dw) / 2);        // 가로는 컷마다 가운데로
    const lift = align === "sheet" ? Math.round((floor - box.y1) * scale) : 0;
    const dy = BASE - lift - dh;                              // 세로는 발끝을 바닥선에서 lift 만큼 띄워
    blit(cut, box, out, dx, dy, dw, dh);
    console.log(`  ${i + 1}컷\t원본 ${box.w}×${box.h} @x${box.x0}\t→ ${dw}×${dh} @(${dx - i * CELL},${dy})` +
                (lift ? `\t↑${lift}` : ""));
  });

  encode(out, out_);
  console.log(`${path.basename(src)} → ${path.basename(out_)}\t${out.w}×${out.h}` +
              ` (${CELL}px × ${n}컷, 배율 ${scale.toFixed(3)}${clean ? ", 배경 이미 지워짐" : ""})`);
  if (scale > 1) {
    console.log(`  ⚠ 원화가 셀보다 작아 ${scale.toFixed(2)}배로 늘렸습니다 — 외곽선이 흐려질 수 있습니다.`);
  }
}

/**
 * 원화 이름에서 번호를 읽어 게임용 시트 이름을 짐작한다.
 * 이름이 규칙과 다르면 1번으로 본다 — 시트 하나만 손으로 굽는 자리라 출력 경로를
 * 직접 줄 수도 있다.
 */
function defaultOut(src, motion) {
  const m = motion.num.exec(path.basename(src));
  return path.join(OUT_DIR, motion.out(m ? m[1] : 1));
}

/**
 * 원화가 있는 번호를 전부 굽는다 — 냥을 한 종류 추가할 때마다 손댈 곳이 없다.
 *
 * 한 장이 실패해도 멈추지 않는다. 여섯 장을 한 번에 굽는 자리라, 세 번째에서 터져 나머지
 * 세 장이 안 구워지면 무엇이 되고 무엇이 안 됐는지 알 수 없다 — 실패한 것만 모아서 끝에 알린다.
 */
function bakeAll(motion) {
  let n = 0;
  const failed = [];
  for (const i of ALL) {
    const name = motion.src(i);
    const src = path.join(SRC_DIR, name);
    if (!fs.existsSync(src)) { console.log(`${name}\t없음 — 건너뜁니다`); continue; }
    try {
      bake(src, path.join(OUT_DIR, motion.out(i)), motion);
      n++;
    } catch (e) {
      console.log(`${name}\t❌ ${e.message}`);
      failed.push(name);
    }
  }
  console.log(`\n${n}장 구웠습니다.` + (failed.length ? ` (실패: ${failed.join(", ")})` : ""));
  if (failed.length) process.exitCode = 1;
}

/** 도구 하나의 명령줄 처리 — 인자가 있으면 한 장만, 없으면 전부 굽는다 */
function main(motion) {
  if (process.argv[2]) bake(process.argv[2], process.argv[3] || defaultOut(process.argv[2], motion), motion);
  else bakeAll(motion);
}

module.exports = { MOTIONS, CELL, bake, bakeAll, defaultOut, main };
