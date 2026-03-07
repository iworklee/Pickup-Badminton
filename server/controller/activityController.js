const { Activity, ActivityPlayer, CourtMatch, MatchResult } = require("../model/db");
const { uuid } = require("../model/db");
const activityService = require("../service/activityService");
const { computeNextMatch } = require("../utils/scheduler");
const { broadcastLive } = require("../ws");

async function create(req, res) {
  try {
    const { title, date, courtCount, mode, handicapRules, players: initialPlayers } = req.body;
    const id = uuid();
    await Activity.create({
      id,
      title: title || "未命名活动",
      date: date || new Date().toISOString().slice(0, 10),
      courtCount: Math.max(1, parseInt(courtCount, 10) || 1),
      mode: mode === "fixed" ? "fixed" : "dynamic",
      handicapRules: Array.isArray(handicapRules) ? handicapRules : [],
      status: "draft",
    });
    const players = Array.isArray(initialPlayers) ? initialPlayers : [];
    for (const p of players) {
      if (p.name && (p.gender === "M" || p.gender === "F")) {
        await ActivityPlayer.create({
          id: uuid(),
          activityId: id,
          name: String(p.name).trim(),
          gender: p.gender,
          status: "active",
        });
      }
    }
    const state = await activityService.getLiveState(id);
    res.json({ code: 0, data: state });
  } catch (e) {
    res.status(500).json({ code: -1, message: e.message });
  }
}

async function getLive(req, res) {
  try {
    const state = await activityService.getLiveState(req.params.id);
    if (!state) return res.status(404).json({ code: -1, message: "活动不存在" });
    res.json({ code: 0, data: state });
  } catch (e) {
    res.status(500).json({ code: -1, message: e.message });
  }
}

async function start(req, res) {
  try {
    const { id } = req.params;
    const activity = await Activity.findByPk(id);
    if (!activity) return res.status(404).json({ code: -1, message: "活动不存在" });
    if (activity.status !== "draft") return res.status(400).json({ code: -1, message: "活动已开始或已结束" });
    await activity.update({ status: "live" });
    const players = await ActivityPlayer.findAll({ where: { activityId: id, status: "active" } });
    const playerList = players.map((p) => p.toJSON());
    const courtCount = activity.courtCount || 1;
    if (activity.mode === "dynamic" && playerList.length >= 4) {
      for (let c = 0; c < courtCount; c++) {
        const existing = await CourtMatch.findAll({ where: { activityId: id, courtIndex: c } });
        if (existing.length > 0) continue;
        const courtMatches = await CourtMatch.findAll({ where: { activityId: id } });
        const matchResults = await MatchResult.findAll({ where: { activityId: id } });
        const next = computeNextMatch(playerList, courtMatches.map((m) => m.toJSON()), matchResults.map((r) => r.toJSON()), activity.handicapRules || []);
        if (next) {
          await CourtMatch.create({
            id: uuid(),
            activityId: id,
            courtIndex: c,
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
      }
    }
    const state = await activityService.getLiveState(id);
    broadcastLive(id, { type: "live", data: state });
    res.json({ code: 0, data: state });
  } catch (e) {
    res.status(500).json({ code: -1, message: e.message });
  }
}

async function addPlayer(req, res) {
  try {
    const { id } = req.params;
    const { name, gender } = req.body;
    const activity = await Activity.findByPk(id);
    if (!activity) return res.status(404).json({ code: -1, message: "活动不存在" });
    if (activity.status !== "live" && activity.status !== "draft") return res.status(400).json({ code: -1, message: "活动已结束" });
    if (!name || (gender !== "M" && gender !== "F")) return res.status(400).json({ code: -1, message: "姓名和性别必填" });
    const player = await ActivityPlayer.create({
      id: uuid(),
      activityId: id,
      name: String(name).trim(),
      gender,
      status: "active",
    });
    const state = await activityService.getLiveState(id);
    broadcastLive(id, { type: "live", data: state });
    res.json({ code: 0, data: player.toJSON() });
  } catch (e) {
    res.status(500).json({ code: -1, message: e.message });
  }
}

async function updatePlayer(req, res) {
  try {
    const { id, playerId } = req.params;
    const { status } = req.body;
    const activity = await Activity.findByPk(id);
    if (!activity) return res.status(404).json({ code: -1, message: "活动不存在" });
    const player = await ActivityPlayer.findOne({ where: { activityId: id, id: playerId } });
    if (!player) return res.status(404).json({ code: -1, message: "选手不存在" });
    if (status === "left") await player.update({ status: "left" });
    const state = await activityService.getLiveState(id);
    broadcastLive(id, { type: "live", data: state });
    res.json({ code: 0, data: player.toJSON() });
  } catch (e) {
    res.status(500).json({ code: -1, message: e.message });
  }
}

async function submitScore(req, res) {
  try {
    const state = await activityService.submitCourtScore(
      req.params.id,
      req.params.courtIndex,
      req.body.scoreA,
      req.body.scoreB,
      broadcastLive
    );
    res.json({ code: 0, data: state });
  } catch (e) {
    res.status(400).json({ code: -1, message: e.message });
  }
}

async function endCourt(req, res) {
  try {
    const state = await activityService.submitCourtScore(
      req.params.id,
      req.params.courtIndex,
      0,
      0,
      broadcastLive
    );
    res.json({ code: 0, data: state });
  } catch (e) {
    res.status(400).json({ code: -1, message: e.message });
  }
}

async function updateResult(req, res) {
  try {
    const { id, resultId } = req.params;
    const { scoreA, scoreB } = req.body;
    const activity = await Activity.findByPk(id);
    if (!activity) return res.status(404).json({ code: -1, message: "活动不存在" });
    if (activity.status !== "live") return res.status(400).json({ code: -1, message: "仅进行中活动可修改比分" });
    const result = await MatchResult.findOne({ where: { id: resultId, activityId: id } });
    if (!result) return res.status(404).json({ code: -1, message: "该场记录不存在" });
    const sA = parseInt(scoreA, 10);
    const sB = parseInt(scoreB, 10);
    if (Number.isNaN(sA) || Number.isNaN(sB) || sA < 0 || sB < 0) return res.status(400).json({ code: -1, message: "比分无效" });
    await result.update({ scoreA: sA, scoreB: sB });
    const state = await activityService.getLiveState(id);
    broadcastLive(id, { type: "live", data: state });
    res.json({ code: 0, data: state });
  } catch (e) {
    res.status(500).json({ code: -1, message: e.message });
  }
}

async function leaderboard(req, res) {
  try {
    const data = await activityService.getLeaderboard(req.params.id);
    if (!data) return res.status(404).json({ code: -1, message: "活动不存在" });
    res.json({ code: 0, data });
  } catch (e) {
    res.status(500).json({ code: -1, message: e.message });
  }
}

function wxOpenId(req, res) {
  if (req.headers["x-wx-source"]) res.send(req.headers["x-wx-openid"]);
}

module.exports = {
  create,
  getLive,
  start,
  addPlayer,
  updatePlayer,
  submitScore,
  endCourt,
  updateResult,
  leaderboard,
  wxOpenId,
};
