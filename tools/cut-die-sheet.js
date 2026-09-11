// @ts-check
/**
 * 사망 3컷 원화(mob{n}_die.png) → 게임용 투명 스트립(mob-{종류}-die.png).
 *
 *   node tools/cut-die-sheet.js [원화폴더] [출력폴더]
 *   (기본값: public/img/src → public/img/game. 키를 맞출 달리기 시트 mob{n}.png 는 늘 public/img/game 에서 읽는다)
 *
 * 원화는 흰 배경에 컷 3장이 가로로 놓인 한 장(2172×724)이다. 여기서
 *   1. 배경을 지워 투명하게 만들고 (sprite.js cutout — 테두리에서 번져 들어가며 지운다),
 *   2. 세로 알파 합으로 3컷을 가른 뒤,
 *   3. 달리기 시트(mob{n}.png)의 정면 쥐와 키가 같아지도록 축소하고,
 *   4. 달리기 시트와 같은 칸 너비(1254÷4)로, 바닥선을 공유하는 가로 스트립을 만든다.
 *
 * 3·4 때문에 사망 컷과 달리기 컷이 게임 안에서 같은 크기로 보인다 — drawMobArt 는 칸 크기 기준으로
 * 그리므로, 칸 안에서 쥐가 차지하는 비율이 같아야 쓰러지는 순간 크기가 튀지 않는다.
 * 첫 컷(움찔)이 정면으로 서 있는 자세라 달리기 시트 ↓ 줄의 키와 맞춘다.
 *
 * 출력은 옛 스타일시트에서 뽑던 mob-{종류}-die.png 를 그대로 덮어쓴다 — 게임 코드(MOB_ANIM.die)는 그대로다.
 */
const path = require("path");
const { decode, encode } = require("./png");
const { cutout, bbox, clusters } = require("./sprite");

const IN = process.argv[2] || path.join(__dirname, "../public/img/src");
const OUT = process.argv[3] || path.join(__dirname, "../public/img/game");
/** 달리기 시트가 있는 곳 — 사망 컷의 키·칸 너비를 여기 맞춘다 */
const RUN_DIR = path.join(__dirname, "../public/img/game");

/** 1단계→copy, 2단계→fast, 3단계→tank, 4단계→boss */
const TYPES = ["copy", "fast", "tank", "boss"];
const N = 3;                 // 사망 컷 수
const RUN_COLS = 4, RUN_ROWS = 4, RUN_FRONT_ROW = 1;   // 달리기 시트 격자와 정면(↓) 줄

/** 알파가 있는 가로 띠들 — 달리기 시트의 줄을 찾는다 (game.js sheetCells 와 같은 방법) */
function rowBands(img) {
  const has = new Uint8Array(img.h);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (img.data[(y * img.w + x) * 4 + 3] > 20) { has[y] = 1; break; }
  }
  const out = []; let s = -1;
  for (let y = 0; y < img.h; y++) {
    if (has[y] && s < 0) s = y;
    if (!has[y] && s >= 0) { out.push([s, y - 1]); s = -1; }
  }
  if (s >= 0) out.push([s, img.h - 1]);
  return out;
}

/** 영역 평균 축소 — 목표 픽셀 하나가 덮는 원본 픽셀들을 알파 가중으로 평균 낸다 (외곽선이 깨지지 않는다) */
function resize(img, s) {
  const w = Math.max(1, Math.round(img.w * s)), h = Math.max(1, Math.round(img.h * s));
  const out = { w, h, data: Buffer.alloc(w * h * 4) };
  for (let y = 0; y < h; y++) {
    const y0 = y / s, y1 = (y + 1) / s;
    for (let x = 0; x < w; x++) {
      const x0 = x / s, x1 = (x + 1) / s;
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = Math.floor(y0); sy < Math.min(img.h, Math.ceil(y1)); sy++) {
        for (let sx = Math.floor(x0); sx < Math.min(img.w, Math.ceil(x1)); sx++) {
          const i = (sy * img.w + sx) * 4, pa = img.data[i + 3];
          r += img.data[i] * pa; g += img.data[i + 1] * pa; b += img.data[i + 2] * pa; a += pa; n++;
        }
      }
      const o = (y * w + x) * 4;
      if (a > 0) { out.data[o] = r / a; out.data[o + 1] = g / a; out.data[o + 2] = b / a; }
      out.data[o + 3] = n ? a / n : 0;
    }
  }
  return out;
}

TYPES.forEach((t, i) => {
  const n = i + 1;
  const run = decode(path.join(RUN_DIR, `mob${n}.png`));
  const src = decode(path.join(IN, `mob${n}_die.png`));

  const cut = cutout(src);
  const cs = clusters(cut, N);
  const box = bbox(cut);
  if (!box || cs.length !== N) throw new Error(`mob${n}_die.png — 컷 ${N}개로 못 갈랐습니다`);

  // 첫 컷(정면으로 서 있음)의 키를 달리기 시트 정면 줄의 키에 맞춘다
  const c0 = bbox({ w: cs[0][1] - cs[0][0] + 1, h: cut.h, data: cropRaw(cut, cs[0][0], cs[0][1]) });
  const bands = rowBands(run);
  if (bands.length !== RUN_ROWS) throw new Error(`mob${n}.png — 줄이 ${bands.length}개 (${RUN_ROWS}개여야 함)`);
  const runH = bands[RUN_FRONT_ROW][1] - bands[RUN_FRONT_ROW][0] + 1;
  const s = runH / (c0.y1 - c0.y0 + 1);

  const small = resize(cut, s);
  const sb = bbox(small);
  const cellW = Math.round(run.w / RUN_COLS);
  const cellH = sb.y1 - sb.y0 + 1 + 8;
  const out = { w: cellW * N, h: cellH, data: Buffer.alloc(cellW * N * cellH * 4) };
  cs.forEach(([a, b], k) => {
    // 컷마다 가로는 그 컷의 가운데, 세로는 전체 바닥선(sb.y1)을 공유한다 — 쓰러지며 낮아지는 건 그림이 갖고 있다
    const sub = { w: Math.round((b - a + 1) * s), h: small.h,
      data: cropRaw(small, Math.round(a * s), Math.round(b * s)) };
    const bb = bbox(sub);
    const cx = Math.round(a * s) + (bb.x0 + bb.x1) / 2;
    const sx = Math.round(cx - cellW / 2), sy = sb.y1 + 4 - cellH + 1;
    for (let y = 0; y < cellH; y++) for (let x = 0; x < cellW; x++) {
      const px = sx + x, py = sy + y;
      if (px < 0 || px >= small.w || py < 0 || py >= small.h) continue;
      small.data.copy(out.data, ((y * out.w) + k * cellW + x) * 4, (py * small.w + px) * 4, (py * small.w + px) * 4 + 4);
    }
  });
  encode(out, path.join(OUT, `mob-${t}-die.png`));
  console.log(`${n}단계 → mob-${t}-die.png\t축소 ×${s.toFixed(3)}\t셀 ${cellW}×${cellH}`);
});

/** 세로 전체 · 가로 [x0, x1] 구간만 떼어 낸 픽셀 버퍼 */
function cropRaw(img, x0, x1) {
  const w = x1 - x0 + 1, buf = Buffer.alloc(w * img.h * 4);
  for (let y = 0; y < img.h; y++) img.data.copy(buf, y * w * 4, (y * img.w + x0) * 4, (y * img.w + x0 + w) * 4);
  return buf;
}
