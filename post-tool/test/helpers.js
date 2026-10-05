import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { seedSampleData } from './fixtures.js';

export async function startTestServer({ seed = true, providerOverride } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'post-tool-test-'));
  const db = openDb(':memory:');
  const ids = seed ? seedSampleData(db) : null;
  const app = createApp({ db, specFile: path.join(dir, 'google-spec.json'), providerOverride });
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, url, body, { user = 'テスト担当', raw = false, headers = {} } = {}) => {
    const h = { ...headers };
    if (user) h['x-user'] = encodeURIComponent(user);
    let payload = body;
    if (body !== undefined && typeof body !== 'string') { payload = JSON.stringify(body); h['content-type'] = 'application/json'; }
    const res = await fetch(base + url, { method, headers: h, body: payload });
    const text = await res.text();
    let data = text;
    if (!raw) { try { data = JSON.parse(text); } catch { /* text */ } }
    return { status: res.status, data, headers: res.headers };
  };
  const close = () => new Promise((r) => server.close(r));
  return { db, ids, base, call, close, dir };
}

export function genBody(storeIds, common = {}, extra = {}) {
  return { storeIds, common: { theme: '秋のおすすめ', useSeason: true, setCount: 1, ...common }, provider: 'mock', ...extra };
}
