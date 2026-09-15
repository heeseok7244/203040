/* 4방향 냥타워 원화의 투명 여백을 읽어 프레임을 정렬한다. */
(function (root) {
  "use strict";
  function cuts(counts, size) {
    const out = [0];
    for (let i = 1; i < 4; i++) {
      const ideal = size * i / 4, radius = size / 20;
      let best = Math.round(ideal);
      for (let p = Math.ceil(ideal - radius); p <= Math.floor(ideal + radius); p++) {
        if (counts[p] < counts[best] ||
            (counts[p] === counts[best] && Math.abs(p - ideal) < Math.abs(best - ideal))) best = p;
      }
      out.push(best);
    }
    out.push(size);
    return out;
  }

  function bounds(data, w, h) {
    const ys = new Uint32Array(h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 20) ys[y]++;
    }
    const rows = cuts(ys, h), frames = [];
    for (let row = 0; row < 4; row++) {
      const xs = new Uint32Array(w);
      for (let y = rows[row]; y < rows[row + 1]; y++) for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 20) xs[x]++;
      }
      const cols = cuts(xs, w);
      for (let col = 0; col < 4; col++) {
        let x0 = w, y0 = h, x1 = -1, y1 = -1;
        for (let y = rows[row]; y < rows[row + 1]; y++) for (let x = cols[col]; x < cols[col + 1]; x++) {
          if (data[(y * w + x) * 4 + 3] <= 20) continue;
          x0 = Math.min(x0, x); x1 = Math.max(x1, x);
          y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        }
        if (x1 < x0) throw new Error("Empty cat duel frame");
        frames.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
      }
    }
    return frames;
  }

  // z가 커질수록 화면에서는 뒤쪽(위쪽)으로 향한다.
  function direction(dx, dz, mirrored, fallback) {
    if (Math.abs(dx) + Math.abs(dz) < 1e-6) return fallback;
    if (Math.abs(dz) > Math.abs(dx)) return dz > 0 ? 3 : 1;
    return (mirrored ? -dx : dx) > 0 ? 0 : 2;
  }

  function create(srcByKey) {
    const sheets = new Map();
    for (const src of Object.values(srcByKey)) {
      if (sheets.has(src)) continue;
      const im = new Image();
      sheets.set(src, { im, frames: null, failed: false });
      im.src = src;
    }
    return function frame(key, dir, index) {
      const sheet = sheets.get(srcByKey[key]);
      if (!sheet || sheet.failed || !sheet.im.complete || !sheet.im.naturalWidth) return null;
      if (!sheet.frames) {
        try {
          const im = sheet.im, cv = document.createElement("canvas");
          cv.width = im.naturalWidth; cv.height = im.naturalHeight;
          const g = cv.getContext("2d", { willReadFrequently: true });
          g.drawImage(im, 0, 0);
          const boxes = bounds(g.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height);
          // 전 프레임이 같은 배율을 사용해야 걸을 때 몸집이 바뀌지 않는다.
          const scale = 120 / Math.max(...boxes.map(b => Math.max(b.w, b.h)));
          sheet.frames = boxes.map(b => {
            const out = document.createElement("canvas"); out.width = 128; out.height = 128;
            const c = out.getContext("2d");
            c.imageSmoothingEnabled = true; c.imageSmoothingQuality = "high";
            c.drawImage(im, b.x, b.y, b.w, b.h, (128 - b.w * scale) / 2, 126 - b.h * scale, b.w * scale, b.h * scale);
            return out;
          });
        } catch (_) { sheet.failed = true; return null; }
      }
      return sheet.frames[Math.max(0, Math.min(3, dir | 0)) * 4 + ((index % 4 + 4) % 4)];
    };
  }
  const api = { bounds, direction, create };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DuelCatArt = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
