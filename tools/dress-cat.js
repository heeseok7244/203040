// @ts-check
/**
 * 프로필 초상화(cat{n}_info.png)에서 **소품만** 떼어 낸다 — 모션 시트에 입히기 위한 몸통이다.
 *
 * 냥의 모션 원화(cat_N.png / catN_jump.png)는 소품 없는 맨 냥이고, 프로필 원화는 같은 냥에
 * 서류·저격총·모노클·수리검·개틀링·폭탄 같은 소품이 붙어 있다. 소품 달린 모션 원화가 따로
 * 없으므로, 프로필에서 냥 몸통을 지워 소품층만 남기고 그걸 모션 컷마다 얹는다
 * (cat-sheet.js bake 참고). 몸통을 어떻게 지우는지는 splitProps 에 적었다.
 */
const { lum } = require("./sprite");

/** 이보다 어두우면 검은 외곽선으로 본다 — 몸통 채색 중 가장 어두운 검은 냥(L≈53)보다 낮게 */
const OUTLINE_L = 30;
/** 외곽선 두께(px) — 몸통 안쪽을 채운 뒤 이만큼 부풀려 외곽선까지 몸통에 넣는다 */
const OUTLINE_W = 16;
/** 이 알파보다 옅은 픽셀은 없는 것으로 본다 */
const ALPHA = 128;
/** 채색 조각의 이 비율 이상이 컷의 실루엣 안에 들면 몸통(귀·이마·꼬리)으로 본다 */
const IN_SIL = 0.4;
/** 머리 꼭대기·발끝을 재는 세로 띠의 반폭(px) — 몸통 가운데 x 를 중심으로 */
const BAND = 200;
/** 컷 실루엣에서 이 거리(px) 안에만 있는 조각은 소품이 아니라 몸통 찌꺼기로 보고 지운다 */
const NEAR = 24;
/** 몸통에 가려졌던 소품 자리를 소품 색으로 이어 그리는 깊이(px) — 꼬리 굵기보다 넉넉하게 */
const EXTEND = 64;
/** 이보다 작은 조각은 소품이 아니라 부스러기다 (가장 작은 소품인 방패 파편·수리검 바람이 900px쯤) */
const MIN_PROP = 300;

/**
 * seeds 에서 시작해 pass 인 픽셀로만 번지는 채우기.
 * @returns {Uint8Array} 채워진 픽셀 1
 */
function flood(img, pass, seeds, maxArea) {
  const { w, h } = img;
  const done = new Uint8Array(w * h);
  for (const [sx, sy] of seeds) {
    const i0 = sy * w + sx;
    if (!pass(i0) || done[i0]) continue;
    const stack = [i0];
    const filled = [];
    done[i0] = 1;
    while (stack.length) {
      const i = stack.pop();
      filled.push(i);
      const x = i % w, y = (i / w) | 0;
      const nb = [];
      if (x > 0) nb.push(i - 1);
      if (x < w - 1) nb.push(i + 1);
      if (y > 0) nb.push(i - w);
      if (y < h - 1) nb.push(i + w);
      for (const j of nb) if (!done[j] && pass(j)) { done[j] = 1; stack.push(j); }
    }
    // 너무 넓게 번졌으면 소품으로 새어 나간 것 — 이 씨앗은 없던 일로 한다
    if (maxArea && filled.length > maxArea) for (const i of filled) done[i] = 0;
  }
  return done;
}

/** pass 인 픽셀들을 이어진 덩어리로 가른다 — 덩어리마다 픽셀 번호 배열 */
function components(img, pass) {
  const { w, h } = img;
  const seen = new Uint8Array(w * h);
  const out = [];
  for (let i0 = 0; i0 < w * h; i0++) {
    if (seen[i0] || !pass(i0)) continue;
    const stack = [i0], comp = [];
    seen[i0] = 1;
    while (stack.length) {
      const i = stack.pop();
      comp.push(i);
      const x = i % w, y = (i / w) | 0;
      const nb = [];
      if (x > 0) nb.push(i - 1);
      if (x < w - 1) nb.push(i + 1);
      if (y > 0) nb.push(i - w);
      if (y < h - 1) nb.push(i + w);
      for (const j of nb) if (!seen[j] && pass(j)) { seen[j] = 1; stack.push(j); }
    }
    out.push(comp);
  }
  return out;
}

/** 마스크를 r 픽셀 부풀린다 (정사각 창 — 외곽선 두께 정도라 모양은 상관없다) */
function dilate(mask, w, h, r) {
  const out = new Uint8Array(w * h);
  // 가로 → 세로 두 번으로 나누면 O(w·h·r)
  const tmp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let run = 0;
    for (let x = 0; x < w + r; x++) {
      if (x < w && mask[y * w + x]) run = 2 * r + 1;
      if (run > 0 && x - r >= 0 && x - r < w) tmp[y * w + x - r] = 1;
      if (run > 0) run--;
    }
  }
  for (let x = 0; x < w; x++) {
    let run = 0;
    for (let y = 0; y < h + r; y++) {
      if (y < h && tmp[y * w + x]) run = 2 * r + 1;
      if (run > 0 && y - r >= 0 && y - r < h) out[(y - r) * w + x] = 1;
      if (run > 0) run--;
    }
  }
  return out;
}

/** 마스크 1 인 픽셀의 경계 상자 */
function maskBox(mask, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * 초상화 → { behind, over, body }.
 *
 * `behind` 냥 **뒤에** 깔 소품층 — 초상화에서 몸통을 지운 나머지 (저격총·폭탄처럼 몸에 닿은
 *          소품은 잘린 자리가 냥 몸통 아래로 들어가므로 뒤에 깔면 자연스럽다).
 * `over`   냥 **위에** 얹을 소품층 — 모노클·나비넥타이처럼 몸통 안쪽에 그려진 소품.
 *          cfg.over 로 자리를 집어 준 냥만 있다 (없으면 null).
 * `body`   지운 몸통의 경계 상자 — 모션 컷의 몸통을 이 크기·자리에 맞춘다.
 *
 * 몸통은 이렇게 찾는다.
 *   1. 검은 외곽선(OUTLINE_L 보다 어두운 픽셀)을 벽으로 삼고, cfg.seeds(가슴·꼬리)에서
 *      채워 나간다. 외곽선이 닫혀 있으니 몸통 채색 안에서 멈춘다. 소품이 몸을 가리고 있어
 *      선이 끊긴 자리로 새어 나가면 넓이가 확 늘므로 그 씨앗은 버린다 (seedMax).
 *   2. 귀·이마(선글라스 위)·꼬리처럼 외곽선으로 갈려 따로 남은 채색 조각은 **컷의 실루엣**으로
 *      가른다 — 맨 냥 컷(frame)을 초상화 몸통 크기로 키워 겹쳤을 때 조각의 절반 이상이 그 안에
 *      들면 몸통이고, 아니면 소품이다. 소품은 몸 바깥으로 뻗으므로 실루엣 밖이 더 많다.
 *      컷을 겹치는 배율은 머리 꼭대기~발끝 높이로 잡는다 (몸통 가운데 세로 띠 안에서 잰다 —
 *      소품은 대개 옆으로 뻗고, 머리 위 소품은 몸에 붙어 있지 않다).
 *      실루엣 안에 들어와 있는 소품(꼬리 자리의 개틀링)은 cfg.props 로 자리를 집어 빼 준다.
 *   3. 채운 영역에 완전히 둘러싸인 구멍(눈·입·선글라스·나비넥타이)은 몸통에 넣는다 —
 *      바깥에서 닿을 수 없는 픽셀이 곧 구멍이다.
 *   4. OUTLINE_W 만큼 부풀려 외곽선까지 몸통으로 친다.
 *   5. 남은 조각 중 컷 실루엣 언저리를 못 벗어나는 것(외곽선 부스러기·선글라스)과 너무 작은
 *      조각은 지운다 (NEAR, MIN_PROP).
 *   6. cfg.front 자리의 소품은 냥 앞에 오도록 위 소품층으로 옮긴다.
 *   7. 몸통이 가리고 있던 소품 자리는 소품 색을 이어 그려 메운다 (EXTEND).
 *   8. cfg.over 자리의 소품(몸통 안쪽 그림)을 원화에서 떠 위 소품층에 보탠다.
 *
 * @param {{w:number,h:number,data:Buffer}} img 배경을 지운 초상화 (RGBA)
 * @param {{seeds:[number,number][], seedMax?:number, props?:[number,number,number,number][],
 *          front?:[number,number,number,number][],
 *          over?:({disc:{cx:number,cy:number,r:number}}|{rect:[number,number,number,number], notColor:[number,number,number], tol:number})[]}} cfg
 * @param {{img:{w:number,h:number,data:Buffer}, box:{x0:number,y0:number,x1:number,y1:number,w:number,h:number}}} frame 맨 냥 컷(앉은 자세)과 그 경계 상자
 */
function splitProps(img, cfg, frame) {
  const { w, h, data } = img;
  const n = w * h;
  const alpha = (i) => data[i * 4 + 3];
  const opaque = (i) => alpha(i) > ALPHA;
  const dark = (i) => lum(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) < OUTLINE_L;
  const paint = (i) => opaque(i) && !dark(i);

  // 1. 몸통 채색 채우기 — 첫 씨앗(가슴)은 제한 없이, 나머지(꼬리)는 새면 버린다
  const fill = flood(img, paint, cfg.seeds.slice(0, 1));
  const more = flood(img, paint, cfg.seeds.slice(1), cfg.seedMax || 60000);
  for (let i = 0; i < n; i++) if (more[i]) fill[i] = 1;
  const fbox = maskBox(fill, w, h);
  if (!fbox) throw new Error("몸통을 찾지 못했습니다 — seeds 를 다시 보세요");

  // 2. 컷의 실루엣으로 남은 조각 가르기
  //    머리 꼭대기·발끝: 채운 몸통에 잉크로 이어진 픽셀 중 가운데 띠 안에서 가장 위·아래
  const ink = flood(img, opaque, cfg.seeds);
  const mid = Math.round((fbox.x0 + fbox.x1) / 2);
  let top = h, bottom = -1;
  for (let y = 0; y < h; y++) for (let x = mid - BAND; x <= mid + BAND; x++) {
    if (!ink[y * w + x]) continue;
    if (y < top) top = y;
    if (y > bottom) bottom = y;
  }
  const s = (bottom - top + 1) / frame.box.h;                  // 컷 px 하나가 초상화에서 차지하는 크기
  const left = fbox.x0 - OUTLINE_W;                            // 컷의 왼쪽 끝 = 왼쪽 볼 외곽선
  const inSil = (i) => {
    const fx = Math.round(frame.box.x0 + ((i % w) - left) / s);
    const fy = Math.round(frame.box.y0 + (((i / w) | 0) - top) / s);
    // 컷 상자 밖은 실루엣 밖 — 시트에는 옆 컷이 붙어 있어 상자를 넘어가면 다른 컷을 읽는다
    if (fx < frame.box.x0 || fx > frame.box.x1 || fy < frame.box.y0 || fy > frame.box.y1) return false;
    return frame.img.data[(fy * frame.img.w + fx) * 4 + 3] > ALPHA;
  };
  const sil = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (inSil(i)) sil[i] = 1;
  const inRects = (i, rects) => rects.some(([x0, y0, x1, y1]) => {
    const x = i % w, y = (i / w) | 0;
    return x >= x0 && x <= x1 && y >= y0 && y <= y1;
  });
  for (const comp of components(img, (i) => paint(i) && !fill[i])) {
    if (comp.some((i) => inRects(i, cfg.props || []))) continue;   // 소품이라고 집어 준 자리
    let inside = 0;
    for (const i of comp) if (sil[i]) inside++;
    if (inside >= comp.length * IN_SIL) for (const i of comp) fill[i] = 1;
  }

  // 3. 구멍 메우기 — 채운 영역 밖에서 테두리부터 닿는 픽셀이 「바깥」, 그 외는 구멍
  const border = [];
  for (let x = 0; x < w; x++) border.push([x, 0], [x, h - 1]);
  for (let y = 0; y < h; y++) border.push([0, y], [w - 1, y]);
  const outside = flood(img, (i) => !fill[i], border);
  for (let i = 0; i < n; i++) if (!outside[i]) fill[i] = 1;

  // 4. 외곽선까지
  const body = dilate(fill, w, h, OUTLINE_W);
  const box = maskBox(body, w, h);

  const behind = { w, h, data: Buffer.from(data) };
  for (let i = 0; i < n; i++) if (body[i]) behind.data[i * 4 + 3] = 0;

  // 5. 찌꺼기 걷어 내기 — 남은 조각 중 컷 실루엣 언저리(NEAR 안)를 벗어나지 못하는 것은 소품이
  //    아니라 몸통 외곽선의 부스러기(부풀린 폭보다 굵은 자리)나 선글라스처럼 몸통 안에 갇힌
  //    검은 덩어리다. 소품은 반드시 몸 바깥으로 뻗는다.
  const near = dilate(sil, w, h, NEAR);
  const left_ = (i) => behind.data[i * 4 + 3] > ALPHA;
  for (const comp of components(behind, left_)) {
    const out = comp.filter((i) => !near[i]).length;
    const keep = out > 0 && comp.length >= MIN_PROP;
    if (process.env.DRESS_DEBUG) {                            // DRESS_DEBUG=1 로 조각별 판정을 찍어 본다
      const b = { x0: w, y0: h, x1: -1, y1: -1 };
      for (const i of comp) {
        const x = i % w, y = (i / w) | 0;
        b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y);
      }
      console.log(`    조각 ${comp.length}px [${b.x0},${b.y0}]-[${b.x1},${b.y1}] 실루엣 밖 ${out}px → ${keep ? "소품" : "지움"}`);
    }
    if (!keep) for (const i of comp) behind.data[i * 4 + 3] = 0;
  }

  // 6. 냥 앞에 와야 할 소품(cfg.front 사각형 안의 것 — 앞발로 쥔 개틀링)은 위 소품층으로 옮긴다.
  //    초상화에서 몸 앞에 그려진 소품은 가려진 데가 없어 그대로 얹으면 되고, 뒤에 깔면 컷의
  //    몸통(초상화보다 통통하다)에 거의 다 묻힌다.
  let over = null;
  if (cfg.front && cfg.front.length) {
    over = { w, h, data: Buffer.alloc(n * 4) };
    for (let i = 0; i < n; i++) {
      if (!left_(i) || !inRects(i, cfg.front)) continue;
      behind.data.copy(over.data, i * 4, i * 4, i * 4 + 4);
      behind.data[i * 4 + 3] = 0;
    }
  }

  // 7. 몸통이 가리고 있던 소품 자리 메우기 — 소품 색을 몸통 안쪽으로 EXTEND 만큼 이어 그린다.
  //    꼬리가 기름통 앞을 지나는 식으로 몸통이 소품을 가린 자리는 몸통을 지우면 구멍이 되는데,
  //    컷의 꼬리는 모양이 달라 그 구멍을 다 덮지 못한다. 몸통이 있던 자리(초상화에서 불투명했던
  //    픽셀)에 한해 가장 가까운 소품 픽셀 색을 끌어다 채우면, 컷이 덮는 곳은 어차피 안 보이고
  //    안 덮는 곳은 소품이 이어진 것처럼 보인다. 배경(투명)이었던 자리는 건드리지 않는다 —
  //    머리 위 서류처럼 떨어져 있는 소품이 틈을 건너 몸통까지 번지면 안 된다.
  const known = new Uint8Array(n);
  let front = [];
  for (let i = 0; i < n; i++) if (behind.data[i * 4 + 3] > ALPHA) { known[i] = 1; front.push(i); }
  for (let r = 0; r < EXTEND && front.length; r++) {
    const next = [];
    for (const i of front) {
      const x = i % w, y = (i / w) | 0;
      const nb = [];
      if (x > 0) nb.push(i - 1);
      if (x < w - 1) nb.push(i + 1);
      if (y > 0) nb.push(i - w);
      if (y < h - 1) nb.push(i + w);
      for (const j of nb) {
        if (known[j] || !body[j] || !opaque(j)) continue;
        known[j] = 1;
        behind.data.copy(behind.data, j * 4, i * 4, i * 4 + 4);
        next.push(j);
      }
    }
    front = next;
  }

  // 8. 몸통 안쪽에 그려진 소품(cfg.over — 모노클·선글라스)은 자리를 집어 원화에서 그대로 떠 온다
  if (cfg.over && cfg.over.length) {
    over = over || { w, h, data: Buffer.alloc(n * 4) };
    for (const part of cfg.over) {
      if ("disc" in part) {
        const { cx, cy, r } = part.disc;
        for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
          if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
          const i = y * w + x;
          data.copy(over.data, i * 4, i * 4, i * 4 + 4);
        }
      } else {
        const [x0, y0, x1, y1] = part.rect, [nr, ng, nb] = part.notColor;
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const i = y * w + x, p = i * 4;
          if (!opaque(i)) continue;
          if (Math.hypot(data[p] - nr, data[p + 1] - ng, data[p + 2] - nb) <= part.tol) continue;
          data.copy(over.data, p, p, p + 4);
        }
      }
    }
  }
  return { behind, over, body: box, mask: body, sil };
}

module.exports = { splitProps, maskBox };
