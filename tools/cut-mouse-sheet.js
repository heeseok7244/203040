// @ts-check
/**
 * 쥐 몬스터 스타일시트 → 게임용 스프라이트.
 *
 *   node tools/cut-mouse-sheet.js [시트경로] [출력폴더]
 *   (기본값: public/img/mouse-sheet-v2.png → public/img)
 *
 * 시트의 카드 4장(1~4단계)에서 종류마다 두 장을 뽑는다.
 *   mob-{종류}.png       서 있는 원화 한 장 — 도감 초상화
 *   mob-{종류}-die.png   사망 3컷 가로 스트립
 *
 * 달리기는 컷이 8개로 늘어난 별도 시트(mouse-run-v3.png)에서 뽑는다 — cut-run-sheet.js.
 *
 * 카드 배경(크림색)과 바닥 그림자는 지워 투명 PNG로 만든다 — 게임은 자체 그림자를 그리기 때문이다.
 * 스트립의 컷은 세로 위치를 시트 그대로 두어 도약·쓰러짐 높이를 살리고, 가로만 컷마다 가운데로 맞춘다.
 * 그래서 컷들이 바닥선을 공유하고, 컷이 넘어가도 발이 지면에서 뜨지 않는다.
 *
 * 시트를 새로 뽑았다면 아래 COLS/HERO/RUN/DIE 좌표만 다시 재면 된다.
 * PNG 읽기·쓰기는 옆의 png.js 가 맡는다 (외부 라이브러리 없음).
 */
const path = require("path");
const { decode, encode, crop } = require("./png");


/* ═══════ 시트 좌표 — 시트를 새로 뽑으면 여기만 다시 잰다 ═══════ */

const SRC = process.argv[2] || path.join(__dirname, "../public/img/mouse-sheet-v2.png");
const OUT = process.argv[3] || path.join(__dirname, "../public/img");

/** 카드 4장의 x 범위 (섹션 라벨 바의 좌우 끝에서 측정) */
const COLS = [
  { x: 19, w: 339 },
  { x: 373, w: 343 },
  { x: 731, w: 343 },
  { x: 1089, w: 342 },
];
/** 1단계→copy, 2단계→fast, 3단계→tank, 4단계→boss */
const TYPES = ["copy", "fast", "tank", "boss"];
/** 섹션 y 범위 (라벨 바 사이). inset은 카드 안쪽 패널 테두리를 피하는 좌우 여백 */
const HERO = { y: 240, h: 222, inset: 12 };
const DIE = { y: 863, h: 73, n: 3 };


/* ═══════ 자르기 — 배경 지우기·컷 나누기는 sprite.js 가 맡는다 ═══════ */

const { cutout, bbox, strip } = require("./sprite");

/* ═══════ 실행 ═══════ */

const sheet = decode(SRC);
COLS.forEach((c, i) => {
  const t = TYPES[i];
  // 서 있는 원화 한 장 — 도감 초상화 & 스트립이 아직 없을 때의 대역
  const hero = cutout(crop(sheet, c.x + HERO.inset, HERO.y, c.w - HERO.inset * 2, HERO.h));
  const hb = bbox(hero);
  encode(crop(hero, hb.x0 - 2, hb.y0 - 2, hb.x1 - hb.x0 + 5, hb.y1 - hb.y0 + 5),
    path.join(OUT, `mob-${t}.png`));

  const die = strip(crop(sheet, c.x, DIE.y, c.w, DIE.h), DIE.n);
  encode(die.img, path.join(OUT, `mob-${t}-die.png`));

  console.log(`${i + 1}단계 → ${t}\t원화 ${hb.x1 - hb.x0 + 5}×${hb.y1 - hb.y0 + 5}` +
    `\t사망 셀 ${die.cell}×${die.img.h}`);
});
