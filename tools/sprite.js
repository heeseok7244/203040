// @ts-check
/**
 * 스타일시트에서 스프라이트를 잘라 낼 때 쓰는 공통 도구.
 *
 * 카드 배경과 바닥 그림자를 지워 투명 PNG로 만들고(cutout), 한 줄에 늘어선 컷을
 * 같은 크기·같은 바닥선의 가로 스트립으로 묶는다(strip).
 * cut-mouse-sheet.js(원화·달리기·사망 시트)와 cut-run-sheet.js(달리기 8컷 시트)가 같이 쓴다.
 */

const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const chroma = (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b);

/** 테두리 픽셀의 중앙값 = 카드 배경색 */
function borderBg(img) {
  const rs = [], gs = [], bs = [];
  const take = (x, y) => {
    const i = (y * img.w + x) * 4;
    rs.push(img.data[i]); gs.push(img.data[i + 1]); bs.push(img.data[i + 2]);
  };
  for (let x = 0; x < img.w; x++) { take(x, 0); take(x, img.h - 1); }
  for (let y = 0; y < img.h; y++) { take(0, y); take(img.w - 1, y); }
  const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];
  return [med(rs), med(gs), med(bs)];
}

/**
 * 배경다움 점수 0~1.
 * 배경색과 가까우면 1이고, 색이 옅으면서 밝은 회색(= 바닥에 깔린 그림자)도 1에 가깝게 본다.
 * 캐릭터 안쪽의 밝은 배(크림색)도 점수는 높지만, 바깥에서 흘러 들어갈 수 없으므로 지워지지 않는다.
 */
function bgScore(r, g, b, bg, bgL) {
  const d = Math.hypot(r - bg[0], g - bg[1], b - bg[2]);
  const base = Math.min(1, Math.max(0, 1 - (d - 16) / 28));
  let sh = 0;
  if (chroma(r, g, b) < 30) {
    const L = lum(r, g, b);
    sh = Math.min(1, Math.max(0, (L - bgL * 0.70) / (bgL * 0.20)));
  }
  return Math.max(base, sh * 0.96);
}

/** 테두리에서 번져 들어가며 배경/그림자만 지운다. 경계는 반투명으로 남겨 부드럽게 만든다. */
function cutout(img) {
  const bg = borderBg(img);
  const bgL = lum(bg[0], bg[1], bg[2]);
  const n = img.w * img.h;
  const score = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    score[i] = bgScore(img.data[p], img.data[p + 1], img.data[p + 2], bg, bgL);
  }
  const outside = new Uint8Array(n);
  const stack = [];
  const push = (x, y) => {
    const i = y * img.w + x;
    if (!outside[i] && score[i] >= 0.30) { outside[i] = 1; stack.push(i); }
  };
  for (let x = 0; x < img.w; x++) { push(x, 0); push(x, img.h - 1); }
  for (let y = 0; y < img.h; y++) { push(0, y); push(img.w - 1, y); }
  while (stack.length) {
    const i = stack.pop(), x = i % img.w, y = (i / img.w) | 0;
    if (x > 0) push(x - 1, y);
    if (x < img.w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < img.h - 1) push(x, y + 1);
  }
  const out = Buffer.from(img.data);
  for (let i = 0; i < n; i++) {
    if (!outside[i]) continue;
    out[i * 4 + 3] = Math.round(Math.min(1, Math.max(0, (1 - score[i]) / 0.70)) * 255);
  }
  return { w: img.w, h: img.h, data: out };
}

/** 알파가 남은 영역의 경계 상자 */
function bbox(img, thr = 14) {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (img.data[(y * img.w + x) * 4 + 3] > thr) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** 세로 줄별 알파 합으로 한 줄을 컷 n개로 가른다 */
function clusters(img, n) {
  const col = new Float64Array(img.w);
  for (let x = 0; x < img.w; x++) {
    let s = 0;
    for (let y = 0; y < img.h; y++) s += img.data[(y * img.w + x) * 4 + 3];
    col[x] = s / 255;
  }
  // 빈칸 기준을 조금씩 올려 가며 정확히 n덩어리로 갈라지는 지점을 찾는다
  for (const gap of [0.4, 0.8, 1.2, 1.8, 2.6, 3.5, 5]) {
    const cs = [];
    let st = -1;
    for (let x = 0; x <= img.w; x++) {
      const on = x < img.w && col[x] > gap;
      if (on && st < 0) st = x;
      else if (!on && st >= 0) { if (x - st > 8) cs.push([st, x - 1]); st = -1; }
    }
    if (cs.length === n) return cs;
  }
  // 끝내 못 가르면 균등 분할로 되돌린다
  return Array.from({ length: n }, (_, i) =>
    [Math.round((img.w * i) / n), Math.round((img.w * (i + 1)) / n) - 1]);
}

/** 잘라낸 한 줄을 균일한 셀의 가로 스트립으로 만든다 */
function strip(band, n) {
  const cut = cutout(band);
  const cs = clusters(cut, n);
  const box = bbox(cut);
  if (!box) throw new Error("빈 줄입니다 — 섹션 y 좌표를 다시 확인하세요");
  const cw = Math.max(...cs.map(([a, b]) => b - a + 1)) + 8;   // 가장 넓은 컷 + 여백
  const ch = box.y1 - box.y0 + 1 + 4;
  const out = { w: cw * n, h: ch, data: Buffer.alloc(cw * n * ch * 4) };
  cs.forEach(([a, b], i) => {
    const sx = Math.round((a + b) / 2 - cw / 2);   // 가로만 가운데 정렬 — 세로는 시트 그대로 둔다
    const sy = box.y0 - 2;                          // 컷 전부가 같은 바닥선을 쓴다
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const px = sx + x, py = sy + y;
        if (px < 0 || px >= cut.w || py < 0 || py >= cut.h) continue;
        cut.data.copy(out.data, ((y * out.w) + i * cw + x) * 4,
          (py * cut.w + px) * 4, (py * cut.w + px) * 4 + 4);
      }
    }
  });
  return { img: out, cell: cw };
}

module.exports = { lum, chroma, borderBg, cutout, bbox, clusters, strip };
