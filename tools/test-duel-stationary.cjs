const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../public/game.js'), 'utf8');
const context = vm.createContext({});
vm.runInContext(source.slice(0, source.indexOf('__mods["core/game.js"]')) +
  '\nglobalThis.DuelSim = __req("core/duel.js").DuelSim;', context);
const unit = (extra = {}) => ({ k: 'test', hp: 500, dmg: 12, rate: 2, range: 1, atk: true, ...extra });
const roster = {
  a: [...Array.from({ length: 9 }, () => unit()), unit({ atk: false, hl: 1 }),
    unit({ sk: { k: 'test', cd: 0.2, n: 1, mul: 2 } })],
  b: Array.from({ length: 12 }, () => unit({ mob: true })),
};
function run() {
  const sim = new context.DuelSim(roster, 42);
  const frontA = Math.max(...sim.alive('a').map(u => u.x));
  const frontB = Math.min(...sim.alive('b').map(u => u.x));
  assert.ok(frontB - frontA >= 328, 'Front lines keep the wider 340px gap with placement jitter');
  assert.ok(sim.units.every(u => u.x >= 70 && u.x <= 930), 'Both formations fit inside the map');
  const positions = new Map(sim.units.map(u => [u.id, [u.x, u.z]]));
  // The healer must reach a wounded front unit despite the full formation width.
  sim.units[0].hp -= 100;
  let attacks = false, healing = false, skill = false;
  for (let i = 0; i < 7000 && !sim.over; i++) {
    sim.tick();
    attacks ||= sim.shots.some(s => !s.heal);
    for (const e of sim.drainEvents()) {
      healing ||= e.t === 'heal';
      skill ||= e.t === 'skill';
    }
    for (const u of sim.units) {
      assert.deepEqual([u.x, u.z], positions.get(u.id), 'Every unit retains its initial position');
      assert.equal(u.walking, false);
    }
  }
  assert.ok(attacks, 'Short-range units attack from their fixed positions');
  assert.ok(healing, 'Healer can heal across its formation');
  assert.ok(skill, 'Skills activate across the gap');
  assert.ok(sim.over, 'Battle reaches a result');
  return JSON.stringify(sim.result());
}
assert.equal(run(), run(), 'Shared seed produces the same outcome');
for (const count of [0, 1, 2, 4, 7, 12, 18, 30, 60]) {
  const squad = Array.from({ length: count }, () => unit());
  const sim = new context.DuelSim({ a: squad, b: squad }, 42);
  const left = sim.alive('a'), right = sim.alive('b');
  assert.equal(left.length, count);
  assert.equal(new Set(left.map(u => `${u.x},${u.z}`)).size, count, 'No duplicated deployment slots');
  for (let i = 0; i < count; i++) {
    assert.ok(left[i].x >= 76 && left[i].x <= 330);
    assert.ok(left[i].z >= 0 && left[i].z <= 300);
    assert.equal(left[i].x + right[i].x, 1000, 'Equal armies have mirrored positions');
    assert.equal(left[i].z, right[i].z);
  }
  const columns = [...new Set(left.map(u => u.x))].sort((a, b) => a - b);
  for (let i = 1; i < columns.length; i++) {
    assert.ok(columns[i] - columns[i - 1] <= 78 + 1e-9, 'Horizontal gaps stay moderate');
  }
  for (const x of columns) {
    const depths = left.filter(u => u.x === x).map(u => u.z).sort((a, b) => a - b);
    for (let i = 1; i < depths.length; i++) {
      assert.ok((depths[i] - depths[i - 1]) * 130 / 300 <= 46 + 1e-9, 'Vertical screen gaps stay moderate');
    }
  }
  if (count === 4) {
    assert.equal(columns[1] - columns[0], 78, 'Small squads do not stretch across the whole side');
  }
}
const drawStart = source.indexOf('function drawDuelMissile(');
const drawEnd = source.indexOf('\nfunction drawDuel(now)', drawStart);
let drawn;
const rendering = vm.createContext({ drawMissile: (...args) => { drawn = args; } });
vm.runInContext(source.slice(drawStart, drawEnd) + '\nglobalThis.draw = drawDuelMissile;', rendering);
const canvas = { save() {}, restore() {} };
rendering.draw(canvas, { key: 'test', life: 0.2, max: 0.42 }, 100, 200, 800, 250);
assert.equal(drawn[0], canvas);
assert.equal(drawn[1].key, 'test');
assert.equal(drawn[1].x2, 800);
assert.equal(drawn[1].y2, 250);
assert.equal(drawn[2], false, 'Duel does not enqueue particles in the paused defense scene');
const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
assert.ok(html.includes('id="duelDecks"'));
assert.ok(!/id="duel(?:Power|Lines)"|class="duelnote"/.test(html));
console.log('PASS: stationary battle, attacks, healing, skills, completion, determinism, simplified duel UI.');
