// 統計グラフ（個別 / 全体）— 両者は同じ部品・同じデザインで描画する
import * as S from '../store.js';
import { h, $, $$, fmtYear, fmtYM, fmtCount, fmtDiff, fmtMD, fmtDayKeyLong, dayKey, addDays, addMonths, daysInMonth, startOfWeek, weekdayLabel } from '../util.js';
import { icon } from '../icons.js';
import { haptic } from '../feedback.js';

const PERIODS = [
  ['day', '日別'],
  ['week', '週間'],
  ['month', '月間'],
  ['year', '年間'],
];
const CMP = { day: '前日比', week: '前週比', month: '前月比', year: '前年比' };
const WEEKS_PER_PAGE = 10;

// 画面ごとの表示状態を保持
const memo = new Map();

export function renderStats(root, nav, target) {
  const isAll = target === 'all';
  const cid = isAll ? null : target;
  if (!isAll && !S.counter(cid)) {
    root.innerHTML = `<div class="page"><header class="nav-bar"><button class="back-btn" data-back>${icon('back', 22)}戻る</button></header><div class="empty"><p class="empty-title">カウンターが見つかりません</p></div></div>`;
    root.querySelector('[data-back]').onclick = () => history.back();
    return {};
  }
  const now = new Date();
  if (!memo.has(target)) {
    memo.set(target, {
      period: 'week',
      dayYM: { year: now.getFullYear(), month: now.getMonth() + 1 },
      weekOffset: 0, // 0 = 今週を含むページ, 1 = その前のページ…
      year: now.getFullYear(),
      selected: null, // 選択中の棒の key
    });
  }
  const st = memo.get(target);

  root.innerHTML = '';
  const el = h(`
    <div class="page stats-page">
      <header class="nav-bar">
        <button class="back-btn" data-act="back">${icon('back', 22)}<span>戻る</span></button>
        <h1 class="nav-title"></h1>
        <div class="nav-spacer"></div>
      </header>
      <section class="stats-total card-panel">
        <span class="sum-label"></span>
        <span class="stats-total-num"></span>
      </section>
      <div class="segmented" role="tablist">
        ${PERIODS.map(([k, l]) => `<button role="tab" data-period="${k}">${l}</button>`).join('')}
      </div>
      <section class="chart-panel card-panel">
        <div class="period-nav">
          <button class="icon-btn subtle" data-act="prev" aria-label="前へ">${icon('chevL', 22)}</button>
          <span class="period-label"></span>
          <button class="icon-btn subtle" data-act="next" aria-label="次へ">${icon('chevR', 22)}</button>
          <button class="chip-btn small" data-act="now"></button>
        </div>
        <div class="chart-scroll"><div class="chart"></div></div>
      </section>
      <section class="chart-detail card-panel"></section>
    </div>`);
  root.appendChild(el);

  $('.nav-title', el).textContent = isAll ? '全体統計' : `${S.counter(cid).name} の統計`;

  // ---------- 集計 ----------
  function sumMonth(y, m) {
    if (cid) return S.monthCount(cid, y, m);
    let n = 0;
    for (const c of S.counters()) n += S.monthCount(c.id, y, m);
    return n;
  }
  function sumYear(y) {
    if (cid) return S.yearCount(cid, y);
    let n = 0;
    for (const c of S.counters()) n += S.yearCount(c.id, y);
    return n;
  }
  function sumRange(start, end) {
    return S.rangeStats(cid, start, end).sum;
  }

  /** 表示中の棒データ */
  function buildBars() {
    const ws = S.settings().weekStart;
    const bars = [];
    if (st.period === 'day') {
      const { year, month } = st.dayYM;
      for (let d = 1; d <= daysInMonth(year, month); d++) {
        const date = new Date(year, month - 1, d);
        bars.push({ key: dayKey(date), label: String(d), sub: weekdayLabel(date.getDay()), start: date, end: date, sum: S.dayCount(cid, dayKey(date)) });
      }
    } else if (st.period === 'week') {
      const thisWeek = startOfWeek(new Date(), ws);
      const lastStart = addDays(thisWeek, -7 * WEEKS_PER_PAGE * st.weekOffset);
      for (let i = WEEKS_PER_PAGE - 1; i >= 0; i--) {
        const s = addDays(lastStart, -7 * i);
        const e = addDays(s, 6);
        bars.push({ key: 'w' + dayKey(s), label: `${s.getMonth() + 1}/${s.getDate()}`, sub: '〜', start: s, end: e, sum: sumRange(s, e) });
      }
    } else if (st.period === 'month') {
      for (let m = 1; m <= 12; m++) {
        bars.push({ key: `m${st.year}-${m}`, label: `${m}月`, start: new Date(st.year, m - 1, 1), end: new Date(st.year, m - 1, daysInMonth(st.year, m)), sum: sumMonth(st.year, m) });
      }
    } else {
      const cur = new Date().getFullYear();
      const first = Math.min(S.firstRecordYear(cid) ?? cur, cur - 4);
      for (let y = first; y <= cur; y++) {
        bars.push({ key: `y${y}`, label: String(y), start: new Date(y, 0, 1), end: new Date(y, 11, 31), sum: sumYear(y) });
      }
    }
    return bars;
  }

  function defaultSelected(bars) {
    // 今日を含む棒、無ければ最後の棒
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    const hit = bars.find((b) => b.start <= t && t <= b.end);
    return (hit || bars[bars.length - 1]).key;
  }

  function prevPeriod(bar) {
    switch (st.period) {
      case 'day':
        return { start: addDays(bar.start, -1), end: addDays(bar.start, -1) };
      case 'week':
        return { start: addDays(bar.start, -7), end: addDays(bar.end, -7) };
      case 'month': {
        const p = addMonths(bar.start.getFullYear(), bar.start.getMonth() + 1, -1);
        return { start: new Date(p.year, p.month - 1, 1), end: new Date(p.year, p.month - 1, daysInMonth(p.year, p.month)) };
      }
      default: {
        const y = bar.start.getFullYear() - 1;
        return { start: new Date(y, 0, 1), end: new Date(y, 11, 31) };
      }
    }
  }

  function periodLabel(bar) {
    switch (st.period) {
      case 'day':
        return fmtDayKeyLong(dayKey(bar.start));
      case 'week': {
        const sameYear = bar.start.getFullYear() === bar.end.getFullYear();
        return `${fmtYear(bar.start.getFullYear())}${fmtMD(bar.start)}〜${sameYear ? '' : fmtYear(bar.end.getFullYear())}${fmtMD(bar.end)}`;
      }
      case 'month':
        return fmtYM(bar.start.getFullYear(), bar.start.getMonth() + 1);
      default:
        return fmtYear(bar.start.getFullYear());
    }
  }

  // ---------- 描画 ----------
  let bars = [];

  function paintHeader() {
    $('.sum-label', el).textContent = isAll ? '全体累計' : '累計';
    $('.stats-total-num', el).innerHTML = `${fmtCount(isAll ? S.grandTotal() : S.total(cid))}<small>回</small>`;
    $$('[data-period]', el).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.period === st.period)));
    const nowBtn = $('[data-act="now"]', el);
    const pn = $('.chart-panel .period-nav', el);
    const t = new Date();
    let label = '';
    let atNow = true;
    let navigable = true;
    if (st.period === 'day') {
      label = fmtYM(st.dayYM.year, st.dayYM.month);
      atNow = st.dayYM.year === t.getFullYear() && st.dayYM.month === t.getMonth() + 1;
      nowBtn.textContent = '今月';
    } else if (st.period === 'week') {
      const first = bars[0];
      const last = bars[bars.length - 1];
      label = `${fmtYear(first.start.getFullYear())}${fmtMD(first.start)}〜${fmtMD(last.end)}`;
      atNow = st.weekOffset === 0;
      nowBtn.textContent = '今週';
    } else if (st.period === 'month') {
      label = fmtYear(st.year);
      atNow = st.year === t.getFullYear();
      nowBtn.textContent = '今年';
    } else {
      label = `${bars[0].label}〜${bars[bars.length - 1].label}年`;
      navigable = false;
    }
    $('.period-label', pn).textContent = label;
    nowBtn.hidden = atNow;
    $('[data-act="prev"]', pn).style.visibility = navigable ? '' : 'hidden';
    // 週間は未来のページが無いので、今週表示中は「次へ」を隠す
    $('[data-act="next"]', pn).style.visibility = navigable && !(st.period === 'week' && atNow) ? '' : 'hidden';
  }

  function paintChart(scrollToSelected = true) {
    bars = buildBars();
    if (!bars.some((b) => b.key === st.selected)) st.selected = defaultSelected(bars);
    paintHeader();
    const max = Math.max(1, ...bars.map((b) => b.sum));
    const chart = $('.chart', el);
    chart.className = `chart p-${st.period}`;
    chart.innerHTML = bars
      .map((b) => {
        const pct = (b.sum / max) * 100;
        return `<button class="bar-col ${b.key === st.selected ? 'selected' : ''} ${b.sum ? '' : 'zero'}" data-key="${b.key}" aria-label="${b.label} ${b.sum}回">
          <span class="bar-val">${b.sum ? fmtCount(b.sum) : ''}</span>
          <span class="bar-track"><span class="bar" style="height:${b.sum ? Math.max(pct, 3) : 0}%"></span></span>
          <span class="bar-label">${b.label}</span>
          ${b.sub ? `<span class="bar-sub">${b.sub}</span>` : ''}
        </button>`;
      })
      .join('');
    paintDetail();
    if (scrollToSelected) {
      requestAnimationFrame(() => {
        const sel = $('.bar-col.selected', chart);
        const sc = $('.chart-scroll', el);
        if (sel && sc.scrollWidth > sc.clientWidth) {
          sc.scrollLeft = sel.offsetLeft - sc.clientWidth / 2 + sel.offsetWidth / 2;
        }
      });
    }
  }

  function paintDetail() {
    const bar = bars.find((b) => b.key === st.selected);
    const box = $('.chart-detail', el);
    if (!bar) {
      box.innerHTML = '';
      return;
    }
    const prev = prevPeriod(bar);
    const prevSum = st.period === 'month' ? sumMonth(prev.start.getFullYear(), prev.start.getMonth() + 1) : st.period === 'year' ? sumYear(prev.start.getFullYear()) : sumRange(prev.start, prev.end);
    const diff = bar.sum - prevSum;
    // 前期間が0回のときは割合を出さない（∞% や NaN% を表示しない）
    const pct = prevSum > 0 ? `（${diff > 0 ? '+' : diff < 0 ? '−' : '±'}${Math.round((Math.abs(diff) / prevSum) * 100)}%）` : '';
    const note = prevSum === 0 ? '<span class="muted small">前の期間は記録なし</span>' : '';
    const showMax = st.period !== 'day';
    const max = showMax ? S.rangeStats(cid, bar.start, bar.end).max : 0;
    box.innerHTML = `
      <div class="detail-grid">
        <div class="dg-item wide"><span class="dg-label">対象期間</span><span class="dg-val">${periodLabel(bar)}</span></div>
        <div class="dg-item"><span class="dg-label">${isAll ? '合計回数' : '回数'}</span><span class="dg-val big">${fmtCount(bar.sum)}<small>回</small></span></div>
        <div class="dg-item"><span class="dg-label">${CMP[st.period]}</span><span class="dg-val ${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}">${fmtDiff(diff)}<small>${pct}</small></span>${note}</div>
        ${showMax ? `<div class="dg-item"><span class="dg-label">1日の最高回数</span><span class="dg-val">${fmtCount(max)}<small>回</small></span></div>` : ''}
      </div>`;
  }

  // ---------- 操作 ----------
  el.addEventListener('click', (e) => {
    const col = e.target.closest('.bar-col');
    if (col) {
      // 1回のタップで詳細を表示（長押し不要）
      haptic();
      st.selected = col.dataset.key;
      $$('.bar-col', el).forEach((b) => b.classList.toggle('selected', b === col));
      paintDetail();
      return;
    }
    const p = e.target.closest('[data-period]');
    if (p) {
      st.period = p.dataset.period;
      st.selected = null;
      paintChart();
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'back') history.back();
    if (act === 'prev' || act === 'next') {
      const d = act === 'prev' ? -1 : 1;
      if (st.period === 'day') st.dayYM = addMonths(st.dayYM.year, st.dayYM.month, d);
      if (st.period === 'week') st.weekOffset = Math.max(0, st.weekOffset - d);
      if (st.period === 'month') st.year += d;
      st.selected = null;
      paintChart();
    }
    if (act === 'now') {
      const t = new Date();
      st.dayYM = { year: t.getFullYear(), month: t.getMonth() + 1 };
      st.weekOffset = 0;
      st.year = t.getFullYear();
      st.selected = null;
      paintChart();
    }
  });

  const unsub = S.subscribe((ev) => {
    if (ev.type === 'count' || ev.type === 'counters' || ev.type === 'settings') {
      if (!isAll && !S.counter(cid)) return;
      paintChart(false);
    }
  });

  paintChart();
  return { destroy: unsub };
}
