/**
 * 전장 원화(img/src/map*.png)를 게임 액자 규격에 맞춰 손질한다.
 *   node tools/fit-map-art.js public/img/src/map1_idea_campus.png public/map/Idea_campus.png
 *   node tools/fit-map-art.js public/map/space_base.png public/map/space_base.png --no-monument --no-sharpen
 *     (이미 손질된 map/*.png 의 액자 규격만 바꿀 때 — 여백이 모자라면 배경색으로 채운다)
 *
 * 1. 이음매(어두운 격자선)를 찾아 안쪽 8개로 등간격 격자를 최소제곱으로 맞춘다.
 *    (바깥 두 선은 액자와 겹쳐 안쪽으로 밀리거나, 생성 AI가 바깥 칸을 좁게 그리기도 해서 안 쓴다)
 * 2. 실제 격자선이 등간격에서 벗어나면 구간별로 늘리고 줄여 아홉 칸을 고르게 만든다.
 *    — 안 그러면 pad 로는 못 맞추고 냥타워 타일이 바깥 칸에서 액자를 밟는다.
 * 3. 판 둘레 여백을 목표 액자(ARENA_W × ARENA_H, 84px 판 기준)에 맞게 오려낸다.
 *    원화 칸이 정사각형이 아니어도 된다 — CSS 가 100%/100% 로 늘려 깔기 때문에 축마다 따로 환산한다.
 * 4. 위·아래 가장자리에 걸려 잘린 장식(나무·덤불)은 배경색으로 지운다 (배경이 단색일 때만).
 * 끝에 STAGE_THEMES 에 넣을 pad 값을 찍어 준다.
 */
const { decode, encode, crop } = require("./png.js");

const ARENA_W = 1000, ARENA_H = 900;   // 목표 액자 (화면 px, 배율 1) — 판 756(9×84) 을 가운데 둔다
const CELL = 84;

const args = process.argv.slice(2), flags = new Set(args.filter((a) => a.startsWith("--")));
const [inFile, outFile] = args.filter((a) => !a.startsWith("--"));
if (!inFile || !outFile) { console.error("사용: node tools/fit-map-art.js <원화.png> <출력.png> [--no-monument] [--no-sharpen]"); process.exit(1); }
// 이미 한 번 손질한 map/*.png 를 액자 규격만 바꿔 다시 돌릴 때는 조형물 옮기기·선명화를 건너뛴다 —
// 조형물은 이미 2×2 에 맞아 있고, 선명화를 두 번 먹이면 외곽선이 거칠어진다.
let img = decode(inFile);

/* 배경색 — 둘레 띠(가장자리 2%)의 중앙값. 장식이 섞여도 중앙값은 바탕색이다.
 * 여백을 늘릴 때 빈 곳을 채우고, 잘린 장식을 지울 때도 쓴다. flat 은 둘레의 절반 이상이 그 색에 가까운지. */
function bgColor(im) {
  const { w, h, data } = im, samp = [];
  const bw = Math.max(4, Math.round(w * 0.02)), bh = Math.max(4, Math.round(h * 0.02));
  for (let y = 0; y < h; y += 3) for (let x = 0; x < w; x += 3) {
    if (x >= bw && x < w - bw && y >= bh && y < h - bh) continue;
    const p = (y * w + x) * 4; samp.push([data[p], data[p + 1], data[p + 2]]);
  }
  const bg = [0, 1, 2].map((c) => samp.map((s) => s[c]).sort((a, b) => a - b)[samp.length >> 1]);
  const near = samp.filter((s) => Math.abs(s[0] - bg[0]) + Math.abs(s[1] - bg[1]) + Math.abs(s[2] - bg[2]) < 14).length;
  return { bg, flat: near >= samp.length * 0.5 };
}

/* ── 1. 격자선 찾기 ── */
function lines(im, axis) {
  const { w, h, data } = im;
  const n = axis === "x" ? w : h, m = axis === "x" ? h : w;
  const a0 = Math.floor(m * 0.3), a1 = Math.floor(m * 0.7);   // 가운데 40% 띠만 본다 — 둘레 장식 제외
  const prof = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let dark = 0;
    for (let j = a0; j < a1; j++) {
      const p = (axis === "x" ? j * w + i : i * w + j) * 4;
      if (0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2] < 90) dark++;
    }
    prof[i] = dark / (a1 - a0);
  }
  const pk = []; let s = -1;                                    // 어두운 비율 50% 넘는 구간의 무게중심
  for (let i = 0; i <= n; i++) {
    const on = i < n && prof[i] > 0.5;
    if (on && s < 0) s = i;
    if (!on && s >= 0) { let sw = 0, sx = 0; for (let k = s; k < i; k++) { sw += prof[k]; sx += prof[k] * k; } pk.push(sx / sw); s = -1; }
  }
  // 액자 테두리 2 + 격자선 10 = 12개(액자선이 안 잡히면 10개)를 기대
  const grid = pk.length === 12 ? pk.slice(1, 11) : pk.length === 10 ? pk : null;
  if (!grid) throw new Error(`${axis}축 격자선을 못 찾음 (peak ${pk.length}개: ${pk.map((v) => v.toFixed(0)).join(" ")})`);
  const inner = grid.slice(1, 9);
  let sk = 0, sx = 0, skk = 0, skx = 0;
  inner.forEach((v, i) => { const k = i + 1; sk += k; sx += v; skk += k * k; skx += k * v; });
  const pitch = (8 * skx - sk * sx) / (8 * skk - sk * sk), start = (sx - pitch * sk) / 8;
  return { grid, start, pitch };
}

/* ── 2. 구간별 늘리기 — 실제 격자선을 등간격 자리로 옮긴다 ── */
function straighten(im, axis, f) {
  const { w, h, data } = im;
  const n = axis === "x" ? w : h;
  const dst = f.grid.map((_, k) => f.start + k * f.pitch);
  const maxOff = Math.max(...f.grid.map((v, k) => Math.abs(v - dst[k])));
  if (maxOff < 1.5) return im;                                  // 이미 고르면 손대지 않는다
  const S = [0, ...f.grid, n], D = [0, ...dst, n];
  const srcOf = (v) => { let i = 0; while (i < D.length - 2 && v >= D[i + 1]) i++; return S[i] + (v - D[i]) / (D[i + 1] - D[i]) * (S[i + 1] - S[i]); };
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < n; i++) {
    const fv = srcOf(i + 0.5) - 0.5, i0 = Math.max(0, Math.floor(fv)), i1 = Math.min(n - 1, i0 + 1), t = fv - i0;
    const m = axis === "x" ? h : w;
    for (let j = 0; j < m; j++) {
      const a = (axis === "x" ? j * w + i0 : i0 * w + j) * 4, b = (axis === "x" ? j * w + i1 : i1 * w + j) * 4;
      const d = (axis === "x" ? j * w + i : i * w + j) * 4;
      for (let c = 0; c < 4; c++) out[d + c] = Math.round(data[a + c] * (1 - t) + data[b + c] * t);
    }
  }
  console.log(`${axis}축 격자선 최대 ${maxOff.toFixed(1)}px 어긋나 등간격으로 폈다`);
  return { w, h, data: out };
}

let fx = lines(img, "x"), fy = lines(img, "y");
img = straighten(img, "x", fx); img = straighten(img, "y", fy);
fx = lines(img, "x"); fy = lines(img, "y");
console.log(`격자 x ${fx.start.toFixed(2)} + ${fx.pitch.toFixed(2)}k · y ${fy.start.toFixed(2)} + ${fy.pitch.toFixed(2)}k (${img.w}×${img.h})`);

/* ── 2.5. 가운데 조형물을 2×2 자리(x 3~4 × y 4~5, core/maps.js 의 deco)에 맞춰 넣기 ──
 * 생성 AI는 조형물을 격자에 안 맞춰 반 칸쯤 비껴 그리기 일쑤다. 게임의 칸 덮개(.cell)는 원화 위에
 * 반투명으로 얹히고 조형물 2×2 만 투명(.mon)이라, 조형물이 비껴 있으면 옆 칸 덮개가 조형물 위에 칠해진다.
 * 그래서 조형물 주변 3×3 칸(x 3~5 × y 3~5)을 깨끗한 칸으로 다시 깔고, 조형물만 오려 2×2 안에 맞춰 다시 붙인다.
 *   조형물 찾기 = 각 칸을 같은 종류의 깨끗한 기준 칸과 픽셀 단위로 비교해서 다른 부분.
 *   기준 칸: 초록 심사관 터 (1,1) · 베이지 통로 (0,2). 조형물 밑 2×2 는 원화가 초록으로 깔았으니 초록으로 친다. */
(function recenterMonument(im) {
  if (flags.has("--no-monument")) return;
  const { w, h, data } = im;
  const LX = (k) => fx.start + k * fx.pitch, LY = (k) => fy.start + k * fy.pitch;
  const P = fx.pitch, Q = fy.pitch;
  const LAYOUT = ["G........", "TTTTTTTT.", ".......T.", ".TTTTT.T.", ".T..XT.T.", ".T.##T.T.", ".T.....T.", ".TTTTTTT.", "........."];
  const inBlock = (cx, cy) => cx >= 3 && cx <= 4 && cy >= 4 && cy <= 5;
  const refOf = (cx, cy) => (inBlock(cx, cy) || LAYOUT[cy][cx] === "T") ? [1, 1] : [0, 2];
  const REGION = { x0: 2, x1: 6, y0: 3, y1: 7 };                   // 살펴볼 칸 범위 (끝 제외)
  const px = (x, y) => (Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 4;
  // 1) 기준 칸에 나오는 색(이음매·바탕·발바닥 포함)을 팔레트로 모아 두고, 그 팔레트에 없는 색만 조형물로 친다.
  //    픽셀 단위 차이로 비교하면 발바닥·이음매가 한두 px 어긋난 것까지 잡혀 조형물에 딸려 온다.
  const Qz = 24;                                                      // 색 양자화 폭
  const key = (p) => `${(data[p] / Qz) | 0},${(data[p + 1] / Qz) | 0},${(data[p + 2] / Qz) | 0}`;
  const palette = (rx, ry) => {
    const cnt = new Map();
    const x0 = Math.round(LX(rx)) - 3, x1 = Math.round(LX(rx + 1)) + 3, y0 = Math.round(LY(ry)) - 3, y1 = Math.round(LY(ry + 1)) + 3;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const k = key(px(x, y)); cnt.set(k, (cnt.get(k) || 0) + 1); }
    // 칸 넓이의 1% 넘게 나오는 색만 — 칸 테두리의 얇은 밝은 빗면(크림색)이 조형물 벽 색과 겹쳐서,
    // 드문 색까지 팔레트에 넣으면 벽이 배경으로 빠진다
    return new Set([...cnt].filter(([, n]) => n >= 0.01 * P * Q).map(([k]) => k));
  };
  const pals = { "1,1": palette(1, 1), "0,2": palette(0, 2) };
  const bx0 = Math.round(LX(REGION.x0)), bx1 = Math.round(LX(REGION.x1)), by0 = Math.round(LY(REGION.y0)), by1 = Math.round(LY(REGION.y1));
  const mw = bx1 - bx0, mh = by1 - by0;
  let mask = new Uint8Array(mw * mh);
  for (let cy = REGION.y0; cy < REGION.y1; cy++) for (let cx = REGION.x0; cx < REGION.x1; cx++) {
    const pal = pals[refOf(cx, cy).join(",")];
    const x0 = Math.round(LX(cx)), x1 = Math.round(LX(cx + 1)), y0 = Math.round(LY(cy)), y1 = Math.round(LY(cy + 1));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (!pal.has(key(px(x, y)))) mask[(y - by0) * mw + (x - bx0)] = 1;
  }
  // 2) 열기(침식→팽창)로 팔레트에서 빠진 얇은 빗면 선을 지우고, 닫기(팽창→침식)로 틈을 메운 뒤 큰 덩어리만 남긴다
  const morph = (m, grow, r) => { const o = new Uint8Array(mw * mh); for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) { let v = grow ? 0 : 1; for (let dy = -r; dy <= r && (grow ? !v : v); dy++) for (let dx = -r; dx <= r; dx++) { const xx = x + dx, yy = y + dy; const q = xx < 0 || yy < 0 || xx >= mw || yy >= mh ? 0 : m[yy * mw + xx]; if (grow && q) { v = 1; break; } if (!grow && !q) { v = 0; break; } } o[y * mw + x] = v; } return o; };
  mask = morph(morph(mask, false, 1), true, 1);        // 반지름 2면 전구 빛살 같은 가는 선까지 지워진다
  mask = morph(morph(mask, true, 3), false, 3);
  const comp = new Int32Array(mw * mh).fill(-1); const areas = [];
  for (let s = 0; s < mw * mh; s++) {
    if (!mask[s] || comp[s] >= 0) continue;
    const id = areas.length; let n = 0; const st = [s]; comp[s] = id;
    while (st.length) { const p = st.pop(); n++; const x = p % mw, y = (p - x) / mw; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= mw || yy >= mh) continue; const q = yy * mw + xx; if (mask[q] && comp[q] < 0) { comp[q] = id; st.push(q); } } }
    areas.push(n);
  }
  const keep = areas.map((n) => n > 0.3 * P * Q);
  if (!keep.some(Boolean)) { console.log("조형물을 못 찾아 그대로 둔다"); return; }
  for (let p = 0; p < mw * mh; p++) mask[p] = comp[p] >= 0 && keep[comp[p]] ? 1 : 0;
  // 조형물 안쪽에 뚫린 구멍을 메운다 — 집 벽의 발바닥 무늬처럼 이음매와 같은 어두운 색은 팔레트에 있어
  // 배경으로 빠지는데, 그대로 두면 그 자리에 밑에 깐 기준 칸(초록 발바닥)이 비쳐 보인다.
  // 살펴보는 범위의 가장자리에서 배경을 따라 채워 들어가고, 못 닿은 배경은 전부 조형물로 친다.
  (function fillHoles() {
    const reach = new Uint8Array(mw * mh), st = [];
    const push = (x, y) => { if (x < 0 || y < 0 || x >= mw || y >= mh) return; const p = y * mw + x; if (reach[p] || mask[p]) return; reach[p] = 1; st.push(p); };
    for (let x = 0; x < mw; x++) { push(x, 0); push(x, mh - 1); }
    for (let y = 0; y < mh; y++) { push(0, y); push(mw - 1, y); }
    while (st.length) { const p = st.pop(), x = p % mw, y = (p - x) / mw; push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }
    let n = 0;
    for (let p = 0; p < mw * mh; p++) if (!mask[p] && !reach[p]) { mask[p] = 1; n++; }
    if (n) console.log(`조형물 안쪽 구멍 ${n}px 를 메웠다`);
  })();
  // 닫기(팽창→침식)가 조형물 바로 옆의 바닥 무늬(발바닥 조각)까지 한 덩어리로 묶어 딸려 온다.
  // 바깥과 맞닿은 마스크 가장자리에서 팔레트(바닥) 색인 픽셀만 겉부터 한 겹씩 벗겨 낸다 —
  // 조형물 외곽선은 팔레트에 없는 색이라 거기서 멈춘다.
  (function peel() {
    const palAt = (x, y) => pals[refOf(Math.floor((bx0 + x - fx.start) / P), Math.floor((by0 + y - fy.start) / Q)).join(",")];
    // 무늬 가장자리의 반투명 픽셀은 드문 색이라 팔레트에 없어 벗기기를 막는다. 그래서 같은 종류 기준 칸의
    // 같은 자리(±2px)에 비슷한 색이 있으면 바닥 무늬로 친다 — 타일은 똑같은 그림의 반복이라 발바닥이
    // 칸마다 같은 자리에 온다. (양자화 이웃까지 팔레트로 넓히면 검은 외곽선이 이음매 색으로 잡혀 벗겨진다)
    const likeRef = (x, y) => {
      const gx = bx0 + x, gy = by0 + y, cx = Math.floor((gx - fx.start) / P), cy = Math.floor((gy - fy.start) / Q);
      const [rx, ry] = refOf(cx, cy); const ox = LX(rx) - LX(cx), oy = LY(ry) - LY(cy), p = px(gx, gy);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const q = px(Math.round(gx + ox + dx), Math.round(gy + oy + dy));
        if (Math.abs(data[p] - data[q]) + Math.abs(data[p + 1] - data[q + 1]) + Math.abs(data[p + 2] - data[q + 2]) < 30) return true;
      }
      return false;
    };
    let total = 0;
    for (let it = 0; it < 60; it++) {
      const drop = [];
      for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
        const p = y * mw + x; if (!mask[p]) continue;
        const edge = x === 0 || y === 0 || x === mw - 1 || y === mh - 1 || !mask[p - 1] || !mask[p + 1] || !mask[p - mw] || !mask[p + mw];
        if (edge && (palAt(x, y).has(key(px(bx0 + x, by0 + y))) || likeRef(x, y))) drop.push(p);
      }
      if (!drop.length) break;
      drop.forEach((p) => { mask[p] = 0; }); total += drop.length;
    }
    if (total) console.log(`조형물에 딸려 온 바닥 무늬 ${total}px 를 벗겨 냈다`);
  })();
  let hx0 = mw, hx1 = 0, hy0 = mh, hy1 = 0;
  for (let p = 0; p < mw * mh; p++) if (mask[p]) { const x = p % mw, y = (p - x) / mw; hx0 = Math.min(hx0, x); hx1 = Math.max(hx1, x + 1); hy0 = Math.min(hy0, y); hy1 = Math.max(hy1, y + 1); }
  const hw = hx1 - hx0, hh = hy1 - hy0;
  console.log(`조형물 자리 x ${((bx0 + hx0 - fx.start) / P).toFixed(2)}~${((bx0 + hx1 - fx.start) / P).toFixed(2)} · y ${((by0 + hy0 - fy.start) / Q).toFixed(2)}~${((by0 + hy1 - fy.start) / Q).toFixed(2)} 칸 → 3~5 · 4~6 으로 옮긴다`);
  // 3) 조형물을 RGBA 로 오려 둔다 (마스크 가장자리는 살짝 부드럽게)
  const soft = new Float32Array(mw * mh);
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) { let s = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; s += xx < 0 || yy < 0 || xx >= mw || yy >= mh ? 0 : mask[yy * mw + xx]; } soft[y * mw + x] = s / 9; }
  const house = Buffer.alloc(hw * hh * 4);
  for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) { const s = px(bx0 + hx0 + x, by0 + hy0 + y), d = (y * hw + x) * 4; house[d] = data[s]; house[d + 1] = data[s + 1]; house[d + 2] = data[s + 2]; house[d + 3] = Math.round(255 * soft[(hy0 + y) * mw + hx0 + x]); }
  // 4) 조형물이 걸쳐 있던 칸을 깨끗한 기준 칸으로 다시 깐다 (이음매까지 포함해 한 칸 간격 통째로)
  for (let cy = REGION.y0; cy < REGION.y1; cy++) for (let cx = REGION.x0; cx < REGION.x1; cx++) {
    const x0 = Math.round(LX(cx)), x1 = Math.round(LX(cx + 1)), y0 = Math.round(LY(cy)), y1 = Math.round(LY(cy + 1));
    let hit = inBlock(cx, cy) ? 1 : 0;                                // 2×2 자리는 무조건 — 원화가 반은 초록 반은 베이지로 그려 두기도 한다
    for (let y = y0; y < y1 && !hit; y++) for (let x = x0; x < x1 && !hit; x++) hit = mask[(y - by0) * mw + (x - bx0)];
    if (!hit) continue;
    const [rx, ry] = refOf(cx, cy); const ox = LX(rx) - LX(cx), oy = LY(ry) - LY(cy);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data.copy(data, px(x, y), px(Math.round(x + ox), Math.round(y + oy)), px(Math.round(x + ox), Math.round(y + oy)) + 4);
    if (!inBlock(cx, cy)) continue;
    // 2×2 자리는 기준 칸의 발바닥 무늬까지 딸려 오는데, 조형물이 덮고 남은 귀퉁이로 발바닥 조각이 비어져
    // 나온다. 이음매 안쪽(칸의 8% 안쪽)을 칸의 바탕색(중앙값)으로 고르게 칠해 무늬를 지운다 — 타일이
    // 거의 단색이라 빗면만 남기면 티가 안 난다.
    const ix0 = Math.round(x0 + 0.08 * P), ix1 = Math.round(x1 - 0.08 * P), iy0 = Math.round(y0 + 0.08 * Q), iy1 = Math.round(y1 - 0.08 * Q);
    const ch = [[], [], []];
    for (let y = iy0; y < iy1; y++) for (let x = ix0; x < ix1; x++) { const p = px(x, y); for (let c = 0; c < 3; c++) ch[c].push(data[p + c]); }
    const base = ch.map((a) => a.sort((u, v) => u - v)[a.length >> 1]);
    for (let y = iy0; y < iy1; y++) for (let x = ix0; x < ix1; x++) {
      const p = px(x, y);
      if (Math.abs(data[p] - base[0]) + Math.abs(data[p + 1] - base[1]) + Math.abs(data[p + 2] - base[2]) > 12) { data[p] = base[0]; data[p + 1] = base[1]; data[p + 2] = base[2]; }
    }
  }
  // 5) 2×2 자리 안에 들어가도록 줄여서(비율 유지) 가운데에 붙인다
  const FIT = 0.94;
  const sc = Math.min(1, FIT * 2 * P / hw, FIT * 2 * Q / hh);
  const nw = Math.round(hw * sc), nh = Math.round(hh * sc);
  const cxp = LX(4), cyp = LY(5);                                     // 2×2 자리의 가운데
  const dx0 = Math.round(cxp - nw / 2), dy0 = Math.round(cyp - nh / 2);
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    const sx = (x + 0.5) / sc - 0.5, sy = (y + 0.5) / sc - 0.5;
    const ix = Math.max(0, Math.min(hw - 2, Math.floor(sx))), iy = Math.max(0, Math.min(hh - 2, Math.floor(sy)));
    const tx = Math.min(1, Math.max(0, sx - ix)), ty = Math.min(1, Math.max(0, sy - iy));
    const c = [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) c[k] = house[(iy * hw + ix) * 4 + k] * (1 - tx) * (1 - ty) + house[(iy * hw + ix + 1) * 4 + k] * tx * (1 - ty) + house[((iy + 1) * hw + ix) * 4 + k] * (1 - tx) * ty + house[((iy + 1) * hw + ix + 1) * 4 + k] * tx * ty;
    const a = c[3] / 255, d = px(dx0 + x, dy0 + y);
    for (let k = 0; k < 3; k++) data[d + k] = Math.round(c[k] * a + data[d + k] * (1 - a));
  }
  console.log(`조형물 ${hw}×${hh} → ×${sc.toFixed(2)} 로 줄여 2×2 가운데에 붙였다`);
})(img);

/* ── 3. 여백 오려내기 ── */
const mx = (ARENA_W - 9 * CELL) / 2 * fx.pitch / CELL, my = (ARENA_H - 9 * CELL) / 2 * fy.pitch / CELL;
const x0 = Math.round(fx.start - mx), x1 = Math.round(fx.start + 9 * fx.pitch + mx);
const y0 = Math.round(fy.start - my), y1 = Math.round(fy.start + 9 * fy.pitch + my);
const srcBg = bgColor(img), srcW = img.w, srcH = img.h;
img = crop(img, x0, y0, x1 - x0, y1 - y0);
if (x0 < 0 || y0 < 0 || x1 > srcW || y1 > srcH) {
  // 원화 여백이 모자라면 모자란 띠를 배경색으로 채운다 — 예전 정사각 액자용 원화(옆 여백 25px 상당)를
  // 1000×900 액자에 맞출 때 양옆이 100px 상당씩 빈다. 배경이 단색이 아니면(별 무늬 등) 그냥 바탕색으로 깐다.
  const { w, h, data } = img, [r, g, b] = srcBg.bg;
  let n = 0;
  for (let p = 0; p < w * h * 4; p += 4) {
    if (data[p + 3]) continue;                                  // crop 이 바깥은 투명(0)으로 둔다
    data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = 255; n++;
  }
  console.log(`원화 여백이 모자라 ${n}px 를 배경색(${srcBg.bg.join(",")})으로 채웠다${srcBg.flat ? "" : " — 배경이 단색이 아니라 무늬는 못 잇는다"}`);
}

/* ── 4. 위·아래에 걸려 잘린 장식 지우기 ── */
(function eraseCut(im) {
  const { w, h, data } = im;
  const { bg, flat } = bgColor(im);
  if (!flat) { console.log("배경이 단색이 아니라 잘린 장식은 그대로 둔다"); return; }
  const diff = (p) => Math.abs(data[p] - bg[0]) + Math.abs(data[p + 1] - bg[1]) + Math.abs(data[p + 2] - bg[2]);
  const seen = new Uint8Array(w * h), q = [];
  const push = (x, y) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const p = y * w + x; if (seen[p] || diff(p * 4) < 14) return; seen[p] = 1; q.push(p); };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  while (q.length) { const p = q.pop(), x = p % w, y = (p - x) / w; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) push(x + dx, y + dy); }
  let n = 0;
  for (let p = 0; p < w * h; p++) if (seen[p]) { n++; data[p * 4] = bg[0]; data[p * 4 + 1] = bg[1]; data[p * 4 + 2] = bg[2]; }
  console.log(`위·아래에 잘린 장식 ${n}px 를 배경색(${bg.join(",")})으로 지웠다`);
})(img);

/* ── 5. 언샤프 마스크 — 생성 AI 원화는 외곽선이 물러서, 화면에 거의 원 크기(0.8배)로 깔리면 흐릿하다.
 *       out = src + amount·(src − gaussian(src, r)). 예전 원화(131px/칸)는 0.6배로 줄어들며 절로 또렷해졌지만
 *       칸당 100px 안팎이면 이 과정이 필요하다. 근본 해결은 칸당 170px(2000×1800) 이상으로 받아 오는 것. ── */
(function unsharp(im, amount = 1.0, r = 1.5) {
  if (flags.has("--no-sharpen")) return;
  const { w, h, data } = im;
  const n = Math.ceil(r * 3), k = []; let ks = 0;
  for (let i = -n; i <= n; i++) { const v = Math.exp(-(i * i) / (2 * r * r)); k.push(v); ks += v; }
  const tmp = new Float32Array(w * h * 3), blur = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) {
    let s = 0; for (let i = -n; i <= n; i++) s += data[(y * w + Math.min(w - 1, Math.max(0, x + i))) * 4 + c] * k[i + n];
    tmp[(y * w + x) * 3 + c] = s / ks;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) {
    let s = 0; for (let i = -n; i <= n; i++) s += tmp[(Math.min(h - 1, Math.max(0, y + i)) * w + x) * 3 + c] * k[i + n];
    blur[(y * w + x) * 3 + c] = s / ks;
  }
  for (let p = 0; p < w * h; p++) for (let c = 0; c < 3; c++) {
    const v = data[p * 4 + c]; data[p * 4 + c] = Math.max(0, Math.min(255, Math.round(v + amount * (v - blur[p * 3 + c]))));
  }
})(img);

encode(img, outFile);

/* ── pad: [위, 오른쪽, 아래, 왼쪽] — 여백을 84px 판 기준으로 환산하고 +2 (타일이 84px 칸 안에서 2px 안쪽에 그려짐) ── */
fx = lines(img, "x"); fy = lines(img, "y");
const sx = CELL / fx.pitch, sy = CELL / fy.pitch;
const pad = [fy.start * sy + 2, (img.w - fx.start - 9 * fx.pitch) * sx + 2, (img.h - fy.start - 9 * fy.pitch) * sy + 2, fx.start * sx + 2];
console.log(`→ ${outFile} ${img.w}×${img.h}`);
console.log(`pad: [${pad.map((v) => v.toFixed(2)).join(", ")}]  (액자 ${(752 + pad[1] + pad[3]).toFixed(0)}×${(752 + pad[0] + pad[2]).toFixed(0)})`);
