// SQLite データベースを data/backups/ に日時付きでコピーする。 npm run backup
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const src = path.join(dataDir, 'post-tool.db');
if (!fs.existsSync(src)) {
  console.error(`データベースが見つかりません: ${src}`);
  process.exit(1);
}
const dir = path.join(dataDir, 'backups');
fs.mkdirSync(dir, { recursive: true });
const dest = path.join(dir, `post-tool_${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
// VACUUM INTO で、書き込み中でも整合性のあるコピーを作る。
const db = new DatabaseSync(src);
db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
db.close();
console.log(`バックアップを作成しました: ${dest}`);
