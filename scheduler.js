/**
 * 动态排阵：根据权重选出下一场 4 人并分成两对
 * 权重：出场少 > 休息多 > 避免搭档/对手重复
 */

function getPlayerIdsOnCourt(courtMatches) {
  const ids = new Set();
  for (const m of courtMatches) {
    (m.teamAPlayerIds || []).forEach((id) => ids.add(id));
    (m.teamBPlayerIds || []).forEach((id) => ids.add(id));
  }
  return ids;
}

function getLastPartnerAndOpponents(playerId, matchResults, courtMatches) {
  const all = [...(matchResults || []), ...(courtMatches || [])].filter(
    (r) =>
      (r.teamAPlayerIds && r.teamAPlayerIds.includes(playerId)) ||
      (r.teamBPlayerIds && r.teamBPlayerIds.includes(playerId))
  );
  const last = all[all.length - 1];
  if (!last) return { lastPartner: null, lastOpponents: [] };
  const inA = (last.teamAPlayerIds || []).includes(playerId);
  const partner = inA ? (last.teamAPlayerIds || []).find((id) => id !== playerId) : (last.teamBPlayerIds || []).find((id) => id !== playerId);
  const opponents = inA ? (last.teamBPlayerIds || []) : (last.teamAPlayerIds || []);
  return { lastPartner: partner || null, lastOpponents: opponents };
}

/**
 * 计算权重：越大越优先上场
 */
function weight(player, onCourtIds, matchResults, courtMatches) {
  if (onCourtIds.has(player.id)) return -1e9;
  if (player.status !== "active") return -1e9;

  let w = 0;
  w += (100 - player.playCount) * 100;
  w += Math.min(player.restCount || 0, 10) * 10;

  const { lastPartner, lastOpponents } = getLastPartnerAndOpponents(player.id, matchResults, courtMatches);
  // 待选 4 人里尽量避免和 lastPartner 再次搭档、和 lastOpponents 再次对阵（在选完 4 人分队时再细化）
  w -= (lastPartner ? 5 : 0);
  w -= lastOpponents.length * 3;

  return w;
}

/**
 * 从候选人中选 4 人并分成 teamA(2) vs teamB(2)
 * 可选：尽量性别平衡（男双/混双）
 */
function pickFourAndSplit(players, handicapRules = []) {
  if (players.length < 4) return null;
  const sorted = [...players].sort((a, b) => b.weight - a.weight);
  const four = sorted.slice(0, 4);

  const needBalance = handicapRules && handicapRules.length > 0;
  let teamA = [four[0].id, four[1].id];
  let teamB = [four[2].id, four[3].id];

  if (needBalance) {
    const countM = (ids) => ids.reduce((n, id) => n + (four.find((p) => p.id === id)?.gender === "M" ? 1 : 0), 0);
    const trySwap = () => {
      const aM = countM(teamA);
      const bM = countM(teamB);
      if (aM === bM) return;
      if (aM === 2 && bM === 0) {
        [teamA, teamB] = [[teamA[0], teamB[0]], [teamA[1], teamB[1]]];
      } else if (aM === 0 && bM === 2) {
        [teamA, teamB] = [[teamA[0], teamB[0]], [teamA[1], teamB[1]]];
      }
    };
    trySwap();
  }

  return { teamA, teamB, players: four };
}

/**
 * 计算本场让分提示
 */
function getHandicapTip(teamAPlayerIds, teamBPlayerIds, playersById, handicapRules) {
  if (!handicapRules || handicapRules.length === 0) return "";
  const getGenders = (ids) => (ids || []).map((id) => playersById[id]?.gender).filter(Boolean);
  const countM = (genders) => genders.filter((g) => g === "M").length;
  const teamAG = getGenders(teamAPlayerIds);
  const teamBG = getGenders(teamBPlayerIds);
  const aM = countM(teamAG);
  const bM = countM(teamBG);
  for (const rule of handicapRules) {
    const name = (rule.name || "").toLowerCase();
    let give = 0;
    if (name.includes("男双") && name.includes("混双")) {
      if (aM === 2 && bM === 1) give = rule.points || 0;
      else if (bM === 2 && aM === 1) give = -(rule.points || 0);
    }
    if (give !== 0) {
      return give > 0 ? `B 队需让 ${give} 分` : `A 队需让 ${-give} 分`;
    }
  }
  return "";
}

/**
 * 入口：给定活动下的选手、当前场地比赛、历史结果、让分规则，返回下一场建议
 */
function computeNextMatch(players, courtMatches, matchResults, handicapRules) {
  const onCourtIds = getPlayerIdsOnCourt(courtMatches);
  const playersWithWeight = (players || []).map((p) => ({
    ...p,
    weight: weight(p, onCourtIds, matchResults, courtMatches),
  }));
  const playersById = {};
  players.forEach((p) => (playersById[p.id] = p));
  const next = pickFourAndSplit(playersWithWeight, handicapRules);
  if (!next) return null;
  const handicapTip = getHandicapTip(next.teamA, next.teamB, playersById, handicapRules || []);
  return {
    teamAPlayerIds: next.teamA,
    teamBPlayerIds: next.teamB,
    handicapTip,
    players: next.players,
  };
}

module.exports = {
  computeNextMatch,
  getHandicapTip,
  getPlayerIdsOnCourt,
};
