// @ts-check
/**
 * 냥 스타일시트(가로 4컷) → 게임용 64×64 4프레임 스트립.
 *
 *   node tools/cut-cat-sheet.js [시트경로] [출력경로]
 *   (기본값: public/img/cat_1.png → public/img/cat-spec.png)
 *
 * 시트는 흰 배경에 같은 고양이가 네 자세로 늘어서 있다.
 * 1컷이 평상시 자세이고, 네 컷을 순서대로 재생하면 공격 모션이 된다 (web/sprite.js 참고).
 *
 * 네 컷은 **같은 배율**로 줄여 셀 가로 가운데에 놓고, 발끝을 **같은 바닥선(BASE)** 에 맞춘다.
 * 컷마다 몸높이가 다르지만(2컷은 납작하게 웅크린다) 이렇게 맞춰야 프레임이 넘어가도
 * 발이 뜨거나 가라앉지 않는다 — 제자리 공격 모션이라 바닥선이 흔들리면 바로 눈에 띈다.
 *
 * 시트를 새로 뽑았다면 아래 상수만 다시 보면 된다.
 * PNG 읽기·쓰기는 png.js, 배경 지우기는 sprite.js 가 맡는다.
 */
const path = require("path");
const { decode, encode } = require("./png");
const { cutout } = require("./sprite");

/* ═══════ 시트 좌표 — 시트를 새로 뽑으면 여기만 다시 잰다 ═══════ */

const SRC = process.argv[2] || path.join(__dirname, "../public/img/cat_1.png");
const OUT = process.argv[3] || path.join(__dirname, "../public/img/cat-spec.png");

/** 컷 수 */
const N = 4;
/** 한 칸의 크기(px) — 판 위 냥타워 캔버스와 같은 64 */
const CELL = 64;
/** 셀 안에서 그림이 차지할 최대 크기 (가로, 세로) */
const FIT_W = 60, FIT_H = 58;
/** 발끝이 놓일 바닥선 (셀 위에서부터 px) */
const BASE = 62;
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

/* ═══════ 실행 ═══════ */

const cut = deflare(cutout(decode(SRC)));
const boxes = columns(cut, N).map(([a, b]) => boxOf(cut, a, b));

// 네 컷이 같은 배율을 쓴다 — 가장 넓고 가장 높은 컷이 셀 안에 들어가는 배율로 맞춘다
const maxW = Math.max(...boxes.map((b) => b.w));
const maxH = Math.max(...boxes.map((b) => b.h));
const scale = Math.min(FIT_W / maxW, FIT_H / maxH);

const out = { w: CELL * N, h: CELL, data: Buffer.alloc(CELL * N * CELL * 4) };
boxes.forEach((box, i) => {
  const dw = Math.max(1, Math.round(box.w * scale));
  const dh = Math.max(1, Math.round(box.h * scale));
  const dx = i * CELL + Math.round((CELL - dw) / 2);   // 가로는 컷마다 가운데로
  const dy = BASE - dh;                                 // 세로는 발끝을 공통 바닥선에
  blit(cut, box, out, dx, dy, dw, dh);
  console.log(`${i + 1}컷\t원본 ${box.w}×${box.h} @x${box.x0}\t→ ${dw}×${dh} @(${dx - i * CELL},${dy})`);
});

encode(out, OUT);
console.log(`${path.basename(SRC)} → ${path.basename(OUT)}\t${out.w}×${out.h} (${CELL}px × ${N}컷, 배율 ${scale.toFixed(3)})`);
