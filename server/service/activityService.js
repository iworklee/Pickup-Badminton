const { Activity, ActivityPlayer, CourtMatch, MatchResult } = require("../model/db");
const { uuid } = require("../model/db");
const { computeNextMatch, isSameMatchup } = require("../utils/scheduler");

function distinctMatchCount(matchResults) {
  const list = matchResults || [];
  let count = 0;
  for (let i = 0; i < list.length; i++) {
    const cur = list[i];
    let duplicate = false;
    for (let j = 0; j < i; j++) {
      if (isSameMatchup(cur.teamAPlayerIds, cur.teamBPlayerIds, list[j])) {
        duplicate = true;
        break;
      }
    }
    if (!duplicate) count += 1;
  }
  return count;
}

async function getLiveState(activityId) {
  const activity = await Activity.findByPk(activityId);
  if (!activity) return null;
  const players = await ActivityPlayer.findAll({ where: { activityId }, order: [["createdAt", "ASC"]] });
  const courtMatches = await CourtMatch.findAll({ where: { activityId }, order: [["courtIndex", "ASC"]] });
  const matchResults = await MatchResult.findAll({ where: { activityId }, order: [["createdAt", "ASC"]] });
  const playerList = players.map((p) => p.toJSON());
  const courtMatchesData = courtMatches.map((m) => m.toJSON());
  const matchResultsData = matchResults.map((r) => r.toJSON());
  const activePlayerCount = playerList.filter((p) => p.status === "active").length;
  const courtCount = activity.courtCount || 1;
  // Round Robin 完整循环场数：4人=3场，N人(N≥5)=N场
  const cycleGames = activePlayerCount === 4 ? 3 : Math.max(activePlayerCount, 1);

  // 自愈：场地空了但活动还在进行中，自动补排下一场
  if (activity.status === "live" && activity.mode === "dynamic" && activePlayerCount >= 4) {
    for (let c = 0; c < courtCount; c++) {
      const hasMatch = courtMatchesData.some((m) => m.courtIndex === c);
      if (!hasMatch) {
        const next = computeNextMatch(
          playerList,
          courtMatchesData,
          matchResultsData,
          activity.handicapRules || []
        );
        if (next) {
          await CourtMatch.create({
            id: uuid(),
            activityId,
            courtIndex: c,
            teamAPlayerIds: next.teamAPlayerIds,
            teamBPlayerIds: next.teamBPlayerIds,
            handicapTip: next.handicapTip,
            status: "playing",
          });
          courtMatchesData.push({
            courtIndex: c,
            teamAPlayerIds: next.teamAPlayerIds,
            teamBPlayerIds: next.teamBPlayerIds,
            handicapTip: next.handicapTip,
          });
          // 同步更新轮空玩家状态
          const newOnCourtIds = new Set([...next.teamAPlayerIds, ...next.teamBPlayerIds]);
          for (const p of players) {
            if (p.status === "active" && !newOnCourtIds.has(p.id)) {
              await p.update({
                restCount: (p.restCount || 0) + 1,
                consecutiveRest: (p.consecutiveRest || 0) + 1,
                consecutivePlay: 0,
              });
            }
          }
          // 刷新 playerList 以反映最新状态
          const refreshed = await ActivityPlayer.findAll({ where: { activityId }, order: [["createdAt", "ASC"]] });
          playerList.splice(0, playerList.length, ...refreshed.map((p) => p.toJSON()));
        }
      }
    }
  }

  // 计算候场场次列表
  // 推演思路：候场是"当前场结束后"的安排，每轮推演假设当前在场已结束，排下一场。
  // 当场地有比赛时：模拟当前场结束后的状态作为推演起点
  // 当场地为空时：直接用数据库真实状态作为推演起点（不做 consecutivePlay 清零）
  const upcomingMatches = [];
  if (activity.status === "live" && activity.mode === "dynamic" && activePlayerCount >= 4) {
    const hasCurrentMatch = courtMatchesData.length > 0;

    let simulatedResults = [
      ...matchResultsData,
      ...courtMatchesData.map((m) => ({ teamAPlayerIds: m.teamAPlayerIds, teamBPlayerIds: m.teamBPlayerIds })),
    ];
    let simulatedPlayers = playerList.map((p) => ({ ...p }));

    if (hasCurrentMatch) {
      // 有当前进行中比赛：模拟当前场结束后，所有人重新可用
      const currentOnCourtIds = new Set(courtMatchesData.flatMap((m) => [...(m.teamAPlayerIds || []), ...(m.teamBPlayerIds || [])]));
      simulatedPlayers = simulatedPlayers.map((p) => ({
        ...p,
        playCount: currentOnCourtIds.has(p.id) ? (p.playCount || 0) + 1 : p.playCount,
        restCount: currentOnCourtIds.has(p.id) ? 0 : (p.restCount || 0) + 1,
        // 上场者 consecutivePlay+1，休息者清零（本场结束后上场者连打记录+1）
        consecutivePlay: currentOnCourtIds.has(p.id) ? (p.consecutivePlay || 0) + 1 : 0,
        consecutiveRest: currentOnCourtIds.has(p.id) ? 0 : (p.consecutiveRest || 0) + 1,
      }));
    }
    // 场地为空时直接用 playerList 真实值，不做任何清零

    // 候场只推演本轮循环剩余场数（当前在场的这场结束后还剩几场）
    const playedSoFar = matchResultsData.length + (courtMatchesData.length > 0 ? 1 : 0);
    const playedInCycleNow = playedSoFar % (cycleGames || 1);
    const maxUpcoming = cycleGames - playedInCycleNow;

    for (let round = 0; round < maxUpcoming; round++) {
      const excludeMatchup = round === 0 && hasCurrentMatch
        ? { teamAPlayerIds: courtMatchesData[0].teamAPlayerIds, teamBPlayerIds: courtMatchesData[0].teamBPlayerIds }
        : upcomingMatches.length > 0
          ? { teamAPlayerIds: upcomingMatches[upcomingMatches.length - 1].teamAPlayerIds, teamBPlayerIds: upcomingMatches[upcomingMatches.length - 1].teamBPlayerIds }
          : null;

      const next = computeNextMatch(
        simulatedPlayers,
        [],
        simulatedResults,
        activity.handicapRules || [],
        excludeMatchup
      );
      if (!next) break;

      upcomingMatches.push({
        teamAPlayerIds: next.teamAPlayerIds,
        teamBPlayerIds: next.teamBPlayerIds,
        handicapTip: next.handicapTip,
        isPreview: round === 0 && hasCurrentMatch,
      });

      simulatedResults = [
        ...simulatedResults,
        { teamAPlayerIds: next.teamAPlayerIds, teamBPlayerIds: next.teamBPlayerIds },
      ];
      const onCourtIds = new Set([...next.teamAPlayerIds, ...next.teamBPlayerIds]);
      simulatedPlayers = simulatedPlayers.map((p) => ({
        ...p,
        playCount: onCourtIds.has(p.id) ? (p.playCount || 0) + 1 : p.playCount,
        restCount: onCourtIds.has(p.id) ? 0 : (p.restCount || 0) + 1,
        consecutivePlay: onCourtIds.has(p.id) ? (p.consecutivePlay || 0) + 1 : 0,
        consecutiveRest: onCourtIds.has(p.id) ? 0 : (p.consecutiveRest || 0) + 1,
      }));
    }
  }

  // 兼容旧字段 nextUp（取候场第一场）
  const nextUp = upcomingMatches.length > 0
    ? { teamAPlayerIds: upcomingMatches[0].teamAPlayerIds, teamBPlayerIds: upcomingMatches[0].teamBPlayerIds, handicapTip: upcomingMatches[0].handicapTip, nextUpIsPreview: upcomingMatches[0].isPreview }
    : null;

  const recentResults = [...matchResults].reverse().slice(0, 5).map((r) => ({
    id: r.id,
    courtIndex: r.courtIndex,
    teamAPlayerIds: r.teamAPlayerIds,
    teamBPlayerIds: r.teamBPlayerIds,
    scoreA: r.scoreA,
    scoreB: r.scoreB,
  }));
  const playedCount = distinctMatchCount(matchResults);
  const totalMatchesEstimate = courtCount * cycleGames;
  const remainingMatchesEstimate = Math.max(0, totalMatchesEstimate - playedCount);
  return {
    activity: activity.toJSON(),
    players: playerList,
    courtMatches: courtMatches.map((m) => m.toJSON()),
    nextUp,
    upcomingMatches,
    recentResults,
    matchStats: { totalMatchesEstimate, playedCount, remainingMatchesEstimate, activePlayerCount, courtCount },
  };
}

async function submitCourtScore(activityId, courtIndex, scoreA, scoreB, broadcastLive) {
  const id = activityId;
  const ci = parseInt(courtIndex, 10);
  const activity = await Activity.findByPk(id);
  if (!activity) throw new Error("活动不存在");
  if (activity.status !== "live") throw new Error("活动未进行中");
  const courtMatch = await CourtMatch.findOne({ where: { activityId: id, courtIndex: ci } });
  if (!courtMatch) throw new Error("该场地无进行中比赛");
  const sA = parseInt(scoreA, 10);
  const sB = parseInt(scoreB, 10);
  if (Number.isNaN(sA) || Number.isNaN(sB)) throw new Error("比分无效");
  await MatchResult.create({
    id: uuid(),
    activityId: id,
    courtIndex: ci,
    teamAPlayerIds: courtMatch.teamAPlayerIds,
    teamBPlayerIds: courtMatch.teamBPlayerIds,
    scoreA: sA,
    scoreB: sB,
    handicapTip: courtMatch.handicapTip || "",
  });
  const justPlayedIds = new Set([...(courtMatch.teamAPlayerIds || []), ...(courtMatch.teamBPlayerIds || [])]);
  await courtMatch.destroy();

  // 第一步：只更新刚打完的上场玩家
  for (const pid of justPlayedIds) {
    const p = await ActivityPlayer.findByPk(pid);
    if (p) {
      await p.update({
        playCount: (p.playCount || 0) + 1,
        restCount: 0,
        consecutivePlay: (p.consecutivePlay || 0) + 1,
        consecutiveRest: 0,
      });
    }
  }

  // 第二步：用最新选手状态排下一场（此时轮空玩家的 consecutiveRest 是准确的旧值）
  const players = await ActivityPlayer.findAll({ where: { activityId: id } });
  const playerList = players.map((p) => p.toJSON());
  const courtMatches = await CourtMatch.findAll({ where: { activityId: id } });
  const matchResults = await MatchResult.findAll({ where: { activityId: id } });
  const next = activity.mode === "dynamic"
    ? computeNextMatch(playerList, courtMatches.map((m) => m.toJSON()), matchResults.map((r) => r.toJSON()), activity.handicapRules || [])
    : null;

  if (next) {
    await CourtMatch.create({
      id: uuid(),
      activityId: id,
      courtIndex: ci,
      teamAPlayerIds: next.teamAPlayerIds,
      teamBPlayerIds: next.teamBPlayerIds,
      handicapTip: next.handicapTip,
      status: "playing",
    });
  }

  // 第三步：更新轮空玩家（未参与刚结束那场、且未进入下一场的 active 玩家）
  const newOnCourtIds = next ? new Set([...next.teamAPlayerIds, ...next.teamBPlayerIds]) : new Set();
  for (const p of players) {
    if (p.status === "active" && !justPlayedIds.has(p.id) && !newOnCourtIds.has(p.id)) {
      await p.update({
        restCount: (p.restCount || 0) + 1,
        consecutiveRest: (p.consecutiveRest || 0) + 1,
        consecutivePlay: 0,
      });
    }
  }
  const state = await getLiveState(id);
  if (broadcastLive) broadcastLive(id, { type: "live", data: state });
  return state;
}

async function getLeaderboard(activityId) {
  const activity = await Activity.findByPk(activityId);
  if (!activity) return null;
  const players = await ActivityPlayer.findAll({ where: { activityId } });
  const results = await MatchResult.findAll({ where: { activityId } });
  const playerById = {};
  players.forEach((p) => { playerById[p.id] = { id: p.id, name: p.name, gender: p.gender, playCount: 0, wins: 0, totalScoreFor: 0, totalScoreAgainst: 0, partners: {} }; });
  for (const r of results) {
    const teamA = r.teamAPlayerIds || [];
    const teamB = r.teamBPlayerIds || [];
    const scoreA = r.scoreA || 0;
    const scoreB = r.scoreB || 0;
    const aWon = scoreA > scoreB;
    for (const id of teamA) {
      if (playerById[id]) {
        playerById[id].playCount++;
        if (aWon) playerById[id].wins++;
        playerById[id].totalScoreFor += scoreA;
        playerById[id].totalScoreAgainst += scoreB;
        const partner = teamA.find((x) => x !== id);
        if (partner) playerById[id].partners[partner] = (playerById[id].partners[partner] || 0) + (aWon ? 1 : 0);
      }
    }
    for (const id of teamB) {
      if (playerById[id]) {
        playerById[id].playCount++;
        if (!aWon) playerById[id].wins++;
        playerById[id].totalScoreFor += scoreB;
        playerById[id].totalScoreAgainst += scoreA;
        const partner = teamB.find((x) => x !== id);
        if (partner) playerById[id].partners[partner] = (playerById[id].partners[partner] || 0) + (!aWon ? 1 : 0);
      }
    }
  }
  const leaderboard = Object.values(playerById)
    .filter((p) => p.playCount > 0)
    .map((p) => ({
      ...p,
      winRate: p.playCount ? (p.wins / p.playCount) : 0,
      pointDiff: (p.totalScoreFor || 0) - (p.totalScoreAgainst || 0),
      avgPointDiff: p.playCount ? ((p.totalScoreFor || 0) - (p.totalScoreAgainst || 0)) / p.playCount : 0,
    }))
    .sort((a, b) => b.winRate - a.winRate || b.avgPointDiff - a.avgPointDiff);
  const partnerWins = [];
  const seen = new Set();
  for (const p of Object.values(playerById)) {
    for (const [partnerId, wins] of Object.entries(p.partners || {})) {
      const key = [p.id, partnerId].sort().join("-");
      if (seen.has(key)) continue;
      seen.add(key);
      const total = (results.filter((r) => {
        const a = (r.teamAPlayerIds || []).includes(p.id) && (r.teamAPlayerIds || []).includes(partnerId);
        const b = (r.teamBPlayerIds || []).includes(p.id) && (r.teamBPlayerIds || []).includes(partnerId);
        return a || b;
      })).length;
      if (total > 0) partnerWins.push({ playerId1: p.id, playerId2: partnerId, name1: playerById[p.id].name, name2: playerById[partnerId].name, wins, total, winRate: wins / total });
    }
  }
  partnerWins.sort((a, b) => b.winRate - a.winRate);
  return { leaderboard, partnerWins };
}

module.exports = {
  getLiveState,
  submitCourtScore,
  getLeaderboard,
};
