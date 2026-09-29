'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MODES = ['solo', 'duel'];
const TOP = 20;

function activeRows(rows, now) {
  if (!Array.isArray(rows)) throw new Error('Invalid ranking data');
  return rows.filter((r) => r && Number.isFinite(r.score) &&
    Date.parse(r.at) > now - RETENTION_MS && Date.parse(r.at) <= now)
    .map((r) => ({ ...r, mode: MODES.includes(r.mode) ? r.mode : 'solo' }))
    .sort((a, b) => b.score - a.score || a.at.localeCompare(b.at) || String(a.id || '').localeCompare(String(b.id || '')));
}

function resultFor(rows, entry) {
  const publicRow = ({ id, ...row }, i) => ({ rank: i + 1, ...row });
  const lists = Object.fromEntries(MODES.map((mode) => [mode,
    rows.filter((r) => r.mode === mode).slice(0, TOP).map(publicRow)]));
  return { top: TOP, retentionDays: 30, lists, ...(entry ? {
    mode: entry.mode, rank: rows.filter((r) => r.mode === entry.mode).findIndex((r) => r.id === entry.id) + 1,
  } : {}) };
}

function createRankingStore({ env = process.env, fetchImpl = fetch, now = Date.now } = {}) {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  const key = env.RANK_REDIS_KEY || 'patent-siege:rankings:v1';
  const file = env.RANK_FILE || path.join(__dirname, '..', 'data', 'rankings.json');
  let queue = Promise.resolve();

  async function remote(entry, time) {
    if (!url || !token) throw new Error('Both Upstash environment variables are required');
    if (new URL(url).protocol !== 'https:') throw new Error('Upstash URL must use HTTPS');
    const commands = [];
    if (entry) commands.push(['ZADD', key, time, JSON.stringify(entry)]);
    commands.push(['ZREMRANGEBYSCORE', key, '-inf', time - RETENTION_MS]);
    if (entry) commands.push(['EXPIRE', key, RETENTION_MS / 1000]);
    commands.push(['ZRANGE', key, 0, -1]);
    const response = await fetchImpl(url.replace(/\/$/, '') + '/multi-exec', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands), signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Ranking storage HTTP ${response.status}`);
    const results = await response.json();
    if (!Array.isArray(results) || results.length !== commands.length || results.some((r) => !r || r.error)) {
      throw new Error('Ranking storage command failed');
    }
    const values = results[results.length - 1].result;
    if (!Array.isArray(values)) throw new Error('Invalid ranking storage response');
    return activeRows(values.map((value) => JSON.parse(value)), time);
  }

  async function local(entry, time) {
    let rows;
    try { rows = JSON.parse(await fs.readFile(file, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; rows = []; }
    rows = activeRows(rows, time);
    if (entry) rows = activeRows([...rows, entry], time);
    // Keep every result for 30 days: lower scores may enter the top after older scores expire.
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file + '.tmp', JSON.stringify(rows, null, 1));
    await fs.rename(file + '.tmp', file);
    return rows;
  }

  function run(input) {
    const operation = queue.then(async () => {
      const time = now();
      const entry = input ? { ...input, id: randomUUID(), at: new Date(time).toISOString() } : null;
      // Never silently fall back to ephemeral storage in Render or after a remote failure.
      if (!url && !token && env.RENDER) throw new Error('Configure Upstash for persistent rankings on Render');
      const rows = await (url || token ? remote(entry, time) : local(entry, time));
      return resultFor(rows, entry);
    });
    queue = operation.catch(() => {});
    return operation;
  }
  return { list: () => run(), add: (entry) => run(entry) };
}

module.exports = { createRankingStore, RETENTION_MS };
