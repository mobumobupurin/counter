// 登録・編集用のシート（基本情報 / タグ / 自由情報欄）
import * as S from '../store.js';
import { h, esc, $, uid } from '../util.js';
import { icon } from '../icons.js';
import { openSheet, toast, placeholderStyle } from '../ui.js';
import { openCropper } from './cropper.js';

const ICON_MAX = 900; // ホーム用（カードは小さいので十分）
const DETAIL_MAX = 1800; // 詳細画面用
// 種類ごとのトリミング比率（アイコンはカードに合わせて正方形固定）
const CROP_ASPECTS = {
  icon: ['square'],
  detail: ['original', 'square', 'landscape', 'portrait', 'wide'],
};

/** 新規登録（counter=null）または基本情報の編集 */
export function openCounterEditor(counter, done) {
  const isNew = !counter;
  const draft = {
    name: counter?.name ?? '',
    iconImageId: counter?.iconImageId ?? null,
    detailImageId: counter?.detailImageId ?? null,
    tags: [...(counter?.tags ?? [])],
  };
  // このシートで新たに保存した画像（キャンセル時に破棄する）
  const newImages = new Set();
  let saved = false;

  const body = h(`
    <form class="form" autocomplete="off">
      <label class="field">
        <span class="field-label">カウンター名</span>
        <input class="text-input" name="name" maxlength="60" placeholder="例：ランニング" value="${esc(draft.name)}" required>
      </label>
      <div class="image-pickers">
        <div class="image-picker" data-kind="icon">
          <span class="field-label">アイコン画像</span>
          <button type="button" class="image-slot square"></button>
          <span class="field-note">ホーム・カレンダー・並び替えで使用</span>
        </div>
        <div class="image-picker" data-kind="detail">
          <span class="field-label">詳細画像</span>
          <button type="button" class="image-slot wide"></button>
          <span class="field-note">未設定ならアイコン画像を使用</span>
        </div>
      </div>
      ${isNew ? `<div class="field"><span class="field-label">タグ</span><div class="tag-editor-slot"></div></div>` : ''}
      <input type="file" accept="image/*" hidden>
    </form>`);

  const fileInput = $('input[type=file]', body);
  let pickingKind = null;

  async function paintSlot(kind) {
    const slot = $(`[data-kind="${kind}"] .image-slot`, body);
    const id = kind === 'icon' ? draft.iconImageId : draft.detailImageId;
    const url = await S.imageURL(id);
    if (url) {
      slot.innerHTML = `<img src="${url}" alt=""><span class="slot-actions">
          <span class="slot-badge" data-crop="${kind}">${icon('crop', 14)}切り取り</span>
          <span class="slot-badge" data-change="${kind}">${icon('image', 14)}変更</span>
          <span class="slot-badge danger" data-remove="${kind}" aria-label="画像を外す">${icon('trash', 14)}</span>
        </span>`;
    } else if (kind === 'detail' && draft.iconImageId) {
      const iu = await S.imageURL(draft.iconImageId);
      slot.innerHTML = `<img src="${iu}" alt="" class="dim"><span class="slot-empty">${icon('image', 22)}<span>アイコン画像を使用中<br>タップで別の画像を選択</span></span>`;
    } else {
      slot.innerHTML = `<span class="slot-empty">${icon('image', 26)}<span>画像を選択</span></span>`;
    }
  }

  body.addEventListener('click', async (e) => {
    const rm = e.target.closest('[data-remove]');
    if (rm) {
      e.preventDefault();
      e.stopPropagation();
      const k = rm.dataset.remove;
      const old = k === 'icon' ? draft.iconImageId : draft.detailImageId;
      if (newImages.has(old)) {
        newImages.delete(old);
        S.discardImage(old);
      }
      if (k === 'icon') draft.iconImageId = null;
      else draft.detailImageId = null;
      paintSlot('icon');
      paintSlot('detail');
      return;
    }
    const changeBtn = e.target.closest('[data-change]');
    const slot = e.target.closest('.image-slot');
    if (!slot) return;
    e.preventDefault();
    const kind = slot.closest('[data-kind]').dataset.kind;
    const curId = kind === 'icon' ? draft.iconImageId : draft.detailImageId;
    // 画像があるとき：「変更」以外のタップ（画像本体・切り取り）はトリミングし直し
    if (curId && !changeBtn) {
      recrop(kind, curId);
      return;
    }
    pickingKind = kind;
    fileInput.value = '';
    fileInput.click();
  });

  /** 新しい画像IDを下書きに設定（このシートで作った古い画像は破棄） */
  function setImage(kind, id) {
    const old = kind === 'icon' ? draft.iconImageId : draft.detailImageId;
    if (old && newImages.has(old)) {
      newImages.delete(old);
      S.discardImage(old);
    }
    newImages.add(id);
    if (kind === 'icon') draft.iconImageId = id;
    else draft.detailImageId = id;
  }

  /** トリミング画面を開き、決定したら保存する */
  async function cropAndSave(kind, source, prevCrop) {
    const res = await openCropper({
      source,
      aspects: CROP_ASPECTS[kind],
      aspect: prevCrop?.aspect,
      crop: prevCrop,
      maxSize: kind === 'icon' ? ICON_MAX : DETAIL_MAX,
      title: kind === 'icon' ? 'アイコン画像を切り取り' : '詳細画像を切り取り',
    });
    if (!res) return;
    try {
      const id = await S.saveImage({ blob: res.blob, source, crop: res.crop });
      setImage(kind, id);
      await paintSlot('icon');
      await paintSlot('detail');
    } catch (err) {
      console.error(err);
      toast('画像を保存できませんでした');
    }
  }

  async function recrop(kind, id) {
    const rec = await S.imageRecord(id);
    if (!rec) return;
    // 以前のデータ（元画像を持っていない画像）は、今の画像を元にする
    await cropAndSave(kind, rec.source || rec.blob, rec.source ? rec.crop : null);
  }

  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    if (!f || !pickingKind) return;
    const kind = pickingKind;
    const slot = $(`[data-kind="${kind}"] .image-slot`, body);
    slot.classList.add('loading');
    let source;
    try {
      source = await S.prepareSource(f);
    } catch (err) {
      console.error(err);
      toast('画像を読み込めませんでした');
      return;
    } finally {
      slot.classList.remove('loading');
    }
    await cropAndSave(kind, source, null);
  });

  let tagEd = null;
  if (isNew) {
    tagEd = tagEditor(draft.tags);
    $('.tag-editor-slot', body).appendChild(tagEd.el);
  }

  body.addEventListener('submit', (e) => e.preventDefault());

  openSheet({
    title: isNew ? '新しいカウンター' : '基本情報を編集',
    body,
    left: 'キャンセル',
    right: isNew ? '追加' : '保存',
    wide: true,
    onRight: async (sheet) => {
      const name = $('[name=name]', body).value.trim();
      if (!name) {
        toast('カウンター名を入力してください');
        $('[name=name]', body).focus();
        return;
      }
      if (tagEd) tagEd.commitPending();
      let result;
      if (isNew) {
        result = await S.createCounter({ ...draft, name });
      } else {
        await S.updateCounter(counter.id, { name, iconImageId: draft.iconImageId, detailImageId: draft.detailImageId });
        result = S.counter(counter.id);
      }
      saved = true;
      sheet.close(result);
    },
    onClose: (result) => {
      if (!saved) for (const id of newImages) S.discardImage(id);
      done?.(saved ? result : null);
    },
  });

  paintSlot('icon');
  paintSlot('detail');
  if (isNew) setTimeout(() => $('[name=name]', body)?.focus(), 350);
}

/** タグ入力コンポーネント */
function tagEditor(tags) {
  const el = h(`
    <div class="tag-editor">
      <div class="tag-list"></div>
      <div class="tag-input-row">
        <input class="text-input" placeholder="タグを入力" maxlength="30" enterkeyhint="done">
        <button type="button" class="secondary-btn small" data-add>追加</button>
      </div>
      <div class="tag-suggest"></div>
    </div>`);
  const input = $('input', el);

  function paint() {
    $('.tag-list', el).innerHTML = tags.length
      ? tags.map((t, i) => `<span class="tag removable">${esc(t)}<button type="button" data-rm="${i}" aria-label="${esc(t)}を外す">${icon('x', 12)}</button></span>`).join('')
      : '<span class="muted">タグなし</span>';
    const sug = S.allTags().filter((t) => !tags.includes(t));
    $('.tag-suggest', el).innerHTML = sug.length
      ? `<span class="field-note">既存のタグ</span>${sug.map((t) => `<button type="button" class="tag ghost" data-sug="${esc(t)}">${icon('plus', 11)}${esc(t)}</button>`).join('')}`
      : '';
  }
  function add(v) {
    v = v.trim();
    if (!v || tags.includes(v)) return;
    tags.push(v);
    paint();
  }
  el.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-rm]');
    if (rm) {
      tags.splice(Number(rm.dataset.rm), 1);
      paint();
      return;
    }
    const sg = e.target.closest('[data-sug]');
    if (sg) {
      add(sg.dataset.sug);
      return;
    }
    if (e.target.closest('[data-add]')) {
      add(input.value);
      input.value = '';
      input.focus();
    }
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      add(input.value);
      input.value = '';
    }
  });
  paint();
  return {
    el,
    commitPending() {
      if (input.value.trim()) add(input.value);
      input.value = '';
    },
  };
}

/** タグ編集（詳細画面から） */
export function openTagEditor(counter) {
  const tags = [...counter.tags];
  const ed = tagEditor(tags);
  openSheet({
    title: 'タグを編集',
    body: ed.el,
    left: 'キャンセル',
    right: '保存',
    onRight: async (sheet) => {
      ed.commitPending();
      await S.updateCounter(counter.id, { tags: [...tags] });
      sheet.close();
    },
  });
}

/** 自由情報欄の追加・編集 */
export function openInfoEditor(counter, field) {
  const body = h(`
    <form class="form">
      <label class="field">
        <span class="field-label">タイトル <em class="req">必須</em></span>
        <input class="text-input" name="title" maxlength="40" placeholder="例：プロフィール" value="${esc(field?.title ?? '')}">
      </label>
      <label class="field">
        <span class="field-label">内容</span>
        <textarea class="text-input area" name="content" rows="8" placeholder="自由に入力できます（空でも保存できます）">${esc(field?.content ?? '')}</textarea>
      </label>
    </form>`);
  body.addEventListener('submit', (e) => e.preventDefault());
  openSheet({
    title: field ? '情報欄を編集' : '情報欄を追加',
    body,
    left: 'キャンセル',
    right: '保存',
    wide: true,
    onRight: async (sheet) => {
      const title = $('[name=title]', body).value.trim();
      const content = $('[name=content]', body).value;
      if (!title) {
        toast('タイトルを入力してください');
        $('[name=title]', body).focus();
        return;
      }
      const list = counter.infoFields.map((f) => ({ ...f }));
      if (field) {
        const f = list.find((x) => x.id === field.id);
        if (f) Object.assign(f, { title, content });
      } else {
        list.push({ id: uid(), title, content });
      }
      await S.updateCounter(counter.id, { infoFields: list });
      sheet.close();
    },
  });
  if (!field) setTimeout(() => $('[name=title]', body)?.focus(), 350);
}

export { placeholderStyle };
