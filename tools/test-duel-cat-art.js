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

const source = fs.readFileSync(path.join(root, "public/game.js"), "utf8");
const start = source.indexOf("function drawDuelUnit(");
const end = source.indexOf("function drawDuel(now)", start);
const chosen = [], scales = [], images = [], labels = [];
let side = "a", available = true;
const context = {
  DuelCatArt: { direction }, DIR: { right: 0, down: 1, left: 2, up: 3 },
  mySide: () => side, soloMode: true, mySlot: 0, DUEL: { depthPx: 300, w: 1000 },
  duelX: x => x, duelYAt: () => 200, duelScale: () => 1,
  sideCol: () => ["black", "blue"], duel: { sim: { t: 1 } },
  duelCatFrame: (key, dir, frame) => { chosen.push({ key, dir, frame }); return available ? {} : null; },
  frameOf: () => [0, 0], catFrameCanvas: () => ({}), CAT_SKILLS: {},
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
assert.equal(chosen.at(-1).dir, 2); // 지나친 적을 쫓아 왼쪽을 본다
assert.equal(chosen.at(-1).frame, 9);
assert.ok(!scales.some(([x]) => x < 0), "directional sprites must not be mirrored");
side = "b";
context.drawDuelUnit(g, u, 1000);
assert.equal(chosen.at(-1).dir, 0);
context.drawDuelUnit(g, { ...u, walking: false, atkT: .2 }, 1000);
assert.equal(chosen.at(-1).frame, 0);
context.drawDuelUnit(g, { ...u, freezeT: 1 }, 1000);
assert.equal(chosen.at(-1).frame, 0);
context.drawDuelUnit(g, { ...u, dead: true, deadT: .1 }, 1000);
assert.equal(chosen.at(-1).frame, 0);
// 한 줄 전장뿐이라 깊이(lookZ)는 방향에 실리지 않는다 — 옆을 본다
context.drawDuelUnit(g, { ...u, lookX: 0, lookZ: 1 }, 1000);
assert.notEqual(chosen.at(-1).dir, 3);
available = false;
context.drawDuelUnit(g, u, 1000); // 로드 실패 시 기존 그림으로 표시
assert.ok(scales.some(([x]) => x < 0));
console.log("PASS: 96 sprite bounds, side view only, mirrored viewpoint, movement/attack/freeze/death, fallback");
