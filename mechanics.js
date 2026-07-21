/**
 * Shared typing-horror mechanics for cartoon + monitor versions.
 * 通关唯一条件：对上每一个必打字（打叉字用空格跳过）。无凑字数。
 */

import { getStoryParagraphs, GHOST_PROFILE } from "./story.js";
import { createJiugongRound, faceSvg } from "./jiugong.js";

export function loadMeta() {
  try {
    return {
      clearedOnce: localStorage.getItem("typegame_cleared_once") === "1",
      ngPlus: localStorage.getItem("typegame_ngplus") === "1",
      mode: localStorage.getItem("typegame_mode") || "classic",
    };
  } catch {
    return { clearedOnce: false, ngPlus: false, mode: "classic" };
  }
}

export function markClearedOnce() {
  try {
    localStorage.setItem("typegame_cleared_once", "1");
  } catch (_) {}
}

export function setNgPlus(on) {
  try {
    localStorage.setItem("typegame_ngplus", on ? "1" : "0");
  } catch (_) {}
}

export function setSavedMode(mode) {
  try {
    localStorage.setItem("typegame_mode", mode);
  } catch (_) {}
}

export function buildFlags(text, seed = 1) {
  const n = text.length;
  const ink = new Array(n).fill(false);
  const trap = new Array(n).fill(false);
  let s = (seed * 2654435761) >>> 0;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  for (let i = 1; i < n; i++) {
    const ch = text[i];
    if ("，。！？、；：…—·「」『』“”\"'（）()".includes(ch)) continue;
    if (rnd() < 0.14) ink[i] = true;
    else if (rnd() < 0.1) trap[i] = true;
  }
  for (let i = 1; i < n; i++) {
    if (trap[i] && trap[i - 1]) trap[i] = false;
  }
  return { ink, trap };
}

export function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function renderTargetHtml(text, index, flags, endBlack) {
  const { ink, trap } = flags;
  const n = text.length;
  let html = "";
  for (let k = 0; k < n; k++) {
    const fromEnd = n - 1 - k;
    const ngHidden = endBlack > 0 && fromEnd < endBlack && k >= index;
    const hideInk = ink[k] && k > index;
    const hide = ngHidden || hideInk;

    let cls = k < index ? "done" : k === index ? "current" : "todo";
    if (trap[k]) cls += " trap";
    if (hide) cls += " ink";

    const shown = hide ? "█" : text[k];
    const trapMark =
      trap[k] && !hide ? `<span class="trap-x" aria-hidden="true">✕</span>` : "";
    html += `<span class="${cls}" data-i="${k}">${trapMark}${escapeHtml(shown)}</span>`;
  }
  return html;
}

function createKeyLock(seed) {
  let s = (seed * 1103515245 + 12345) >>> 0;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  const letters = "qwertyuiopasdfghjklzxcvbnm".split("");
  const locked = [];
  const count = 3 + Math.floor(rnd() * 3);
  while (locked.length < count) {
    const i = Math.floor(rnd() * letters.length);
    locked.push(letters.splice(i, 1)[0]);
  }
  return { type: "keylock", locked, remaining: 16 + rnd() * 8 };
}

/**
 * @param {object} opts
 * @param {() => object} opts.getEls
 * @param {string[]} opts.paragraphs classic paragraphs
 * @param {(state: object) => void} [opts.onHud]
 * @param {(state: object) => void} [opts.onCompleteRun]
 * @param {number} [opts.timeScale]
 */
export function createGameController(opts) {
  const { getEls, paragraphs, onHud, onCompleteRun, timeScale = 1 } = opts;

  const meta = loadMeta();
  const state = {
    running: false,
    mode: meta.mode || "classic", // classic | story | jiugong
    wave: 1,
    cleared: 0,
    text: "",
    index: 0,
    typed: "",
    composing: "",
    ghosts: 1,
    near: 0.16,
    time: 0,
    timeMax: 0,
    streak: 0,
    wrongFlash: 0,
    imeComposing: false,
    lastJudged: "",
    flags: { ink: [], trap: [] },
    endBlack: 0,
    ngPlus: meta.ngPlus || false,
    clearedOnce: meta.clearedOnce || false,
    keyTrap: null,
    jiugong: null,
    storyProfile: GHOST_PROFILE,
    storyParas: getStoryParagraphs(GHOST_PROFILE),
  };

  function els() {
    return getEls();
  }

  function proximityLabel(n) {
    if (n < 0.25) return "远";
    if (n < 0.45) return "可见";
    if (n < 0.65) return "靠近";
    if (n < 0.85) return "很近";
    return "贴脸";
  }

  function modeParagraphs() {
    if (state.mode === "story") return state.storyParas;
    return paragraphs;
  }

  function pickText() {
    const list = modeParagraphs();
    const base = list[(state.wave + state.cleared) % list.length];
    if (state.mode === "classic" && state.wave >= 4 && base.length < 80) {
      return base + "快一点。";
    }
    return base;
  }

  function timeFor(text) {
    if (state.mode === "jiugong") return 0;
    const cps = Math.max(1.2, 1.85 - state.wave * 0.07) * timeScale;
    return Math.min(140, Math.max(28, text.length / cps + 6));
  }

  function refreshTarget() {
    const e = els();
    const node = e.prompt || e.article;
    if (!node) return;
    if (state.mode === "jiugong") {
      node.innerHTML = "";
      return;
    }
    node.innerHTML = renderTargetHtml(
      state.text,
      state.index,
      state.flags,
      state.endBlack,
    );
    if (e.articleWrap) {
      const cur = node.querySelector(".current");
      if (cur) {
        e.articleWrap.scrollTop = Math.max(
          0,
          cur.offsetTop - e.articleWrap.clientHeight * 0.35,
        );
      }
    }
  }

  function renderTyped(extraWrong = "") {
    const e = els();
    if (!e.typedBox) return;
    if (state.mode === "jiugong") {
      e.typedBox.innerHTML = `<span class="placeholder">九宫模式：点选或按小键盘 1–9 / 主键盘对应方向</span>`;
      return;
    }
    if (!state.typed && !state.composing && !extraWrong) {
      e.typedBox.innerHTML = `<span class="placeholder">在这里输入…</span>`;
      return;
    }
    let html = `<span class="ok">${escapeHtml(state.typed)}</span>`;
    if (extraWrong) html += `<span class="bad">${escapeHtml(extraWrong)}</span>`;
    if (state.composing) {
      html += `<span class="composing">${escapeHtml(state.composing)}</span>`;
    }
    e.typedBox.innerHTML = html;
  }

  let keyTrapHudSig = "";
  let jiugongHudId = -1;

  function renderKeyTrapHud() {
    const e = els();
    const panel = e.keyTrapPanel;
    if (!panel) return;
    if (!state.keyTrap) {
      if (keyTrapHudSig !== "") {
        panel.classList.add("hidden");
        panel.innerHTML = "";
        keyTrapHudSig = "";
      }
      return;
    }
    const sig = state.keyTrap.locked.join("") + "|" + Math.ceil(state.keyTrap.remaining);
    if (sig === keyTrapHudSig) return;
    keyTrapHudSig = sig;
    panel.classList.remove("hidden");
    const rows = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
    const locked = new Set(state.keyTrap.locked);
    let html = `<div class="trap-title">输入陷阱 · 红键封锁（${state.keyTrap.remaining.toFixed(0)}s）· 用联想绕过</div><div class="kb">`;
    for (const row of rows) {
      html += `<div class="kb-row">`;
      for (const ch of row) {
        html += `<span class="kb-key${locked.has(ch) ? " locked" : ""}">${ch}</span>`;
      }
      html += `</div>`;
    }
    html += `</div>`;
    panel.innerHTML = html;
  }

  function renderJiugongHud() {
    const e = els();
    const panel = e.jiugongPanel;
    if (!panel) return;
    if (state.mode !== "jiugong" || !state.jiugong) {
      if (jiugongHudId !== -1) {
        panel.classList.add("hidden");
        panel.innerHTML = "";
        jiugongHudId = -1;
      }
      return;
    }
    const j = state.jiugong;
    panel.classList.remove("hidden");
    // 只在新一轮重建九宫，避免每帧重绘打断点击
    if (j.id !== jiugongHudId) {
      jiugongHudId = j.id;
      let html = `<div class="jg-hint"></div><div class="jg-grid">`;
      j.cells.forEach((cell, i) => {
        html += `<button type="button" class="jg-cell" data-slot="${i}" aria-label="格子${i + 1}">
          ${faceSvg(cell.kind, cell.seed)}
          <span class="jg-num">${i + 1}</span>
        </button>`;
      });
      html += `</div><div class="jg-keys">键位：7 8 9 / 4 5 6 / 1 2 3（小键盘或主键盘数字）</div>`;
      panel.innerHTML = html;
      panel.querySelectorAll(".jg-cell").forEach((btn) => {
        btn.addEventListener("click", () => {
          pickJiugong(Number(btn.dataset.slot));
        });
      });
    }
    const hint = panel.querySelector(".jg-hint");
    if (hint) {
      hint.textContent = `她正在做「${j.correctKind}」脸 · 在九宫答案里找出有她这张脸的格子 · 剩余 ${j.time.toFixed(1)}s`;
    }
  }

  function syncHud() {
    const e = els();
    if (e.wave) e.wave.textContent = String(state.wave);
    if (e.cleared) e.cleared.textContent = String(state.cleared);
    if (e.ghostCount) e.ghostCount.textContent = String(state.ghosts);
    if (e.proximity) e.proximity.textContent = proximityLabel(state.near);
    if (e.timeLeft) {
      e.timeLeft.textContent =
        state.mode === "jiugong" && state.jiugong
          ? state.jiugong.time.toFixed(1)
          : state.time.toFixed(1);
    }
    if (e.streak) e.streak.textContent = String(state.streak);
    if (e.progress) {
      if (state.mode === "jiugong") {
        e.progress.textContent = "—";
      } else {
        const need = state.text.length || 1;
        const p = Math.floor((state.index / need) * 100);
        e.progress.textContent = Math.min(100, p) + "%";
      }
    }
    if (e.timerFill) {
      const ratio =
        state.mode === "jiugong" && state.jiugong
          ? state.jiugong.time / state.jiugong.timeMax
          : state.timeMax
            ? state.time / state.timeMax
            : 0;
      e.timerFill.style.transform = `scaleX(${Math.max(0, ratio)})`;
    }
    if (e.ngBadge) e.ngBadge.classList.toggle("hidden", !state.ngPlus);
    if (e.fillStat) {
      e.fillStat.textContent =
        state.mode === "jiugong"
          ? "九宫"
          : `${state.index}/${state.text.length}`;
    }
    if (e.modeLabel) {
      e.modeLabel.textContent =
        state.mode === "story"
          ? "剧情"
          : state.mode === "jiugong"
            ? "九宫"
            : "经典";
    }
    renderKeyTrapHud();
    renderJiugongHud();
    onHud?.(state);
  }

  function focusInput() {
    const e = els();
    if (state.mode === "jiugong") return;
    requestAnimationFrame(() => e.typeInput?.focus());
  }

  function fail(reason) {
    state.running = false;
    state.keyTrap = null;
    const e = els();
    if (e.typeInput) e.typeInput.disabled = true;
    if (e.goMsg) e.goMsg.textContent = reason;
    e.gameover?.classList.remove("hidden");
    syncHud();
  }

  function onWrong() {
    state.streak = 0;
    state.wrongFlash = 0.45;
    if (state.ghosts < 5 && Math.random() < 0.34 + state.wave * 0.03) {
      state.ghosts += 1;
      state.near = Math.min(0.98, state.near + 0.055);
    } else {
      state.near = Math.min(0.98, state.near + 0.095 + state.wave * 0.008);
    }
    if (state.near >= 1) fail("打错太多，它贴上来了。");
  }

  function approach(amount) {
    state.near = Math.min(0.98, state.near + amount);
    state.wrongFlash = Math.max(state.wrongFlash, 0.35);
    if (state.near >= 1) fail("她不高兴了，贴上来了。");
  }

  function retreat(amount) {
    state.near = Math.max(0.05, state.near - amount);
    state.streak += 1;
  }

  function maybeSpawnKeyTrap() {
    if (state.mode === "jiugong") return;
    if (state.keyTrap) return;
    if (state.near < 0.28) return;
    if (Math.random() < 0.004 + state.near * 0.01) {
      state.keyTrap = createKeyLock(state.wave * 31 + state.cleared * 7 + 3);
    }
  }

  function advanceCorrect() {
    state.index += 1;
    state.streak += 1;
    if (state.ngPlus) {
      state.endBlack = Math.min(
        state.text.length - state.index,
        state.endBlack + 1,
      );
    }
    if (state.streak >= 10) {
      state.near = Math.max(0.08, state.near - 0.028);
      state.streak = 0;
    }
  }

  function skipTrap() {
    if (!state.running || state.mode === "jiugong") return;
    if (!state.flags.trap[state.index]) return;
    state.typed += "·";
    advanceCorrect();
    const e = els();
    if (e.typeInput) e.typeInput.value = state.typed;
    state.lastJudged = state.typed;
    renderTyped();
    refreshTarget();
    syncHud();
    if (state.index >= state.text.length) {
      if (e.typeInput) e.typeInput.value = "";
      completeParagraph();
    }
  }

  function judgeCommitted(raw) {
    if (!state.running || state.mode === "jiugong") return;
    const target = state.text;
    const e = els();

    if (state.flags.trap[state.index]) {
      const next = raw.slice(state.typed.length);
      if (next.length === 0) return;
      if (raw !== state.lastJudged) {
        onWrong();
        state.lastJudged = raw;
      }
      if (e.typeInput) e.typeInput.value = state.typed;
      renderTyped(next.slice(0, 8));
      refreshTarget();
      syncHud();
      return;
    }

    let prefix = 0;
    const limit = Math.min(raw.length, target.length);
    while (prefix < limit && raw[prefix] === target[prefix]) {
      if (state.flags.trap[prefix] && prefix >= state.index) break;
      prefix++;
    }

    const correct = target.slice(0, prefix);
    const wrongTail = raw.slice(prefix);

    if (wrongTail.length > 0) {
      if (raw !== state.lastJudged) {
        onWrong();
        state.lastJudged = raw;
      }
      state.typed = state.text.slice(0, state.index);
      if (e.typeInput) e.typeInput.value = state.typed;
      renderTyped(wrongTail.slice(0, 8));
      refreshTarget();
      syncHud();
      return;
    }

    while (state.index < prefix) {
      advanceCorrect();
    }
    state.typed = correct;
    state.lastJudged = correct;
    renderTyped();
    refreshTarget();
    syncHud();

    if (state.index >= target.length) {
      if (e.typeInput) e.typeInput.value = "";
      completeParagraph();
    }
  }

  function pickJiugong(slot) {
    if (!state.running || state.mode !== "jiugong" || !state.jiugong) return;
    const cell = state.jiugong.cells[slot];
    if (!cell) return;
    if (cell.correct) {
      retreat(0.22);
      state.cleared += 1;
      if (state.ghosts > 1) {
        state.ghosts -= 1;
        startJiugongRound();
      } else if (state.near < 0.14) {
        state.running = false;
        markClearedOnce();
        state.clearedOnce = true;
        const e = els();
        e.clear?.classList.remove("hidden");
        if (e.clearHint) {
          e.clearHint.textContent = "九宫里她笑了，退到门后。下次可开二周目涂黑。";
        }
        setNgPlus(true);
        state.ngPlus = true;
        syncHud();
        onCompleteRun?.(state);
      } else {
        startJiugongRound();
      }
    } else {
      approach(0.14);
      if (state.running) startJiugongRound();
    }
  }

  function startJiugongRound() {
    state.jiugong = createJiugongRound(
      state.wave * 97 + state.cleared * 13 + 11,
    );
    state.text = "";
    state.index = 0;
    state.typed = "";
    const e = els();
    if (e.typeInput) {
      e.typeInput.value = "";
      e.typeInput.disabled = true;
    }
    renderTyped();
    refreshTarget();
    syncHud();
  }

  function completeParagraph() {
    // 仅当每一个必打位置都对上（含空格跳过的打叉字）才到这里
    state.cleared += 1;
    state.typed = "";
    state.composing = "";
    state.endBlack = 0;
    state.keyTrap = null;
    if (state.ghosts > 1) {
      state.ghosts -= 1;
      state.near = Math.max(0.1, state.near - 0.2);
    } else {
      state.near = Math.max(0.05, state.near - 0.34);
      if (state.near < 0.12) {
        state.running = false;
        markClearedOnce();
        state.clearedOnce = true;
        const e = els();
        if (e.typeInput) e.typeInput.disabled = true;
        e.clear?.classList.remove("hidden");
        if (e.clearHint) {
          e.clearHint.textContent = state.ngPlus
            ? "二周目特效已开启。继续将保持末尾涂黑。"
            : "一周目过关。下次开始将进入二周目（每打对一字，文末涂黑一字）。";
        }
        setNgPlus(true);
        state.ngPlus = true;
        syncHud();
        onCompleteRun?.(state);
        return;
      }
    }
    startParagraph();
  }

  function startParagraph() {
    if (state.mode === "jiugong") {
      startJiugongRound();
      return;
    }
    state.text = pickText();
    state.index = 0;
    state.typed = "";
    state.composing = "";
    state.lastJudged = "";
    state.endBlack = 0;
    state.flags = buildFlags(
      state.text,
      state.wave * 17 + state.cleared * 3 + 5,
    );
    state.timeMax = timeFor(state.text);
    state.time = state.timeMax;
    state.streak = 0;
    const e = els();
    if (e.typeInput) {
      e.typeInput.value = "";
      e.typeInput.disabled = false;
    }
    if (e.articleWrap) e.articleWrap.scrollTop = 0;
    renderTyped();
    refreshTarget();
    syncHud();
    focusInput();
  }

  function setMode(mode) {
    if (!["classic", "story", "jiugong"].includes(mode)) return;
    state.mode = mode;
    setSavedMode(mode);
    syncHud();
  }

  function startGame() {
    const metaNow = loadMeta();
    state.clearedOnce = metaNow.clearedOnce;
    state.ngPlus = metaNow.ngPlus;
    if (!state.mode) state.mode = metaNow.mode || "classic";
    state.storyParas = getStoryParagraphs(state.storyProfile);
    state.running = true;
    state.wave = 1;
    state.cleared = 0;
    state.ghosts = 1;
    state.near = 0.14;
    state.endBlack = 0;
    state.keyTrap = null;
    state.jiugong = null;
    const e = els();
    e.overlay?.classList.add("hidden");
    e.gameover?.classList.add("hidden");
    e.clear?.classList.add("hidden");
    startParagraph();
  }

  function nextWave() {
    state.wave += 1;
    state.ghosts = Math.min(5, 1 + Math.floor(state.wave / 2));
    state.near = Math.min(0.34, 0.12 + state.wave * 0.015);
    state.running = true;
    state.keyTrap = null;
    els().clear?.classList.add("hidden");
    startParagraph();
  }

  function bindInput() {
    const e0 = els();
    const input = e0.typeInput;
    if (!input) return;

    input.addEventListener("compositionstart", () => {
      state.imeComposing = true;
    });
    input.addEventListener("compositionupdate", (ev) => {
      state.composing = ev.data || "";
      renderTyped();
    });
    input.addEventListener("compositionend", (ev) => {
      state.imeComposing = false;
      state.composing = "";
      judgeCommitted(ev.target.value);
      focusInput();
    });
    input.addEventListener("input", (ev) => {
      if (state.imeComposing || ev.isComposing) {
        const v = ev.target.value;
        state.composing = v.startsWith(state.typed)
          ? v.slice(state.typed.length)
          : v;
        renderTyped();
        return;
      }
      state.composing = "";
      judgeCommitted(ev.target.value);
    });

    const onKeyDown = (ev) => {
      if (!state.running) return;

      // 九宫：数字键选格
      if (state.mode === "jiugong" && state.jiugong) {
        const map = {
          Numpad7: 0,
          Numpad8: 1,
          Numpad9: 2,
          Numpad4: 3,
          Numpad5: 4,
          Numpad6: 5,
          Numpad1: 6,
          Numpad2: 7,
          Numpad3: 8,
          Digit7: 0,
          Digit8: 1,
          Digit9: 2,
          Digit4: 3,
          Digit5: 4,
          Digit6: 5,
          Digit1: 6,
          Digit2: 7,
          Digit3: 8,
        };
        if (ev.code in map) {
          ev.preventDefault();
          pickJiugong(map[ev.code]);
        }
        return;
      }

      // 键盘封锁陷阱：红键无法按下（物理 a-z）
      if (state.keyTrap?.type === "keylock") {
        const k = ev.key.length === 1 ? ev.key.toLowerCase() : "";
        if (k >= "a" && k <= "z" && state.keyTrap.locked.includes(k)) {
          ev.preventDefault();
          ev.stopPropagation();
          approach(0.04);
          syncHud();
          return;
        }
      }

      if (ev.key === " " || ev.code === "Space") {
        if (state.flags.trap[state.index] && !state.imeComposing) {
          ev.preventDefault();
          skipTrap();
        }
      }
    };

    input.addEventListener("keydown", onKeyDown);
    window.addEventListener("keydown", onKeyDown);
  }

  function tick(dt) {
    if (!state.running) {
      syncHud();
      return;
    }

    if (state.wrongFlash > 0) {
      state.wrongFlash = Math.max(0, state.wrongFlash - dt);
    }

    if (state.keyTrap) {
      state.keyTrap.remaining -= dt;
      if (state.keyTrap.remaining <= 0) state.keyTrap = null;
    } else {
      maybeSpawnKeyTrap();
    }

    if (state.mode === "jiugong" && state.jiugong) {
      state.jiugong.time -= dt;
      if (state.jiugong.time <= 0) {
        approach(0.12);
        if (state.running) startJiugongRound();
      }
      // 闲置也会慢慢逼近
      state.near = Math.min(0.98, state.near + dt * 0.018);
      if (state.near >= 1) fail("拖太久了，她贴上来了。");
      syncHud();
      return;
    }

    state.time -= dt;
    if (state.time <= 0) {
      approach(0.1);
      state.time = Math.min(12, state.timeMax * 0.35);
      if (!state.running) return;
    }

    // 缓慢逼近
    state.near = Math.min(0.98, state.near + dt * (0.008 + state.wave * 0.001));
    if (state.near >= 1) fail("你太慢了，它贴上来了。");

    syncHud();
  }

  return {
    state,
    startGame,
    nextWave,
    bindInput,
    tick,
    syncHud,
    setMode,
    pickJiugong,
  };
}
