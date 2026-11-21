// アプリ状態（メモリ上のキャッシュ）と、変更・集計の窓口
import * as db from './db.js';
import { uid, dayKey, todayKey, parseDayKey, addDays } from './util.js';

const DATA_VERSION = 1;

export const DEFAULT_SETTINGS = {
  appName: 'カウンター',
  weekStart: 1, // 0=日曜, 1=月曜
  favCountMode: 'day', // 好きな順モードのカードに出す回数: 'day'=選択日, 'total'=累計
  sound: true,
  haptics: true,
  theme: 'system', // 'system' | 'light' | 'dark'
};

const state = {
  counters: [], // 正規化済みカウンター
  byId: new Map(),
  // counterId -> Map(day -> [{id, ts}])
  recs: new Map(),
  // 集計キャッシュ
  totals: new Map(), // cid -> n
  yearTotals: new Map(), // cid -> Map(year -> n)
  monthTotals: new Map(), // cid -> Map('YYYY-MM' -> n)
  dayTotalsAll: new Map(), // day -> n（全カウンター合計）
  settings: { ...DEFAULT_SETTINGS },
  selectedDay: todayKey(),
  imageURLs: new Map(),
};

const listeners = new Set();
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit(detail) {
  for (const fn of listeners) {
    try {
      fn(detail);
    } catch (e) {
      console.error(e);
    }
  }
}

// ---------- 正規化（古いデータ・欠けたフィールドに初期値を補う） ----------
function normalizeCounter(c, i) {
  return {
    id: c.id ?? uid(),
    name: typeof c.name === 'string' ? c.name : '名称未設定',
    iconImageId: c.iconImageId ?? null,
    detailImageId: c.detailImageId ?? null,
    createdAt: typeof c.createdAt === 'number' ? c.createdAt : Date.now(),
    order: typeof c.order === 'number' ? c.order : i,
    tags: Array.isArray(c.tags) ? c.tags.filter((t) => typeof t === 'string' && t.trim()) : [],
    infoFields: Array.isArray(c.infoFields)
      ? c.infoFields.map((f) => ({
          id: f.id ?? uid(),
          title: String(f.title ?? ''),
          content: String(f.content ?? ''),
        }))
      : [],
    pinned: !!c.pinned,
    v: DATA_VERSION,
  };
}

function bump(map, key, n) {
  const v = (map.get(key) || 0) + n;
  if (v <= 0) map.delete(key);
  else map.set(key, v);
}

function indexRecord(r, sign) {
  const cid = r.counterId;
  if (!state.recs.has(cid)) state.recs.set(cid, new Map());
  const days = state.recs.get(cid);
  if (sign > 0) {
    if (!days.has(r.day)) days.set(r.day, []);
    days.get(r.day).push({ id: r.id, ts: r.ts });
  }
  state.totals.set(cid, (state.totals.get(cid) || 0) + sign);
  if (!state.yearTotals.has(cid)) state.yearTotals.set(cid, new Map());
  if (!state.monthTotals.has(cid)) state.monthTotals.set(cid, new Map());
  bump(state.yearTotals.get(cid), Number(r.day.slice(0, 4)), sign);
  bump(state.monthTotals.get(cid), r.day.slice(0, 7), sign);
  bump(state.dayTotalsAll, r.day, sign);
}

// ---------- 初期読み込み ----------
export async function load() {
  const [counters, records, settings] = await Promise.all([
    db.getAll('counters'),
    db.getAll('records'),
    db.getAll('settings'),
  ]);
  counters.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  state.counters = counters.map(normalizeCounter);
  state.byId = new Map(state.counters.map((c) => [c.id, c]));
  for (const r of records) {
    if (!state.byId.has(r.counterId) || typeof r.day !== 'string') continue;
    indexRecord(r, +1);
  }
  for (const days of state.recs.values()) {
    for (const arr of days.values()) arr.sort((a, b) => a.ts - b.ts);
  }
  const s = { ...DEFAULT_SETTINGS };
  for (const row of settings) if (row.key in DEFAULT_SETTINGS) s[row.key] = row.value;
  state.settings = s;
}

// ---------- 参照 ----------
export const getState = () => state;
export const counters = () => state.counters;
export const counter = (id) => state.byId.get(id);
export const settings = () => state.settings;
export const selectedDay = () => state.selectedDay;

export function setSelectedDay(key) {
  state.selectedDay = key;
  emit({ type: 'selectedDay' });
}

export function allTags() {
  const set = new Set();
  for (const c of state.counters) for (const t of c.tags) set.add(t);
  return [...set].sort((a, b) => a.localeCompare(b, 'ja'));
}

/** ユーザー指定順（order）での比較 */
export function byOrder(a, b) {
  return a.order - b.order;
}

// ---------- 集計 ----------
export function countOn(cid, day) {
  return state.recs.get(cid)?.get(day)?.length || 0;
}
export function total(cid) {
  return state.totals.get(cid) || 0;
}
export function yearCount(cid, year) {
  return state.yearTotals.get(cid)?.get(year) || 0;
}
export function monthCount(cid, year, month) {
  const k = `${year}-${String(month).padStart(2, '0')}`;
  return state.monthTotals.get(cid)?.get(k) || 0;
}
export function dayTotalAll(day) {
  return state.dayTotalsAll.get(day) || 0;
}
export function grandTotal() {
  let n = 0;
  for (const c of state.counters) n += total(c.id);
  return n;
}

/** 指定カウンター（null なら全体）の日別回数 */
export function dayCount(cid, day) {
  return cid ? countOn(cid, day) : dayTotalAll(day);
}

/** 期間 [start, end]（Date, 両端含む）の合計と1日の最高回数 */
export function rangeStats(cid, start, end) {
  let sum = 0;
  let max = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const n = dayCount(cid, dayKey(d));
    sum += n;
    if (n > max) max = n;
  }
  return { sum, max };
}

/** 記録のある日付キーの一覧（cid 指定時はそのカウンター） */
export function recordedDays(cid) {
  if (cid) return [...(state.recs.get(cid)?.entries() || [])].filter(([, a]) => a.length).map(([k]) => k);
  return [...state.dayTotalsAll.keys()];
}

/** 年→月→日の階層データ（詳細画面用） */
export function hierarchy(cid) {
  const days = state.recs.get(cid);
  const years = new Map();
  if (days) {
    for (const [day, arr] of days) {
      if (!arr.length) continue;
      const y = Number(day.slice(0, 4));
      const m = Number(day.slice(5, 7));
      if (!years.has(y)) years.set(y, { year: y, total: 0, months: new Map() });
      const Y = years.get(y);
      Y.total += arr.length;
      if (!Y.months.has(m)) Y.months.set(m, { month: m, total: 0, days: [] });
      const M = Y.months.get(m);
      M.total += arr.length;
      M.days.push({ day, count: arr.length });
    }
  }
  return [...years.values()]
    .sort((a, b) => b.year - a.year) // 年は新しい順
    .map((Y) => ({
      ...Y,
      months: [...Y.months.values()]
        .sort((a, b) => a.month - b.month) // 月は時系列順
        .map((M) => ({ ...M, days: M.days.sort((a, b) => (a.day < b.day ? -1 : 1)) })),
    }));
}

/** その日の内訳（多い順、同数は並び順） */
export function dayBreakdown(day) {
  return state.counters
    .map((c) => ({ c, n: countOn(c.id, day) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || byOrder(a.c, b.c));
}

/** 全体カレンダーの代表カウンター（最多、同数は並び順が早い方） */
export function topCounterOn(day) {
  let best = null;
  let bestN = 0;
  for (const c of [...state.counters].sort(byOrder)) {
    const n = countOn(c.id, day);
    if (n > bestN) {
      best = c;
      bestN = n;
    }
  }
  return best;
}

export function firstRecordYear(cid) {
  let min = null;
  const maps = cid ? [state.yearTotals.get(cid)] : [...state.yearTotals.values()];
  for (const m of maps) {
    if (!m) continue;
    for (const y of m.keys()) if (min === null || y < min) min = y;
  }
  return min;
}

// ---------- カウント操作 ----------
function tsForDay(day) {
  // 選択日の「現在時刻」を記録日時にする
  const d = parseDayKey(day);
  const now = new Date();
  d.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  return d.getTime();
}

export async function increment(cid, day = state.selectedDay) {
  const rec = { counterId: cid, day, ts: tsForDay(day) };
  // 先にメモリへ反映して表示を即時更新し、その後保存する
  const tempId = 'tmp-' + uid();
  rec.id = tempId;
  indexRecord(rec, +1);
  emit({ type: 'count', cid, day });
  try {
    const { id, ...toSave } = rec;
    const realId = await db.addRecord(toSave);
    const arr = state.recs.get(cid)?.get(day);
    const item = arr?.find((x) => x.id === tempId);
    if (item) item.id = realId;
  } catch (e) {
    console.error(e);
    removeFromIndex(cid, day, tempId);
    emit({ type: 'count', cid, day });
    throw e;
  }
}

function removeFromIndex(cid, day, id) {
  const arr = state.recs.get(cid)?.get(day);
  if (!arr) return null;
  const i = arr.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const [item] = arr.splice(i, 1);
  if (!arr.length) state.recs.get(cid).delete(day);
  indexRecord({ counterId: cid, day, id }, -1);
  return item;
}

/** 選択日の記録を1件減らす。0件なら false */
export async function decrement(cid, day = state.selectedDay) {
  const arr = state.recs.get(cid)?.get(day);
  if (!arr || !arr.length) return false;
  // 一番新しい記録を消す（保存中の仮IDは避ける）
  let target = null;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (typeof arr[i].id === 'number') {
      target = arr[i];
      break;
    }
  }
  if (!target) return false;
  removeFromIndex(cid, day, target.id);
  emit({ type: 'count', cid, day });
  try {
    await db.del('records', target.id);
  } catch (e) {
    console.error(e);
  }
  return true;
}

/** 特定日の回数を指定値に合わせる */
export async function setDayCount(cid, day, n) {
  n = Math.max(0, Math.floor(n));
  let cur = countOn(cid, day);
  while (cur < n) {
    await increment(cid, day);
    cur++;
  }
  while (cur > n) {
    if (!(await decrement(cid, day))) break;
    cur--;
  }
}

// ---------- カウンター編集 ----------
export async function createCounter({ name, iconImageId, detailImageId, tags }) {
  const maxOrder = state.counters.reduce((m, c) => Math.max(m, c.order), -1);
  const c = normalizeCounter({
    id: uid(),
    name,
    iconImageId,
    detailImageId,
    tags,
    createdAt: Date.now(),
    order: maxOrder + 1,
  });
  await db.put('counters', c);
  state.counters.push(c);
  state.byId.set(c.id, c);
  emit({ type: 'counters' });
  return c;
}

export async function updateCounter(id, patch) {
  const c = state.byId.get(id);
  if (!c) return;
  const oldImages = [c.iconImageId, c.detailImageId];
  Object.assign(c, patch);
  await db.put('counters', c);
  // 使われなくなった画像を削除
  for (const img of oldImages) {
    if (img && img !== c.iconImageId && img !== c.detailImageId) await deleteImage(img);
  }
  emit({ type: 'counters', cid: id });
}

export async function deleteCounter(id) {
  const c = state.byId.get(id);
  if (!c) return;
  await db.deleteCounterCascade(c);
  for (const img of [c.iconImageId, c.detailImageId]) revokeImage(img);
  state.counters = state.counters.filter((x) => x.id !== id);
  state.byId.delete(id);
  const days = state.recs.get(id);
  if (days) for (const [day, arr] of days) bump(state.dayTotalsAll, day, -arr.length);
  state.recs.delete(id);
  state.totals.delete(id);
  state.yearTotals.delete(id);
  state.monthTotals.delete(id);
  emit({ type: 'counters' });
}

export async function saveOrder(ids) {
  ids.forEach((id, i) => {
    const c = state.byId.get(id);
    if (c) c.order = i;
  });
  // 並び替え対象外（絞り込みで非表示）だったものは後ろに
  let n = ids.length;
  for (const c of [...state.counters].sort(byOrder)) if (!ids.includes(c.id)) c.order = n++;
  state.counters.sort(byOrder);
  await db.putMany('counters', state.counters);
  emit({ type: 'counters' });
}

export async function setSetting(key, value) {
  state.settings[key] = value;
  await db.put('settings', { key, value });
  emit({ type: 'settings', key });
}

// ---------- 画像 ----------
/** 画像ファイルを縮小して保存し、画像IDを返す */
export async function saveImageFile(file, maxSize) {
  const blob = await resizeImage(file, maxSize);
  const id = uid();
  await db.put('images', { id, blob });
  return id;
}

async function resizeImage(file, maxSize) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // createImageBitmap 非対応形式は <img> 経由で読む
    bitmap = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }
  const w = bitmap.width;
  const h = bitmap.height;
  const scale = Math.min(1, maxSize / Math.max(w, h));
  const cw = Math.round(w * scale);
  const ch = Math.round(h * scale);
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, cw, ch);
  if (bitmap.close) bitmap.close();
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b || file), 'image/jpeg', 0.86));
}

export async function imageURL(id) {
  if (!id) return null;
  if (state.imageURLs.has(id)) return state.imageURLs.get(id);
  const row = await db.get('images', id);
  if (!row) return null;
  const url = URL.createObjectURL(row.blob);
  state.imageURLs.set(id, url);
  return url;
}
/** キャッシュ済みなら同期的に URL を返す */
export function imageURLSync(id) {
  return id ? state.imageURLs.get(id) || null : null;
}

/** 起動時に全画像の URL を用意しておく（一覧表示を速くするため） */
export async function preloadImages() {
  const ids = new Set();
  for (const c of state.counters) {
    if (c.iconImageId) ids.add(c.iconImageId);
  }
  await Promise.all([...ids].map((id) => imageURL(id)));
}

function revokeImage(id) {
  const url = state.imageURLs.get(id);
  if (url) URL.revokeObjectURL(url);
  state.imageURLs.delete(id);
}
async function deleteImage(id) {
  revokeImage(id);
  await db.del('images', id);
}
export async function discardImage(id) {
  if (id) await deleteImage(id);
}

// ---------- バックアップ ----------
function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

export async function exportBackup() {
  const [counters, records, images, settings] = await Promise.all([
    db.getAll('counters'),
    db.getAll('records'),
    db.getAll('images'),
    db.getAll('settings'),
  ]);
  const imgs = [];
  for (const im of images) imgs.push({ id: im.id, data: await blobToDataURL(im.blob) });
  return {
    app: 'counter',
    version: DATA_VERSION,
    exportedAt: new Date().toISOString(),
    counters,
    records: records.map(({ id, ...r }) => r),
    images: imgs,
    settings,
  };
}

export async function importBackup(data) {
  if (!data || data.app !== 'counter' || !Array.isArray(data.counters)) {
    throw new Error('このファイルはカウンターのバックアップではありません');
  }
  await db.clearAll();
  await db.putMany('counters', data.counters.map(normalizeCounter));
  for (const im of data.images || []) {
    const blob = await (await fetch(im.data)).blob();
    await db.put('images', { id: im.id, blob });
  }
  const recs = (data.records || []).filter((r) => r && r.counterId && typeof r.day === 'string');
  for (const r of recs) await db.addRecord({ counterId: r.counterId, day: r.day, ts: r.ts ?? parseDayKey(r.day).getTime() });
  await db.putMany('settings', (data.settings || []).filter((s) => s && s.key in DEFAULT_SETTINGS));
}
