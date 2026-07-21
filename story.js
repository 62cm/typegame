/** 剧情模式：鬼的生平设定，后续段落必须答出。 */

export const GHOST_PROFILE = {
  name: "阿缕",
  gender: "她",
  bio: "民国时在城南绣坊做学徒，二十三岁那年冬天失踪，衣服留在井边。",
  likes: ["绣花针", "桂花糕", "雨夜油灯"],
  hates: ["铜镜", "敲门声", "被叫错名字"],
  likePeople: ["绣坊里的哑巴师兄"],
  hatePeople: ["收租的赵老爷"],
};

/**
 * Story chapters: first teach lore, later demand exact recall typing.
 * 玩家必须把要求写出的字完整打对，不能凑字数。
 */
export function getStoryParagraphs(profile) {
  const p = profile;
  return [
    `${p.gender}贴在你耳后说：我叫${p.name}。${p.bio}你把我的名字打出来：${p.name}。`,
    `${p.gender}数着喜欢的东西：${p.likes.join("、")}。讨厌的是：${p.hates.join("、")}。先把第一样喜欢的打出来：${p.likes[0]}。`,
    `${p.gender}又说：我喜欢的人只有${p.likePeople.join("、")}；我恨的人是${p.hatePeople.join("、")}。把喜欢的人打出来：${p.likePeople[0]}。`,
    `屏幕跳出空问：她叫什么？请一字不差写下：${p.name}`,
    `她最喜欢的第一样东西是什么？请写下：${p.likes[0]}`,
    `她讨厌的第二样东西是什么？请写下：${p.hates[1]}`,
    `她恨的人是谁？请写下：${p.hatePeople[0]}`,
    `她喜欢的人是谁？请写下：${p.likePeople[0]}`,
    `她生平里提到的地方：请写下：城南绣坊`,
    `她二十三岁那年冬天怎样了？请写下：失踪`,
    `她的衣服留在哪里？请写下：井边`,
    `最后确认：再打一遍她的名字——${p.name}`,
  ];
}
