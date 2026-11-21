// カレンダー（個別 / 全体）
import * as S from '../store.js';
import { h, esc, $, fmtYM, fmtCount, dayKey, daysInMonth, addMonths, todayKey, weekdayLabel, fmtDayKeyLong } from '../util.js';
import { icon } from '../icons.js';
import { openSheet, pressAnim, popAnim, placeholderStyle } from '../ui.js';
import { click, haptic } from '../feedback.js';
import { openDayEditor } from './detail.js';

const monthState = new Map(); // 'all' or cid -> {year, month}

export function renderCalendar(root, nav, target) {
  const isAll = target === 'all';
  const cid = isAll ? null : target;
  if (!isAll && !S.counter(cid)) {
    root.innerHTML = `<div class="page"><header class="nav-bar"><button class="back-btn" data-back>${icon('back', 22)}戻る</button></header><div class="empty"><p class="empty-title">カウンターが見つかりません</p></div></div>`;
    root.querySelector('[data-back]').onclick = () => history.back();
    return {};
  }
  const n = new Date();
  if (!monthState.has(target)) monthState.set(target, { year: n.getFullYear(), month: n.getMonth() + 1 });
  let ym = monthState.get(target);

  root.innerHTML = '';
  const el = h(`
    <div class="page calendar-page">
      <header class="nav-bar">
        <button class="back-btn" data-act="back">${icon('back', 22)}<span>戻る</span></button>
        <h1 class="nav-title"></h1>
        <div class="nav-spacer"></div>
      </header>
      <div class="cal-wrap card-panel">
        <div class="period-nav">
          <button class="icon-btn subtle" data-act="prev" aria-label="前の月">${icon('chevL', 22)}</button>
          <span class="period-label"></span>
          <button class="icon-btn subtle" data-act="next" aria-label="次の月">${icon('chevR', 22)}</button>
          <button class="chip-btn small" data-act="now">今月</button>
        </div>
        <div class="cal-week"></div>
        <div class="cal-grid"></div>
      </div>
      <div class="cal-summary card-panel"></div>
    </div>`);
  root.appendChild(el);

  $('.nav-title', el).textContent = isAll ? '全体カレンダー' : `${S.counter(cid).name}`;

  function paint() {
    const ws = S.settings().weekStart;
    $('.period-label', el).textContent = fmtYM(ym.year, ym.month); // 年号は桁区切りなし
    const t = new Date();
    $('[data-act="now"]', el).hidden = ym.year === t.getFullYear() && ym.month === t.getMonth() + 1;
    $('.cal-week', el).innerHTML = Array.from({ length: 7 }, (_, i) => {
      const wd = (i + ws) % 7;
      return `<span class="${wd === 0 ? 'sun' : wd === 6 ? 'sat' : ''}">${weekdayLabel(wd)}</span>`;
    }).join('');

    const first = new Date(ym.year, ym.month - 1, 1);
    const lead = (first.getDay() - ws + 7) % 7;
    const dim = daysInMonth(ym.year, ym.month);
    const today = todayKey();
    let cells = '';
    for (let i = 0; i < lead; i++) cells += '<div class="cal-cell blank"></div>';
    let monthSum = 0;
    let activeDays = 0;
    for (let d = 1; d <= dim; d++) {
      const date = new Date(ym.year, ym.month - 1, d);
      const key = dayKey(date);
      const cnt = S.dayCount(cid, key);
      monthSum += cnt;
      if (cnt) activeDays++;
      const wd = date.getDay();
      const cls = ['cal-cell', key === today ? 'today' : '', wd === 0 ? 'sun' : wd === 6 ? 'sat' : ''].join(' ');
      if (cnt) {
        // 記録がある日は、アイコン画像を背景にして中央に回数だけ表示
        const rep = isAll ? S.topCounterOn(key) : S.counter(cid);
        const url = S.imageURLSync(rep?.iconImageId);
        const bg = url ? `<img src="${url}" alt="" loading="lazy" decoding="async">` : `<div class="cal-ph" style="${placeholderStyle(rep?.name || '')}"></div>`;
        cells += `<button class="${cls} has" data-day="${key}" aria-label="${d}日 ${cnt}回">${bg}<span class="cal-shade"></span><span class="cal-date">${d}</span><span class="cal-num">${fmtCount(cnt)}</span></button>`;
      } else {
        cells += `<button class="${cls}" data-day="${key}" aria-label="${d}日 記録なし"><span class="cal-date plain">${d}</span></button>`;
      }
    }
    $('.cal-grid', el).innerHTML = cells;
    $('.cal-summary', el).innerHTML = `
      <div class="sum-item"><span class="sum-label">${ym.month}月の合計</span><span class="sum-val">${fmtCount(monthSum)}<small>回</small></span></div>
      <div class="sum-item"><span class="sum-label">記録した日</span><span class="sum-val">${activeDays}<small>日</small></span></div>`;
  }

  el.addEventListener('click', (e) => {
    const cell = e.target.closest('.cal-cell[data-day]');
    if (cell) {
      haptic();
      if (isAll) openDayBreakdown(cell.dataset.day);
      else openDayEditor(cid, cell.dataset.day);
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'back') history.back();
    if (act === 'prev' || act === 'next') {
      ym = addMonths(ym.year, ym.month, act === 'prev' ? -1 : 1);
      monthState.set(target, ym);
      paint();
    }
    if (act === 'now') {
      const t = new Date();
      ym = { year: t.getFullYear(), month: t.getMonth() + 1 };
      monthState.set(target, ym);
      paint();
    }
  });

  // 左右スワイプで月移動
  let sx = null;
  const gridEl = $('.cal-grid', el);
  gridEl.addEventListener('touchstart', (e) => (sx = e.touches[0].clientX), { passive: true });
  gridEl.addEventListener(
    'touchend',
    (e) => {
      if (sx === null) return;
      const dx = e.changedTouches[0].clientX - sx;
      sx = null;
      if (Math.abs(dx) > 60) {
        ym = addMonths(ym.year, ym.month, dx < 0 ? 1 : -1);
        monthState.set(target, ym);
        paint();
      }
    },
    { passive: true }
  );

  const unsub = S.subscribe((ev) => {
    if (ev.type === 'count' || ev.type === 'counters' || ev.type === 'settings') {
      if (!isAll && !S.counter(cid)) return;
      paint();
    }
  });

  paint();
  return { destroy: unsub };
}

/** 全体カレンダー：その日の合計と内訳 */
function openDayBreakdown(day) {
  const body = h('<div class="breakdown"></div>');
  function paint() {
    const list = S.dayBreakdown(day);
    const totalN = S.dayTotalAll(day);
    body.innerHTML = `
      <div class="bd-total"><span>合計</span><strong>${fmtCount(totalN)}<small>回</small></strong></div>
      ${
        list.length
          ? list
              .map(({ c, n }) => {
                const url = S.imageURLSync(c.iconImageId);
                return `<div class="bd-row" data-cid="${esc(c.id)}">
                  ${url ? `<img src="${url}" alt="">` : `<div class="ph" style="${placeholderStyle(c.name)}"></div>`}
                  <span class="bd-name">${esc(c.name)}</span>
                  <div class="qc-ctrl small">
                    <button class="round-btn" data-d="-1" aria-label="1減らす">${icon('minus', 16)}</button>
                    <span class="qc-num">${n}</span>
                    <button class="round-btn accent" data-d="1" aria-label="1増やす">${icon('plus', 16)}</button>
                  </div>
                </div>`;
              })
              .join('')
          : '<p class="muted pad center">この日の記録はありません</p>'
      }`;
  }
  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-d]');
    if (!b) return;
    const cid = b.closest('[data-cid]').dataset.cid;
    pressAnim(b);
    haptic();
    if (b.dataset.d === '1') {
      click('up');
      S.increment(cid, day);
    } else {
      click('down');
      S.decrement(cid, day);
    }
    // 0 回になった行も、このシートを開いている間は残す
    const row = b.closest('.bd-row');
    $('.qc-num', row).textContent = String(S.countOn(cid, day));
    popAnim($('.qc-num', row));
    $('.bd-total strong', body).innerHTML = `${fmtCount(S.dayTotalAll(day))}<small>回</small>`;
  });
  paint();
  openSheet({ title: fmtDayKeyLong(day), body });
}
