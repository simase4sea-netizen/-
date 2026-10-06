import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { DEFAULT_SETTINGS, initialStore } from "../defaults";
import type { Store } from "../types";

// データはローカルのJSONファイルに保存する。外部には送らない。
export function dataDir(): string {
  return path.resolve(process.env.BRAIN_STUDIO_DATA_DIR || path.join(process.cwd(), "data"));
}

export function storePath(): string {
  return path.join(dataDir(), "store.json");
}

let queue: Promise<unknown> = Promise.resolve();

/** 読み書きを直列化して、同時保存による破損を防ぐ */
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => undefined);
  return next;
}

async function readRaw(): Promise<Store> {
  try {
    const text = await fs.readFile(storePath(), "utf8");
    const parsed = JSON.parse(text) as Store;
    return {
      ...parsed,
      settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
      cases: parsed.cases ?? [],
      projects: parsed.projects ?? [],
    };
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      const store = initialStore();
      await writeRaw(store);
      return store;
    }
    if (e instanceof SyntaxError) {
      // 壊れたファイルは退避して、新しいデータで開始する
      const broken = `${storePath()}.broken-${Date.now()}`;
      await fs.rename(storePath(), broken);
      console.error(`store.json を読み込めなかったため ${broken} に退避しました`);
      const store = initialStore();
      await writeRaw(store);
      return store;
    }
    throw e;
  }
}

async function writeRaw(store: Store): Promise<void> {
  await fs.mkdir(dataDir(), { recursive: true });
  const tmp = `${storePath()}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), "utf8");
  await fs.rename(tmp, storePath());
}

export function readStore(): Promise<Store> {
  return serialize(readRaw);
}

export function updateStore<T>(fn: (store: Store) => T): Promise<T> {
  return serialize(async () => {
    const store = await readRaw();
    const result = fn(store);
    await writeRaw(store);
    return result;
  });
}
