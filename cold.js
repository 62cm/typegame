/**
 * 感冒模式逻辑：咳嗽溅唾液到全键盘打字；语音靠口水触发。
 */

import { REPORT, VOICE_LINES, charsUnlockedByVoice } from "./cold-content.js";

export const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

/** 同一竖列：每列从上到下最多 3 键 */
export function columnKeys(letter) {
  const cols = [];
  for (let c = 0; c < 10; c++) {
    const col = [];
    for (const row of ROWS) {
      if (c < row.length) col.push(row[c]);
    }
    cols.push(col);
  }
  for (const col of cols) {
    const idx = col.indexOf(letter);
    if (idx >= 0) {
      return col.slice(idx, idx + 3);
    }
  }
  return [letter];
}

export const SALIVA = {
  phlegm: { id: "phlegm", name: "浓痰", duration: 30, color: "#c4a574" },
  snot: { id: "snot", name: "鼻涕", duration: 10, color: "#8fd4a8" },
  spit: { id: "spit", name: "唾沫星子", duration: 1, color: "#d8e8ff" },
};

export function payTier(elapsedSec) {
  if (elapsedSec <= 180) return { label: "奖金", amount: 2000, tip: "3 分钟内完成" };
  if (elapsedSec <= 300) return { label: "合同款", amount: 1000, tip: "5 分钟内完成" };
  return { label: "辛苦费", amount: 100, tip: "不限时完成" };
}

export function createColdGame(ui) {
  const state = {
    running: false,
    finished: false,
    salivaType: "phlegm",
    // key -> [{type, until, id}]
    stains: new Map(),
    typed: "",
    revealedEnd: 0,
    voiceIndex: 0,
    voicePlaying: false,
    shakeCd: 0,
    elapsed: 0,
    stainSeq: 0,
    lastEmit: "",
  };

  let stainOrder = []; // {key, type, until, id} placement order for 浓痰 combo

  function target() {
    return REPORT;
  }

  function unlockedText() {
    return REPORT.slice(0, state.revealedEnd);
  }

  function clearStains() {
    state.stains.clear();
    stainOrder = [];
  }

  function pruneStains(now) {
    for (const [k, list] of state.stains) {
      const next = list.filter((s) => s.until > now);
      if (next.length) state.stains.set(k, next);
      else state.stains.delete(k);
    }
    stainOrder = stainOrder.filter((s) => s.until > now);
  }

  function keysWithSaliva() {
    const set = new Set();
    for (const k of state.stains.keys()) set.add(k);
    return set;
  }

  /** 溅射：放置唾液并立刻按「当前有唾液的键」拼出字母 */
  function coughOnKey(letter) {
    if (!state.running || state.finished) return;
    const now = performance.now() / 1000;
    pruneStains(now);

    const type = state.salivaType;
    const def = SALIVA[type];
    const until = now + def.duration;
    const keys =
      type === "snot" ? columnKeys(letter) : [letter];

    for (const k of keys) {
      state.stainSeq += 1;
      const stain = { type, until, id: state.stainSeq, key: k };
      const list = state.stains.get(k) || [];
      list.push(stain);
      state.stains.set(k, list);
      stainOrder.push(stain);
    }

    // 组合输出：所有仍带唾液的字母键，按溅上顺序去重
    const seen = new Set();
    let chunk = "";
    for (const s of stainOrder) {
      if (s.until <= now) continue;
      if (seen.has(s.key)) continue;
      seen.add(s.key);
      chunk += s.key;
    }
    if (chunk) {
      state.typed += chunk;
      state.lastEmit = chunk;
    }

    ui.onStain?.(state);
    ui.onTyped?.(state);
    checkWin();
  }

  function backspace() {
    if (!state.running || state.finished) return;
    if (!state.typed) return;
    state.typed = state.typed.slice(0, -1);
    ui.onTyped?.(state);
  }

  function space() {
    if (!state.running || state.finished) return;
    state.typed += " ";
    ui.onTyped?.(state);
    checkWin();
  }

  function shakeKeyboard() {
    if (!state.running || state.finished) return;
    if (state.shakeCd > 0) return false;
    clearStains();
    state.shakeCd = 10;
    ui.onStain?.(state);
    ui.onShake?.(state);
    return true;
  }

  function spitForVoice() {
    if (!state.running || state.finished) return;
    // 未播完的下一段 / 重听当前段
    if (state.voiceIndex < VOICE_LINES.length) {
      const { end } = charsUnlockedByVoice(state.voiceIndex);
      state.revealedEnd = Math.max(state.revealedEnd, end);
      const line = VOICE_LINES[state.voiceIndex];
      state.voicePlaying = true;
      ui.onVoice?.(line, state.voiceIndex, false);
      state.voiceIndex += 1;
      ui.onReveal?.(state);
    } else {
      // 全部解锁后，再吐一口可重听最后一段
      const line = VOICE_LINES[VOICE_LINES.length - 1];
      state.voicePlaying = true;
      ui.onVoice?.(line, VOICE_LINES.length - 1, true);
    }
  }

  function checkWin() {
    if (state.typed === REPORT) {
      state.finished = true;
      state.running = false;
      const pay = payTier(state.elapsed);
      ui.onWin?.(state, pay);
    }
  }

  function start() {
    state.running = true;
    state.finished = false;
    state.typed = "";
    state.revealedEnd = 0;
    state.voiceIndex = 0;
    state.shakeCd = 0;
    state.elapsed = 0;
    clearStains();
    ui.onStart?.(state);
    ui.onTyped?.(state);
    ui.onReveal?.(state);
    ui.onStain?.(state);
  }

  function tick(dt) {
    if (!state.running) return;
    state.elapsed += dt;
    if (state.shakeCd > 0) state.shakeCd = Math.max(0, state.shakeCd - dt);
    const now = performance.now() / 1000;
    pruneStains(now);
    ui.onTick?.(state);
    ui.onStain?.(state);
  }

  function setSalivaType(id) {
    if (SALIVA[id]) state.salivaType = id;
  }

  return {
    state,
    target,
    unlockedText,
    keysWithSaliva,
    coughOnKey,
    backspace,
    space,
    shakeKeyboard,
    spitForVoice,
    start,
    tick,
    setSalivaType,
    REPORT,
    VOICE_LINES,
    SALIVA,
    ROWS,
    payTier,
  };
}
