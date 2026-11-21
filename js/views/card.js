// カウンターカード（ホーム・並び替えで共通のレイアウト）
import { esc, fmtCount } from '../util.js';
import { icon } from '../icons.js';
import { imageURLSync } from '../store.js';
import { rankBadge, placeholderStyle } from '../ui.js';

/**
 * @param {object} c カウンター
 * @param {{count?:number, rank?:number, controls?:boolean, canDec?:boolean}} o
 */
export function cardHTML(c, o = {}) {
  const url = imageURLSync(c.iconImageId);
  const img = url
    ? `<img class="card-img" src="${url}" alt="" loading="lazy" decoding="async" draggable="false">`
    : `<div class="card-img placeholder" style="${placeholderStyle(c.name)}"><span>${esc([...c.name][0] || '?')}</span></div>`;
  const controls = o.controls !== false;
  return `
    <div class="card" data-id="${esc(c.id)}" role="button" tabindex="0" aria-label="${esc(c.name)}">
      ${img}
      ${o.rank ? `<div class="card-rank">${rankBadge(o.rank)}</div>` : ''}
      ${c.pinned ? `<div class="card-pin" aria-label="ピン留め">${icon('pin', 13)}</div>` : ''}
      <div class="card-shade">
        ${
          controls
            ? `<div class="card-row">
                 <button class="cbtn" data-act="dec" aria-label="${esc(c.name)}を1減らす" ${o.canDec === false ? 'data-disabled="1"' : ''}><span class="cbtn-face">${icon('minus', 16)}</span></button>
                 <span class="cnum">${fmtCount(o.count ?? 0)}</span>
                 <button class="cbtn" data-act="inc" aria-label="${esc(c.name)}を1増やす"><span class="cbtn-face">${icon('plus', 16)}</span></button>
               </div>`
            : ''
        }
        <div class="cname"><span>${esc(c.name)}</span></div>
      </div>
    </div>`;
}
