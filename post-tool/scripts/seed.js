// テスト用データを投入する（架空の顧客・店舗）。 npm run seed
import path from 'node:path';
import { openDb } from '../src/db.js';
import { seedSampleData } from '../test/fixtures.js';

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const db = openDb(path.join(dataDir, 'post-tool.db'));
const n = db.prepare('SELECT COUNT(*) AS n FROM clients').get().n;
if (n > 0) {
  console.log('既にデータがあるため、テストデータは投入しませんでした。');
} else {
  seedSampleData(db, 'サンプル投入');
  console.log('テスト用データ（架空の2顧客・3店舗）を投入しました。');
}
