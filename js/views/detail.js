// カウンター詳細画面
import * as S from '../store.js';
import { h, esc, $, fmtYear, fmtCount, fmtMD, fmtYMD, fmtDayKeyLong, parseDayKey } from '../util.js';
import { icon } from '../icons.js';
import { openSheet, confirmDialog, toast, pressAnim, popAnim, placeholderStyle } from '../ui.js';
import { click, haptic } from '../feedback.js';
import { openCounterEditor, openTagEditor, openInfoEditor } from './editor.js';

// 展開状態（カウンターごと・個別に保持）
const expanded = new Map(); // cid -> Set('y2026', 'm2026-8')

export function renderDetail(root, nav, cid) {
  const c0 = S.counter(cid);
  if (!c0) {
    root.innerHTML = `<div class="page"><header class="nav-bar"><button class="back-btn" data-back>${icon('back', 22)}戻る</button></header><div class="empty"><p class="empty-title">カウンターが見つかりません</p></div></div>`;
    root.querySelector('[data-back]').onclick = () => history.back();
    return {};
  }
  if (!expanded.has(cid)) {
    // 初期状態では最新の年を開いておく
    const hy = S.hierarchy(cid)[0];
    expanded.set(cid, new Set(hy ? [`y${hy.year}`] : []));
  }
  const open = expanded.get(cid);

  root.innerHTML = '';
  const el = h(`
    <div class="page detail">
      <header class="nav-bar floating">
        <button class="back-btn" data-act="back">${icon('back', 22)}<span>戻る</span></button>
        <div class="nav-spacer"></div>
        <button class="icon-btn glass" data-act="edit" aria-label="基本情報を編集">${icon('pencil', 19)}</button>
      </header>
      <div class="hero"></div>
      <section class="detail-head">
        <h1 class="detail-name"></h1>
        <div class="detail-total"><span class="big"></span><span class="unit">回</span><span class="label">累計</span></div>
        <div class="quick-count">
          <span class="qc-label"></span>
          <div class="qc-ctrl">
            <button class="round-btn" data-act="dec" aria-label="1減らす">${icon('minus', 20)}</button>
            <span class="qc-num"></span>
            <button class="round-btn accent" data-act="inc" aria-label="1増やす">${icon('plus', 20)}</button>
          </div>
        </div>
        <div class="action-row">
          <button class="action" data-act="calendar">${icon('calendar', 22)}<span>カレンダー</span></button>
          <button class="action" data-act="stats">${icon('chart', 22)}<span>グラフ</span></button>
          <button class="action" data-act="pin">${icon('pin', 22)}<span></span></button>
        </div>
      </section>
      <section class="section">
        <h2 class="section-title">記録</h2>
        <div class="tree card-panel"></div>
      </section>
      <section class="section">
        <div class="section-head"><h2 class="section-title">タグ</h2><button class="text-btn" data-act="tags">編集</button></div>
        <div class="tag-scroll"></div>
      </section>
      <section class="section">
        <h2 class="section-title">情報</h2>
        <div class="info-list"></div>
        <button class="add-row" data-act="add-info">${icon('plus', 18)}情報欄を追加</button>
      </section>
      <section class="section">
        <div class="card-panel menu-list">
          <button class="menu-item" data-act="edit">${icon('pencil', 18)}<span>名前・画像を編集</span>${icon('chevR', 16, 'chev')}</button>
          <button class="menu-item danger" data-act="delete">${icon('trash', 18)}<span>カウンターを削除</span></button>
        </div>
      </section>
    </div>`);
  root.appendChild(el);

  async function paintHero() {
    const c = S.counter(cid);
    const url = (await S.imageURL(c.detailImageId)) || (await S.imageURL(c.iconImageId));
    $('.hero', el).innerHTML = url
      ? `<img src="${url}" alt="">`
      : `<div class="hero-ph" style="${placeholderStyle(c.name)}"><span>${esc([...c.name][0] || '?')}</span></div>`;
  }

  function paintHead() {
    const c = S.counter(cid);
    $('.detail-name', el).textContent = c.name;
    $('.detail-total .big', el).textContent = fmtCount(S.total(cid));
    const sd = S.selectedDay();
    $('.qc-label', el).textContent = `${fmtYMD(parseDayKey(sd))} の記録`;
    $('.qc-num', el).textContent = String(S.countOn(cid, sd));
    $('[data-act="dec"]', el).toggleAttribute('data-disabled', S.countOn(cid, sd) === 0);
    const pin = $('[data-act="pin"]', el);
    pin.classList.toggle('on', c.pinned);
    $('span', pin).textContent = c.pinned ? 'ピン留め中' : 'ピン留め';
  }

  function paintTree() {
    const tree = S.hierarchy(cid);
    const box = $('.tree', el);
    if (!tree.length) {
      box.innerHTML = '<p class="muted pad">まだ記録がありません</p>';
      return;
    }
    box.innerHTML = tree
      .map((Y) => {
        const yk = `y${Y.year}`;
        const yOpen = open.has(yk);
        return `<div class="tree-node">
          <button class="tree-row level-0" data-key="${yk}" aria-expanded="${yOpen}">
            ${icon('chevR', 16, 'tw')}<span class="tree-label">${fmtYear(Y.year)}</span><span class="tree-count">${fmtCount(Y.total)}回</span>
          </button>
          <div class="collapse ${yOpen ? 'open' : ''}"><div class="collapse-inner">
            ${Y.months
              .map((M) => {
                const mk = `m${Y.year}-${M.month}`;
                const mOpen = open.has(mk);
                return `<div class="tree-node">
                  <button class="tree-row level-1" data-key="${mk}" aria-expanded="${mOpen}">
                    ${icon('chevR', 15, 'tw')}<span class="tree-label">${M.month}月</span><span class="tree-count">${fmtCount(M.total)}回</span>
                  </button>
                  <div class="collapse ${mOpen ? 'open' : ''}"><div class="collapse-inner">
                    ${M.days
                      .map(
                        (D) => `<button class="tree-row level-2" data-day="${D.day}">
                          <span class="tree-label">${fmtMD(parseDayKey(D.day))}</span><span class="tree-count">${D.count}回</span>
                        </button>`
                      )
                      .join('')}
                  </div></div>
                </div>`;
              })
              .join('')}
          </div></div>
        </div>`;
      })
      .join('');
  }

  function paintTags() {
    const c = S.counter(cid);
    $('.tag-scroll', el).innerHTML = c.tags.length
      ? c.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')
      : '<span class="muted">タグなし</span>';
  }

  function paintInfo() {
    const c = S.counter(cid);
    $('.info-list', el).innerHTML = c.infoFields
      .map(
        (f) => `<article class="info card-panel" data-fid="${esc(f.id)}">
          <div class="info-head"><h3>${esc(f.title)}</h3>
            <button class="icon-btn subtle" data-act="info-menu" aria-label="メニュー">${icon('more', 20)}</button></div>
          ${f.content ? `<div class="info-body selectable">${esc(f.content)}</div>` : '<div class="info-body muted">（内容なし）</div>'}
        </article>`
      )
      .join('');
  }

  function paintAll() {
    paintHero();
    paintHead();
    paintTree();
    paintTags();
    paintInfo();
  }

  // 展開・折りたたみ：他の要素を作り直さず、その部分だけ高さを変える
  function toggle(btn) {
    const key = btn.dataset.key;
    const col = btn.nextElementSibling;
    const isOpen = open.has(key);
    if (isOpen) open.delete(key);
    else open.add(key);
    btn.setAttribute('aria-expanded', String(!isOpen));
    col.classList.toggle('open', !isOpen);
  }

  el.addEventListener('click', async (e) => {
    const row = e.target.closest('.tree-row[data-key]');
    if (row) {
      toggle(row);
      return;
    }
    const dayRow = e.target.closest('.tree-row[data-day]');
    if (dayRow) {
      openDayEditor(cid, dayRow.dataset.day);
      return;
    }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const c = S.counter(cid);
    switch (b.dataset.act) {
      case 'back':
        history.back();
        break;
      case 'edit':
        openCounterEditor(c);
        break;
      case 'inc':
        pressAnim(b);
        click('up');
        haptic();
        S.increment(cid);
        break;
      case 'dec':
        if (S.countOn(cid, S.selectedDay()) === 0) return;
        pressAnim(b);
        click('down');
        haptic();
        S.decrement(cid);
        break;
      case 'calendar':
        nav(`#/calendar/${encodeURIComponent(cid)}`);
        break;
      case 'stats':
        nav(`#/stats/${encodeURIComponent(cid)}`);
        break;
      case 'pin':
        haptic();
        await S.updateCounter(cid, { pinned: !c.pinned });
        toast(c.pinned ? 'ピン留めしました' : 'ピン留めを解除しました');
        break;
      case 'tags':
        openTagEditor(c);
        break;
      case 'add-info':
        openInfoEditor(c, null);
        break;
      case 'info-menu': {
        const fid = b.closest('[data-fid]').dataset.fid;
        const f = c.infoFields.find((x) => x.id === fid);
        if (f) openInfoMenu(c, f);
        break;
      }
      case 'delete': {
        const ok = await confirmDialog({
          title: `「${c.name}」を削除しますか？`,
          message: '名前・画像・タグ・情報欄・すべてのカウント記録が削除されます。\nこの操作は取り消せません。',
          ok: '削除',
          danger: true,
        });
        if (ok) {
          await S.deleteCounter(cid);
          toast('削除しました');
          history.back();
        }
        break;
      }
    }
  });

  function openInfoMenu(c, f) {
    const body = h(`<div class="option-list">
      <button class="option" data-m="edit"><span>${icon('pencil', 17)} 編集</span></button>
      <button class="option danger" data-m="del"><span>${icon('trash', 17)} 削除</span></button>
    </div>`);
    const sheet = openSheet({ title: f.title, body });
    body.addEventListener('click', async (e) => {
      const m = e.target.closest('[data-m]')?.dataset.m;
      if (!m) return;
      sheet.close();
      if (m === 'edit') openInfoEditor(c, f);
      if (m === 'del') {
        const ok = await confirmDialog({ title: `「${f.title}」を削除しますか？`, message: 'この操作は取り消せません。', ok: '削除', danger: true });
        if (ok) await S.updateCounter(c.id, { infoFields: c.infoFields.filter((x) => x.id !== f.id) });
      }
    });
  }

  const unsub = S.subscribe((ev) => {
    if (!S.counter(cid)) return;
    if (ev.type === 'count' && ev.cid === cid) {
      paintHead();
      popAnim($('.qc-num', el));
      paintTree();
    } else if (ev.type === 'selectedDay') {
      paintHead();
    } else if (ev.type === 'counters' && (!ev.cid || ev.cid === cid)) {
      paintAll();
    }
  });

  paintAll();
  return { destroy: unsub };
}

/** 特定日の回数を確認・変更するシート（詳細・個別カレンダーから） */
export function openDayEditor(cid, day) {
  const c = S.counter(cid);
  const body = h(`
    <div class="day-editor">
      <div class="day-editor-icon"></div>
      <p class="day-editor-name">${esc(c.name)}</p>
      <div class="qc-ctrl large">
        <button class="round-btn" data-d="-1" aria-label="1減らす">${icon('minus', 24)}</button>
        <span class="qc-num"></span>
        <button class="round-btn accent" data-d="1" aria-label="1増やす">${icon('plus', 24)}</button>
      </div>
      <p class="hint">この日の回数を直接変更できます</p>
    </div>`);
  (async () => {
    const url = await S.imageURL(c.iconImageId);
    $('.day-editor-icon', body).innerHTML = url
      ? `<img src="${url}" alt="">`
      : `<div class="ph" style="${placeholderStyle(c.name)}">${esc([...c.name][0] || '?')}</div>`;
  })();
  const num = $('.qc-num', body);
  const paint = () => {
    num.textContent = String(S.countOn(cid, day));
    $('[data-d="-1"]', body).toggleAttribute('data-disabled', S.countOn(cid, day) === 0);
  };
  paint();
  body.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-d]');
    if (!b) return;
    if (b.dataset.d === '1') {
      click('up');
      haptic();
      pressAnim(b);
      S.increment(cid, day);
    } else {
      if (!S.countOn(cid, day)) return;
      click('down');
      haptic();
      pressAnim(b);
      S.decrement(cid, day);
    }
    paint();
    popAnim(num);
  });
  openSheet({ title: fmtDayKeyLong(day), body });
}
