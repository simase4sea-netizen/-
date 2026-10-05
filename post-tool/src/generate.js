// 投稿案セットの生成。店舗ごとに独立して生成し、結果を検証して下書き保存する。
import crypto from 'node:crypto';
import { storeWithParents, logHistory, getRow, now, HttpError } from './db.js';
import { buildContext, unresolvedConflicts, detectConflicts } from './context.js';
import { validateSet, otherStoreMarkers } from './validate.js';
import * as anthropic from './providers/anthropic.js';
import * as mock from './providers/mock.js';

export const PROVIDERS = { anthropic, mock };

export function chooseProvider(requested) {
  if (requested === 'mock') return mock;
  if (requested === 'anthropic') {
    if (!anthropic.isConfigured()) throw new HttpError(400, 'AI生成の APIキー（環境変数 ANTHROPIC_API_KEY）が設定されていません。');
    return anthropic;
  }
  return anthropic.isConfigured() ? anthropic : mock;
}

// 店舗ごとの入力 = 共通キャンペーン情報 + 店舗別の上書き
export function mergeRequest(common, perStore = {}) {
  const merged = { ...common };
  for (const [k, v] of Object.entries(perStore || {})) {
    if (v !== undefined && v !== null && String(v).trim() !== '') merged[k] = v;
  }
  return merged;
}

function sanitizeRequest(req) {
  const copy = { ...req };
  // 画像本体は保存しない（ファイル名のみ記録）。
  copy.images = (req.images || []).map((i) => ({ name: i.name }));
  return copy;
}

export function preflight(db, spec, body) {
  const storeIds = (body.storeIds || []).map(Number).filter(Boolean);
  if (storeIds.length === 0) throw new HttpError(400, '店舗を選択してください。');
  const bundles = storeIds.map((id) => {
    const b = storeWithParents(db, id);
    if (!b) throw new HttpError(404, `店舗が見つかりません（id=${id}）。`);
    return b;
  });
  const clientIds = new Set(bundles.map((b) => b.client?.id));
  if (clientIds.size > 1) throw new HttpError(400, '異なる顧客の店舗を同時に生成することはできません。顧客ごとに分けて生成してください。');
  return bundles.map((bundle) => {
    const req = mergeRequest(body.common || {}, body.perStore?.[bundle.store.id]);
    const ctx = buildContext(bundle, req, spec);
    return {
      storeId: bundle.store.id,
      storeCode: bundle.store.store_code,
      storeName: bundle.store.name,
      conflicts: detectConflicts(bundle, req),
      confirmations: ctx.confirmations,
    };
  });
}

export async function generatePosts(db, spec, body, user, { provider: forced } = {}) {
  const pre = preflight(db, spec, body);
  const provider = forced || chooseProvider(body.provider);
  const batchId = crypto.randomUUID();
  const results = [];
  for (const p of pre) {
    const req = mergeRequest(body.common || {}, body.perStore?.[p.storeId]);
    const pending = unresolvedConflicts(p.conflicts, req.resolutions);
    if (pending.length) {
      throw new HttpError(409, `${p.storeName}：投稿入力と店舗登録情報が異なる項目があります（${pending.map((c) => c.label).join('、')}）。どちらを使うか選んでください。`);
    }
  }
  for (const p of pre) {
    // 1店舗ずつ、その店舗の情報だけで生成する（他店舗の情報を混ぜない）。
    const bundle = storeWithParents(db, p.storeId);
    const req = mergeRequest(body.common || {}, body.perStore?.[p.storeId]);
    const ctx = buildContext(bundle, req, spec);
    const out = await provider.generate(ctx, { images: req.images || [] });
    const sets = (out.sets || []).slice(0, ctx.setCount);
    if (sets.length === 0) throw new HttpError(502, `${p.storeName}：生成結果が空でした。`);
    const markers = otherStoreMarkers(db, ctx);
    const saved = [];
    sets.forEach((set, idx) => {
      const validation = validateSet(set, ctx, spec, { otherMarkers: markers, siblings: sets });
      const ts = now();
      const res = db.prepare(`INSERT INTO post_sets (store_id, batch_id, set_no, theme, request_json, context_json, catchcopy, body_ja, body_en,
        generated_json, checks_json, provider, status, created_at, created_by, updated_at, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`).run(
        ctx.store.id, batchId, idx + 1, req.theme || null, JSON.stringify(sanitizeRequest(req)), JSON.stringify(ctx),
        set.catchcopy, set.body_ja, set.body_en, JSON.stringify({ ...set, model: out.model }), JSON.stringify(validation),
        provider.name, ts, user || null, ts, user || null,
      );
      const row = getRow(db, 'post_sets', Number(res.lastInsertRowid));
      logHistory(db, 'post_sets', row.id, 'create', null, row, user);
      saved.push(getRow(db, 'post_sets', row.id));
    });
    results.push({ storeId: p.storeId, storeName: p.storeName, storeCode: p.storeCode, posts: saved });
  }
  return { batchId, provider: provider.name, results };
}

// 編集後の再チェック（保存時に呼ぶ）。
export function revalidate(db, spec, post) {
  const ctx = JSON.parse(post.context_json);
  const set = { catchcopy: post.catchcopy, body_ja: post.body_ja, body_en: post.body_en };
  const validation = validateSet(set, ctx, spec, { otherMarkers: otherStoreMarkers(db, ctx) });
  db.prepare('UPDATE post_sets SET checks_json = ? WHERE id = ?').run(JSON.stringify(validation), post.id);
  return validation;
}

export function duplicatePost(db, id, user) {
  const src = getRow(db, 'post_sets', id);
  if (!src) return null;
  const ts = now();
  const res = db.prepare(`INSERT INTO post_sets (store_id, batch_id, set_no, theme, request_json, context_json, catchcopy, body_ja, body_en,
    generated_json, checks_json, provider, status, duplicated_from, created_at, created_by, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)`).run(
    src.store_id, src.batch_id, src.set_no, src.theme, src.request_json, src.context_json, src.catchcopy, src.body_ja, src.body_en,
    src.generated_json, src.checks_json, src.provider, src.id, ts, user || null, ts, user || null,
  );
  const row = getRow(db, 'post_sets', Number(res.lastInsertRowid));
  logHistory(db, 'post_sets', row.id, 'duplicate', null, row, user);
  return row;
}
