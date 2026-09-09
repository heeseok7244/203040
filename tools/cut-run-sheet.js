// @ts-check
/**
 * 달리기 8컷 스타일시트 → 게임용 스프라이트.
 *
 *   node tools/cut-run-sheet.js [시트경로] [출력폴더]
 *   (기본값: public/img/mouse-run-v4.png → public/img)
 *
 * 시트는 가로 한 줄이 한 단계다 — 왼쪽에 서 있는 원화, 가운데 달리기 8컷, 오른쪽에 반복 예시.
 * 가운데 8컷만 잘라 종류마다 한 장씩 만든다.
 *   mob-{종류}-run.png   달리기 8컷 가로 스트립
 *
 * 원화(mob-{종류}.png)와 사망 3컷은 이전 시트에서 뽑은 것을 그대로 쓴다 — cut-mouse-sheet.js.
 *
 * 컷의 세로 위치는 시트 그대로 두고 가로만 가운데로 맞춘다. 그래야 8컷이 같은 바닥선을 공유해
 * 컷이 넘어가도 발이 지면에서 뜨지 않는다 — 이 시트의 컷은 도약 높이가 컷마다 다르기 때문에
 * 컷별로 위아래를 맞춰 버리면 뛰는 맛이 사라진다.
 *
 * 시트를 새로 뽑았다면 아래 PANEL/ROWS 좌표만 다시 재면 된다 (잉크 밀도로 재는 법은 README 참고).
 * PNG 읽기·쓰기는 png.js, 배경 지우기·컷 나누기는 sprite.js 가 맡는다.
 */
const path = require("path");
const { decode, encode, crop } = require("./png");
const { strip } = require("./sprite");

/* ═══════ 시트 좌표 — 시트를 새로 뽑으면 여기만 다시 잰다 ═══════ */

const SRC = process.argv[2] || path.join(__dirname, "../public/img/mouse-run-v4.png");
const OUT = process.argv[3] || path.join(__dirname, "../public/img");

/** 8컷이 놓인 가운데 패널의 x 범위 (왼쪽 라벨 카드와 오른쪽 예시 패널 사이) */
const PANEL = { x: 310, w: 1118 };
/** 컷 수 */
const N = 8;
/** 1단계→copy, 2단계→fast, 3단계→tank, 4단계→boss */
const TYPES = ["copy", "fast", "tank", "boss"];
/** 단계별 줄의 y 범위 — 위쪽 번호 뱃지(①②…)는 빼고 그림만 담기도록 잡았다 */
const ROWS = [
  { y: 118, h: 128 },
  { y: 308, h: 134 },
  { y: 504, h: 137 },
  { y: 704, h: 146 },
];

/* ═══════ 실행 ═══════ */

const sheet = decode(SRC);
ROWS.forEach((row, i) => {
  const t = TYPES[i];
  const run = strip(crop(sheet, PANEL.x, row.y, PANEL.w, row.h), N);
  encode(run.img, path.join(OUT, `mob-${t}-run.png`));
  console.log(`${i + 1}단계 → ${t}\t달리기 ${N}컷\t셀 ${run.cell}×${run.img.h}`);
});
