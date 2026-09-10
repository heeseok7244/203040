// @ts-check
/**
 * 냥 점프 스타일시트(가로 4컷) → 게임용 4프레임 스트립.
 *
 *   node tools/cut-cat-jump-sheet.js                    # cat1_jump..cat6_jump 중 있는 것을 전부 굽는다
 *   node tools/cut-cat-jump-sheet.js [시트경로] [출력경로]   # 한 장만 굽는다
 *
 * 원화 `public/img/catN_jump.png` → 게임용 `public/img/cat_jumpN.png` 가 기본 짝이다.
 * 번호는 공격 시트와 같은 번호를 쓴다 — `cat1_jump.png` 는 `cat_1.png`(출원냥) 와 같은 냥이다.
 * 나온 시트는 `cat_attackN.png` 와 **완전히 같은 형식**이다: 160px 셀 × 4컷 가로 한 줄,
 * 같은 배율·같은 셀 크기라 모션이 바뀌어도 판 위에서 냥 크기가 변하지 않는다.
 *
 * 공격과 다른 점은 세로 맞춤 하나다 (cat-sheet.js 의 MOTIONS.jump 참고).
 * 공격은 컷마다 발끝을 바닥선에 앉히지만, 점프는 **시트에서의 높이차를 그대로 살린다** —
 * 발끝을 전부 바닥선에 맞춰 버리면 도약이 사라져 제자리 뜀박질로 보인다.
 * 그래서 가장 낮은 컷의 발끝이 바닥선에 놓이고 뜬 컷은 그만큼 위로 올라간다.
 * 시트의 네 컷이 **같은 바닥에 서서 그려져 있어야** 이 높이차가 뜻을 갖는다.
 *
 * 굽는 일과 시트 좌표(CELL·FIT·BASE 등)는 cat-sheet.js 에 모여 있다.
 */
const { MOTIONS, main } = require("./cat-sheet");

main(MOTIONS.jump);
