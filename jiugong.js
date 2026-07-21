/** 九宫格表情模式：9 张鬼脸 SVG，点选她正在做的那张。 */

const FACE_NAMES = [
  "哀",
  "怒",
  "嬉",
  "惧",
  "呆",
  "馋",
  "羞",
  "倦",
  "诡",
];

export function faceSvg(kind, seed = 0) {
  const eye = {
    哀: ["M70 85 Q78 95 86 85", "M114 85 Q122 95 130 85"],
    怒: ["M68 80 L88 88", "M112 88 L132 80"],
    嬉: ["M70 82 Q78 78 86 82", "M114 82 Q122 78 130 82"],
    惧: ["M78 86 m-6 0 a6 8 0 1 0 12 0 a6 8 0 1 0 -12 0", "M122 86 m-6 0 a6 8 0 1 0 12 0 a6 8 0 1 0 -12 0"],
    呆: ["M78 86 m-5 0 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0", "M122 86 m-5 0 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0"],
    馋: ["M70 84 Q78 90 86 84", "M114 84 Q122 90 130 84"],
    羞: ["M72 88 Q78 84 84 88", "M116 88 Q122 84 128 88"],
    倦: ["M70 86 L86 86", "M114 86 L130 86"],
    诡: ["M70 80 Q78 92 86 80", "M114 80 Q122 70 130 84"],
  }[kind] || ["M78 86 m-5 0 a5 5 0 1 0 10 0", "M122 86 m-5 0 a5 5 0 1 0 10 0"];

  const mouth = {
    哀: "M85 130 Q100 120 115 130",
    怒: "M85 125 L115 125",
    嬉: "M82 125 Q100 145 118 125",
    惧: "M95 122 a6 10 0 1 0 10 0",
    呆: "M92 128 a8 6 0 1 0 16 0",
    馋: "M88 128 Q100 140 112 128 L100 135 Z",
    羞: "M90 130 Q100 136 110 130",
    倦: "M88 132 Q100 128 112 132",
    诡: "M85 128 Q100 118 110 132 Q100 138 85 128",
  }[kind] || "M90 130 Q100 136 110 130";

  const tint = 40 + (seed % 30);
  return `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="100" cy="105" rx="70" ry="78" fill="rgba(${200 - tint},${200 - tint},${210 - tint},0.2)" stroke="rgba(220,220,220,0.45)" stroke-width="2"/>
    <path d="${eye[0]}" fill="none" stroke="rgba(220,80,80,0.9)" stroke-width="3" stroke-linecap="round"/>
    <path d="${eye[1]}" fill="none" stroke="rgba(220,80,80,0.9)" stroke-width="3" stroke-linecap="round"/>
    <path d="${mouth}" fill="rgba(180,60,60,0.35)" stroke="rgba(200,200,200,0.5)" stroke-width="2"/>
    <text x="100" y="188" text-anchor="middle" fill="rgba(200,200,200,0.55)" font-size="16" font-family="sans-serif">${kind}</text>
  </svg>`;
}

export function createJiugongRound(seed = 1) {
  let s = seed >>> 0;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  const correctKind = FACE_NAMES[Math.floor(rnd() * FACE_NAMES.length)];
  // 9 answers: one correct, rest distractors (may repeat kinds with different seed look)
  const cells = [];
  const correctSlot = Math.floor(rnd() * 9);
  for (let i = 0; i < 9; i++) {
    if (i === correctSlot) {
      cells.push({ kind: correctKind, seed: seed + i, correct: true });
    } else {
      let k = FACE_NAMES[Math.floor(rnd() * FACE_NAMES.length)];
      if (k === correctKind) k = FACE_NAMES[(FACE_NAMES.indexOf(k) + 1 + Math.floor(rnd() * 7)) % 9];
      cells.push({ kind: k, seed: seed + 20 + i, correct: false });
    }
  }
  return {
    id: seed >>> 0,
    correctKind,
    correctSlot,
    cells,
    timeMax: 7.5,
    time: 7.5,
  };
}

export { FACE_NAMES };
