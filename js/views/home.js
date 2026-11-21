// ホーム画面
import * as S from '../store.js';
import { h, esc, $, $$, fmtYear, fmtYM, fmtCount, fmtYMD, parseDayKey, todayKey, addMonths, fitText, debounce } from '../util.js';
import { icon } from '../icons.js';
import { openSheet, pressAnim, popAnim, toast } from '../ui.js';
import { click, haptic } from '../feedback.js';
import { cardHTML } from './card.js';
import { openCounterEditor } from './editor.js';

const now = new Date();
// 画面を離れても保持する表示状態
const view = {
  mode: 'fav', // fav | total | year | month
  tag: null,
  query: '',
  year: now.getFullYear(),
  ym: { year: now.getFullYear(), month: now.getMonth() + 1 },
};

const MODES = [
  ['fav', '好きな順'],
  ['total', '累計'],
  ['year', '年間'],
  ['month', '月間'],
];

export function renderHome(root, nav) {
  root.innerHTML = '';
  const el = h(`
    <div class="home">
      <header class="home-top">
        <h1 class="app-title"><span></span></h1>
        <div class="top-actions">
          <button class="pill-btn" data-act="reorder">並び替え</button>
          <button class="icon-btn" data-act="settings" aria-label="設定">${icon('gear', 21)}</button>
          <button class="icon-btn accent" data-act="add" aria-label="カウンターを追加">${icon('plus', 24)}</button>
        </div>
      </header>
      <div class="toolbar">
        <button class="chip-btn" data-act="tag"></button>
        <div class="toolbar-right">
          <button class="chip-btn square" data-act="calendar" aria-label="全体カレンダー">${icon('calendar', 20)}</button>
          <button class="chip-btn square" data-act="stats" aria-label="全体統計">${icon('chart', 20)}</button>
          <button class="chip-btn today-btn" data-act="today" hidden>今日に戻る</button>
          <button class="chip-btn date-btn" data-act="date"></button>
        </div>
      </div>
      <label class="search">
        ${icon('search', 18)}
        <input type="search" placeholder="名前で検索" enterkeyhint="search" autocomplete="off">
        <button class="search-clear" data-act="clear" aria-label="検索を消去" hidden>${icon('xCircle', 18)}</button>
      </label>
      <div class="segmented" role="tablist">
        ${MODES.map(([k, l]) => `<button role="tab" data-mode="${k}">${l}</button>`).join('')}
      </div>
      <div class="period-nav" hidden>
        <button class="icon-btn subtle" data-act="prev" aria-label="前へ">${icon('chevL', 20)}</button>
        <span class="period-label"></span>
        <button class="icon-btn subtle" data-act="next" aria-label="次へ">${icon('chevR', 20)}</button>
        <button class="chip-btn small" data-act="period-now"></button>
      </div>
      <div class="grid" aria-live="polite"></div>
      <div class="empty" hidden></div>
    </div>`);
  root.appendChild(el);

  const grid = $('.grid', el);
  const empty = $('.empty', el);
  const search = $('.search input', el);
  search.value = view.query;

  // ---------- 表示データ ----------
  function countFor(c) {
    switch (view.mode) {
      case 'total':
        return S.total(c.id);
      case 'year':
        return S.yearCount(c.id, view.year);
      case 'month':
        return S.monthCount(c.id, view.ym.year, view.ym.month);
      default:
        return S.settings().favCountMode === 'total' ? S.total(c.id) : S.countOn(c.id, S.selectedDay());
    }
  }

  function matches(c) {
    if (view.tag && !c.tags.includes(view.tag)) return false;
    const q = view.query.trim().toLowerCase();
    if (q && !c.name.toLowerCase().includes(q)) return false;
    return true;
  }

  function computeList() {
    const all = [...S.counters()].sort(S.byOrder);
    if (view.mode === 'fav') {
      if (!all.length) return { items: [], emptyMsg: 'onboarding' };
      const sorted = [...all.filter((c) => c.pinned), ...all.filter((c) => !c.pinned)];
      const items = sorted.filter(matches).map((c) => ({ c, n: countFor(c) }));
      return { items, emptyMsg: items.length ? null : '該当する項目がありません' };
    }
    // ランキング：0回は最初から非表示、同数はユーザーの並び順
    const ranked = all.map((c) => ({ c, n: countFor(c) })).filter((x) => x.n > 0);
    if (!ranked.length) return { items: [], emptyMsg: '記録がありません' };
    const items = ranked.filter((x) => matches(x.c)).sort((a, b) => b.n - a.n || S.byOrder(a.c, b.c));
    items.forEach((x, i) => (x.rank = i + 1));
    return { items, emptyMsg: items.length ? null : '該当する項目がありません' };
  }

  // ---------- 描画 ----------
  function renderChrome() {
    const st = S.settings();
    $('.app-title span', el).textContent = st.appName || 'カウンター';
    fitText($('.app-title span', el), 34, 20);
    $('[data-act="tag"]', el).innerHTML = `${icon('tag', 18)}<span>${esc(view.tag ?? 'すべて')}</span>${icon('chevD', 15)}`;
    $('[data-act="tag"]', el).classList.toggle('active', !!view.tag);
    const sd = S.selectedDay();
    const isToday = sd === todayKey();
    const dateBtn = $('[data-act="date"]', el);
    dateBtn.innerHTML = `${icon('calendarDay', 18)}<span>${fmtYMD(parseDayKey(sd))}</span>`;
    dateBtn.classList.toggle('past', !isToday);
    $('[data-act="today"]', el).hidden = isToday;
    $('[data-act="reorder"]', el).hidden = view.mode !== 'fav';
    $$('.segmented button', el).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === view.mode)));
    $('.search-clear', el).hidden = !view.query;

    const pn = $('.period-nav', el);
    pn.hidden = !(view.mode === 'year' || view.mode === 'month');
    if (view.mode === 'year') {
      $('.period-label', pn).textContent = fmtYear(view.year);
      const btn = $('[data-act="period-now"]', pn);
      btn.textContent = '今年に戻る';
      btn.hidden = view.year === new Date().getFullYear();
    } else if (view.mode === 'month') {
      $('.period-label', pn).textContent = fmtYM(view.ym.year, view.ym.month);
      const n = new Date();
      const btn = $('[data-act="period-now"]', pn);
      btn.textContent = '今月に戻る';
      btn.hidden = view.ym.year === n.getFullYear() && view.ym.month === n.getMonth() + 1;
    }
  }

  function renderGrid(animate = false) {
    const first = animate ? snapshotRects() : null;
    const { items, emptyMsg } = computeList();
    grid.innerHTML = items
      .map((x) => cardHTML(x.c, { count: x.n, rank: x.rank, canDec: S.countOn(x.c.id, S.selectedDay()) > 0 }))
      .join('');
    if (emptyMsg === 'onboarding') {
      empty.innerHTML = `<div class="empty-icon">${icon('grid', 40)}</div><p class="empty-title">カウンターがありません</p><p>右上の＋から、好きな画像と名前で<br>カウンターを登録しましょう。</p><button class="primary-btn" data-act="add">${icon('plus', 18)}カウンターを追加</button>`;
    } else {
      empty.innerHTML = emptyMsg ? `<p class="empty-title">${esc(emptyMsg)}</p>` : '';
    }
    empty.hidden = !emptyMsg;
    fitNames();
    if (first) playFlip(first);
  }

  function fitNames() {
    requestAnimationFrame(() => {
      for (const s of $$('.cname span', grid)) {
        s.style.fontSize = '';
        if (s.scrollWidth > s.clientWidth) fitText(s, 14, 8);
      }
    });
  }

  // 並び替わるときのFLIPアニメーション
  function snapshotRects() {
    const m = new Map();
    for (const c of $$('.card', grid)) m.set(c.dataset.id, c.getBoundingClientRect());
    return m;
  }
  function playFlip(first) {
    for (const c of $$('.card', grid)) {
      const a = first.get(c.dataset.id);
      if (!a) {
        c.animate([{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' });
        continue;
      }
      const b = c.getBoundingClientRect();
      const dx = a.left - b.left;
      const dy = a.top - b.top;
      if (dx || dy) {
        c.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
    }
  }

  function updateCard(cid) {
    const card = grid.querySelector(`.card[data-id="${CSS.escape(cid)}"]`);
    if (!card) return;
    const c = S.counter(cid);
    const num = $('.cnum', card);
    num.textContent = fmtCount(countFor(c));
    popAnim(num);
    const dec = $('[data-act="dec"]', card);
    if (S.countOn(cid, S.selectedDay()) > 0) dec.removeAttribute('data-disabled');
    else dec.setAttribute('data-disabled', '1');
  }

  const resort = debounce(() => {
    if (view.mode !== 'fav') renderGrid(true);
  }, 650);

  // ---------- 操作 ----------
  el.addEventListener('click', async (e) => {
    const t = e.target;
    const cbtn = t.closest('.cbtn');
    if (cbtn) {
      e.stopPropagation();
      const cid = cbtn.closest('.card').dataset.id;
      pressAnim(cbtn);
      if (cbtn.dataset.act === 'inc') {
        click('up');
        haptic();
        S.increment(cid).catch(() => toast('保存に失敗しました'));
      } else {
        if (S.countOn(cid, S.selectedDay()) <= 0) {
          cbtn.closest('.card').animate(
            [{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }],
            { duration: 220 }
          );
          return;
        }
        click('down');
        haptic();
        S.decrement(cid);
      }
      return;
    }
    const card = t.closest('.card');
    if (card) {
      haptic();
      nav(`#/detail/${encodeURIComponent(card.dataset.id)}`);
      return;
    }
    const modeBtn = t.closest('[data-mode]');
    if (modeBtn) {
      view.mode = modeBtn.dataset.mode;
      renderChrome();
      renderGrid();
      return;
    }
    const act = t.closest('[data-act]')?.dataset.act;
    switch (act) {
      case 'add':
        openCounterEditor(null, (c) => {
          if (c) toast(`「${c.name}」を追加しました`);
        });
        break;
      case 'reorder':
        nav('#/reorder');
        break;
      case 'settings':
        nav('#/settings');
        break;
      case 'calendar':
        nav('#/calendar/all');
        break;
      case 'stats':
        nav('#/stats/all');
        break;
      case 'tag':
        openTagFilter();
        break;
      case 'date':
        openDatePicker();
        break;
      case 'today':
        S.setSelectedDay(todayKey());
        break;
      case 'clear':
        view.query = '';
        search.value = '';
        renderChrome();
        renderGrid();
        search.blur();
        break;
      case 'prev':
      case 'next': {
        const d = act === 'prev' ? -1 : 1;
        if (view.mode === 'year') view.year += d;
        else view.ym = addMonths(view.ym.year, view.ym.month, d);
        renderChrome();
        renderGrid();
        break;
      }
      case 'period-now': {
        const n = new Date();
        view.year = n.getFullYear();
        view.ym = { year: n.getFullYear(), month: n.getMonth() + 1 };
        renderChrome();
        renderGrid();
        break;
      }
    }
  });

  el.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('card')) {
      e.preventDefault();
      nav(`#/detail/${encodeURIComponent(e.target.dataset.id)}`);
    }
  });

  search.addEventListener('input', () => {
    view.query = search.value;
    $('.search-clear', el).hidden = !view.query;
    renderGrid();
  });

  function openTagFilter() {
    const tags = S.allTags();
    const body = h(`<div class="option-list">
      ${[null, ...tags]
        .map(
          (t) => `<button class="option ${view.tag === t ? 'selected' : ''}" data-tag="${t === null ? '' : esc(t)}" data-all="${t === null ? 1 : 0}">
            <span>${t === null ? 'すべて' : `${icon('tag', 16)} ${esc(t)}`}</span>${view.tag === t ? icon('check', 18) : ''}
          </button>`
        )
        .join('')}
      ${tags.length ? '' : '<p class="hint">タグはまだありません。カウンターの詳細画面から追加できます。</p>'}
    </div>`);
    const sheet = openSheet({ title: 'タグで絞り込み', body });
    body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tag]');
      if (!b) return;
      view.tag = b.dataset.all === '1' ? null : b.dataset.tag;
      sheet.close();
      renderChrome();
      renderGrid();
    });
  }

  function openDatePicker() {
    const body = h(`<div class="date-sheet">
      <p class="hint">＋ − で記録する日付を選びます。</p>
      <input type="date" class="date-input" value="${S.selectedDay()}" max="${todayKey()}">
      <button class="secondary-btn" data-today>今日にする</button>
    </div>`);
    const input = $('input', body);
    const sheet = openSheet({
      title: '記録する日付',
      body,
      right: '完了',
      onRight: (s) => {
        if (input.value) S.setSelectedDay(input.value);
        s.close();
      },
    });
    $('[data-today]', body).addEventListener('click', () => {
      S.setSelectedDay(todayKey());
      sheet.close();
    });
  }

  // ---------- ストア変更への追従 ----------
  const unsub = S.subscribe((ev) => {
    if (ev.type === 'count') {
      updateCard(ev.cid);
      if (view.mode !== 'fav') resort();
    } else if (ev.type === 'selectedDay') {
      renderChrome();
      renderGrid();
    } else {
      renderChrome();
      renderGrid();
    }
  });

  const onResize = debounce(fitNames, 150);
  window.addEventListener('resize', onResize);

  renderChrome();
  renderGrid();

  return {
    // 他画面から戻ったときに、日付をまたいでいたら今日に追従させる
    onShow() {
      renderChrome();
    },
    destroy() {
      unsub();
      window.removeEventListener('resize', onResize);
    },
  };
}
