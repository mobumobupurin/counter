// 画像トリミング（ドラッグで移動・ピンチ／スライダーで拡大縮小）
import { h, $, $$ } from '../util.js';
import { icon } from '../icons.js';
import { openSheet } from '../ui.js';

const MAX_ZOOM = 8;

/** 比率の選択肢 */
export const ASPECTS = {
  square: { label: '1:1', value: 1 },
  original: { label: '元の比率', value: null },
  landscape: { label: '4:3', value: 4 / 3 },
  portrait: { label: '3:4', value: 3 / 4 },
  wide: { label: '16:9', value: 16 / 9 },
};

/**
 * トリミング画面を開く
 * @param {{source:Blob, aspects:string[], aspect?:string, crop?:{cx:number,cy:number,zoom:number}, maxSize:number, title?:string}} o
 * @returns {Promise<{blob:Blob, crop:object}|null>} キャンセル時は null
 */
export function openCropper(o) {
  return new Promise((resolve) => {
    const aspects = o.aspects;
    let aspectKey = aspects.includes(o.aspect) ? o.aspect : aspects[0];
    let done = false;

    const body = h(`
      <div class="cropper">
        <div class="crop-stage-wrap">
          <div class="crop-stage" aria-label="トリミング範囲。ドラッグで移動、ピンチで拡大縮小">
            <img class="crop-img" alt="" draggable="false">
            <div class="crop-grid"><i></i><i></i><i></i><i></i></div>
          </div>
        </div>
        <div class="crop-zoom">
          <button type="button" class="icon-btn subtle" data-z="-1" aria-label="縮小">${icon('minus', 20)}</button>
          <input type="range" min="0" max="1000" value="0" aria-label="拡大率">
          <button type="button" class="icon-btn subtle" data-z="1" aria-label="拡大">${icon('plus', 20)}</button>
        </div>
        ${
          aspects.length > 1
            ? `<div class="crop-aspects">${aspects
                .map((k) => `<button type="button" class="chip-btn small" data-aspect="${k}">${ASPECTS[k].label}</button>`)
                .join('')}</div>`
            : ''
        }
        <div class="crop-foot">
          <p class="hint">ドラッグで位置、ピンチやスライダーで大きさを調整できます</p>
          <button type="button" class="text-btn" data-reset>リセット</button>
        </div>
      </div>`);

    const stage = $('.crop-stage', body);
    const wrap = $('.crop-stage-wrap', body);
    const img = $('.crop-img', body);
    const slider = $('input[type=range]', body);
    const url = URL.createObjectURL(o.source);

    // 画像の元サイズ、枠のサイズ、表示倍率、画像左上の位置（枠基準）
    let nw = 0;
    let nh = 0;
    let W = 0;
    let H = 0;
    let s = 1;
    let minS = 1;
    let tx = 0;
    let ty = 0;

    const aspectValue = () => ASPECTS[aspectKey].value ?? nw / nh;

    function layoutFrame() {
      const maxW = wrap.clientWidth || 320;
      const maxH = Math.min(window.innerHeight * 0.5, 520);
      const a = aspectValue();
      W = maxW;
      H = W / a;
      if (H > maxH) {
        H = maxH;
        W = H * a;
      }
      W = Math.round(W);
      H = Math.round(H);
      stage.style.width = W + 'px';
      stage.style.height = H + 'px';
      minS = Math.max(W / nw, H / nh); // 枠を必ず覆う最小倍率
    }

    function clamp() {
      s = Math.min(Math.max(s, minS), minS * MAX_ZOOM);
      tx = Math.min(0, Math.max(W - nw * s, tx));
      ty = Math.min(0, Math.max(H - nh * s, ty));
    }

    function apply() {
      clamp();
      img.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
      // スライダーは対数目盛り
      slider.value = String(Math.round((Math.log(s / minS) / Math.log(MAX_ZOOM)) * 1000));
    }

    /** 枠内の点 (px, py) を中心に倍率を変える */
    function zoomAt(newS, px = W / 2, py = H / 2) {
      newS = Math.min(Math.max(newS, minS), minS * MAX_ZOOM);
      const ix = (px - tx) / s;
      const iy = (py - ty) / s;
      s = newS;
      tx = px - ix * s;
      ty = py - iy * s;
      apply();
    }

    /** 中心位置と倍率を保ったまま枠を作り直す */
    function relayout(center, zoom) {
      layoutFrame();
      s = minS * zoom;
      tx = W / 2 - center.cx * nw * s;
      ty = H / 2 - center.cy * nh * s;
      apply();
    }

    function currentCrop() {
      return {
        cx: (W / 2 - tx) / s / nw,
        cy: (H / 2 - ty) / s / nh,
        zoom: s / minS,
        aspect: aspectKey,
      };
    }

    function paintAspectButtons() {
      $$('[data-aspect]', body).forEach((b) => b.classList.toggle('active', b.dataset.aspect === aspectKey));
    }

    // ---------- 操作 ----------
    const pointers = new Map();
    let pinch = null;

    stage.addEventListener('pointerdown', (e) => {
      stage.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) startPinch();
    });

    function startPinch() {
      const [a, b] = [...pointers.values()];
      const r = stage.getBoundingClientRect();
      pinch = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        s,
        mx: (a.x + b.x) / 2 - r.left,
        my: (a.y + b.y) / 2 - r.top,
      };
    }

    stage.addEventListener('pointermove', (e) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const cur = { x: e.clientX, y: e.clientY };
      pointers.set(e.pointerId, cur);
      if (pointers.size >= 2 && pinch) {
        const [a, b] = [...pointers.values()];
        const r = stage.getBoundingClientRect();
        const mx = (a.x + b.x) / 2 - r.left;
        const my = (a.y + b.y) / 2 - r.top;
        // 2本指の中点の移動で平行移動、距離の変化で拡大縮小
        tx += mx - pinch.mx;
        ty += my - pinch.my;
        pinch.mx = mx;
        pinch.my = my;
        zoomAt(pinch.s * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.dist), mx, my);
      } else if (pointers.size === 1) {
        tx += cur.x - prev.x;
        ty += cur.y - prev.y;
        apply();
      }
    });

    const endPointer = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 2) startPinch();
    };
    stage.addEventListener('pointerup', endPointer);
    stage.addEventListener('pointercancel', endPointer);

    // iOS Safari のピンチ（gesture イベント）でページ自体が拡大されるのを防ぐ
    const stopGesture = (e) => e.preventDefault();
    stage.addEventListener('gesturestart', stopGesture);
    stage.addEventListener('gesturechange', stopGesture);

    stage.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const r = stage.getBoundingClientRect();
        zoomAt(s * Math.exp(-e.deltaY * 0.002), e.clientX - r.left, e.clientY - r.top);
      },
      { passive: false }
    );

    slider.addEventListener('input', () => {
      zoomAt(minS * Math.pow(MAX_ZOOM, Number(slider.value) / 1000));
    });

    body.addEventListener('click', (e) => {
      const z = e.target.closest('[data-z]');
      if (z) zoomAt(s * (z.dataset.z === '1' ? 1.25 : 0.8));
      const a = e.target.closest('[data-aspect]');
      if (a) {
        const c = currentCrop();
        aspectKey = a.dataset.aspect;
        paintAspectButtons();
        relayout(c, c.zoom);
      }
      if (e.target.closest('[data-reset]')) relayout({ cx: 0.5, cy: 0.5 }, 1);
    });

    const onResize = () => {
      if (!nw) return;
      const c = currentCrop();
      relayout(c, c.zoom);
    };
    window.addEventListener('resize', onResize);

    // ---------- 書き出し ----------
    async function render() {
      const sx = -tx / s;
      const sy = -ty / s;
      const sw = W / s;
      const sh = H / s;
      const k = Math.min(1, o.maxSize / Math.max(sw, sh));
      const cw = Math.max(1, Math.round(sw * k));
      const ch = Math.max(1, Math.round(sh * k));
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
      return new Promise((r) => canvas.toBlob((b) => r(b), 'image/jpeg', 0.88));
    }

    const sheet = openSheet({
      title: o.title || 'トリミング',
      body,
      left: 'キャンセル',
      right: '完了',
      wide: true,
      onRight: async (sh) => {
        const blob = await render();
        done = true;
        sh.close();
        resolve({ blob, crop: currentCrop() });
      },
      onClose: () => {
        window.removeEventListener('resize', onResize);
        URL.revokeObjectURL(url);
        if (!done) resolve(null);
      },
    });

    img.onload = () => {
      nw = img.naturalWidth;
      nh = img.naturalHeight;
      img.style.width = nw + 'px';
      img.style.height = nh + 'px';
      paintAspectButtons();
      // シートの表示が終わってから枠の大きさを決める
      requestAnimationFrame(() => {
        const c = o.crop || { cx: 0.5, cy: 0.5, zoom: 1 };
        relayout(c, c.zoom || 1);
        stage.classList.add('ready');
      });
    };
    img.onerror = () => sheet.close();
    img.src = url;
  });
}
