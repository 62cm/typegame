/**
 * Shared typing-horror mechanics for cartoon + monitor versions.
 */

export function loadMeta() {
  try {
    return {
      clearedOnce: localStorage.getItem("typegame_cleared_once") === "1",
      ngPlus: localStorage.getItem("typegame_ngplus") === "1",
    };
  } catch {
    return { clearedOnce: false, ngPlus: false };
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

/** Deterministic masks from text + seed */
export function buildFlags(text, seed = 1) {
  const n = text.length;
  const ink = new Array(n).fill(false); // blacked until previous typed
  const trap = new Array(n).fill(false); // must NOT type correctly — Space to skip
  let s = (seed * 2654435761) >>> 0;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  for (let i = 1; i < n; i++) {
    // skip punctuation-heavy density
    const ch = text[i];
    if ("，。！？、；：…—·「」『』“”".includes(ch)) continue;
    if (rnd() < 0.14) ink[i] = true;
    else if (rnd() < 0.1) trap[i] = true;
  }
  // ensure not too many traps in a row
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

/**
 * Render target text with ink / trap / NG+ end-black / progress.
 * endBlack: number of chars blackened from the end (NG+).
 */
export function renderTargetHtml(text, index, flags, endBlack) {
  const { ink, trap } = flags;
  const n = text.length;
  let html = "";
  for (let k = 0; k < n; k++) {
    const fromEnd = n - 1 - k;
    const ngHidden = endBlack > 0 && fromEnd < endBlack && k >= index;
    const inkHidden = ink[k] && k > index; // reveal when previous typed (index > k-1 => index >= k for current)
    // "前一个字被打出来才有": visible when index >= k (current and past visible; future ink hidden)
    const hideInk = ink[k] && k > index;
    const hide = ngHidden || hideInk;

    let cls = k < index ? "done" : k === index ? "current" : "todo";
    if (trap[k]) cls += " trap";
    if (hide) cls += " ink";

    const shown = hide ? "█" : text[k];
    const trapMark = trap[k] && !hide ? `<span class="trap-x" aria-hidden="true">✕</span>` : "";
    html += `<span class="${cls}" data-i="${k}">${trapMark}${escapeHtml(shown)}</span>`;
  }
  return html;
}

export function createGameController(opts) {
  const {
    getEls,
    paragraphs,
    onHud,
    onCompleteRun,
    timeScale = 1,
  } = opts;

  const meta = loadMeta();
  const state = {
    running: false,
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
    fillCount: 0,
    flags: { ink: [], trap: [] },
    endBlack: 0,
    ngPlus: meta.ngPlus || false,
    clearedOnce: meta.clearedOnce || false,
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

  function pickText() {
    const base = paragraphs[(state.wave + state.cleared) % paragraphs.length];
    if (state.wave >= 4 && base.length < 80) return base + "快一点。";
    return base;
  }

  function timeFor(text) {
    const cps = Math.max(1.2, 1.85 - state.wave * 0.07) * timeScale;
    return Math.min(120, Math.max(22, text.length / cps + 5));
  }

  function refreshTarget() {
    const e = els();
    const node = e.prompt || e.article;
    if (!node) return;
    node.innerHTML = renderTargetHtml(
      state.text,
      state.index,
      state.flags,
      state.endBlack,
    );
    if (e.articleWrap) {
      const cur = node.querySelector(".current");
      if (cur) {
        e.articleWrap.scrollTop = Math.max(0, cur.offsetTop - e.articleWrap.clientHeight * 0.35);
      }
    }
  }

  function renderTyped(extraWrong = "") {
    const e = els();
    if (!e.typedBox) return;
    if (!state.typed && !state.composing && !extraWrong) {
      e.typedBox.innerHTML = `<span class="placeholder">在这里输入…</span>`;
      return;
    }
    let html = `<span class="ok">${escapeHtml(state.typed)}</span>`;
    if (extraWrong) html += `<span class="bad">${escapeHtml(extraWrong)}</span>`;
    if (state.composing) html += `<span class="composing">${escapeHtml(state.composing)}</span>`;
    e.typedBox.innerHTML = html;
  }

  function syncHud() {
    const e = els();
    if (e.wave) e.wave.textContent = String(state.wave);
    if (e.cleared) e.cleared.textContent = String(state.cleared);
    if (e.ghostCount) e.ghostCount.textContent = String(state.ghosts);
    if (e.proximity) e.proximity.textContent = proximityLabel(state.near);
    if (e.timeLeft) e.timeLeft.textContent = state.time.toFixed(1);
    if (e.streak) e.streak.textContent = String(state.streak);
    if (e.progress) {
      const p = Math.floor((state.fillCount / Math.max(1, state.text.length)) * 100);
      e.progress.textContent = Math.min(100, p) + "%";
    }
    if (e.timerFill) {
      e.timerFill.style.transform = `scaleX(${Math.max(0, state.time / state.timeMax)})`;
    }
    if (e.ngBadge) {
      e.ngBadge.classList.toggle("hidden", !state.ngPlus);
    }
    if (e.fillStat) {
      e.fillStat.textContent = `${state.fillCount}/${state.text.length}`;
    }
    onHud?.(state);
  }

  function focusInput() {
    const e = els();
    requestAnimationFrame(() => e.typeInput?.focus());
  }

  function fail(reason) {
    state.running = false;
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

  function checkQuotaWin() {
    if (state.fillCount >= state.text.length && state.near < 1) {
      completeParagraph(true);
      return true;
    }
    return false;
  }

  function advanceCorrect() {
    state.index += 1;
    state.fillCount += 1;
    state.streak += 1;
    if (state.ngPlus) {
      state.endBlack = Math.min(state.text.length - state.index, state.endBlack + 1);
    }
    if (state.streak >= 10) {
      state.near = Math.max(0.08, state.near - 0.028);
      state.streak = 0;
    }
  }

  function skipTrap() {
    // Space on trap: advance without punishment, counts toward fill
    if (!state.running) return;
    if (!state.flags.trap[state.index]) return;
    state.typed += "·";
    advanceCorrect();
    const e = els();
    if (e.typeInput) e.typeInput.value = state.typed;
    state.lastJudged = state.typed;
    renderTyped();
    refreshTarget();
    syncHud();
    if (state.index >= state.text.length || checkQuotaWin()) {
      if (state.index >= state.text.length) {
        if (e.typeInput) e.typeInput.value = "";
        completeParagraph(false);
      }
    }
  }

  function judgeCommitted(raw) {
    if (!state.running) return;
    const target = state.text;
    const e = els();

    // If current is trap and they typed the real character — punish (same as wrong)
    if (state.flags.trap[state.index]) {
      const expected = target[state.index];
      const next = raw.slice(state.typed.length);
      if (next.length === 0) return;
      // any committed char on trap = wrong effect; do not consume as correct
      if (raw !== state.lastJudged) {
        onWrong();
        state.fillCount += 1; // still counts toward quota
        state.lastJudged = raw;
      }
      if (e.typeInput) e.typeInput.value = state.typed;
      renderTyped(next.slice(0, 8));
      refreshTarget();
      syncHud();
      checkQuotaWin();
      return;
    }

    // Align: raw should be typed + new chars; compare to target prefix
    let prefix = 0;
    const limit = Math.min(raw.length, target.length);
    while (prefix < limit && raw[prefix] === target[prefix]) {
      // cannot "correctly" pass through traps via matching
      if (state.flags.trap[prefix] && prefix >= state.index) break;
      prefix++;
    }

    const correct = target.slice(0, prefix);
    const wrongTail = raw.slice(prefix);

    if (wrongTail.length > 0) {
      if (raw !== state.lastJudged) {
        onWrong();
        state.fillCount += 1;
        state.lastJudged = raw;
      }
      state.typed = state.text.slice(0, state.index);
      if (e.typeInput) e.typeInput.value = state.typed;
      renderTyped(wrongTail.slice(0, 8));
      refreshTarget();
      syncHud();
      checkQuotaWin();
      return;
    }

    // gained correct chars
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
      completeParagraph(false);
      return;
    }
    checkQuotaWin();
  }

  function completeParagraph(_byQuota) {
    state.cleared += 1;
    state.typed = "";
    state.composing = "";
    state.endBlack = 0;
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
        // unlock NG+ for next full run
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
    state.text = pickText();
    state.index = 0;
    state.typed = "";
    state.composing = "";
    state.lastJudged = "";
    state.fillCount = 0;
    state.endBlack = 0;
    state.flags = buildFlags(state.text, state.wave * 17 + state.cleared * 3 + 5);
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

  function startGame() {
    const metaNow = loadMeta();
    state.clearedOnce = metaNow.clearedOnce;
    state.ngPlus = metaNow.ngPlus;
    state.running = true;
    state.wave = 1;
    state.cleared = 0;
    state.ghosts = 1;
    state.near = 0.14;
    state.endBlack = 0;
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
    els().clear?.classList.add("hidden");
    startParagraph();
  }

  function bindInput() {
    const e = els();
    const input = e.typeInput;
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
        state.composing = v.startsWith(state.typed) ? v.slice(state.typed.length) : v;
        renderTyped();
        return;
      }
      state.composing = "";
      judgeCommitted(ev.target.value);
    });

    input.addEventListener("keydown", (ev) => {
      if (!state.running) return;
      if (ev.key === " " || ev.code === "Space") {
        if (state.flags.trap[state.index] && !state.imeComposing) {
          ev.preventDefault();
          skipTrap();
        }
      }
    });
  }

  function tick(dt) {
    if (!state.running) return;
    state.time -= dt;
    state.near = Math.min(
      1,
      state.near + dt * (0.01 + state.ghosts * 0.0038 + state.wave * 0.0012),
    );
    if (state.wrongFlash > 0) state.wrongFlash = Math.max(0, state.wrongFlash - dt * 1.7);
    if (state.time <= 0) {
      state.time = 0;
      state.near = Math.min(1, state.near + 0.16);
      if (state.near >= 1) fail("时间到了。它抓住你了。");
      else {
        if (state.ghosts < 5) state.ghosts += 1;
        state.time = Math.max(8, state.timeMax * 0.32);
      }
    }
    if (state.near >= 1) fail("它碰到你了。");
    syncHud();
  }

  return {
    state,
    startGame,
    nextWave,
    bindInput,
    tick,
    syncHud,
    refreshTarget,
    proximityLabel,
    fail,
  };
}
