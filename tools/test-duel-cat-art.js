const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { bounds, direction } = require("../public/duel-cat-art");
const { decode } = require("./png");
const root = path.join(__dirname, "..");

// 실제 원화 96컷: 각 그림이 잘리지 않고, 한 프레임에만 포함되는지 검사한다.
for (let n = 1; n <= 6; n++) {
  const { data, w, h } = decode(path.join(root, `public/img/game/cat_duel${n}.png`));
  assert.equal(data[3], 0);
  const frames = bounds(data, w, h);
  assert.equal(frames.length, 16);
  for (const b of frames) {
    assert.ok(b.w > 150 && b.h > 200, `cat ${n}: incomplete frame`);
    assert.ok(b.w < w / 3 && b.h < h / 3, `cat ${n}: merged frames`);
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] <= 20) continue;
    const owners = frames.filter(b => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h);
    assert.equal(owners.length, 1, `cat ${n}: lost/overlapping pixel at ${x},${y}`);
  }
}
assert.equal(direction(10, 0, false, 1), 0);
assert.equal(direction(-10, 0, false, 1), 2);
assert.equal(direction(10, 0, true, 1), 2);
assert.equal(direction(-10, 0, true, 1), 0);
assert.equal(direction(1, 10, false, 0), 3);
assert.equal(direction(1, -10, true, 0), 1);
assert.equal(direction(0, 0, false, 2), 2);

/* 대전장 그리기 — 냥타워는 **판 위와 같은 정면 원화**로 서고 좌우로 뒤집히지 않는다.
 * 어디를 노리는지는 투사체가 알리므로 4방향 시트는 그리기에 쓰이지 않는다 (위의 원화 검사는
 * 시트를 되살릴 때를 위해 남겨 둔 것이다 — 되돌린다면 아래도 예전 판본으로 함께 되돌려야 한다). */
const source = fs.readFileSync(path.join(root, "public/game.js"), "utf8");
const start = source.indexOf("function drawDuelUnit(");
const end = source.indexOf("function drawDuel(now)", start);
const asked = [], scales = [], images = [], labels = [];
let side = "a", available = true;
const context = {
  mySide: () => side, soloMode: true, mySlot: 0, DUEL: { depthPx: 300, w: 1000 },
  duelX: x => x, duelYAt: () => 200, duelScale: () => 1,
  sideCol: () => ["black", "blue"], duel: { sim: { t: 1 } },
  frameOf: () => [0, 0], CAT_SKILLS: {},
  catFrameCanvas: (key, row, frame) => { asked.push({ key, row, frame }); return available ? {} : null; },
};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);
const methods = {
  scale: (...args) => scales.push(args),
  ellipse: (...args) => {
    assert.ok(args.length >= 7, "Canvas ellipse requires 7 arguments");
    assert.ok(args.slice(0, 7).every(Number.isFinite));
  },
  drawImage: (...args) => images.push(args),
  fillText: text => labels.push(text),
};
const g = new Proxy({}, { get: (_, key) => methods[key] || (() => {}), set: () => true });
const u = { side: "a", k: "spec", id: 2, lv: 2, x: 100, z: 150, hp: 100, max: 100, walking: true, lookX: -1, lookZ: 0 };
context.drawDuelUnit(g, u, 1000);
assert.equal(images.length, 1, "cat image must be drawn");
assert.ok(labels.includes("Lv2"), "level label must be drawn");
// 판 위와 같은 정면 시트(catFrameCanvas)에서 가져온다 — 방향 인자 자체가 없다
assert.deepEqual(asked.at(-1), { key: "spec", row: 0, frame: 0 });
assert.ok(!scales.some(([x]) => x < 0), "front-facing sprite must not be mirrored");
// 상대 진영에서 봐도, 어떤 상태에서도 같은 정면 원화 한 장만 그린다
side = "b";
for (const extra of [{}, { walking: false, atkT: .2 }, { freezeT: 1 },
                     { dead: true, deadT: .1 }, { lookX: 0, lookZ: 1 }]) {
  const before = images.length;
  context.drawDuelUnit(g, { ...u, ...extra }, 1000);
  assert.equal(images.length, before + 1, "exactly one sprite per unit");
  assert.equal(asked.at(-1).key, "spec");
}
assert.ok(!scales.some(([x]) => x < 0), "no side or state may mirror the sprite");
available = false;
const drawn = images.length;
context.drawDuelUnit(g, u, 1000); // 원화가 아직 안 실렸으면 진영색 동그라미로 대신한다
assert.equal(images.length, drawn, "missing art must fall back to a plain circle");
console.log("PASS: 96 sprite bounds, front-facing only, never mirrored, movement/attack/freeze/death, fallback");
