/**
 * 倒着做：
 * 1) 满分稿 FULL_SCORE
 * 2) 拆成领导口述语音条（含废话）
 * 3) 每条语音只解锁「该打的字」；废话只播报不打
 */

/** 满分稿：玩家应对齐的最终文本 */
export const FULL_SCORE =
  "本研究旨在探讨数字化协作强度对企业项目交付效率的影响。" +
  "基于多源问卷与归档绩效日志，本文估计结构模型并控制团队规模。" +
  "结果表明基础设施成熟度对交付效率具有显著正向作用。" +
  "局限在于样本范围，后续应纳入纵向传感数据与跨境网络。";

/** oral = 整段口述（含废话）；units = 本条要打的字（废话不在其中） */
export const SEGMENTS = [
  {
    duration: 54,
    say:
      "喂小王你在听吗，我这会儿在车里说啊，信号不好你就多听两遍。" +
      "反正别急着回我微信。今晚合同附件里的研究背景必须写清楚，" +
      "别写成微博，也别写成朋友圈。客户要可核验的东西。" +
      "你就按我说的打：本研究旨在探讨数字化协作强度对企业项目交付效率的影响。" +
      "打完这段先停，我下条再说。咳，油烟味真大。",
    units: [
      ["本", "ben"], ["研", "yan"], ["究", "jiu"], ["旨", "zhi"], ["在", "zai"],
      ["探", "tan"], ["讨", "tao"], ["数", "shu"], ["字", "zi"], ["化", "hua"],
      ["协", "xie"], ["作", "zuo"], ["强", "qiang"], ["度", "du"], ["对", "dui"],
      ["企", "qi"], ["业", "ye"], ["项", "xiang"], ["目", "mu"], ["交", "jiao"],
      ["付", "fu"], ["效", "xiao"], ["率", "lv"], ["的", "de"], ["影", "ying"],
      ["响", "xiang"], ["。", ""],
    ],
  },
  {
    duration: 58,
    say:
      "还有啊，方法论那段你给我客观一点。少写我觉得我认为，多写数据。" +
      "对了你石膏还绑着呢吧，绑着也得干活。听清楚要打的句子：" +
      "基于多源问卷与归档绩效日志，本文估计结构模型并控制团队规模。" +
      "评审最爱抓方法站不住，你别给我翻车。嗯，红灯了等我一下……好了继续。",
    units: [
      ["基", "ji"], ["于", "yu"], ["多", "duo"], ["源", "yuan"], ["问", "wen"],
      ["卷", "juan"], ["与", "yu"], ["归", "gui"], ["档", "dang"], ["绩", "ji"],
      ["效", "xiao"], ["日", "ri"], ["志", "zhi"], ["，", ""],
      ["本", "ben"], ["文", "wen"], ["估", "gu"], ["计", "ji"], ["结", "jie"],
      ["构", "gou"], ["模", "mo"], ["型", "xing"], ["并", "bing"], ["控", "kong"],
      ["制", "zhi"], ["团", "tuan"], ["队", "dui"], ["规", "gui"], ["模", "mo"],
      ["。", ""],
    ],
  },
  {
    duration: 52,
    say:
      "结果和讨论分开写，引用别漏。我跟你讲啊，上周那个供应商又迟到，真是……" +
      "扯远了。你要打的是这句：" +
      "结果表明基础设施成熟度对交付效率具有显著正向作用。" +
      "结论落到管理启示，客户能听懂就行。别的废话你别写进稿子里。",
    units: [
      ["结", "jie"], ["果", "guo"], ["表", "biao"], ["明", "ming"], ["基", "ji"],
      ["础", "chu"], ["设", "she"], ["施", "shi"], ["成", "cheng"], ["熟", "shu"],
      ["度", "du"], ["对", "dui"], ["交", "jiao"], ["付", "fu"], ["效", "xiao"],
      ["率", "lv"], ["具", "ju"], ["有", "you"], ["显", "xian"], ["著", "zhu"],
      ["正", "zheng"], ["向", "xiang"], ["作", "zuo"], ["用", "yong"], ["。", ""],
    ],
  },
  {
    duration: 57,
    say:
      "最后补局限和后续。样本范围写诚实点，别装全面。我喝口咖啡啊……" +
      "好了，打这句：" +
      "局限在于样本范围，后续应纳入纵向传感数据与跨境网络。" +
      "写完发我邮箱抄送项目群。别再对着麦克风咳嗽了，飞沫声很难听。就这样。",
    units: [
      ["局", "ju"], ["限", "xian"], ["在", "zai"], ["于", "yu"], ["样", "yang"],
      ["本", "ben"], ["范", "fan"], ["围", "wei"], ["，", ""],
      ["后", "hou"], ["续", "xu"], ["应", "ying"], ["纳", "na"], ["入", "ru"],
      ["纵", "zong"], ["向", "xiang"], ["传", "chuan"], ["感", "gan"], ["数", "shu"],
      ["据", "ju"], ["与", "yu"], ["跨", "kua"], ["境", "jing"], ["网", "wang"],
      ["络", "luo"], ["。", ""],
    ],
  },
];

export function segmentText(seg) {
  return seg.units.map((u) => u[0]).join("");
}

export function segmentPy(seg) {
  return seg.units.map((u) => u[1]);
}

export function fullReport() {
  return SEGMENTS.map(segmentText).join("");
}

export function fullPyList() {
  return SEGMENTS.flatMap(segmentPy);
}

export const REPORT = fullReport();
export const VOICE_LINES = SEGMENTS.map((s) => s.say);

export function charsUnlockedByVoice(voiceIndex) {
  let end = 0;
  for (let i = 0; i <= voiceIndex && i < SEGMENTS.length; i++) {
    end += segmentText(SEGMENTS[i]).length;
  }
  return { start: 0, end };
}

/** 对照满分稿评分 0–100 */
export function scoreTyped(typed) {
  const full = FULL_SCORE;
  if (!full.length) return 0;
  let ok = 0;
  const n = Math.max(full.length, typed.length);
  for (let i = 0; i < full.length; i++) {
    if (typed[i] === full[i]) ok++;
  }
  // 多打的字扣一点
  const extra = Math.max(0, typed.length - full.length);
  const raw = (ok / full.length) * 100 - extra * 0.5;
  return Math.max(0, Math.min(100, Math.round(raw)));
}
