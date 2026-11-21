// エントリーポイント：読み込み・画面遷移（ハッシュルーティング）
import * as S from './store.js';
import { todayKey, h } from './util.js';
import { unlockAudioOnFirstGesture } from './feedback.js';
import { closeAllSheets } from './ui.js';
import { renderHome } from './views/home.js';
import { renderReorder } from './views/reorder.js';
import { renderDetail } from './views/detail.js';
import { renderCalendar } from './views/calendar.js';
import { renderStats } from './views/stats.js';
import { renderSettings } from './views/settings.js';

const app = document.getElementById('app');

// 画面スタック：ホームは常に一番下に残し、スクロール位置を保つ
const pages = []; // {hash, el, ctrl}

function route(hash) {
  const parts = (hash.replace(/^#\/?/, '') || '').split('/').map(decodeURIComponent);
  return { name: parts[0] || 'home', arg: parts[1] };
}

function mount(hash, animate) {
  const { name, arg } = route(hash);
  const el = h(`<div class="screen" data-screen="${name}"></div>`);
  app.appendChild(el);
  let ctrl = {};
  try {
    if (name === 'home') ctrl = renderHome(el, go);
    else if (name === 'reorder') ctrl = renderReorder(el, go);
    else if (name === 'detail') ctrl = renderDetail(el, go, arg);
    else if (name === 'calendar') ctrl = renderCalendar(el, go, arg);
    else if (name === 'stats') ctrl = renderStats(el, go, arg);
    else if (name === 'settings') ctrl = renderSettings(el, go);
    else ctrl = renderHome(el, go);
  } catch (e) {
    console.error(e);
    el.innerHTML = '<div class="page"><div class="empty"><p class="empty-title">画面を表示できませんでした</p><button class="primary-btn" onclick="location.hash=\'#/\'">ホームへ</button></div></div>';
  }
  if (animate) el.classList.add('enter');
  pages.push({ hash, el, ctrl: ctrl || {} });
}

function unmount(p) {
  try {
    p.ctrl.destroy?.();
  } catch (e) {
    console.error(e);
  }
  p.el.classList.add('leave');
  setTimeout(() => p.el.remove(), 260);
}

function sync() {
  closeAllSheets();
  const hash = location.hash || '#/';
  const norm = hash === '#' ? '#/' : hash;
  const idx = pages.findIndex((p) => p.hash === norm);
  if (idx >= 0) {
    // 戻る：上に積まれた画面を外す
    while (pages.length - 1 > idx) unmount(pages.pop());
    pages[idx].ctrl.onShow?.();
  } else {
    if (route(norm).name === 'home') {
      while (pages.length) unmount(pages.pop());
      mount('#/', false);
    } else {
      if (!pages.length) mount('#/', false); // 直接URLで開いたときもホームを下に置く
      mount(norm, true);
    }
  }
  updateVisibility();
}

function updateVisibility() {
  pages.forEach((p, i) => {
    p.el.classList.toggle('covered', i < pages.length - 1);
    p.el.inert = i < pages.length - 1;
  });
}

export function go(hash) {
  if (location.hash === hash) return;
  location.hash = hash;
}

function applyTheme() {
  document.documentElement.dataset.theme = S.settings().theme;
}

async function start() {
  try {
    await S.load();
  } catch (e) {
    console.error(e);
    app.innerHTML = '<div class="page"><div class="empty"><p class="empty-title">データを読み込めませんでした</p><p>プライベートブラウズでは保存できない場合があります。</p></div></div>';
    return;
  }
  applyTheme();
  S.subscribe((ev) => {
    if (ev.type === 'settings' && ev.key === 'theme') applyTheme();
  });
  await S.preloadImages();
  unlockAudioOnFirstGesture();
  window.addEventListener('hashchange', sync);

  // 日付が変わったら（選択日が「今日」だった場合）自動で今日に追従
  let lastToday = todayKey();
  const checkDate = () => {
    const t = todayKey();
    if (t !== lastToday) {
      if (S.selectedDay() === lastToday) S.setSelectedDay(t);
      lastToday = t;
    }
  };
  document.addEventListener('visibilitychange', () => !document.hidden && checkDate());
  setInterval(checkDate, 60 * 1000);

  // 記録が消されにくいよう永続ストレージを要求
  navigator.storage?.persist?.().catch(() => {});

  sync();
  document.getElementById('boot')?.remove();
}

start();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
