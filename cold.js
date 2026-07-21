/**
 * 感冒模式：视线方向 + 力度蓄力喷射（抛物线）。
 * 咳：唾沫星子；小喷嚏：清水鼻涕；每第 3 个喷嚏为大喷嚏：黄鼻涕。
 */

import { REPORT, VOICE_LINES, charsUnlockedByVoice } from "./cold-content.js";

export const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

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
  spit: { id: "spit", name: "唾沫星子", duration: 1.2, color: "#d8e8ff" },
  water: { id: "water", name: "清水鼻涕", duration: 10, color: "#a8d8f0", drip: false },
  yellow: { id: "yellow", name: "黄鼻涕", duration: 30, color: "#d4c020", drip: true },
};

export const COUGH_PERIOD = 3;
export const SNEEZE_PERIOD = 10;
export const HOLD_MAX = 3;

export function payTier(elapsedSec) {
  if (elapsedSec <= 180) return { label: "奖金", amount: 2000, tip: "3 分钟内完成" };
  if (elapsedSec <= 300) return { label: "合同款", amount: 1000, tip: "5 分钟内完成" };
  return { label: "辛苦费", amount: 100, tip: "不限时完成" };
}

/** 预览抛物线采样点（归一化坐标，相对 stage） */
export function sampleArc(aim, force, scatter = 0) {
  const mouthX = 0.5 + aim * 0.06;
  const mouthY = 0.88;
  const targetX = 0.5 + aim * 0.38 + scatter;
  const targetY = 0.42 - force * 0.05;
  const flight = 0.55;
  const vx = (targetX - mouthX) / flight;
  const vy0 = (targetY - mouthY) / flight - 0.9 * force;
  const g = 2.2;
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
    aim: 0,
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
    typed: "",
    revealedEnd: 0,
    voiceIndex: 0,
    elapsed: 0,
    stainSeq: 0,
    lastEmit: "",
    lastBurst: null,
    practiceHits: 0,
    // 当前预览力度（蓄力中显示）
    previewForce: 0,
    intensity: 0, // 最近一次喷射强度 0..1
  };

  let stainOrder = [];

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

  function setAim(a) {
    state.aim = Math.max(-1, Math.min(1, a));
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

  /**
   * kind: cough | sneeze
   * forced: 憋满爆发
   */
  function burst(kind, forced = false) {
    const isSneeze = kind === "sneeze";
    let goo = "spit";
    let big = false;
    if (isSneeze) {
      state.sneezeIndex += 1;
      big = state.sneezeIndex % 3 === 0;
      goo = big ? "yellow" : "water";
      state.nextSneezeBig = (state.sneezeIndex + 1) % 3 === 0;
    }

    // 满蓄力 = 最大强度；憋满再乘散射
    let force = 1;
    let scatter = isSneeze ? (big ? 0.28 : 0.16) : 0.09;
    let count = isSneeze ? (big ? 10 : 6) : 5;
    if (forced) {
      force = 1.35;
      scatter *= 2.5;
      count = Math.floor(count * 2.1);
    }

    state.intensity = force;
    state.previewForce = force;
    state.lastBurst = { kind, forced, scatter, force, goo, big };

    const mouthX = 0.5 + state.aim * 0.06;
    const mouthY = 0.88;
    const targetY = 0.4 - force * 0.04;
    const targetX = 0.5 + state.aim * 0.38;
    const g = 2.2;

    for (let i = 0; i < count; i++) {
      const spread = (Math.random() - 0.5) * 2 * scatter;
      const tx = Math.max(0.06, Math.min(0.94, targetX + spread));
      const ty = targetY + (Math.random() - 0.5) * scatter * 0.4;
      const flight = 0.5 + Math.random() * 0.12;
      const vx = (tx - mouthX) / flight;
      const vy = (ty - mouthY) / flight - 0.9 * force;
      state.projectiles.push({
        x: mouthX,
        y: mouthY,
        vx,
        vy,
        goo,
        life: 1.4,
        age: 0,
        g,
        landed: false,
        r: goo === "yellow" ? 0.014 : goo === "water" ? 0.011 : 0.008,
        trail: [],
      });
    }

    ui.onBurst?.(state);
  }

  function landOnKeys(x, y, goo) {
    let hits = ui.hitTest?.(x, y);
    if (!hits || !hits.length) hits = estimateKeys(x, y);
    if (!hits.length) return;

    const now = performance.now() / 1000;
    const def = GOO[goo] || GOO.spit;
    const until = now + def.duration;

    for (const letter of hits) {
      addStain(letter, goo, until);
      if (def.drip) {
        for (const k of columnKeys(letter).slice(1)) {
          addStain(k, goo, now + 10);
        }
      }
    }

    if (state.phase === "play") {
      pruneStains(now);
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
        ui.onTyped?.(state);
        checkWin();
      }
    } else if (state.phase === "practice") {
      state.practiceHits += hits.length;
      ui.onPracticeHit?.(state, hits);
    }
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
    // 键盘大致在 stage 中上部
    if (y < 0.22 || y > 0.62) return [];
    const rowYs = [0.34, 0.42, 0.5];
    let row = 0;
    let best = 99;
    for (let i = 0; i < 3; i++) {
      const d = Math.abs(y - rowYs[i]);
      if (d < best) {
        best = d;
        row = i;
      }
    }
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
    state.projectiles = [];
    state.wipeCd = 8;
    ui.onWipe?.(state);
    ui.onStain?.(state);
    return true;
  }

  let voiceLockUntil = 0;
  function spitForVoice() {
    if (state.phase !== "play" || !state.running || state.finished) return;
    const t = performance.now();
    if (t < voiceLockUntil) return;
    voiceLockUntil = t + 900;
    if (state.voiceIndex < VOICE_LINES.length) {
      const { end } = charsUnlockedByVoice(state.voiceIndex);
      state.revealedEnd = Math.max(state.revealedEnd, end);
      ui.onVoice?.(VOICE_LINES[state.voiceIndex], state.voiceIndex, false);
      state.voiceIndex += 1;
      ui.onReveal?.(state);
    } else {
      ui.onVoice?.(VOICE_LINES[VOICE_LINES.length - 1], VOICE_LINES.length - 1, true);
    }
  }

  function backspace() {
    if (state.phase !== "play" || !state.running) return;
    state.typed = state.typed.slice(0, -1);
    ui.onTyped?.(state);
  }

  function space() {
    if (state.phase !== "play" || !state.running) return;
    state.typed += " ";
    ui.onTyped?.(state);
    checkWin();
  }

  function checkWin() {
    if (state.phase === "play" && state.typed === REPORT) {
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
      aim: 0,
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
    });
    state.nextSneezeBig = peekSneezeBig();
    clearStains();
    ui.onPhase?.(state);
  }

  function startPlay() {
    Object.assign(state, {
      phase: "play",
      running: true,
      finished: false,
      typed: "",
      revealedEnd: 0,
      voiceIndex: 0,
      elapsed: 0,
      coughCharge: 0,
      sneezeCharge: 0,
      sneezeIndex: 0,
      wipeCd: 0,
      holding: false,
      holdTime: 0,
      projectiles: [],
      lastEmit: "",
    });
    state.nextSneezeBig = peekSneezeBig();
    clearStains();
    ui.onPhase?.(state);
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
        const kind = state.sneezeCharge >= state.coughCharge ? "sneeze" : "cough";
        burst(kind, true);
        state.holding = false;
        state.holdTime = 0;
        if (kind === "sneeze") state.sneezeCharge = 0;
        else state.coughCharge = 0;
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

      // 穿过键盘带时落地
      const bandTop = 0.28;
      const bandBot = 0.58;
      const crossed =
        !p.landed &&
        p.vy > 0 &&
        prevY < bandBot &&
        p.y >= bandTop &&
        p.y <= bandBot + 0.08;
      if (crossed || (!p.landed && p.y >= bandTop && p.y <= bandBot && p.vy > 0 && p.age > 0.12)) {
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
    backspace,
    space,
    startPractice,
    startPlay,
    tick,
    sampleArc,
    REPORT,
    VOICE_LINES,
    GOO,
    ROWS,
    payTier,
    COUGH_PERIOD,
    SNEEZE_PERIOD,
    HOLD_MAX,
  };
}
