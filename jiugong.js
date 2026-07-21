/**
 * 九宫参考板：固定 9 个方向/表情（含英文），
 * 鬼本体会做其中一张脸，玩家按对应格让她开心。
 */

/** 小键盘布局：7 8 9 / 4 5 6 / 1 2 3 */
export const FACE_DEFS = [
  { slot: 0, num: 7, zh: "哀", en: "SORROW" },
  { slot: 1, num: 8, zh: "怒", en: "RAGE" },
  { slot: 2, num: 9, zh: "嬉", en: "GRIN" },
  { slot: 3, num: 4, zh: "惧", en: "FEAR" },
  { slot: 4, num: 5, zh: "呆", en: "BLANK" },
  { slot: 5, num: 6, zh: "馋", en: "CRAVE" },
  { slot: 6, num: 1, zh: "羞", en: "SHY" },
  { slot: 7, num: 2, zh: "倦", en: "WEARY" },
  { slot: 8, num: 3, zh: "诡", en: "EERIE" },
];

export function faceSvg(kind, seed = 0, opts = {}) {
  const compact = !!opts.compact;
  const eye = {
    哀: ["M70 85 Q78 95 86 85", "M114 85 Q122 95 130 85"],
    怒: ["M68 80 L88 88", "M112 88 L132 80"],
    嬉: ["M70 82 Q78 78 86 82", "M114 82 Q122 78 130 82"],
    惧: [
      "M78 86 m-6 0 a6 8 0 1 0 12 0 a6 8 0 1 0 -12 0",
      "M122 86 m-6 0 a6 8 0 1 0 12 0 a6 8 0 1 0 -12 0",
    ],
    呆: [
      "M78 86 m-5 0 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0",
      "M122 86 m-5 0 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0",
    ],
    馋: ["M70 84 Q78 90 86 84", "M114 84 Q122 90 130 84"],
    羞: ["M72 88 Q78 84 84 88", "M116 88 Q122 84 128 88"],
    倦: ["M70 86 L86 86", "M114 86 L130 86"],
    诡: ["M70 80 Q78 92 86 80", "M114 80 Q122 70 130 84"],
  }[kind] || [
    "M78 86 m-5 0 a5 5 0 1 0 10 0",
    "M122 86 m-5 0 a5 5 0 1 0 10 0",
  ];

  const mouth =
    {
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
  const labelY = compact ? 0 : 188;
  const label = compact
    ? ""
    : `<text x="100" y="${labelY}" text-anchor="middle" fill="rgba(200,200,200,0.55)" font-size="16" font-family="sans-serif">${kind}</text>`;

  return `<svg viewBox="0 0 200 ${compact ? 170 : 200}" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="100" cy="105" rx="70" ry="78" fill="rgba(${200 - tint},${200 - tint},${210 - tint},0.22)" stroke="rgba(220,220,220,0.45)" stroke-width="2"/>
    <path d="${eye[0]}" fill="none" stroke="rgba(220,80,80,0.9)" stroke-width="3" stroke-linecap="round"/>
    <path d="${eye[1]}" fill="none" stroke="rgba(220,80,80,0.9)" stroke-width="3" stroke-linecap="round"/>
    <path d="${mouth}" fill="rgba(180,60,60,0.35)" stroke="rgba(200,200,200,0.5)" stroke-width="2"/>
    ${label}
  </svg>`;
}

/** 固定参考板（九格表情不变，只作对照） */
export function createReferenceBoard() {
  return FACE_DEFS.map((d) => ({
    ...d,
    seed: d.slot * 17 + 3,
  }));
}

/** 开一轮「对表情」：鬼做某一格的脸，限时按对应区域 */
export function createJiugongChallenge(seed = 1) {
  let s = seed >>> 0;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  const correctSlot = Math.floor(rnd() * FACE_DEFS.length);
  const def = FACE_DEFS[correctSlot];
  return {
    id: seed >>> 0,
    correctSlot,
    correctKind: def.zh,
    correctEn: def.en,
    correctNum: def.num,
    timeMax: 6.5,
    time: 6.5,
    cooldown: 0,
  };
}

export const FACE_NAMES = FACE_DEFS.map((d) => d.zh);

/** 卡通鬼身体 + 指定表情（本体用） */
export function ghostBodyWithFace(kind, seed = 0) {
  const faceInner = faceSvg(kind, seed, { compact: true })
    .replace(/<svg[^>]*>/, "")
    .replace("</svg>", "");
  return `<svg viewBox="0 0 200 260" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="100" cy="230" rx="70" ry="18" fill="rgba(0,0,0,0.45)"/>
    <g transform="translate(0,8)">${faceInner}</g>
  </svg>`;
}
