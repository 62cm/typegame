/**
 * 感冒模式：视线方向 + 蓄力喷射。
 * 咳/喷嚏 = 单发一键一字；仅憋气爆发唾沫星子（可粘键组合）。
 * 打字：喷射字母凑拼音，凑齐当前汉字的拼音才出字。
 * 点老板语音条 → 解锁要打的中文。
 */

import {
  REPORT,
  VOICE_LINES,
  SEGMENTS,
  fullPyList,
  charsUnlockedByVoice,
} from "./cold-content.js";

export const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const PY = fullPyList();

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
    if (idx >= 0) return col.slice(idx, idx + 3);
  }
  return [letter];
}

export const GOO = {
  // 唾沫：打中即出字，0.5s 闪一下就没
  spit: { id: "spit", name: "唾沫星子", duration: 0.5, color: "#d8e8ff", sticky: false },
  cough: { id: "cough", name: "咳嗽飞沫", duration: 0.5, color: "#c8d8e8", sticky: false },
  water: { id: "water", name: "清水鼻涕", duration: 0.5, color: "#a8d8f0", sticky: false, drip: false },
  yellow: { id: "yellow", name: "黄鼻涕", duration: 0.5, color: "#d4c020", sticky: false, drip: true },
};

export const COUGH_PERIOD = 3;
export const SNEEZE_PERIOD = 10;
export const HOLD_MAX = 3;

export function payTier(elapsedSec) {
  if (elapsedSec <= 180) return { label: "奖金", amount: 2000, tip: "3 分钟内完成" };
  if (elapsedSec <= 300) return { label: "合同款", amount: 1000, tip: "5 分钟内完成" };
  return { label: "辛苦费", amount: 100, tip: "不限时完成" };
}

/**
 * 预览抛物线（归一化坐标，相对 stage/view-port）
 * 手机不动；鼠标只改落点瞄准键盘区
 */
export function sampleArc(aimX, force, scatter = 0, aimY = 0) {
  const mouthX = 0.5 + aimX * 0.03;
  const mouthY = 0.97;
  const targetX = 0.5 + aimX * 0.36 + scatter;
  // 键盘大致在画面中下部
  const targetY = 0.72 + aimY * 0.12 - force * 0.025;
  const flight = 0.42;
  const vx = (targetX - mouthX) / flight;
  const vy0 = (targetY - mouthY) / flight - 0.85 * force;
  const g = 2.1;
  const pts = [];
  for (let t = 0; t <= flight; t += 0.03) {
    pts.push({
      x: mouthX + vx * t,
      y: mouthY + vy0 * t + 0.5 * g * t * t,
    });
  }
  return pts;
}

export function createColdGame(ui) {
  const state = {
    phase: "practice",
    running: false,
    finished: false,
    aimX: 0, // -1..1 左右
    aimY: 0, // -1..1 上下（负=看向键盘上方）
    holding: false,
    holdTime: 0,
    // 蓄力 0..1，满格才喷（最大强度）
    coughCharge: 0,
    sneezeCharge: 0,
    sneezeIndex: 0, // 第几次喷嚏（1-based 用 % 3）
    nextSneezeBig: false,
    wipeCd: 0,
    stains: new Map(),
    projectiles: [],
    typed: "", // 已确认写入报告的中文前缀
    buffer: "", // 正在凑的拼音
    bufferError: false,
    revealedEnd: 0, // 已解锁可打到的字数
    unlocked: SEGMENTS.map(() => false),
    voiceIndex: 0,
    elapsed: 0,
    stainSeq: 0,
    lastEmit: "",
    lastBurst: null,
    practiceHits: 0,
    previewForce: 0,
    intensity: 0,
    needHint: "", // 下一个汉字的拼音
    needChar: "", // 下一个要打的汉字
  };

  let stainOrder = [];
  let spitSig = "";

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

  function setAim(x, y = state.aimY) {
    state.aimX = Math.max(-1, Math.min(1, x));
    state.aimY = Math.max(-1, Math.min(1, y));
  }

  function setHolding(on) {
    if (!state.running || state.finished) return;
    if (on) {
      if (!state.holding) {
        state.holding = true;
        state.holdTime = 0;
      }
    } else {
      state.holding = false;
      state.holdTime = 0;
    }
  }

  function peekSneezeBig() {
    // 每 3 个里第 3 个大喷嚏（即将喷出的是 sneezeIndex+1）
    return (state.sneezeIndex + 1) % 3 === 0;
  }

  function needPy() {
    if (state.typed.length >= state.revealedEnd) return "";
    return PY[state.typed.length] || "";
  }

  function refreshNeed() {
    state.needHint = needPy();
    state.needChar =
      state.typed.length < state.revealedEnd ? REPORT[state.typed.length] : "";
  }

  /** 标点拼音为空：解锁范围内自动写入 */
  function autoSkipPunct() {
    while (state.typed.length < state.revealedEnd) {
      const py = PY[state.typed.length];
      if (py !== "") break;
      state.typed += REPORT[state.typed.length];
    }
    refreshNeed();
  }

  /** 往拼音缓冲里塞；凑齐当前汉字拼音才出字 */
  function pushLetters(letters) {
    if (!letters) return;
    const clean = String(letters).toLowerCase().replace(/[^a-z]/g, "");
    if (!clean) return;

    if (state.phase === "practice") {
      state.practiceHits += clean.length;
      state.lastEmit = clean;
      ui.onPracticeHit?.(state, clean.split(""));
      return;
    }
    if (state.phase !== "play") return;

    if (state.bufferError) {
      state.lastEmit = "(先 ⌫ 删掉错拼音)";
      ui.onTyped?.(state);
      return;
    }

    for (const ch of clean) {
      if (state.bufferError) break;
      if (state.typed.length >= state.revealedEnd) {
        state.lastEmit = "(先点老板语音条，解锁要打的字)";
        break;
      }
      autoSkipPunct();
      const need = needPy();
      if (!need) {
        state.lastEmit = "(先点老板语音条，解锁要打的字)";
        break;
      }
      const nextBuf = state.buffer + ch;
      if (need.startsWith(nextBuf)) {
        state.buffer = nextBuf;
        state.bufferError = false;
        if (state.buffer === need) {
          state.typed += REPORT[state.typed.length];
          state.buffer = "";
          state.lastEmit = `✓ ${need} → ${REPORT[state.typed.length - 1]}`;
          autoSkipPunct();
          checkWin();
        } else {
          state.lastEmit = `${state.buffer}_ / ${need}`;
        }
      } else {
        state.buffer = nextBuf;
        state.bufferError = true;
        state.lastEmit = `✗ ${state.buffer} ≠ ${need}`;
        ui.onSyllableFail?.(state.buffer, need);
        break;
      }
    }
    refreshNeed();
    ui.onTyped?.(state);
  }

  /**
   * kind: cough | sneeze
   * forced: 憋满 → 只爆发唾沫星子（可组合）
   */
  function burst(kind, forced = false) {
    let goo = "cough";
    let big = false;
    let count = 1;
    let force = 1;
    let scatter = 0.04;

    if (forced) {
      // 只有憋气才爆唾沫星子
      goo = "spit";
      force = 1.4;
      scatter = 0.32;
      count = 14;
      kind = "spitburst";
    } else if (kind === "sneeze") {
      state.sneezeIndex += 1;
      big = state.sneezeIndex % 3 === 0;
      goo = big ? "yellow" : "water";
      state.nextSneezeBig = (state.sneezeIndex + 1) % 3 === 0;
      scatter = big ? 0.1 : 0.06;
      count = 1; // 单发
      force = big ? 1.15 : 1;
    } else {
      // 普通咳嗽：单发飞沫
      goo = "cough";
      count = 1;
      scatter = 0.05;
      force = 1;
    }

    state.intensity = force;
    state.previewForce = force;
    state.lastBurst = { kind, forced, scatter, force, goo, big };

    const mouthX = 0.5 + state.aimX * 0.03;
    const mouthY = 0.97;
    const targetY = 0.72 + state.aimY * 0.12 - force * 0.025;
    const targetX = 0.5 + state.aimX * 0.36;
    const g = 2.1;

    for (let i = 0; i < count; i++) {
      const spread = (Math.random() - 0.5) * 2 * scatter;
      const tx = Math.max(0.08, Math.min(0.92, targetX + spread));
      const ty = Math.max(
        0.55,
        Math.min(0.9, targetY + (Math.random() - 0.5) * scatter * 0.35),
      );
      const flight = goo === "spit" ? 0.38 : 0.42 + Math.random() * 0.06;
      const vx = (tx - mouthX) / flight;
      const vy = (ty - mouthY) / flight - 0.85 * force;
      state.projectiles.push({
        x: mouthX,
        y: mouthY,
        vx,
        vy,
        goo,
        life: 0.85,
        age: 0,
        g,
        landed: false,
        r: goo === "yellow" ? 0.015 : goo === "spit" ? 0.009 : 0.011,
        trail: [],
        single: true,
      });
    }

    ui.onBurst?.(state);
  }

  function landOnKeys(x, y, goo) {
    let hits = ui.hitTest?.(x, y);
    if (!hits || !hits.length) hits = estimateKeys(x, y);
    if (!hits.length) return;

    const now = performance.now() / 1000;
    const def = GOO[goo] || GOO.cough;
    const until = now + def.duration;
    const primary = hits[0];

    addStain(primary, goo, until);
    if (def.drip) {
      for (const k of columnKeys(primary).slice(1)) {
        addStain(k, goo, until);
      }
    }

    // 一次性：打中立刻灌字母，污渍 0.5s 后自己没
    pushLetters(primary);
    ui.onStain?.(state);
  }

  function addStain(letter, type, until) {
    state.stainSeq += 1;
    const stain = { type, until, id: state.stainSeq, key: letter };
    const list = state.stains.get(letter) || [];
    list.push(stain);
    state.stains.set(letter, list);
    stainOrder.push(stain);
  }

  function estimateKeys(x, y) {
    const band = ui.getKeyBand?.() || { top: 0.55, bot: 0.9 };
    if (y < band.top - 0.02 || y > band.bot + 0.02) return [];
    const t = (y - band.top) / Math.max(0.01, band.bot - band.top);
    const row = Math.min(2, Math.max(0, Math.floor(t * 3)));
    const rowStr = ROWS[row];
    const col = Math.max(
      0,
      Math.min(rowStr.length - 1, Math.floor(x * rowStr.length)),
    );
    return [rowStr[col]];
  }

  function wipePhone() {
    if (!state.running || state.finished) return false;
    if (state.wipeCd > 0) return false;
    clearStains();
    spitSig = "";
    state.projectiles = [];
    state.wipeCd = 8;
    ui.onWipe?.(state);
    ui.onStain?.(state);
    return true;
  }

  let voiceLockUntil = 0;

  /** 点老板语音条 → 解锁对应中文；须按顺序点 */
  function unlockSegment(i) {
    if (state.phase !== "play" || !state.running || state.finished) return;
    if (i < 0 || i >= SEGMENTS.length) return;

    if (state.unlocked[i]) {
      ui.onVoice?.(SEGMENTS[i].say, i, true);
      return;
    }

    const next = state.unlocked.findIndex((u) => !u);
    if (i !== next) {
      state.lastEmit =
        next < 0 ? "老板语音都听完了" : "先点上一条老板语音";
      ui.onTyped?.(state);
      return;
    }

    state.unlocked[i] = true;
    state.voiceIndex = i + 1;
    const { end } = charsUnlockedByVoice(i);
    state.revealedEnd = end;
    autoSkipPunct();
    ui.onVoice?.(SEGMENTS[i].say, i, false);
    ui.onReveal?.(state);
    ui.onBubbles?.(state);
    ui.onTyped?.(state);
  }

  /** 喷到话筒 / 咳·听 = 解锁下一段 */
  function spitForVoice() {
    if (state.phase !== "play" || !state.running || state.finished) return;
    const t = performance.now();
    if (t < voiceLockUntil) return;
    voiceLockUntil = t + 500;
    const next = state.unlocked.findIndex((u) => !u);
    if (next < 0) {
      ui.onVoice?.(
        VOICE_LINES[VOICE_LINES.length - 1],
        VOICE_LINES.length - 1,
        true,
      );
      return;
    }
    unlockSegment(next);
  }

  function backspace() {
    if (!state.running || state.finished) return;
    if (state.phase === "practice") return;
    if (state.buffer.length > 0) {
      state.buffer = state.buffer.slice(0, -1);
      state.bufferError = false;
      state.lastEmit = "⌫";
      refreshNeed();
      ui.onTyped?.(state);
      return;
    }
    // 已提交正文不回退（避免刷进度）
  }

  function space() {
    // 标点自动写入，无需喷射空格
  }

  function checkWin() {
    if (
      state.phase === "play" &&
      state.typed.length >= REPORT.length &&
      state.unlocked.every(Boolean)
    ) {
      state.finished = true;
      state.running = false;
      state.phase = "done";
      ui.onWin?.(state, payTier(state.elapsed));
    }
  }

  function startPractice() {
    Object.assign(state, {
      phase: "practice",
      running: true,
      finished: false,
      aimX: 0,
      aimY: 0,
      holding: false,
      holdTime: 0,
      coughCharge: 0.7,
      sneezeCharge: 0.4,
      sneezeIndex: 0,
      nextSneezeBig: false,
      wipeCd: 0,
      elapsed: 0,
      practiceHits: 0,
      projectiles: [],
      intensity: 0,
      previewForce: 0,
      buffer: "",
      bufferError: false,
      typed: "",
      lastEmit: "",
      needHint: "",
      needChar: "",
      revealedEnd: 0,
      unlocked: SEGMENTS.map(() => false),
      voiceIndex: 0,
    });
    spitSig = "";
    state.nextSneezeBig = peekSneezeBig();
    clearStains();
    ui.onPhase?.(state);
    ui.onBubbles?.(state);
  }

  function startPlay() {
    Object.assign(state, {
      phase: "play",
      running: true,
      finished: false,
      typed: "",
      buffer: "",
      bufferError: false,
      revealedEnd: 0,
      unlocked: SEGMENTS.map(() => false),
      voiceIndex: 0,
      elapsed: 0,
      coughCharge: 0,
      sneezeCharge: 0,
      sneezeIndex: 0,
      wipeCd: 0,
      holding: false,
      holdTime: 0,
      projectiles: [],
      lastEmit: "点绿色语音条 → 解锁中文",
      needHint: "",
      needChar: "",
    });
    spitSig = "";
    state.nextSneezeBig = peekSneezeBig();
    clearStains();
    refreshNeed();
    ui.onPhase?.(state);
    ui.onBubbles?.(state);
    ui.onTyped?.(state);
    ui.onReveal?.(state);
    ui.onStain?.(state);
  }

  function tick(dt) {
    if (!state.running || state.finished) return;
    if (state.phase === "play") state.elapsed += dt;
    if (state.wipeCd > 0) state.wipeCd = Math.max(0, state.wipeCd - dt);

    pruneStains(performance.now() / 1000);

    // 预览力度：取两个蓄力的较大者（满格=1）
    state.previewForce = Math.max(state.coughCharge, state.sneezeCharge);
    state.nextSneezeBig = peekSneezeBig();

    if (state.holding) {
      state.holdTime += dt;
      if (state.holdTime >= HOLD_MAX) {
        // 憋满只爆唾沫星子
        burst("cough", true);
        state.holding = false;
        state.holdTime = 0;
        state.coughCharge = 0;
      }
    } else {
      state.coughCharge = Math.min(1, state.coughCharge + dt / COUGH_PERIOD);
      state.sneezeCharge = Math.min(1, state.sneezeCharge + dt / SNEEZE_PERIOD);
      // 满格才以最大强度喷出
      if (state.sneezeCharge >= 1) {
        burst("sneeze", false);
        state.sneezeCharge = 0;
      } else if (state.coughCharge >= 1) {
        burst("cough", false);
        state.coughCharge = 0;
      }
    }

    // 积分弹道
    const remain = [];
    for (const p of state.projectiles) {
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 10) p.trail.shift();
      const prevY = p.y;
      p.age += dt;
      p.life -= dt;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // 穿过真实键盘带时落地（由 UI 提供归一化范围）
      const band = ui.getKeyBand?.() || { top: 0.55, bot: 0.9 };
      const bandTop = band.top;
      const bandBot = band.bot;
      const crossed =
        !p.landed &&
        p.vy > 0 &&
        prevY < bandBot &&
        p.y >= bandTop &&
        p.y <= bandBot + 0.1;
      if (
        crossed ||
        (!p.landed &&
          p.y >= bandTop &&
          p.y <= bandBot &&
          p.vy > 0 &&
          p.age > 0.08)
      ) {
        p.landed = true;
        landOnKeys(p.x, Math.min(bandBot, Math.max(bandTop, p.y)), p.goo);
        continue;
      }
      if (p.life > 0 && p.y < 1.1) remain.push(p);
    }
    state.projectiles = remain;

    ui.onTick?.(state);
  }

  return {
    state,
    setAim,
    setHolding,
    wipePhone,
    spitForVoice,
    unlockSegment,
    backspace,
    space,
    startPractice,
    startPlay,
    tick,
    sampleArc,
    REPORT,
    VOICE_LINES,
    SEGMENTS,
    GOO,
    ROWS,
    payTier,
    COUGH_PERIOD,
    SNEEZE_PERIOD,
    HOLD_MAX,
  };
}
