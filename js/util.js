// 共通ユーティリティ（日付・DOM・文字列）

/** 'YYYY-MM-DD' 形式の日付キー（ローカル時刻） */
export function dayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey() {
  return dayKey(new Date());
}

export function addDays(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + n);
  return d;
}

export function addMonths(year, month, n) {
  // month: 1-12
  const idx = year * 12 + (month - 1) + n;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

export function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/** 週の開始日（weekStart: 0=日曜, 1=月曜） */
export function startOfWeek(date, weekStart) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = (d.getDay() - weekStart + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
export function weekdayLabel(i) {
  return WEEKDAYS[i];
}

// 年号は桁区切りを入れない（2,026年 にならないよう、常に文字列連結で組み立てる）
export function fmtYear(y) {
  return `${y}年`;
}
export function fmtYM(y, m) {
  return `${y}年${m}月`;
}
export function fmtMD(date) {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}
export function fmtYMD(date) {
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}
export function fmtDayKeyLong(key) {
  const d = parseDayKey(key);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAYS[d.getDay()]}）`;
}

/** 回数表示（年号ではない数値）。大きな数だけ桁区切り */
export function fmtCount(n) {
  return n >= 10000 ? n.toLocaleString('ja-JP') : String(n);
}

export function fmtDiff(n) {
  if (n > 0) return `＋${n}回`;
  if (n < 0) return `−${Math.abs(n)}回`;
  return `±0回`;
}

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** HTML文字列から要素を作る */
export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function $(sel, root = document) {
  return root.querySelector(sel);
}
export function $$(sel, root = document) {
  return [...root.querySelectorAll(sel)];
}

/** 文字が長い場合に1行に収まるよう縮小する */
export function fitText(el, maxPx, minPx = 9) {
  if (!el || !el.isConnected) return;
  let size = maxPx;
  el.style.fontSize = size + 'px';
  const width = el.clientWidth;
  if (!width) return;
  while (el.scrollWidth > width && size > minPx) {
    size -= 0.5;
    el.style.fontSize = size + 'px';
  }
}

export function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}
