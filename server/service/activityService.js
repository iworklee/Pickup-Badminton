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

  // 计算所有候场场次列表
  const upcomingMatches = [];
  if (activity.status === "live" && activity.mode === "dynamic" && activePlayerCount >= 4) {
    let simulatedCourtMatches = [...courtMatchesData];
    let simulatedResults = [...matchResultsData];
    // 深拷贝选手状态，用于推演 playCount/restCount
    let simulatedPlayers = playerList.map((p) => ({ ...p }));
    const MAX_UPCOMING = 10;

    for (let round = 0; round < MAX_UPCOMING; round++) {
      const hasOnCourt = simulatedCourtMatches.length > 0;
      // 第一场需排除当前在场的搭档组合（避免同组连续打两场）
      const excludeMatchup = round === 0 && hasOnCourt && simulatedCourtMatches[0]
        ? { teamAPlayerIds: simulatedCourtMatches[0].teamAPlayerIds, teamBPlayerIds: simulatedCourtMatches[0].teamBPlayerIds }
        : null;

      const next = computeNextMatch(
        simulatedPlayers,
        simulatedCourtMatches,
        simulatedResults,
        activity.handicapRules || [],
        excludeMatchup
      );
      if (!next) break;

      upcomingMatches.push({
        teamAPlayerIds: next.teamAPlayerIds,
        teamBPlayerIds: next.teamBPlayerIds,
        handicapTip: next.handicapTip,
        isPreview: round === 0 && hasOnCourt,
      });

      // 推演：将这场加入模拟历史，更新模拟选手状态
      simulatedResults = [
        ...simulatedResults,
        { teamAPlayerIds: next.teamAPlayerIds, teamBPlayerIds: next.teamBPlayerIds },
      ];
      const onCourtIds = new Set([...next.teamAPlayerIds, ...next.teamBPlayerIds]);
      simulatedPlayers = simulatedPlayers.map((p) => ({
        ...p,
        playCount: onCourtIds.has(p.id) ? (p.playCount || 0) + 1 : p.playCount,
        restCount: onCourtIds.has(p.id) ? 0 : (p.restCount || 0) + 1,
      }));
      // 模拟在场状态不叠加（候场推演基于轮换，不维护多场地并行）
      simulatedCourtMatches = [{ teamAPlayerIds: next.teamAPlayerIds, teamBPlayerIds: next.teamBPlayerIds }];
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
  const courtCount = activity.courtCount || 1;
  const totalMatchesEstimate = courtCount * Math.ceil(activePlayerCount / 4) * 2;
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
  const allPlayerIds = [...(courtMatch.teamAPlayerIds || []), ...(courtMatch.teamBPlayerIds || [])];
  for (const pid of allPlayerIds) {
    const p = await ActivityPlayer.findByPk(pid);
    if (p) await p.update({ playCount: (p.playCount || 0) + 1, restCount: 0 });
  }
  await courtMatch.destroy();
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
    const onCourt = new Set([...next.teamAPlayerIds, ...next.teamBPlayerIds]);
    for (const p of players) {
      await p.update({ restCount: onCourt.has(p.id) ? 0 : (p.restCount || 0) + 1 });
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
