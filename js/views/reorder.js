// 並び替え画面（ホームと同じグリッドでドラッグ＆ドロップ）
import * as S from '../store.js';
import { h, $, $$, fitText } from '../util.js';
import { icon } from '../icons.js';
import { haptic } from '../feedback.js';
import { cardHTML } from './card.js';

const HOLD_MS = 180; // この時間押し続けるとドラッグ開始（それより前に動かすとスクロール）

export function renderReorder(root, nav) {
  const sorted = [...S.counters()].sort(S.byOrder);
  // ホームの「好きな順」と同じく、ピン留めを先頭グループにする
  let order = [...sorted.filter((c) => c.pinned), ...sorted.filter((c) => !c.pinned)].map((c) => c.id);

  root.innerHTML = '';
  const el = h(`
    <div class="page reorder">
      <header class="nav-bar">
        <button class="text-btn" data-act="cancel">キャンセル</button>
        <h1 class="nav-title">並び替え</h1>
        <button class="text-btn strong" data-act="done">完了</button>
      </header>
      <p class="hint center">カードを長めに押してからドラッグすると、順番を入れ替えられます。${
        sorted.some((c) => c.pinned) ? '<br>ピン留めした項目は先頭のグループ内で並び替えます。' : ''
      }</p>
      <div class="grid reorder-grid"></div>
    </div>`);
  root.appendChild(el);
  const grid = $('.grid', el);

  grid.innerHTML = order.map((id) => cardHTML(S.counter(id), { controls: false })).join('');
  if (!order.length) grid.outerHTML = '<div class="empty"><p class="empty-title">カウンターがありません</p></div>';
  requestAnimationFrame(() => {
    for (const s of $$('.cname span', el)) if (s.scrollWidth > s.clientWidth) fitText(s, 14, 8);
  });

  el.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'cancel') history.back();
    if (act === 'done') {
      await S.saveOrder(order);
      history.back();
    }
  });

  // ---------- ドラッグ＆ドロップ ----------
  let drag = null; // {id, card, ghost, offX, offY, pointerId}
  let holdTimer = null;
  let start = null;
  let lastPoint = null;
  let scrollRAF = null;
  const scroller = root; // ページ自体がスクロールコンテナ

  // ドラッグ中はページのスクロールを止める（iOS は touchmove を止める必要がある）
  const blockTouch = (e) => {
    if (drag) e.preventDefault();
  };
  document.addEventListener('touchmove', blockTouch, { passive: false });

  grid.addEventListener('contextmenu', (e) => e.preventDefault());

  grid.addEventListener('pointerdown', (e) => {
    const card = e.target.closest('.card');
    if (!card || drag) return;
    start = { x: e.clientX, y: e.clientY, card, pointerId: e.pointerId };
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => beginDrag(start, e.clientX, e.clientY), e.pointerType === 'mouse' ? 0 : HOLD_MS);
  });

  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  function beginDrag(s, x, y) {
    if (!s) return;
    const card = s.card;
    const r = card.getBoundingClientRect();
    const ghost = card.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.style.width = r.width + 'px';
    ghost.style.height = r.height + 'px';
    ghost.style.left = r.left + 'px';
    ghost.style.top = r.top + 'px';
    document.body.appendChild(ghost);
    card.classList.add('drag-source');
    drag = { id: card.dataset.id, card, ghost, offX: x - r.left, offY: y - r.top, pointerId: s.pointerId };
    lastPoint = { x, y };
    haptic();
    autoScroll();
  }

  function onMove(e) {
    if (!drag) {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) {
        // 押し始めてすぐ動かした → スクロール操作とみなす
        clearTimeout(holdTimer);
        start = null;
      }
      return;
    }
    if (e.pointerId !== drag.pointerId) return;
    e.preventDefault();
    lastPoint = { x: e.clientX, y: e.clientY };
    moveGhost();
    hitTest();
  }

  function moveGhost() {
    drag.ghost.style.left = lastPoint.x - drag.offX + 'px';
    drag.ghost.style.top = lastPoint.y - drag.offY + 'px';
  }

  function hitTest() {
    const under = document.elementFromPoint(lastPoint.x, lastPoint.y)?.closest('.reorder-grid .card');
    if (!under || under === drag.card) return;
    const from = order.indexOf(drag.id);
    const to = order.indexOf(under.dataset.id);
    if (from < 0 || to < 0) return;
    // ピン留めグループをまたぐ移動はしない
    if (S.counter(drag.id).pinned !== S.counter(under.dataset.id).pinned) return;
    const first = new Map($$('.card', grid).map((c) => [c, c.getBoundingClientRect()]));
    order.splice(from, 1);
    order.splice(to, 0, drag.id);
    // DOM を新しい順に並べ直す
    const byId = new Map($$('.card', grid).map((c) => [c.dataset.id, c]));
    for (const id of order) grid.appendChild(byId.get(id));
    // 他のカードを自然に移動させる（FLIP）
    for (const [c, a] of first) {
      if (c === drag.card) continue;
      const b = c.getBoundingClientRect();
      const dx = a.left - b.left;
      const dy = a.top - b.top;
      if (dx || dy) c.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
  }

  function autoScroll() {
    cancelAnimationFrame(scrollRAF);
    const step = () => {
      if (!drag) return;
      const edge = 80;
      const hgt = window.innerHeight;
      let dy = 0;
      if (lastPoint.y < edge) dy = -Math.ceil((edge - lastPoint.y) / 6);
      else if (lastPoint.y > hgt - edge) dy = Math.ceil((lastPoint.y - (hgt - edge)) / 6);
      if (dy) {
        scroller.scrollTop += dy;
        hitTest();
      }
      scrollRAF = requestAnimationFrame(step);
    };
    scrollRAF = requestAnimationFrame(step);
  }

  function onUp() {
    clearTimeout(holdTimer);
    start = null;
    if (!drag) return;
    const { card, ghost } = drag;
    const r = card.getBoundingClientRect();
    drag = null;
    cancelAnimationFrame(scrollRAF);
    const anim = ghost.animate(
      [
        { left: ghost.style.left, top: ghost.style.top },
        { left: r.left + 'px', top: r.top + 'px' },
      ],
      { duration: 180, easing: 'ease-out', fill: 'forwards' }
    );
    ghost.classList.add('dropping');
    anim.onfinish = () => {
      ghost.remove();
      card.classList.remove('drag-source');
    };
  }

  // 並び替え中の誤タップで詳細へ行かないようにする
  grid.addEventListener('click', (e) => e.preventDefault());

  return {
    destroy() {
      document.removeEventListener('touchmove', blockTouch);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      cancelAnimationFrame(scrollRAF);
      $$('.drag-ghost').forEach((g) => g.remove());
    },
  };
}
