/**
 * 排阵算法 - Round Robin 轮转 + 评分优化
 *
 * 核心设计原则：
 * 1. Round Robin 强制约束：连续休息/上场次数超限时强制进/出候选池
 * 2. 评分优化：在满足约束的候选池中，用多维度评分挑选最优对阵
 * 3. 适用于任意人数（4人及以上），人数越多轮空人数越多，约束阈值自动调整
 *
 * 连续休息上限（MAX_CONSECUTIVE_REST）动态公式：
 *   - 每场 4 人上场，restPerRound = N - 4
 *   - 一个完整循环轮次 = ceil(N / 4)
 *   - 最大连续休息 = ceil(restPerRound / 4) + 1，最低保证为 1
 *
 * 连续上场上限（MAX_CONSECUTIVE_PLAY）动态公式：
 *   - 根据人数动态计算：ceil(4 / restPerRound) + 1，最低保证为 3
 *   - 例如 5 人局，restPerRound = 1，上限为 ceil(4/1) + 1 = 5 场
 */

const WEIGHTS = {
  PARTNER_REPEAT: -60,  // 搭档重复惩罚
  OPPONENT_REPEAT: -25, // 对手重复惩罚
  GENDER_BALANCE: 30,   // 性别阵容对等奖励
};

/**
 * 根据当前活跃人数动态计算最大允许连续上场场数
 * 防止人数较少时因强制休息导致无法凑齐 4 人
 */
function getMaxConsecutivePlay(totalActive) {
  if (totalActive <= 4) return 999; // 4人以下无需强制休息
  const restPerRound = totalActive - 4;
  // 计算理论上完成一轮休息所需的上场次数，+1 提供缓冲，最低不能小于 3
  return Math.max(3, Math.ceil(4 / restPerRound) + 1);
}

/**
 * 根据当前活跃人数动态计算最大允许连续休息场数
 * 确保在一个合理周期内每人都能轮到上场
 */
function getMaxConsecutiveRest(totalActive) {
  if (totalActive <= 4) return 0; // 恰好4人，不存在轮空
  const restPerRound = totalActive - 4;
  // 每4个休息位置才能轮到1人上场，+1 给一点宽松
  return Math.ceil(restPerRound / 4) + 1;
}

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
  const ensurePlayer = (pid) => {
    if (!history[pid]) history[pid] = { partners: {}, opponents: {} };
  };
  const addLink = (pid, dict, otherId) => {
    ensurePlayer(pid);
    dict[otherId] = (dict[otherId] || 0) + 1;
  };

  const applyMatch = (teamA, teamB) => {
    if (!teamA?.length || !teamB?.length) return;
    [...teamA, ...teamB].forEach(ensurePlayer);

    // 搭档关系（双向）
    for (let i = 0; i < teamA.length; i++) {
      for (let j = i + 1; j < teamA.length; j++) {
        addLink(teamA[i], history[teamA[i]].partners, teamA[j]);
        addLink(teamA[j], history[teamA[j]].partners, teamA[i]);
      }
    }
    // 对手关系（双向，单向遍历避免重复）
    teamA.forEach((a) => {
      teamB.forEach((b) => {
        addLink(a, history[a].opponents, b);
        addLink(b, history[b].opponents, a);
      });
    });
  };

  [...(matchResults || []), ...(courtMatches || [])].forEach((m) => {
    applyMatch(m.teamAPlayerIds || [], m.teamBPlayerIds || []);
  });

  return history;
}

function evaluateMatchup(t1, t2, hist) {
  let score = 0;
  const getHist = (id) => hist[id] || { partners: {}, opponents: {} };

  // 搭档重复惩罚
  const p1Partners = getHist(t1[0].id).partners;
  const p2Partners = getHist(t2[0].id).partners;
  if (p1Partners[t1[1].id]) score += WEIGHTS.PARTNER_REPEAT * p1Partners[t1[1].id];
  if (p2Partners[t2[1].id]) score += WEIGHTS.PARTNER_REPEAT * p2Partners[t2[1].id];

  // 对手重复惩罚（单向遍历，已涵盖 A-C, A-D, B-C, B-D 四条对阵线）
  t1.forEach((p1) => {
    const p1Opponents = getHist(p1.id).opponents;
    t2.forEach((p2) => {
      if (p1Opponents[p2.id]) {
        score += WEIGHTS.OPPONENT_REPEAT * p1Opponents[p2.id];
      }
    });
  });

  // 性别阵容对等奖励
  const getGenderStr = (team) => team.map((p) => p.gender).sort().join("");
  if (getGenderStr(t1) === getGenderStr(t2)) score += WEIGHTS.GENDER_BALANCE;

  // 随机微扰：打破同分僵局，同等条件下产生变化
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
  return (
    (sameSet(teamA, la) && sameSet(teamB, lb)) ||
    (sameSet(teamA, lb) && sameSet(teamB, la))
  );
}

/** 是否复用了上一场任意一方的搭档组合（同一对队友不连续打两场） */
function repeatsExcludedPartnership(teamAIds, teamBIds, excludeMatchup) {
  if (!excludeMatchup) return false;
  const exA = excludeMatchup.teamAPlayerIds || [];
  const exB = excludeMatchup.teamBPlayerIds || [];
  return (
    sameSet(teamAIds, exA) ||
    sameSet(teamAIds, exB) ||
    sameSet(teamBIds, exA) ||
    sameSet(teamBIds, exB)
  );
}

/**
 * Round Robin 约束分层：
 *
 * 第一层 - 强制上场（mustPlay）：
 *   连续休息 >= MAX_CONSECUTIVE_REST 的玩家必须进入本场
 *
 * 第二层 - 强制休息（mustRest）：
 *   连续上场 >= MAX_CONSECUTIVE_PLAY 的玩家必须本场休息
 *   （附带防死锁逻辑：若强制休息导致剩余人数不足 4 人，逐步释放 mustRest 玩家）
 *
 * 第三层 - 自由候选池：
 *   剩余玩家按出场次数（少的优先）+ 连续休息场数（久的优先）排序，
 *   填满 4 人所需的空位
 *
 * 若强制上场人数已 >= 4，直接从 mustPlay 中选最优4人对阵
 * 若强制上场人数 > 4，需从 mustPlay 中再筛选（仍按评分）
 */
function buildCandidatePool(availablePlayers, totalActive) {
  const maxRest = getMaxConsecutiveRest(totalActive);
  const maxPlay = getMaxConsecutivePlay(totalActive);

  const mustPlay = [];   // 连续休息过久，必须上场
  const mustRestPlayers = []; // 连续上场过久，尝试强制休息
  const free = [];       // 其余自由候选

  for (const p of availablePlayers) {
    const consRest = p.consecutiveRest || 0;
    const consPlay = p.consecutivePlay || 0;

    if (consPlay >= maxPlay) {
      mustRestPlayers.push(p);
    } else if (consRest >= maxRest && maxRest > 0) {
      mustPlay.push(p);
    } else {
      free.push(p);
    }
  }

  // 防死锁逻辑：如果必须上场的和自由的人加起来不够 4 个，只能把必须休息的人放出来
  // 按照 consecutivePlay 从小到大排序（优先放出刚才打得没那么久的人）
  while (mustPlay.length + free.length < 4 && mustRestPlayers.length > 0) {
    mustRestPlayers.sort((a, b) => (a.consecutivePlay || 0) - (b.consecutivePlay || 0));
    // 弹出一个上场次数最少的，加入自由池
    const releasedPlayer = mustRestPlayers.shift();
    free.push(releasedPlayer);
  }

  const mustRestSet = new Set(mustRestPlayers.map(p => p.id));

  // 过滤掉最终被确认强制休息的人
  const mustPlayFiltered = mustPlay.filter((p) => !mustRestSet.has(p.id));

  // 自由候选按优先级排序：出场少的优先，同等则连续休息久的优先
  const maxGames = Math.max(0, ...availablePlayers.map((p) => p.playCount || 0));
  const priority = (p) =>
    (maxGames - (p.playCount || 0)) * 100 + (p.consecutiveRest || 0) * 10;

  const freeFiltered = free
    .filter((p) => !mustRestSet.has(p.id))
    .sort((a, b) => priority(b) - priority(a));

  // 合并候选池：mustPlay 优先，free 补位，总数够 4 即可
  const pool = [...mustPlayFiltered];
  for (const p of freeFiltered) {
    if (pool.length >= 8) break; // 候选池上限 8，枚举量可控
    pool.push(p);
  }

  return pool;
}

function computeNextMatch(players, courtMatches, matchResults, handicapRules, excludeMatchup) {
  const onCourtIds = getPlayerIdsOnCourt(courtMatches);
  const availablePlayers = (players || []).filter(
    (p) => p.status === "active" && !onCourtIds.has(p.id)
  );

  if (availablePlayers.length < 4) return null;

  // totalActive：所有 active 玩家数（含在场的），用于动态计算轮空阈值
  const totalActive = (players || []).filter((p) => p.status === "active").length;

  const pool = buildCandidatePool(availablePlayers, totalActive);

  if (pool.length < 4) return null;

  const hist = buildHistory(matchResults, courtMatches);

  let bestMatch = null;
  let bestScore = -Infinity;

  // 枚举候选池中所有 C(n,4) × 3 种对阵方式
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
            if (excludeMatchup && repeatsExcludedPartnership(t1Ids, t2Ids, excludeMatchup)) continue;

            const score = evaluateMatchup(t1, t2, hist);
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
    if (name.includes("男双") && name.includes("混双")) {
      if (aM === 2 && bM === 1) give = -(rule.points || 0);
      else if (bM === 2 && aM === 1) give = rule.points || 0;
    }
    if (give !== 0) {
      return give > 0 ? `B 队需让 ${give} 分` : `A 队需让 ${-give} 分`;
    }
  }
  return "";
}

module.exports = {
  computeNextMatch,
  getPlayerIdsOnCourt,
  isSameMatchup,
};
