// 起動: npm start  （PORT, DATA_DIR, ANTHROPIC_API_KEY, APP_PASSWORD を環境変数で指定）
import http from 'node:http';
import path from 'node:path';
import { openDb } from './src/db.js';
import { createApp } from './src/app.js';

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const db = openDb(path.join(dataDir, 'post-tool.db'));
const app = createApp({ db, specFile: path.join(dataDir, 'google-spec.json') });
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';

http.createServer(app).listen(port, host, () => {
  console.log(`Google投稿コンテンツ生成ツール: http://${host}:${port}`);
  console.log(process.env.ANTHROPIC_API_KEY ? 'AI生成: 有効' : 'AI生成: 無効（ANTHROPIC_API_KEY 未設定のためデモ生成のみ）');
});
