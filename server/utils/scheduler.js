/**
 * 动态排阵：参考 BadmintonScheduler 算法
 * 优先级：出场少 > 休息多 > 避免搭档/对手重复 > 性别阵容对等
 */

function getPlayerIdsOnCourt(courtMatches) {
  const ids = new Set();
  for (const m of courtMatches || []) {
    (m.teamAPlayerIds || []).forEach((id) => ids.add(id));
    (m.teamBPlayerIds || []).forEach((id) => ids.add(id));
  }
  return ids;
}

/**
 * 从已结束 + 进行中的比赛构建每位选手的搭档/对手历史次数
 */
function buildHistory(matchResults, courtMatches) {
  const history = {}; // playerId -> { partners: { id: count }, opponents: { id: count } }
  const add = (pid, dict, otherId) => {
    if (!history[pid]) history[pid] = { partners: {}, opponents: {} };
    dict[otherId] = (dict[otherId] || 0) + 1;
  };
  const applyMatch = (teamA, teamB) => {
    if (!teamA?.length || !teamB?.length) return;
    [...teamA, ...teamB].forEach((pid) => {
      if (!history[pid]) history[pid] = { partners: {}, opponents: {} };
    });
    for (let i = 0; i < teamA.length; i++) {
      for (let j = i + 1; j < teamA.length; j++) {
        const a = teamA[i];
        const b = teamA[j];
        add(a, history[a].partners, b);
        add(b, history[b].partners, a);
      }
    }
    teamA.forEach((a) => {
      teamB.forEach((b) => {
        add(a, history[a].opponents, b);
        add(b, history[b].opponents, a);
      });
    });
  };
  for (const r of matchResults || []) {
    applyMatch(r.teamAPlayerIds || [], r.teamBPlayerIds || []);
  }
  for (const m of courtMatches || []) {
    applyMatch(m.teamAPlayerIds || [], m.teamBPlayerIds || []);
  }
  return history;
}

/**
 * 评估一种对阵的合理性（分数越高越好）
 */
function evaluateMatchup(t1, t2, hist, maxGames) {
  const all4 = [...t1, ...t2];
  let score = 0;

  // 基础分：4 人个人优先级之和 (出场少、休息多得分高)
  for (const p of all4) {
    score += (maxGames - (p.playCount || 0)) * 100 + (p.restCount || 0) * 10;
  }

  const getHist = (id) => hist[id] || { partners: {}, opponents: {} };

  // 惩罚：搭档重复 (每次 -50)
  const p1Partners = getHist(t1[0].id).partners;
  const p2Partners = getHist(t2[0].id).partners;
  if (p1Partners[t1[1].id]) score -= 50 * p1Partners[t1[1].id];
  if (p2Partners[t2[1].id]) score -= 50 * p2Partners[t2[1].id];

  // 惩罚：对手重复 (每次 -20)
  const checkOpponent = (player, opponent) => {
    const opp = getHist(player.id).opponents[opponent.id];
    if (opp) score -= 20 * opp;
  };
  t1.forEach((p1) => t2.forEach((p2) => {
    checkOpponent(p1, p2);
    checkOpponent(p2, p1);
  }));

  // 奖励：性别阵容对等 (男双 vs 男双、混双 vs 混双 等 +30)
  const genders = (team) => team.map((p) => p.gender).sort().join("");
  if (genders(t1) === genders(t2)) score += 30;

  return score;
}

function sameSet(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return a.length === 2 && b.length === 2 && new Set(a).size === 2 && a.every((id) => b.includes(id));
}

function isSameMatchup(teamA, teamB, oneResult) {
  if (!oneResult) return false;
  const la = oneResult.teamAPlayerIds || [];
  const lb = oneResult.teamBPlayerIds || [];
  return (sameSet(teamA, la) && sameSet(teamB, lb)) || (sameSet(teamA, lb) && sameSet(teamB, la));
}

/**
 * 核心：在候选池中 8 选 4，对每种 4 人组合尝试 3 种组队方式，取评分最高的对阵
 * @param excludeMatchup - 可选，{ teamAPlayerIds, teamBPlayerIds }，排除与此相同的对阵（用于本场结束后预览）
 */
function computeNextMatch(players, courtMatches, matchResults, handicapRules, excludeMatchup) {
  const onCourtIds = getPlayerIdsOnCourt(courtMatches);
  const availablePlayers = (players || []).filter(
    (p) => p.status === "active" && !onCourtIds.has(p.id)
  );

  if (availablePlayers.length < 4) {
    return null;
  }

  const hist = buildHistory(matchResults, courtMatches);
  const maxGames = Math.max(0, ...availablePlayers.map((p) => p.playCount || 0));

  // 个人优先级，取前 8 名作为候选池
  availablePlayers.forEach((p) => {
    p._priorityScore = (maxGames - (p.playCount || 0)) * 100 + (p.restCount || 0) * 10;
  });
  availablePlayers.sort((a, b) => b._priorityScore - a._priorityScore);
  const pool = availablePlayers.slice(0, 8);

  let bestMatch = null;
  let bestScore = -Infinity;

  // 遍历所有 4 人组合 (8 选 4)
  for (let i = 0; i < pool.length - 3; i++) {
    for (let j = i + 1; j < pool.length - 2; j++) {
      for (let k = j + 1; k < pool.length - 1; k++) {
        for (let l = k + 1; l < pool.length; l++) {
          const group = [pool[i], pool[j], pool[k], pool[l]];
          const matchups = [
            { t1: [group[0], group[1]], t2: [group[2], group[3]] },
            { t1: [group[0], group[2]], t2: [group[1], group[3]] },
            { t1: [group[0], group[3]], t2: [group[1], group[2]] },
          ];
          for (const { t1, t2 } of matchups) {
            const t1Ids = t1.map((p) => p.id);
            const t2Ids = t2.map((p) => p.id);
            if (excludeMatchup && isSameMatchup(t1Ids, t2Ids, excludeMatchup)) continue;
            const score = evaluateMatchup(t1, t2, hist, maxGames);
            if (score > bestScore) {
              bestScore = score;
              bestMatch = {
                teamAPlayerIds: t1Ids,
                teamBPlayerIds: t2Ids,
                players: [...t1, ...t2],
              };
            }
          }
        }
      }
    }
  }

  if (!bestMatch) return null;

  const playersById = {};
  (players || []).forEach((p) => (playersById[p.id] = p));
  const handicapTip = getHandicapTip(
    bestMatch.teamAPlayerIds,
    bestMatch.teamBPlayerIds,
    playersById,
    handicapRules || []
  );

  return {
    teamAPlayerIds: bestMatch.teamAPlayerIds,
    teamBPlayerIds: bestMatch.teamBPlayerIds,
    handicapTip,
    players: bestMatch.players,
  };
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
    // 男双让混双：男双一方需让分（混双获让分）
    if (name.includes("男双") && name.includes("混双")) {
      if (aM === 2 && bM === 1) give = -(rule.points || 0); // A 男双 → A 队需让
      else if (bM === 2 && aM === 1) give = rule.points || 0;  // B 男双 → B 队需让
    }
    if (give !== 0) {
      return give > 0 ? `B 队需让 ${give} 分` : `A 队需让 ${-give} 分`;
    }
  }
  return "";
}

module.exports = {
  computeNextMatch,
  getHandicapTip,
  getPlayerIdsOnCourt,
  isSameMatchup,
};
