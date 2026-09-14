// @ts-check
/**
 * 초상화 원화 → 게임용 투명 초상화.
 *
 *   침입자  mob{n}_info.png → mob-{종류}-info.png   (도감)
 *   냥타워  cat{n}_info.png → cat_info{n}.png        (좌측 임용 카드의 프로필)
 *
 *   node tools/cut-info-portrait.js [원화폴더] [출력폴더]
 *   (기본값: public/img/src → public/img/game)
 *
 * 원화는 흰 배경에 정면 캐릭터 하나가 그려진 정사각형(쥐 1254×1254, 냥 1024×1024)이다. 여기서
 *   1. 배경을 지워 투명하게 만들고 (sprite.js cutout — 테두리에서 번져 들어가며 지운다),
 *   2. 캐릭터가 남은 영역만 여백을 조금 둔 정사각형으로 오려낸 뒤,
 *   3. 칸(72px / 48px)의 고해상도 화면 몫까지 감안한 SIZE 로 줄인다.
 *
 * 침입자 도감(game.js renderBestiary / paintBeast)과 냥타워 카드(renderCatRoster, CAT_INFO_SRC)가
 * 이 그림을 그대로 칸에 맞춰 그린다 — 달리기·공격 시트와는 무관하다.
 * 냥의 번호는 공격 시트와 같다 (cat1_info = cat_1 = 출원냥).
 */
const fs = require("fs");
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

/**
 * 냥 초상화는 **여섯 장을 같은 창으로** 오린다.
 * 쥐처럼 그림의 경계 상자에 맞춰 오리면 소총·수리검·폭탄 같은 소품이 붙은 냥은 그만큼 작아져
 * 카드마다 냥 크기가 들쭉날쭉해진다. 원화 여섯 장은 몸통이 같은 자리·같은 크기(y 320~860)로
 * 그려져 있으므로, 창 하나를 고정해 두면 몸통 크기가 저절로 같아진다.
 * 창은 출원냥(cat1 — 머리 위 서류 아이콘까지 232~860)이 딱 들어가는 704px 이다. 이보다 넓게
 * 뻗은 소품(소총 총열·바깥쪽 수리검)은 창 밖으로 잘린다 — 소품을 다 담는 것보다 냥이 같은
 * 크기로 보이는 쪽을 택했다.
 */
const CAT_WIN = { cx: 520, cy: 560, side: 704 };

/**
 * 원화 한 장 → 투명 정사각형 초상화 한 장. 원화가 없으면 건너뛴다 (파일을 하나씩 넣는 중에도 돌아가도록).
 * win 을 주면 그 창을 그대로 오리고, 없으면 그림의 경계 상자에 여백을 더한 정사각형으로 오린다.
 */
function bake(srcName, outName, label, win) {
  const srcPath = path.join(IN, srcName);
  if (!fs.existsSync(srcPath)) { console.log(`${label}\t${srcName} 없음 — 건너뜀`); return; }
  const cut = cutout(decode(srcPath));
  const box = bbox(cut);
  if (!box) throw new Error(`${srcName} — 배경을 지우고 나니 그림이 남지 않았습니다`);

  const bw = box.x1 - box.x0 + 1, bh = box.y1 - box.y0 + 1;
  let side, x0, y0;
  if (win) {
    side = win.side; x0 = Math.round(win.cx - side / 2); y0 = Math.round(win.cy - side / 2);
  } else {
    // 캐릭터를 가운데 두는 정사각형 — 긴 변에 여백을 더해 한 변으로 삼는다
    side = Math.round(Math.max(bw, bh) * (1 + PAD * 2));
    x0 = Math.round((box.x0 + box.x1) / 2 - side / 2); y0 = Math.round((box.y0 + box.y1) / 2 - side / 2);
  }
  const clipped = box.x0 < x0 || box.y0 < y0 || box.x1 >= x0 + side || box.y1 >= y0 + side;
  const sq = cropSquare(cut, x0, y0, side);
  const out = resize(sq, SIZE / side);
  encode(out, path.join(OUT, outName));
  console.log(`${label} → ${outName}\t그림 ${bw}×${bh}\t오려낸 변 ${side}${clipped ? " (창 밖 잘림)" : ""}\t→ ${out.w}×${out.h}`);
}

TYPES.forEach((t, i) => bake(`mob${i + 1}_info.png`, `mob-${t}-info.png`, `${i + 1}단계`));
for (let n = 1; n <= 6; n++) bake(`cat${n}_info.png`, `cat_info${n}.png`, `냥 ${n}`, CAT_WIN);
