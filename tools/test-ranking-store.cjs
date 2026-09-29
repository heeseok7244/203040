'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createRankingStore, RETENTION_MS } = require('../server/ranking-store');
const entry = (score, mode = 'solo') => ({ name: 'player', score, mode, grade: 'A', wave: 10, cleared: true });

test('local restart, concurrent writes, mode separation, expiry and lower score promotion', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rank-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const env = { RANK_FILE: path.join(dir, 'rankings.json') };
  let time = Date.parse('2026-09-01T00:00:00Z');
  const options = { env, now: () => time };
  let store = createRankingStore(options);
  await Promise.all(Array.from({ length: 101 }, (_, i) => store.add(entry(1000 + i))));
  time += 1000;
  await store.add(entry(1));
  await store.add(entry(5, 'duel'));
  store = createRankingStore(options);
  let result = await store.list();
  assert.equal(result.lists.solo.length, 20);
  assert.equal(result.lists.solo[0].score, 1100);
  assert.equal(result.lists.duel[0].score, 5);
  time += RETENTION_MS - 1000;
  result = await store.list();
  assert.deepEqual(result.lists.solo.map(r => r.score), [1]);
  assert.equal(result.lists.duel.length, 1);
  time += 1000;
  assert.deepEqual((await store.list()).lists, { solo: [], duel: [] });
});

test('remote storage survives store recreation and never overwrites the full key', async () => {
  const values = new Map();
  let time = Date.parse('2026-09-01T00:00:00Z'), fail = false;
  const env = { RENDER: 'true', UPSTASH_REDIS_REST_URL: 'https://example.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'test' };
  const fetchImpl = async (url, options) => {
    assert.equal(url, 'https://example.upstash.io/multi-exec');
    assert.equal(options.headers.Authorization, 'Bearer test');
    if (fail) return { ok: false, status: 503 };
    const results = JSON.parse(options.body).map(([command, key, ...args]) => {
      assert.equal(key, 'patent-siege:rankings:v1');
      if (command === 'ZADD') { values.set(args[1], args[0]); return { result: 1 }; }
      if (command === 'ZREMRANGEBYSCORE') {
        for (const [value, date] of values) if (date <= args[1]) values.delete(value);
        return { result: 0 };
      }
      if (command === 'ZREMRANGEBYRANK') {
        const sorted = [...values.keys()].sort((a, b) => values.get(a) - values.get(b) || Buffer.compare(Buffer.from(a), Buffer.from(b)));
        const end = args[1] < 0 ? sorted.length + args[1] : args[1];
        for (let i = args[0]; i <= end; i++) values.delete(sorted[i]);
        return { result: Math.max(0, end + 1) };
      }
      if (command === 'EXPIRE') { assert.equal(args[0], RETENTION_MS / 1000); return { result: 1 }; }
      assert.equal(command, 'ZRANGE');
      return { result: [...values.keys()] };
    });
    return { ok: true, json: async () => results };
  };
  const options = { env, fetchImpl, now: () => time };
  await createRankingStore(options).add(entry(50));
  const store = createRankingStore(options);
  assert.equal((await store.list()).lists.solo[0].score, 50);
  fail = true;
  await assert.rejects(store.add(entry(99)));
  fail = false;
  assert.equal((await store.list()).lists.solo.length, 1);
  time += 1000;
  await store.add(entry(2, 'duel'));
  time += 1000;
  await store.add(entry(1));
  const capped = createRankingStore({ ...options, env: { ...env, RANK_MAX_RECORDS: '2' } });
  const trimmed = await capped.list();
  assert.equal(values.size, 2);
  assert.deepEqual(trimmed.lists.solo.map(r => r.score), [1]);
  assert.deepEqual(trimmed.lists.duel.map(r => r.score), [2]);
  time += 1000;
  await capped.add(entry(3));
  assert.equal(values.size, 2);
  assert.equal((await capped.list()).lists.duel.length, 0);
  time += RETENTION_MS;
  assert.equal((await store.list()).lists.solo.length, 0);
});

test('Render missing config and partial credentials fail instead of using a local file', async () => {
  await assert.rejects(createRankingStore({ env: { RENDER: 'true' } }).list());
  await assert.rejects(createRankingStore({ env: { UPSTASH_REDIS_REST_TOKEN: 'test' } }).list());
});

test('corrupt local data is not silently erased', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rank-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'rankings.json');
  await fs.writeFile(file, 'broken');
  await assert.rejects(createRankingStore({ env: { RANK_FILE: file } }).add(entry(5)));
  assert.equal(await fs.readFile(file, 'utf8'), 'broken');
});

test('HTTP API persists across server process restart and reports missing Render storage', async (t) => {
  const { spawn } = require('node:child_process');
  const net = require('node:net');
  const { once } = require('node:events');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rank-http-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  async function start(render = '') {
    const child = spawn(process.execPath, ['server/index.js'], { env: {
      ...process.env, PORT: String(port), RANK_FILE: path.join(dir, 'rankings.json'),
      RENDER: render, UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '',
    }, stdio: ['ignore', 'pipe', 'pipe'] });
    t.after(() => { if (child.exitCode === null) child.kill(); });
    await Promise.race([
      new Promise(resolve => child.stdout.on('data', data => { if (data.toString().includes('listening')) resolve(); })),
      new Promise((_, reject) => { const timer = setTimeout(() => reject(Error('startup timeout')), 5000); timer.unref(); }),
    ]);
    return child;
  }
  async function stop(child) { const ended = once(child, 'exit'); child.kill(); await ended; }
  let child = await start();
  let response = await fetch(base + '/api/rankings', { method: 'POST', body: JSON.stringify(entry(123)) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).rank, 1);
  await stop(child);
  child = await start();
  assert.equal((await (await fetch(base + '/api/rankings')).json()).lists.solo[0].score, 123);
  await stop(child);
  child = await start('true');
  assert.equal((await fetch(base + '/api/rankings')).status, 503);
  assert.equal((await fetch(base + '/healthz')).status, 200);
  await stop(child);
});

test('local cap removes oldest scores across modes, persists, and applies on read', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rank-cap-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'rankings.json');
  let time = Date.parse('2026-09-01T00:00:00Z');
  const options = { env: { RANK_FILE: file, RANK_MAX_RECORDS: '2' }, now: () => time };
  const store = createRankingStore(options);
  await store.add(entry(999));
  time += 1000;
  await store.add(entry(5, 'duel'));
  assert.equal(JSON.parse(await fs.readFile(file)).length, 2);
  time += 1000;
  await store.add(entry(1));
  const result = await createRankingStore(options).list();
  assert.deepEqual(result.lists.solo.map(r => r.score), [1]);
  assert.deepEqual(result.lists.duel.map(r => r.score), [5]);
  assert.equal(JSON.parse(await fs.readFile(file)).length, 2);
  const reduced = createRankingStore({ ...options, env: { ...options.env, RANK_MAX_RECORDS: '1' } });
  assert.equal((await reduced.list()).lists.duel.length, 0);
  assert.equal(JSON.parse(await fs.readFile(file)).length, 1);
});

test('invalid record limits are rejected', () => {
  for (const value of ['0', '-1', '1.5', 'oops', '10001', 'Infinity']) {
    assert.throws(() => createRankingStore({ env: { RANK_MAX_RECORDS: value } }), /RANK_MAX_RECORDS/);
  }
});
