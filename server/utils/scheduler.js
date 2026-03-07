/**
 * 动态排阵算法优化版
 */

// 1. 抽离配置项，告别 Magic Number
const WEIGHTS = {
  PLAY_COUNT: 100,       // 出场次数权重（负向，由 maxGames - playCount 转化）
  REST_COUNT: 10,        // 休息时长权重（正向）
  PARTNER_REPEAT: -50,   // 搭档重复惩罚
  OPPONENT_REPEAT: -20,  // 对手重复惩罚
  GENDER_BALANCE: 30     // 阵容对等奖励
};

function getPlayerIdsOnCourt(courtMatches) {
  const ids = new Set();
  for (const m of courtMatches || []) {
    (m.teamAPlayerIds || []).forEach((id) => ids.add(id));
    (m.teamBPlayerIds || []).forEach((id) => ids.add(id));
  }
  return ids;
}

function buildHistory(matchResults, courtMatches) {
  const history = {}; 
  const add = (pid, dict, otherId) => {
    if (!history[pid]) history[pid] = { partners: {}, opponents: {} };
    dict[otherId] = (dict[otherId] || 0) + 1;
  };

  const applyMatch = (teamA, teamB) => {
    if (!teamA?.length || !teamB?.length) return;
    [...teamA, ...teamB].forEach((pid) => {
      if (!history[pid]) history[pid] = { partners: {}, opponents: {} };
    });

    // 记录搭档 (双向)
    for (let i = 0; i < teamA.length; i++) {
      for (let j = i + 1; j < teamA.length; j++) {
        add(teamA[i], history[teamA[i]].partners, teamA[j]);
        add(teamA[j], history[teamA[j]].partners, teamA[i]);
      }
    }
    // 记录对手 (双向)
    teamA.forEach((a) => {
      teamB.forEach((b) => {
        add(a, history[a].opponents, b);
        add(b, history[b].opponents, a);
      });
    });
  };

  [...(matchResults || []), ...(courtMatches || [])].forEach(m => {
    applyMatch(m.teamAPlayerIds || [], m.teamBPlayerIds || []);
  });

  return history;
}

function evaluateMatchup(t1, t2, hist) {
  let score = 0;

  // 优化点：直接复用已计算好的个人优先级分数，避免重复计算
  const all4 = [...t1, ...t2];
  for (const p of all4) {
    score += (p._priorityScore || 0);
  }

  const getHist = (id) => hist[id] || { partners: {}, opponents: {} };

  // 惩罚：搭档重复
  const p1Partners = getHist(t1[0].id).partners;
  const p2Partners = getHist(t2[0].id).partners;
  if (p1Partners[t1[1].id]) score += WEIGHTS.PARTNER_REPEAT * p1Partners[t1[1].id];
  if (p2Partners[t2[1].id]) score += WEIGHTS.PARTNER_REPEAT * p2Partners[t2[1].id];

  // 优化点：修复对手惩罚被“双重扣分”的 Bug
  // 只需单向遍历 t1 对 t2，因为这已经涵盖了 4 条对阵线 (A-C, A-D, B-C, B-D)
  t1.forEach((p1) => {
    const p1Opponents = getHist(p1.id).opponents;
    t2.forEach((p2) => {
      if (p1Opponents[p2.id]) {
        score += WEIGHTS.OPPONENT_REPEAT * p1Opponents[p2.id];
      }
    });
  });

  // 奖励：性别阵容对等
  const getGenderStr = (team) => team.map((p) => p.gender).sort().join("");
  if (getGenderStr(t1) === getGenderStr(t2)) score += WEIGHTS.GENDER_BALANCE;

  // 优化点：引入 0~0.9 的随机扰动分数，打破同分僵化，让同等条件下的排阵产生变化
  score += Math.random();

  return score;
}

function sameSet(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((id) => setB.has(id));
}

function isSameMatchup(teamA, teamB, oneResult) {
  if (!oneResult) return false;
  const la = oneResult.teamAPlayerIds || [];
  const lb = oneResult.teamBPlayerIds || [];
  return (sameSet(teamA, la) && sameSet(teamB, lb)) || (sameSet(teamA, lb) && sameSet(teamB, la));
}

function computeNextMatch(players, courtMatches, matchResults, handicapRules, excludeMatchup) {
  const onCourtIds = getPlayerIdsOnCourt(courtMatches);
  const availablePlayers = (players || []).filter(
    (p) => p.status === "active" && !onCourtIds.has(p.id)
  );

  if (availablePlayers.length < 4) return null;

  const hist = buildHistory(matchResults, courtMatches);
  
  // 优化点：maxGames 应该基于所有参与过的人计算，而不仅仅是 currently available 的人
  const maxGames = Math.max(0, ...(players || []).map((p) => p.playCount || 0));

  // 计算个人优先级，并挂载到对象上
  availablePlayers.forEach((p) => {
    p._priorityScore = (maxGames - (p.playCount || 0)) * WEIGHTS.PLAY_COUNT + (p.restCount || 0) * WEIGHTS.REST_COUNT;
  });

  // 取前 8 名作为候选池
  availablePlayers.sort((a, b) => b._priorityScore - a._priorityScore);
  const pool = availablePlayers.slice(0, 8);

  let bestMatch = null;
  let bestScore = -Infinity;

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
            
            const score = evaluateMatchup(t1, t2, hist); // 移除 maxGames 参数传递
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
  
  // 生成让分提示
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