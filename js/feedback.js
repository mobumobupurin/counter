// 操作フィードバック（クリック音・触覚）
import { settings } from './store.js';

let ctx = null;
let noiseBuf = null;

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    // 短いノイズバッファ（クリックの「カチッ」成分）
    const len = Math.floor(ctx.sampleRate * 0.03);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  return ctx;
}

// iOS Safari は一度サスペンドされると音が出なくなるため、毎回 resume を試みる
function ensureRunning(ac) {
  if (ac.state !== 'running') ac.resume().catch(() => {});
}

/** 毎回の操作で鳴るクリック音。kind: 'up' | 'down' | 'tap' */
export function click(kind = 'up') {
  if (!settings().sound) return;
  const ac = audio();
  if (!ac) return;
  ensureRunning(ac);
  const t = ac.currentTime + 0.001;

  // 音程のあるポップ音
  const osc = ac.createOscillator();
  const g = ac.createGain();
  const f = kind === 'up' ? 1250 : kind === 'down' ? 720 : 950;
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(f, t);
  osc.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.06);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(kind === 'tap' ? 0.12 : 0.22, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.075);
  osc.connect(g).connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.09);

  // カチッという成分
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = kind === 'down' ? 2200 : 3200;
  bp.Q.value = 1.2;
  const ng = ac.createGain();
  ng.gain.value = 0.35;
  src.connect(bp).connect(ng).connect(ac.destination);
  src.start(t);
}

// ---------- 触覚 ----------
let hapticLabel = null;
function iosHapticLabel() {
  if (hapticLabel) return hapticLabel;
  // iOS 18 以降の Safari では <input type="checkbox" switch> の切り替えで触覚が発生する
  const label = document.createElement('label');
  label.setAttribute('aria-hidden', 'true');
  label.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.tabIndex = -1;
  label.appendChild(input);
  document.body.appendChild(label);
  hapticLabel = label;
  return label;
}

/** 軽い触覚フィードバック */
export function haptic(strength = 'light') {
  if (!settings().haptics) return;
  if (navigator.vibrate) {
    navigator.vibrate(strength === 'light' ? 8 : 15);
    return;
  }
  try {
    iosHapticLabel().click();
  } catch {
    /* 非対応環境では何もしない */
  }
}

/** 最初のタッチで音声を有効化しておく（iOS の自動再生制限対策） */
export function unlockAudioOnFirstGesture() {
  const unlock = () => {
    const ac = audio();
    if (ac) ensureRunning(ac);
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && ctx) ensureRunning(ctx);
  });
}
