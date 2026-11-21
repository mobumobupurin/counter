// アプリ設定
import * as S from '../store.js';
import { h, esc, $ } from '../util.js';
import { icon } from '../icons.js';
import { toast, confirmDialog } from '../ui.js';

export function renderSettings(root) {
  const st = S.settings();
  root.innerHTML = '';
  const el = h(`
    <div class="page settings-page">
      <header class="nav-bar">
        <button class="back-btn" data-act="back">${icon('back', 22)}<span>戻る</span></button>
        <h1 class="nav-title">設定</h1>
        <div class="nav-spacer"></div>
      </header>

      <section class="section">
        <h2 class="section-title">アプリ名</h2>
        <div class="card-panel pad">
          <input class="text-input" name="appName" maxlength="30" value="${esc(st.appName)}" placeholder="カウンター">
          <p class="field-note">ホーム画面上部に表示される名前です。iPhone・iPad のホーム画面に置いたアイコンの名前は、「ホーム画面に追加」するときに別に決められます。</p>
        </div>
      </section>

      <section class="section">
        <h2 class="section-title">表示</h2>
        <div class="card-panel menu-list">
          <div class="menu-item static"><span>「好きな順」で表示する回数</span>
            <select name="favCountMode"><option value="day">選択中の日</option><option value="total">累計</option></select></div>
          <div class="menu-item static"><span>週の始まり</span>
            <select name="weekStart"><option value="1">月曜日</option><option value="0">日曜日</option></select></div>
          <div class="menu-item static"><span>外観</span>
            <select name="theme"><option value="system">端末の設定に合わせる</option><option value="light">ライト</option><option value="dark">ダーク</option></select></div>
        </div>
      </section>

      <section class="section">
        <h2 class="section-title">操作感</h2>
        <div class="card-panel menu-list">
          <label class="menu-item static"><span>クリック音</span><input type="checkbox" class="switch" name="sound"></label>
          <label class="menu-item static"><span>触覚フィードバック</span><input type="checkbox" class="switch" name="haptics"></label>
        </div>
        <p class="field-note pad-x">iPhone の触覚は iOS 18 以降の Safari で動作します。消音モード中は音が出ないことがあります。</p>
      </section>

      <section class="section">
        <h2 class="section-title">データ</h2>
        <div class="card-panel menu-list">
          <button class="menu-item" data-act="export">${icon('download', 18)}<span>バックアップを書き出す</span></button>
          <button class="menu-item" data-act="import">${icon('upload', 18)}<span>バックアップから復元</span></button>
        </div>
        <p class="field-note pad-x">記録はこの端末のブラウザ内に保存され、他の人や他の端末とは共有されません。Safari では「共有 → ホーム画面に追加」してから使うと、データが自動で消されにくくなります。機種変更の前などには、バックアップを書き出しておくと安心です。</p>
        <p class="field-note pad-x storage-info"></p>
        <input type="file" accept="application/json,.json" hidden>
      </section>
    </div>`);
  root.appendChild(el);

  $('[name=favCountMode]', el).value = st.favCountMode;
  $('[name=weekStart]', el).value = String(st.weekStart);
  $('[name=theme]', el).value = st.theme;
  $('[name=sound]', el).checked = st.sound;
  $('[name=haptics]', el).checked = st.haptics;

  const nameInput = $('[name=appName]', el);
  const saveName = () => S.setSetting('appName', nameInput.value.trim() || 'カウンター');
  nameInput.addEventListener('change', saveName);
  nameInput.addEventListener('blur', saveName);

  el.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'favCountMode') S.setSetting('favCountMode', t.value);
    if (t.name === 'weekStart') S.setSetting('weekStart', Number(t.value));
    if (t.name === 'theme') S.setSetting('theme', t.value);
    if (t.name === 'sound') S.setSetting('sound', t.checked);
    if (t.name === 'haptics') S.setSetting('haptics', t.checked);
  });

  const fileInput = $('input[type=file]', el);
  el.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'back') history.back();
    if (act === 'export') {
      try {
        toast('書き出し中…');
        const data = await S.exportBackup();
        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        const d = new Date();
        const name = `counter-backup-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
        const file = new File([blob], name, { type: 'application/json' });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: name }).catch(() => {});
        } else {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = name;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        }
      } catch (err) {
        console.error(err);
        toast('書き出しに失敗しました');
      }
    }
    if (act === 'import') {
      fileInput.value = '';
      fileInput.click();
    }
  });

  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    const ok = await confirmDialog({
      title: 'バックアップから復元しますか？',
      message: '現在のカウンターと記録はすべて、バックアップの内容に置き換わります。',
      ok: '復元',
      danger: true,
    });
    if (!ok) return;
    try {
      const data = JSON.parse(await f.text());
      await S.importBackup(data);
      toast('復元しました');
      setTimeout(() => location.replace(location.pathname), 600);
    } catch (err) {
      console.error(err);
      toast(err.message || '復元に失敗しました');
    }
  });

  // 保存容量の目安
  (async () => {
    try {
      if (navigator.storage?.estimate) {
        const { usage } = await navigator.storage.estimate();
        const persisted = (await navigator.storage.persisted?.()) ?? false;
        $('.storage-info', el).textContent = `使用中のデータ量：約${(usage / 1024 / 1024).toFixed(1)}MB${persisted ? '（保護済み）' : ''}`;
      }
    } catch {
      /* noop */
    }
  })();

  return {};
}
