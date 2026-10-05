// SQLite（Node.js 組み込みの node:sqlite）によるデータ保存と変更履歴。
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

// エンティティごとの編集可能な列。ここに無い列は API から書き込めない。
export const FIELDS = {
  clients: ['name', 'contact_person', 'notes'],
  brands: [
    'client_id', 'name', 'industry', 'features', 'tone', 'preferred_phrases',
    'avoid_phrases', 'logo_url', 'design_guide', 'reference_posts', 'notes',
  ],
  stores: [
    'brand_id', 'name', 'area', 'address', 'google_maps_url', 'business_hours',
    'regular_holidays', 'temporary_closures', 'reservation_method', 'reservation_url',
    'atmosphere', 'use_scenes', 'target', 'features', 'services', 'facilities',
    'parking', 'access', 'floor_info', 'cta_options', 'tone', 'notes',
    'verified_at', 'verified_source', 'verified_by',
  ],
  menu_items: ['store_id', 'name', 'description', 'price', 'sales_period'],
  post_sets: [
    'catchcopy', 'body_ja', 'body_en', 'status', 'reviewer_note',
  ],
};

export const POST_STATUSES = ['draft', 'review', 'approved', 'used'];
export const POST_STATUS_LABELS = { draft: '下書き', review: '確認待ち', approved: '承認済み', used: '使用済み' };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, contact_person TEXT, notes TEXT,
  created_at TEXT NOT NULL, created_by TEXT, updated_at TEXT NOT NULL, updated_by TEXT
);
CREATE TABLE IF NOT EXISTS brands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  name TEXT NOT NULL, industry TEXT, features TEXT, tone TEXT,
  preferred_phrases TEXT, avoid_phrases TEXT, logo_url TEXT, design_guide TEXT,
  reference_posts TEXT, notes TEXT,
  created_at TEXT NOT NULL, created_by TEXT, updated_at TEXT NOT NULL, updated_by TEXT
);
CREATE TABLE IF NOT EXISTS stores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_code TEXT UNIQUE,
  brand_id INTEGER NOT NULL REFERENCES brands(id),
  name TEXT NOT NULL, area TEXT, address TEXT, google_maps_url TEXT,
  business_hours TEXT, regular_holidays TEXT, temporary_closures TEXT,
  reservation_method TEXT, reservation_url TEXT,
  atmosphere TEXT, use_scenes TEXT, target TEXT, features TEXT, services TEXT, facilities TEXT,
  parking TEXT, access TEXT, floor_info TEXT, cta_options TEXT, tone TEXT, notes TEXT,
  verified_at TEXT, verified_source TEXT, verified_by TEXT,
  created_at TEXT NOT NULL, created_by TEXT, updated_at TEXT NOT NULL, updated_by TEXT
);
CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL REFERENCES stores(id),
  name TEXT NOT NULL, description TEXT, price TEXT, sales_period TEXT,
  created_at TEXT NOT NULL, created_by TEXT, updated_at TEXT NOT NULL, updated_by TEXT
);
CREATE TABLE IF NOT EXISTS post_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL REFERENCES stores(id),
  batch_id TEXT, set_no INTEGER NOT NULL DEFAULT 1,
  theme TEXT, request_json TEXT NOT NULL, context_json TEXT NOT NULL,
  catchcopy TEXT NOT NULL, body_ja TEXT NOT NULL, body_en TEXT NOT NULL,
  generated_json TEXT, checks_json TEXT, provider TEXT,
  status TEXT NOT NULL DEFAULT 'draft', reviewer_note TEXT,
  duplicated_from INTEGER,
  created_at TEXT NOT NULL, created_by TEXT, updated_at TEXT NOT NULL, updated_by TEXT
);
CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity TEXT NOT NULL, entity_id INTEGER NOT NULL, action TEXT NOT NULL,
  before_json TEXT, after_json TEXT, user_name TEXT, at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_history_entity ON history(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_posts_store ON post_sets(store_id);
`;

export function now() {
  return new Date().toISOString();
}

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

function clean(entity, data) {
  const out = {};
  for (const key of FIELDS[entity]) {
    if (data[key] === undefined) continue;
    let v = data[key];
    if (key === 'cta_options' && typeof v !== 'string') v = JSON.stringify(v ?? []);
    out[key] = v === null ? null : String(v);
  }
  return out;
}

export function logHistory(db, entity, entityId, action, before, after, user) {
  db.prepare(
    'INSERT INTO history (entity, entity_id, action, before_json, after_json, user_name, at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(entity, entityId, action, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, user || null, now());
}

export function getRow(db, entity, id) {
  return db.prepare(`SELECT * FROM ${entity} WHERE id = ?`).get(Number(id)) || null;
}

export function insertRow(db, entity, data, user) {
  const row = clean(entity, data);
  const ts = now();
  Object.assign(row, { created_at: ts, created_by: user || null, updated_at: ts, updated_by: user || null });
  const keys = Object.keys(row);
  const res = db.prepare(
    `INSERT INTO ${entity} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
  ).run(...keys.map((k) => row[k]));
  const id = Number(res.lastInsertRowid);
  if (entity === 'stores') {
    db.prepare('UPDATE stores SET store_code = ? WHERE id = ?').run(`ST-${String(id).padStart(5, '0')}`, id);
  }
  const after = getRow(db, entity, id);
  logHistory(db, entity, id, 'create', null, after, user);
  return after;
}

export function updateRow(db, entity, id, data, user) {
  const before = getRow(db, entity, id);
  if (!before) return null;
  const row = clean(entity, data);
  // 顧客・ブランド・店舗の所属は付け替え不可（別顧客への混入防止）。
  delete row.client_id; delete row.brand_id; delete row.store_id;
  if (entity === 'post_sets' && row.status && !POST_STATUSES.includes(row.status)) {
    throw new HttpError(400, `不正な状態です: ${row.status}`);
  }
  const keys = Object.keys(row);
  if (keys.length === 0) return before;
  row.updated_at = now();
  row.updated_by = user || null;
  const all = Object.keys(row);
  db.prepare(`UPDATE ${entity} SET ${all.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
    .run(...all.map((k) => row[k]), Number(id));
  const after = getRow(db, entity, id);
  logHistory(db, entity, Number(id), 'update', before, after, user);
  return after;
}

export function deleteRow(db, entity, id, user) {
  const before = getRow(db, entity, id);
  if (!before) return false;
  const children = { clients: ['brands', 'client_id'], brands: ['stores', 'brand_id'], stores: ['post_sets', 'store_id'] }[entity];
  if (children) {
    const n = db.prepare(`SELECT COUNT(*) AS n FROM ${children[0]} WHERE ${children[1]} = ?`).get(Number(id)).n;
    if (n > 0) throw new HttpError(409, '紐づくデータがあるため削除できません。先に配下のデータを整理してください。');
  }
  if (entity === 'stores') db.prepare('DELETE FROM menu_items WHERE store_id = ?').run(Number(id));
  db.prepare(`DELETE FROM ${entity} WHERE id = ?`).run(Number(id));
  logHistory(db, entity, Number(id), 'delete', before, null, user);
  return true;
}

export function listHistory(db, entity, id) {
  return db.prepare('SELECT * FROM history WHERE entity = ? AND entity_id = ? ORDER BY id DESC').all(entity, Number(id));
}

export function storeWithParents(db, storeId) {
  const store = getRow(db, 'stores', storeId);
  if (!store) return null;
  const brand = getRow(db, 'brands', store.brand_id);
  const client = brand ? getRow(db, 'clients', brand.client_id) : null;
  const menu = db.prepare('SELECT * FROM menu_items WHERE store_id = ? ORDER BY id').all(store.id);
  return { client, brand, store, menu };
}

export function dumpAll(db) {
  const out = {};
  for (const t of ['clients', 'brands', 'stores', 'menu_items', 'post_sets', 'history']) {
    out[t] = db.prepare(`SELECT * FROM ${t} ORDER BY id`).all();
  }
  return out;
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
