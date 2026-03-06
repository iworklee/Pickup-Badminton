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

function weight(player, onCourtIds, matchResults, courtMatches) {
  if (onCourtIds.has(player.id)) return -1e9;
  if (player.status !== "active") return -1e9;

  let w = 0;
  w += (100 - player.playCount) * 100;
  w += Math.min(player.restCount || 0, 10) * 10;

  const { lastPartner, lastOpponents } = getLastPartnerAndOpponents(player.id, matchResults, courtMatches);
  w -= (lastPartner ? 5 : 0);
  w -= lastOpponents.length * 3;

  return w;
}

function sameSet(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return a.length === 2 && b.length === 2 && new Set(a).size === 2 && a.every((id) => b.includes(id));
}

function isSameMatchup(teamA, teamB, lastResult) {
  if (!lastResult) return false;
  const la = lastResult.teamAPlayerIds || [];
  const lb = lastResult.teamBPlayerIds || [];
  return (sameSet(teamA, la) && sameSet(teamB, lb)) || (sameSet(teamA, lb) && sameSet(teamB, la));
}

function pickFourAndSplit(players, handicapRules = [], excludeMatchup = null) {
  if (players.length < 4) return null;
  const sorted = [...players].sort((a, b) => b.weight - a.weight);
  const four = sorted.slice(0, 4);
  const ids = four.map((p) => p.id);

  const needBalance = handicapRules && handicapRules.length > 0;
  const countM = (idList) => idList.reduce((n, id) => n + (four.find((p) => p.id === id)?.gender === "M" ? 1 : 0), 0);

  let teamA = [ids[0], ids[1]];
  let teamB = [ids[2], ids[3]];

  if (needBalance) {
    const aM = countM(teamA);
    const bM = countM(teamB);
    if (aM === 2 && bM === 0) {
      [teamA, teamB] = [[ids[0], ids[2]], [ids[1], ids[3]]];
    } else if (aM === 0 && bM === 2) {
      [teamA, teamB] = [[ids[0], ids[2]], [ids[1], ids[3]]];
    }
  }

  const otherSplits = [
    [[ids[0], ids[2]], [ids[1], ids[3]]],
    [[ids[0], ids[3]], [ids[1], ids[2]]],
  ];
  if (excludeMatchup && isSameMatchup(teamA, teamB, excludeMatchup)) {
    for (const [a, b] of otherSplits) {
      if (!isSameMatchup(a, b, excludeMatchup)) {
        teamA = a;
        teamB = b;
        break;
      }
    }
  }

  if (excludeMatchup && isSameMatchup(teamA, teamB, excludeMatchup)) return null;

  return { teamA, teamB, players: four };
}

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

function computeNextMatch(players, courtMatches, matchResults, handicapRules) {
  const onCourtIds = getPlayerIdsOnCourt(courtMatches);
  const playersWithWeight = (players || []).map((p) => ({
    ...p,
    weight: weight(p, onCourtIds, matchResults, courtMatches),
  }));
  const playersById = {};
  players.forEach((p) => (playersById[p.id] = p));
  const lastResult = (matchResults && matchResults.length) ? matchResults[matchResults.length - 1] : null;
  const next = pickFourAndSplit(playersWithWeight, handicapRules, lastResult);
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
