/** 感冒模式：老板口述 + 学术报告正文 */

export const VOICE_LINES = [
  "喂，小王吗？合同附件今晚必须交，你现在就打。",
  "开头先写研究背景，别写得像微博。",
  "方法论那一段要显得客观，少用我觉得。",
  "结果讨论分开写，引用别忘了。",
  "结论收束到管理启示，最后留一句后续工作。",
  "好了就发我邮箱，别再咳嗽对着麦克风。",
];

/** 需打出的英文学术段落（全键盘唾液输入） */
export const REPORT =
  "This study examines how remote collaboration intensity mediates the relationship between digital infrastructure maturity and project delivery efficiency in knowledge-intensive firms. Drawing on a multi-site survey and archival performance logs, we estimate a structural model that controls for team size, industry turbulence, and prior process standardization. Results indicate that infrastructure maturity has a significant positive effect on delivery efficiency, partially transmitted through collaboration intensity. The mediation is stronger when teams maintain synchronous review rituals and weaker when asynchronous backlog practices dominate. Implications for managers include sequencing tool investment after clarifying coordination cadences, and treating collaboration intensity as a measurable operating variable rather than a cultural slogan. Limitations concern single-country sampling and self-reported workload items; future work should incorporate longitudinal sensor data and cross-border vendor networks.";

/** 每段语音解锁的正文字符数（含空格） */
export function charsUnlockedByVoice(voiceIndex) {
  const n = REPORT.length;
  const parts = VOICE_LINES.length;
  const base = Math.floor(n / parts);
  const extra = n % parts;
  let start = 0;
  for (let i = 0; i < voiceIndex; i++) {
    start += base + (i < extra ? 1 : 0);
  }
  const len = base + (voiceIndex < extra ? 1 : 0);
  return { start, end: Math.min(n, start + len) };
}
