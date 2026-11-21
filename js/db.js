// IndexedDB による永続化層
// ストア:
//   counters : カウンター本体（id）
//   records  : カウント記録（自動採番 id, counterId, day 'YYYY-MM-DD', ts）
//   images   : 画像 Blob（id）
//   settings : アプリ設定（key → value）

const DB_NAME = 'counter-app';
const DB_VERSION = 1;

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      // 将来のバージョンアップでも既存ストアは消さず、足りないものだけ追加する
      if (!db.objectStoreNames.contains('counters')) {
        db.createObjectStore('counters', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('records')) {
        const s = db.createObjectStore('records', { keyPath: 'id', autoIncrement: true });
        s.createIndex('counterId', 'counterId');
        s.createIndex('day', 'day');
      }
      if (!db.objectStoreNames.contains('images')) {
        db.createObjectStore('images', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function reqP(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('transaction aborted'));
  });
}

export async function getAll(store) {
  const db = await openDB();
  return reqP(db.transaction(store).objectStore(store).getAll());
}

export async function get(store, key) {
  const db = await openDB();
  return reqP(db.transaction(store).objectStore(store).get(key));
}

export async function put(store, value) {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  const r = tx.objectStore(store).put(value);
  const key = await reqP(r);
  await txDone(tx);
  return key;
}

export async function putMany(store, values) {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  for (const v of values) os.put(v);
  await txDone(tx);
}

export async function del(store, key) {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  await txDone(tx);
}

/** 記録を1件追加し、採番された id を返す */
export async function addRecord(rec) {
  const db = await openDB();
  const tx = db.transaction('records', 'readwrite');
  const id = await reqP(tx.objectStore('records').add(rec));
  await txDone(tx);
  return id;
}

/** カウンターと、その記録・画像をまとめて削除 */
export async function deleteCounterCascade(counter) {
  const db = await openDB();
  const tx = db.transaction(['counters', 'records', 'images'], 'readwrite');
  tx.objectStore('counters').delete(counter.id);
  const idx = tx.objectStore('records').index('counterId');
  const keys = await reqP(idx.getAllKeys(counter.id));
  const rs = tx.objectStore('records');
  for (const k of keys) rs.delete(k);
  for (const imgId of [counter.iconImageId, counter.detailImageId]) {
    if (imgId) tx.objectStore('images').delete(imgId);
  }
  await txDone(tx);
}

/** 全データ削除（バックアップ復元時に使用） */
export async function clearAll() {
  const db = await openDB();
  const stores = ['counters', 'records', 'images', 'settings'];
  const tx = db.transaction(stores, 'readwrite');
  for (const s of stores) tx.objectStore(s).clear();
  await txDone(tx);
}
