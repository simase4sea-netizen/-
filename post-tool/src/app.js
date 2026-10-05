// HTTP API と静的ファイル配信。外部サービスへの投稿機能は持たない（生成・編集・保存・コピーまで）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FIELDS, POST_STATUSES, POST_STATUS_LABELS, HttpError, getRow, insertRow, updateRow, deleteRow,
  listHistory, storeWithParents, dumpAll,
} from './db.js';
import { loadSpec, saveSpec } from './spec.js';
import { preflight, generatePosts, revalidate, duplicatePost, PROVIDERS } from './generate.js';
import { toCsv, parseCsv } from './csv.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(here, '..', 'public');
const MAX_BODY = 20 * 1024 * 1024;
const ENTITIES = ['clients', 'brands', 'stores', 'menu_items'];
const PARENT = { brands: ['client_id', 'clients'], stores: ['brand_id', 'brands'], menu_items: ['store_id', 'stores'] };
const REQUIRED = { clients: ['name'], brands: ['client_id', 'name'], stores: ['brand_id', 'name'], menu_items: ['store_id', 'name'] };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

function send(res, status, data, headers = {}) {
  const isText = typeof data === 'string';
  res.writeHead(status, { 'content-type': isText ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', ...headers });
  res.end(isText ? data : JSON.stringify(data));
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw new HttpError(413, 'リクエストが大きすぎます（画像は合計20MBまで）。');
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readJson(req) {
  const text = await readBody(req);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'JSON の形式が正しくありません。');
  }
}

function currentUser(req) {
  const raw = req.headers['x-user'];
  if (!raw) return null;
  try {
    return decodeURIComponent(String(raw)).trim() || null;
  } catch {
    return null;
  }
}

function requireUser(req) {
  const u = currentUser(req);
  if (!u) throw new HttpError(400, '画面右上で担当者名を入力してください（更新者として記録します）。');
  return u;
}

function checkAuth(req) {
  const password = process.env.APP_PASSWORD;
  if (!password) return true;
  const h = req.headers.authorization || '';
  if (!h.startsWith('Basic ')) return false;
  const [, pass] = Buffer.from(h.slice(6), 'base64').toString('utf8').split(':');
  return pass === password;
}

function validateEntity(db, entity, data, isCreate) {
  if (isCreate) {
    for (const f of REQUIRED[entity]) {
      if (data[f] === undefined || String(data[f]).trim() === '') throw new HttpError(400, `${f} は必須です。`);
    }
    const parent = PARENT[entity];
    if (parent && !getRow(db, parent[1], data[parent[0]])) throw new HttpError(400, `${parent[0]} に該当するデータがありません。`);
  }
  if (entity === 'stores' && data.cta_options !== undefined && typeof data.cta_options === 'string' && data.cta_options.trim()) {
    try {
      const v = JSON.parse(data.cta_options);
      if (!Array.isArray(v)) throw new Error();
    } catch {
      throw new HttpError(400, 'cta_options は [{"type":"BOOK","url":"https://..."}] 形式の JSON で入力してください。');
    }
  }
}

function listEntity(db, entity, query) {
  const where = [];
  const params = [];
  if (entity === 'stores') {
    let sql = `SELECT s.*, b.name AS brand_name, c.id AS client_id, c.name AS client_name
      FROM stores s JOIN brands b ON b.id = s.brand_id JOIN clients c ON c.id = b.client_id`;
    if (query.get('brand_id')) { where.push('s.brand_id = ?'); params.push(Number(query.get('brand_id'))); }
    if (query.get('client_id')) { where.push('c.id = ?'); params.push(Number(query.get('client_id'))); }
    if (query.get('q')) {
      where.push('(s.name LIKE ? OR s.store_code LIKE ? OR s.area LIKE ? OR s.address LIKE ? OR b.name LIKE ? OR c.name LIKE ?)');
      params.push(...Array(6).fill(`%${query.get('q')}%`));
    }
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
    return db.prepare(`${sql} ORDER BY c.name, b.name, s.name`).all(...params);
  }
  if (entity === 'brands') {
    let sql = 'SELECT b.*, c.name AS client_name FROM brands b JOIN clients c ON c.id = b.client_id';
    if (query.get('client_id')) { where.push('b.client_id = ?'); params.push(Number(query.get('client_id'))); }
    if (query.get('q')) { where.push('(b.name LIKE ? OR c.name LIKE ?)'); params.push(`%${query.get('q')}%`, `%${query.get('q')}%`); }
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
    return db.prepare(`${sql} ORDER BY c.name, b.name`).all(...params);
  }
  if (entity === 'menu_items') {
    if (!query.get('store_id')) throw new HttpError(400, 'store_id を指定してください。');
    return db.prepare('SELECT * FROM menu_items WHERE store_id = ? ORDER BY id').all(Number(query.get('store_id')));
  }
  let sql = 'SELECT * FROM clients';
  if (query.get('q')) { sql += ' WHERE name LIKE ? OR contact_person LIKE ?'; params.push(`%${query.get('q')}%`, `%${query.get('q')}%`); }
  return db.prepare(`${sql} ORDER BY name`).all(...params);
}

function listPosts(db, query) {
  const where = [];
  const params = [];
  if (query.get('store_id')) { where.push('p.store_id = ?'); params.push(Number(query.get('store_id'))); }
  if (query.get('client_id')) { where.push('c.id = ?'); params.push(Number(query.get('client_id'))); }
  if (query.get('status')) { where.push('p.status = ?'); params.push(query.get('status')); }
  if (query.get('batch_id')) { where.push('p.batch_id = ?'); params.push(query.get('batch_id')); }
  if (query.get('theme')) { where.push('p.theme LIKE ?'); params.push(`%${query.get('theme')}%`); }
  if (query.get('q')) {
    where.push('(p.catchcopy LIKE ? OR p.body_ja LIKE ? OR p.theme LIKE ? OR s.name LIKE ?)');
    params.push(...Array(4).fill(`%${query.get('q')}%`));
  }
  if (query.get('from')) { where.push('p.created_at >= ?'); params.push(query.get('from')); }
  if (query.get('to')) { where.push('p.created_at < ?'); params.push(`${query.get('to')}T23:59:59.999Z`); }
  const sql = `SELECT p.*, s.name AS store_name, s.store_code, b.name AS brand_name, c.name AS client_name
    FROM post_sets p JOIN stores s ON s.id = p.store_id JOIN brands b ON b.id = s.brand_id JOIN clients c ON c.id = b.client_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY p.created_at DESC, p.id DESC LIMIT 500`;
  return db.prepare(sql).all(...params).map(expandPost);
}

function expandPost(p) {
  if (!p) return p;
  return {
    ...p,
    request: p.request_json ? JSON.parse(p.request_json) : null,
    context: p.context_json ? JSON.parse(p.context_json) : null,
    generated: p.generated_json ? JSON.parse(p.generated_json) : null,
    validation: p.checks_json ? JSON.parse(p.checks_json) : null,
    status_label: POST_STATUS_LABELS[p.status],
  };
}

function getPost(db, id) {
  const p = db.prepare(`SELECT p.*, s.name AS store_name, s.store_code, b.name AS brand_name, c.name AS client_name
    FROM post_sets p JOIN stores s ON s.id = p.store_id JOIN brands b ON b.id = s.brand_id JOIN clients c ON c.id = b.client_id
    WHERE p.id = ?`).get(Number(id));
  return p ? expandPost(p) : null;
}

const CSV_COLUMNS = {
  clients: ['id', ...FIELDS.clients, 'updated_at', 'updated_by'],
  brands: ['id', ...FIELDS.brands, 'updated_at', 'updated_by'],
  stores: ['id', 'store_code', ...FIELDS.stores, 'updated_at', 'updated_by'],
  menu_items: ['id', ...FIELDS.menu_items, 'updated_at', 'updated_by'],
  post_sets: ['id', 'store_id', 'store_code', 'store_name', 'theme', 'set_no', 'status', 'catchcopy', 'body_ja', 'body_en', 'created_at', 'created_by', 'updated_at', 'updated_by'],
};

function importCsv(db, entity, text, user) {
  const rows = parseCsv(text);
  const result = { created: 0, updated: 0, errors: [] };
  db.exec('BEGIN');
  try {
    rows.forEach((r, i) => {
      const line = i + 2;
      try {
        const data = {};
        for (const f of FIELDS[entity]) if (r[f] !== undefined) data[f] = r[f] === '' ? null : r[f];
        if (r.id) {
          const existing = getRow(db, entity, r.id);
          if (!existing) throw new HttpError(400, `id=${r.id} が見つかりません（新規登録は id を空欄にしてください）`);
          const parent = PARENT[entity];
          if (parent && data[parent[0]] && String(data[parent[0]]) !== String(existing[parent[0]])) {
            throw new HttpError(400, `${parent[0]} は変更できません`);
          }
          validateEntity(db, entity, data, false);
          updateRow(db, entity, r.id, data, user);
          result.updated += 1;
        } else {
          validateEntity(db, entity, data, true);
          insertRow(db, entity, data, user);
          result.created += 1;
        }
      } catch (e) {
        result.errors.push(`${line}行目: ${e.message}`);
      }
    });
    if (result.errors.length) {
      db.exec('ROLLBACK');
      return { ...result, created: 0, updated: 0, rolledBack: true };
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return result;
}

function serveStatic(res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, 'Not found');
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

export function createApp({ db, specFile, providerOverride }) {
  const spec = () => loadSpec(specFile);

  async function route(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const { pathname } = url;
    const q = url.searchParams;
    const m = req.method;
    const parts = pathname.split('/').filter(Boolean);

    if (!pathname.startsWith('/api/')) return serveStatic(res, pathname);

    if (pathname === '/api/meta' && m === 'GET') {
      return send(res, 200, {
        aiConfigured: PROVIDERS.anthropic.isConfigured(),
        model: process.env.ANTHROPIC_MODEL || 'claude-opus-5-5',
        statuses: POST_STATUSES.map((s) => ({ value: s, label: POST_STATUS_LABELS[s] })),
        spec: spec(),
        externalPosting: false,
      });
    }

    if (pathname === '/api/spec') {
      if (m === 'GET') return send(res, 200, spec());
      if (m === 'PUT') {
        const user = requireUser(req);
        const before = spec();
        const next = await readJson(req);
        next.verifiedBy = next.verifiedBy || user;
        try { saveSpec(specFile, next); } catch (e) { throw new HttpError(400, e.message); }
        db.prepare('INSERT INTO history (entity, entity_id, action, before_json, after_json, user_name, at) VALUES (?, 0, ?, ?, ?, ?, ?)')
          .run('google_spec', 'update', JSON.stringify(before), JSON.stringify(next), user, new Date().toISOString());
        return send(res, 200, spec());
      }
    }

    if (parts[1] === 'history' && parts.length === 4 && m === 'GET') {
      return send(res, 200, listHistory(db, parts[2], parts[3]));
    }

    if (ENTITIES.includes(parts[1])) {
      const entity = parts[1];
      const id = parts[2];
      if (!id && m === 'GET') return send(res, 200, listEntity(db, entity, q));
      if (!id && m === 'POST') {
        const user = requireUser(req);
        const data = await readJson(req);
        validateEntity(db, entity, data, true);
        return send(res, 201, insertRow(db, entity, data, user));
      }
      if (id && m === 'GET') {
        if (entity === 'stores') {
          const b = storeWithParents(db, id);
          return b ? send(res, 200, { ...b.store, brand: b.brand, client: b.client, menu: b.menu }) : send(res, 404, { error: '見つかりません' });
        }
        const row = getRow(db, entity, id);
        return row ? send(res, 200, row) : send(res, 404, { error: '見つかりません' });
      }
      if (id && m === 'PUT') {
        const user = requireUser(req);
        const data = await readJson(req);
        validateEntity(db, entity, data, false);
        const row = updateRow(db, entity, id, data, user);
        return row ? send(res, 200, row) : send(res, 404, { error: '見つかりません' });
      }
      if (id && m === 'DELETE') {
        const user = requireUser(req);
        return deleteRow(db, entity, id, user) ? send(res, 200, { ok: true }) : send(res, 404, { error: '見つかりません' });
      }
    }

    if (pathname === '/api/generate/preflight' && m === 'POST') {
      return send(res, 200, preflight(db, spec(), await readJson(req)));
    }
    if (pathname === '/api/generate' && m === 'POST') {
      const user = requireUser(req);
      const body = await readJson(req);
      const out = await generatePosts(db, spec(), body, user, { provider: providerOverride });
      out.results = out.results.map((r) => ({ ...r, posts: r.posts.map((p) => getPost(db, p.id)) }));
      return send(res, 200, out);
    }

    if (parts[1] === 'posts') {
      const id = parts[2];
      if (!id && m === 'GET') return send(res, 200, listPosts(db, q));
      if (id && !parts[3] && m === 'GET') {
        const p = getPost(db, id);
        return p ? send(res, 200, p) : send(res, 404, { error: '見つかりません' });
      }
      if (id && !parts[3] && m === 'PUT') {
        const user = requireUser(req);
        const data = await readJson(req);
        const row = updateRow(db, 'post_sets', id, data, user);
        if (!row) return send(res, 404, { error: '見つかりません' });
        revalidate(db, spec(), row);
        return send(res, 200, getPost(db, id));
      }
      if (id && parts[3] === 'duplicate' && m === 'POST') {
        const user = requireUser(req);
        const row = duplicatePost(db, id, user);
        return row ? send(res, 201, getPost(db, row.id)) : send(res, 404, { error: '見つかりません' });
      }
    }

    if (parts[1] === 'export' && m === 'GET') {
      const entity = (parts[2] || '').replace(/\.csv$/, '');
      if (!CSV_COLUMNS[entity]) return send(res, 404, { error: '出力対象が不正です' });
      const rows = entity === 'post_sets' ? listPosts(db, q) : entity === 'stores' ? listEntity(db, 'stores', q)
        : db.prepare(`SELECT * FROM ${entity} ORDER BY id`).all();
      const date = new Date().toISOString().slice(0, 10);
      return send(res, 200, toCsv(rows, CSV_COLUMNS[entity]), {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${entity}_${date}.csv"`,
      });
    }
    if (parts[1] === 'import' && m === 'POST') {
      const entity = parts[2];
      if (!ENTITIES.includes(entity)) return send(res, 404, { error: '取込対象が不正です' });
      const user = requireUser(req);
      const out = importCsv(db, entity, await readBody(req), user);
      return send(res, out.errors.length ? 400 : 200, out);
    }
    if (pathname === '/api/backup' && m === 'GET') {
      const date = new Date().toISOString().replace(/[:.]/g, '-');
      return send(res, 200, { exportedAt: new Date().toISOString(), spec: spec(), data: dumpAll(db) }, {
        'content-disposition': `attachment; filename="backup_${date}.json"`,
      });
    }
    return send(res, 404, { error: 'Not found' });
  }

  return async (req, res) => {
    if (!checkAuth(req)) {
      res.writeHead(401, { 'www-authenticate': 'Basic realm="post-tool", charset="UTF-8"' });
      return res.end('認証が必要です');
    }
    try {
      await route(req, res);
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error(e);
      send(res, status, { error: status >= 500 && !e.status ? `サーバーエラー: ${e.message}` : e.message });
    }
  };
}
