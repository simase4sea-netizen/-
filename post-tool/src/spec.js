// Googleビジネスプロフィール投稿の仕様値を読み書きする。値はコードに固定しない。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_SPEC_FILE = path.join(here, '..', 'config', 'google-spec.default.json');

export function loadSpec(overrideFile) {
  const base = JSON.parse(fs.readFileSync(DEFAULT_SPEC_FILE, 'utf8'));
  if (overrideFile && fs.existsSync(overrideFile)) {
    return { ...base, ...JSON.parse(fs.readFileSync(overrideFile, 'utf8')) };
  }
  return base;
}

export function saveSpec(overrideFile, spec) {
  const maxChars = Number(spec?.postBody?.maxChars);
  if (!Number.isInteger(maxChars) || maxChars <= 0) {
    throw new Error('postBody.maxChars は正の整数で指定してください。');
  }
  fs.mkdirSync(path.dirname(overrideFile), { recursive: true });
  fs.writeFileSync(overrideFile, JSON.stringify(spec, null, 2));
}

// Google の文字数はコードポイント単位で数える（絵文字・サロゲートペアも1文字以上として扱う）。
export function countChars(text) {
  return [...String(text ?? '')].length;
}
