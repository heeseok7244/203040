const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../public/game.js'), 'utf8');
const boardStart = source.indexOf('__mods["core/board.js"]');
const boardEnd = source.indexOf('__mods[', boardStart + 10);
assert.ok(boardStart >= 0 && boardEnd > boardStart);
const context = vm.createContext({});
vm.runInContext(source.slice(0, boardEnd) + '\nglobalThis.modules = __mods;', context);
const maps = context.modules['core/maps.js'];
const rules = context.modules['core/board.js'];
const def = maps.getMap('complex');
const board = { ...maps.parseMap(def), pieces: [] };
const routes = rules.findFixedPaths(board);
assert.ok(routes && routes.length === 1, 'Entrance must still reach the goal');
board.pathCells = new Set(routes.flat().map(([x, y]) => `${x},${y}`));
const cat = { kind: 'cat', key: 'test', x: -1, y: -1, w: 1, h: 1, uid: 1 };
for (const [x, y] of [[4, 3], [5, 4], [5, 5]]) {
  assert.ok(rules.legal(board, cat, x, y), `New green cell ${x},${y} must allow placement`);
  assert.ok(!def.deco.some(([dx, dy]) => dx === x && dy === y));
}
assert.equal(def.deco.length, 4);
for (const [x, y] of [[3, 4], [4, 4], [3, 5], [4, 5]]) {
  assert.ok(!rules.legal(board, cat, x, y), `Monument cell ${x},${y} must remain reserved despite green art`);
  assert.ok(def.deco.some(([dx, dy]) => dx === x && dy === y));
}
const previousLayout = [...def.layout];
previousLayout[3] = '.TTT#T.T.';
previousLayout[4] = '.T..X#.T.';
previousLayout[5] = '.T.###.T.';
const oldBoard = { ...maps.parseMap({ ...def, layout: previousLayout }), pieces: [] };
assert.equal(JSON.stringify(routes), JSON.stringify(rules.findFixedPaths(oldBoard)), 'Enemy route must stay identical');
assert.equal(board.tower.size, oldBoard.tower.size + 3);
for (const key of board.tower) {
  const [x, y] = key.split(',').map(Number);
  assert.ok(rules.legal(board, cat, x, y), `Green cell ${key} must be usable`);
  board.pieces.push({ ...cat, x, y, uid: board.pieces.length + 1 });
}
assert.equal(JSON.stringify(routes), JSON.stringify(rules.findFixedPaths(board)), 'Fully populated green cells must preserve route');
console.log('PASS: 3 added placement cells, 4 reserved monument cells, all surrounding deployment cells usable, enemy route unchanged.');
