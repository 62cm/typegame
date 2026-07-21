/**
 * 感冒模式：只能控方向与憋气；咳嗽/喷嚏自动喷射（抛物线落键）。
 * 喷嚏才喷出青黄浓鼻涕；普通咳嗽为唾沫星子。
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

/** 落点类型 */
export const GOO = {
  spit: { id: "spit", name: "唾沫星子", duration: 1, color: "#d8e8ff" },
  // 喷嚏喷出的「痰」实为青黄浓鼻涕
  snot: { id: "snot", name: "青黄浓鼻涕", duration: 30, color: "#c8d040", drip: true },
};

export function payTier(elapsedSec) {
  if (elapsedSec <= 180) return { label: "奖金", amount: 2000, tip: "3 分钟内完成" };
  if (elapsedSec <= 300) return { label: "合同款", amount: 1000, tip: "5 分钟内完成" };
  return { label: "辛苦费", amount: 100, tip: "不限时完成" };
}

/**
 * aim: -1..1 视线左右
 * hold: 是否在憋
 */
export function createColdGame(ui) {
  const state = {
    phase: "practice", // practice | play | done
    running: false,
    finished: false,
    aim: 0, // -1 left .. 1 right
    holding: false,
    holdTime: 0,
    coughCd: 3,
    sneezeCd: 10,
    wipeCd: 0,
    stains: new Map(), // key -> [{type, until, id}]
    projectiles: [], // flying droplets
    typed: "",
    revealedEnd: 0,
    voiceIndex: 0,
    elapsed: 0,
    stainSeq: 0,
    lastEmit: "",
    lastBurst: null, // {kind, forced, scatter, force}
    practiceHits: 0,
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
    if (on && !state.holding) {
      state.holding = true;
      state.holdTime = 0;
    } else if (!on && state.holding) {
      // 提前松手：若已憋够会在 tick 里强制喷；未满 3s 则正常释放下一次到期的喷射
      state.holding = false;
      state.holdTime = 0;
    }
  }

  /**
   * 发射一波抛物线液滴
   * kind: 'cough' | 'sneeze'
   * forced: 憋满 3s 的大散射
   */
  function burst(kind, forced = false) {
    const isSneeze = kind === "sneeze";
    const goo = isSneeze ? "snot" : "spit";
    // 力度：喷嚏更强；憋满再加强
    let force = isSneeze ? 1.35 : 0.85;
    let scatter = isSneeze ? 0.22 : 0.1;
    let count = isSneeze ? 7 : 4;
    if (forced) {
      force *= 1.55;
      scatter *= 2.4;
      count = Math.floor(count * 2.2);
    }

    state.lastBurst = { kind, forced, scatter, force, goo };

    // 归一化坐标：嘴在屏幕下方中央，键盘在上方区域
    // x: 0..1 across phone, y: 0 top .. 1 bottom
    const mouthX = 0.5 + state.aim * 0.08;
    const mouthY = 0.92;
    // 目标落点带：键盘大约在 y 0.35–0.62
    const targetY = 0.48 - force * 0.06;
    const targetX = 0.5 + state.aim * 0.42;

    for (let i = 0; i < count; i++) {
      const spread = (Math.random() - 0.5) * 2 * scatter;
      const tx = Math.max(0.05, Math.min(0.95, targetX + spread));
      const ty = targetY + (Math.random() - 0.5) * scatter * 0.35;
      // 抛物线：初速度指向目标，带重力
      const dx = tx - mouthX;
      const dy = ty - mouthY;
      const flight = 0.45 + Math.random() * 0.15;
      const vx = dx / flight;
      const vy = dy / flight - 0.55 * force; // 上抛分量
      state.projectiles.push({
        x: mouthX,
        y: mouthY,
        vx,
        vy,
        goo,
        life: 1.2,
        age: 0,
        r: isSneeze ? 0.012 + Math.random() * 0.01 : 0.007 + Math.random() * 0.006,
      });
    }

    ui.onBurst?.(state);
  }

  function landOnKeys(x, y, goo) {
    // 由 UI 提供键位矩形命中；若无则用列估算
    const hits = ui.hitTest?.(x, y) || estimateKeys(x, y, goo);
    if (!hits.length) return;

    const now = performance.now() / 1000;
    const dur = GOO[goo].duration;
    const until = now + dur;

    for (const letter of hits) {
      state.stainSeq += 1;
      const stain = { type: goo, until, id: state.stainSeq, key: letter };
      const list = state.stains.get(letter) || [];
      list.push(stain);
      state.stains.set(letter, list);
      stainOrder.push(stain);

      // 青黄浓鼻涕：同时粘竖列下两键（流淌感）
      if (goo === "snot" && GOO.snot.drip) {
        for (const k of columnKeys(letter).slice(1)) {
          state.stainSeq += 1;
          const s2 = {
            type: goo,
            until: now + 10,
            id: state.stainSeq,
            key: k,
          };
          const l2 = state.stains.get(k) || [];
          l2.push(s2);
          state.stains.set(k, l2);
          stainOrder.push(s2);
        }
      }
    }

    // 组合打字：当前所有带液的键
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

  function estimateKeys(x, y, goo) {
    // 键盘大致区域
    if (y < 0.28 || y > 0.7) return [];
    const rowYs = [0.38, 0.48, 0.58];
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
    const letter = rowStr[col];
    if (goo === "snot") return columnKeys(letter);
    return [letter];
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

  function spitForVoice() {
    if (state.phase !== "play" || !state.running || state.finished) return;
    if (state.voiceIndex < VOICE_LINES.length) {
      const { end } = charsUnlockedByVoice(state.voiceIndex);
      state.revealedEnd = Math.max(state.revealedEnd, end);
      const line = VOICE_LINES[state.voiceIndex];
      ui.onVoice?.(line, state.voiceIndex, false);
      state.voiceIndex += 1;
      ui.onReveal?.(state);
    } else {
      ui.onVoice?.(VOICE_LINES[VOICE_LINES.length - 1], VOICE_LINES.length - 1, true);
    }
  }

  function backspace() {
    if (state.phase !== "play" || !state.running) return;
    if (!state.typed) return;
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
    state.phase = "practice";
    state.running = true;
    state.finished = false;
    state.aim = 0;
    state.holding = false;
    state.holdTime = 0;
    state.coughCd = 2;
    state.sneezeCd = 6;
    state.wipeCd = 0;
    state.elapsed = 0;
    state.practiceHits = 0;
    state.projectiles = [];
    clearStains();
    ui.onPhase?.(state);
  }

  function startPlay() {
    state.phase = "play";
    state.running = true;
    state.finished = false;
    state.typed = "";
    state.revealedEnd = 0;
    state.voiceIndex = 0;
    state.elapsed = 0;
    state.coughCd = 3;
    state.sneezeCd = 10;
    state.wipeCd = 0;
    state.holding = false;
    state.holdTime = 0;
    state.projectiles = [];
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

    const now = performance.now() / 1000;
    pruneStains(now);

    // 憋气
    if (state.holding) {
      state.holdTime += dt;
      // 憋住时暂停自动喷的倒计时
      if (state.holdTime >= 3) {
        // 大面积散射：跟当前更“急”的那一下（喷嚏优先若更近）
        const kind = state.sneezeCd <= state.coughCd ? "sneeze" : "cough";
        burst(kind, true);
        state.holding = false;
        state.holdTime = 0;
        state.coughCd = 3;
        state.sneezeCd = kind === "sneeze" ? 10 : Math.max(state.sneezeCd, 3);
      }
    } else {
      state.coughCd -= dt;
      state.sneezeCd -= dt;
      if (state.sneezeCd <= 0) {
        burst("sneeze", false);
        state.sneezeCd = 10;
      } else if (state.coughCd <= 0) {
        burst("cough", false);
        state.coughCd = 3;
      }
    }

    // 抛物线积分
    const g = 1.35;
    for (const p of state.projectiles) {
      p.age += dt;
      p.life -= dt;
      p.vy += g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    const remain = [];
    for (const p of state.projectiles) {
      // 落到键盘平面
      if (p.y >= 0.34 && p.vy > 0 && p.y <= 0.72) {
        landOnKeys(p.x, p.y, p.goo);
        continue;
      }
      if (p.life > 0 && p.y < 1.05 && p.x > -0.1 && p.x < 1.1) remain.push(p);
    }
    state.projectiles = remain;

    ui.onTick?.(state);
    ui.onStain?.(state);
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
    REPORT,
    VOICE_LINES,
    GOO,
    ROWS,
    payTier,
  };
}
