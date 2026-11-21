// シート・ダイアログ・トーストなどの共通UI
import { h, esc } from './util.js';
import { icon } from './icons.js';

const stack = [];

/**
 * シート（スマホは下から、iPadは中央）を開く
 * @param {{title?:string, body:HTMLElement|string, left?:string, right?:string, onLeft?:Function, onRight?:Function, onClose?:Function, wide?:boolean}} o
 */
export function openSheet(o) {
  const root = h(`
    <div class="sheet-root" role="dialog" aria-modal="true">
      <div class="sheet-backdrop"></div>
      <div class="sheet ${o.wide ? 'wide' : ''}">
        <div class="sheet-grabber"></div>
        <header class="sheet-head">
          <div class="sheet-side">${o.left ? `<button class="text-btn" data-sheet="left">${esc(o.left)}</button>` : ''}</div>
          <h2 class="sheet-title">${esc(o.title || '')}</h2>
          <div class="sheet-side right">${
            o.right
              ? `<button class="text-btn strong" data-sheet="right">${esc(o.right)}</button>`
              : `<button class="icon-btn subtle" data-sheet="close" aria-label="閉じる">${icon('x', 18)}</button>`
          }</div>
        </header>
        <div class="sheet-body"></div>
      </div>
    </div>`);
  const body = root.querySelector('.sheet-body');
  if (typeof o.body === 'string') body.innerHTML = o.body;
  else if (o.body) body.appendChild(o.body);

  let closed = false;
  const api = {
    el: root,
    body,
    close(result) {
      if (closed) return;
      closed = true;
      root.classList.remove('open');
      const i = stack.indexOf(api);
      if (i >= 0) stack.splice(i, 1);
      setTimeout(() => root.remove(), 220);
      o.onClose?.(result);
    },
  };
  root.querySelector('.sheet-backdrop').addEventListener('click', () => api.close());
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-sheet]');
    if (!b) return;
    const k = b.dataset.sheet;
    if (k === 'close') api.close();
    if (k === 'left') (o.onLeft ? o.onLeft(api) : api.close());
    if (k === 'right') {
      if (o.onRight) {
        b.disabled = true;
        try {
          await o.onRight(api);
        } finally {
          b.disabled = false;
        }
      } else api.close();
    }
  });
  document.body.appendChild(root);
  stack.push(api);
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('open')));
  return api;
}

export function closeAllSheets() {
  for (const s of [...stack]) s.close();
}
export function hasOpenSheet() {
  return stack.length > 0;
}

/** 確認ダイアログ */
export function confirmDialog({ title, message, ok = 'OK', cancel = 'キャンセル', danger = false }) {
  return new Promise((resolve) => {
    const root = h(`
      <div class="dialog-root" role="alertdialog" aria-modal="true">
        <div class="dialog">
          <h3>${esc(title)}</h3>
          ${message ? `<p>${esc(message).replace(/\n/g, '<br>')}</p>` : ''}
          <div class="dialog-actions">
            <button class="dlg-btn" data-r="0">${esc(cancel)}</button>
            <button class="dlg-btn ${danger ? 'danger' : 'strong'}" data-r="1">${esc(ok)}</button>
          </div>
        </div>
      </div>`);
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]');
      if (!b && e.target !== root) return;
      const r = b ? b.dataset.r === '1' : false;
      root.classList.remove('open');
      setTimeout(() => root.remove(), 180);
      resolve(r);
    });
    document.body.appendChild(root);
    requestAnimationFrame(() => root.classList.add('open'));
  });
}

let toastTimer;
export function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = h('<div class="toast" role="status"></div>');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/** 押したボタンを一瞬縮小 */
export function pressAnim(el) {
  if (!el) return;
  el.classList.remove('pressed');
  void el.offsetWidth;
  el.classList.add('pressed');
}

/** 数字を一瞬拡大して戻す */
export function popAnim(el) {
  if (!el) return;
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
}

/** 順位バッジ（1〜3位はメダル） */
export function rankBadge(rank) {
  if (!rank) return '';
  const cls = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : 'plain';
  return `<span class="rank ${cls}" aria-label="${rank}位">${rank}</span>`;
}

/** 画像が無いときのプレースホルダ */
export function placeholderStyle(name) {
  let hsh = 0;
  for (const ch of String(name)) hsh = (hsh * 31 + ch.codePointAt(0)) >>> 0;
  const hue = hsh % 360;
  return `background:linear-gradient(135deg,hsl(${hue} 70% 62%),hsl(${(hue + 40) % 360} 70% 45%));`;
}
