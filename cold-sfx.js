/** 咳嗽 / 喷嚏：WebAudio 合成，无需外部文件 */

let _ctx = null;

function ctx() {
  if (!_ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    _ctx = new AC();
  }
  if (_ctx.state === "suspended") _ctx.resume().catch(() => {});
  return _ctx;
}

function noiseBuffer(ac, seconds) {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** 短促咳嗽 */
export function playCough() {
  const ac = ctx();
  if (!ac) return;
  const t0 = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, 0.18);
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 900;
  bp.Q.value = 0.7;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.55, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
  src.connect(bp);
  bp.connect(g);
  g.connect(ac.destination);
  src.start(t0);
  src.stop(t0 + 0.18);
}

/** 喷嚏：更长噪声 + 低频 */
export function playSneeze(big = false) {
  const ac = ctx();
  if (!ac) return;
  const t0 = ac.currentTime;
  const dur = big ? 0.42 : 0.28;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, dur);
  const bp = ac.createBiquadFilter();
  bp.type = "lowpass";
  bp.frequency.value = big ? 1400 : 1100;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(big ? 0.85 : 0.65, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  // 吸气感
  const osc = ac.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(180, t0);
  osc.frequency.exponentialRampToValueAtTime(90, t0 + 0.08);
  const og = ac.createGain();
  og.gain.setValueAtTime(0.0001, t0);
  og.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
  og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
  src.connect(bp);
  bp.connect(g);
  g.connect(ac.destination);
  osc.connect(og);
  og.connect(ac.destination);
  src.start(t0);
  src.stop(t0 + dur);
  osc.start(t0);
  osc.stop(t0 + 0.12);
}

/** 憋气爆唾沫：短促湿声 */
export function playSpitBurst() {
  const ac = ctx();
  if (!ac) return;
  const t0 = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, 0.22);
  const bp = ac.createBiquadFilter();
  bp.type = "highpass";
  bp.frequency.value = 600;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.4, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
  src.connect(bp);
  bp.connect(g);
  g.connect(ac.destination);
  src.start(t0);
  src.stop(t0 + 0.22);
}
