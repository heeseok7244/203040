// @ts-check
/**
 * 냥 공격 스타일시트(가로 4컷) → 게임용 4프레임 스트립.
 *
 *   node tools/cut-cat-sheet.js                    # cat_1..cat_6 중 있는 것을 전부 굽는다
 *   node tools/cut-cat-sheet.js [시트경로] [출력경로]   # 한 장만 굽는다
 *
 * 원화 `public/img/cat_N.png` → 게임용 `public/img/cat_attackN.png` 가 기본 짝이다.
 * 어느 냥이 어느 번호를 쓰는지는 web/sprite.js 의 CAT_SHEET_SRC 에 적혀 있다.
 *
 * 1컷이 평상시 자세이고, 네 컷을 순서대로 재생하면 공격 모션이 된다 (web/sprite.js 참고).
 * 네 컷은 같은 배율로 줄여 셀 가운데에 놓고 발끝을 같은 바닥선에 맞춘다 — 제자리 공격 모션이라
 * 바닥선이 흔들리면 바로 눈에 띈다.
 *
 * 굽는 일과 시트 좌표(CELL·FIT·BASE 등)는 cat-sheet.js 에 모여 있다.
 * 점프 모션은 cut-cat-jump-sheet.js 가 같은 몸통으로 굽는다.
 */
const { MOTIONS, main } = require("./cat-sheet");

main(MOTIONS.attack);
