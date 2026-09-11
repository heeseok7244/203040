// @ts-check
/**
 * 도감 초상화 원화(mob{n}_info.png) → 게임용 투명 초상화(mob-{종류}-info.png).
 *
 *   node tools/cut-info-portrait.js [원화폴더] [출력폴더]
 *   (기본값: public/img/src → public/img/game)
 *
 * 원화는 흰 배경에 정면 쥐 한 마리가 그려진 정사각형(1254×1254)이다. 여기서
 *   1. 배경을 지워 투명하게 만들고 (sprite.js cutout — 테두리에서 번져 들어가며 지운다),
 *   2. 쥐가 남은 영역만 여백을 조금 둔 정사각형으로 오려낸 뒤,
 *   3. 도감 칸(72px)의 고해상도 화면 몫까지 감안한 SIZE 로 줄인다.
 *
 * 침입자 도감(game.js renderBestiary / paintBeast)이 이 그림을 그대로 칸에 맞춰 그린다 —
 * 달리기 시트(mob{n}.png)와는 무관하다.
 */
const path = require("path");
const { decode, encode } = require("./png");
const { cutout, bbox } = require("./sprite");

const IN = process.argv[2] || path.join(__dirname, "../public/img/src");
const OUT = process.argv[3] || path.join(__dirname, "../public/img/game");

/** 1단계→copy, 2단계→fast, 3단계→tank, 4단계→boss */
const TYPES = ["copy", "fast", "tank", "boss"];
const SIZE = 192;      // 출력 한 변 — 도감 칸 72px 의 2.5배쯤이면 고해상도 화면에서도 흐리지 않다
const PAD = 0.06;      // 쥐 둘레에 남기는 여백 (긴 변 기준 비율)

/** 영역 평균 축소 — 목표 픽셀 하나가 덮는 원본 픽셀들을 알파 가중으로 평균 낸다 (cut-die-sheet.js 와 같다) */
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

/** 정사각형 [x,y,side] 구간을 떼어 낸다 — 원본 밖은 투명으로 남는다 */
function cropSquare(img, x0, y0, side) {
  const out = { w: side, h: side, data: Buffer.alloc(side * side * 4) };
  for (let y = 0; y < side; y++) {
    const sy = y0 + y; if (sy < 0 || sy >= img.h) continue;
    const a = Math.max(0, x0), b = Math.min(img.w, x0 + side);
    if (b <= a) continue;
    img.data.copy(out.data, (y * side + (a - x0)) * 4, (sy * img.w + a) * 4, (sy * img.w + b) * 4);
  }
  return out;
}

TYPES.forEach((t, i) => {
  const n = i + 1;
  const src = decode(path.join(IN, `mob${n}_info.png`));
  const cut = cutout(src);
  const box = bbox(cut);
  if (!box) throw new Error(`mob${n}_info.png — 배경을 지우고 나니 그림이 남지 않았습니다`);

  // 쥐를 가운데 두는 정사각형 — 긴 변에 여백을 더해 한 변으로 삼는다
  const bw = box.x1 - box.x0 + 1, bh = box.y1 - box.y0 + 1;
  const side = Math.round(Math.max(bw, bh) * (1 + PAD * 2));
  const x0 = Math.round((box.x0 + box.x1) / 2 - side / 2), y0 = Math.round((box.y0 + box.y1) / 2 - side / 2);
  const sq = cropSquare(cut, x0, y0, side);
  const out = resize(sq, SIZE / side);
  encode(out, path.join(OUT, `mob-${t}-info.png`));
  console.log(`${n}단계 → mob-${t}-info.png\t쥐 ${bw}×${bh}\t오려낸 변 ${side}\t→ ${out.w}×${out.h}`);
});
