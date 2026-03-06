const path = require("path");
const fs = require("fs");
const http = require("http");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { WebSocketServer } = require("ws");
const { init: initDB, uuid, Activity, ActivityPlayer, CourtMatch, MatchResult } = require("./db");
const { computeNextMatch, getHandicapTip } = require("./scheduler");

const logger = morgan("tiny");
const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cors());
app.use(logger);

const wsClients = new Map();

async function getLiveState(activityId) {
  const activity = await Activity.findByPk(activityId);
  if (!activity) return null;
  const players = await ActivityPlayer.findAll({ where: { activityId }, order: [["createdAt", "ASC"]] });
  const courtMatches = await CourtMatch.findAll({ where: { activityId }, order: [["courtIndex", "ASC"]] });
  const matchResults = await MatchResult.findAll({ where: { activityId }, order: [["id", "ASC"]] });
  const playerList = players.map((p) => p.toJSON());
  const nextUp = activity.status === "live" && activity.mode === "dynamic"
    ? computeNextMatch(playerList, courtMatches.map((m) => m.toJSON()), matchResults.map((r) => r.toJSON()), activity.handicapRules || [])
    : null;
  return {
    activity: activity.toJSON(),
    players: playerList,
    courtMatches: courtMatches.map((m) => m.toJSON()),
    nextUp: nextUp ? { teamAPlayerIds: nextUp.teamAPlayerIds, teamBPlayerIds: nextUp.teamBPlayerIds, handicapTip: nextUp.handicapTip } : null,
  };
}

function broadcastLive(activityId, payload) {
  const room = wsClients.get(activityId);
  if (!room) return;
  const data = JSON.stringify(payload);
  room.forEach((ws) => { try { ws.send(data); } catch (e) {} });
}

const distIndex = path.join(__dirname, "dist", "index.html");
app.get("/", (req, res) => {
  if (fs.existsSync(distIndex)) return res.sendFile(distIndex);
  res.sendFile(path.join(__dirname, "index.html"));
});
app.use(express.static(path.join(__dirname, "dist")));

app.post("/api/activities", async (req, res) => {
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
    const state = await getLiveState(id);
    res.json({ code: 0, data: state });
  } catch (e) {
    res.status(500).json({ code: -1, message: e.message });
  }
});

app.get("/api/activities/:id", async (req, res) => {
  try {
    const state = await getLiveState(req.params.id);
    if (!state) return res.status(404).json({ code: -1, message: "活动不存在" });
    res.json({ code: 0, data: state });
  } catch (e) {
    res.status(500).json({ code: -1, message: e.message });
  }
});

app.get("/api/activities/:id/live", async (req, res) => {
  try {
    const state = await getLiveState(req.params.id);
    if (!state) return res.status(404).json({ code: -1, message: "活动不存在" });
    res.json({ code: 0, data: state });
  } catch (e) {
    res.status(500).json({ code: -1, message: e.message });
  }
});

app.post("/api/activities/:id/start", async (req, res) => {
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
          const handicapTip = getHandicapTip(next.teamAPlayerIds, next.teamBPlayerIds, Object.fromEntries(playerList.map((p) => [p.id, p])), activity.handicapRules || []);
          await CourtMatch.create({
            id: uuid(),
            activityId: id,
            courtIndex: c,
            teamAPlayerIds: next.teamAPlayerIds,
            teamBPlayerIds: next.teamBPlayerIds,
            handicapTip,
            status: "playing",
          });
          const onCourt = new Set([...next.teamAPlayerIds, ...next.teamBPlayerIds]);
          for (const p of players) {
            await p.update({ restCount: onCourt.has(p.id) ? 0 : (p.restCount || 0) + 1 });
          }
        }
      }
    }
    const state = await getLiveState(id);
    broadcastLive(id, { type: "live", data: state });
    res.json({ code: 0, data: state });
  } catch (e) {
    res.status(500).json({ code: -1, message: e.message });
  }
});

app.post("/api/activities/:id/players", async (req, res) => {
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
    const state = await getLiveState(id);
    broadcastLive(id, { type: "live", data: state });
    res.json({ code: 0, data: player.toJSON() });
  } catch (e) {
    res.status(500).json({ code: -1, message: e.message });
  }
});

app.patch("/api/activities/:id/players/:playerId", async (req, res) => {
  try {
    const { id, playerId } = req.params;
    const { status } = req.body;
    const activity = await Activity.findByPk(id);
    if (!activity) return res.status(404).json({ code: -1, message: "活动不存在" });
    const player = await ActivityPlayer.findOne({ where: { activityId: id, id: playerId } });
    if (!player) return res.status(404).json({ code: -1, message: "选手不存在" });
    if (status === "left") await player.update({ status: "left" });
    const state = await getLiveState(id);
    broadcastLive(id, { type: "live", data: state });
    res.json({ code: 0, data: player.toJSON() });
  } catch (e) {
    res.status(500).json({ code: -1, message: e.message });
  }
});

async function submitCourtScore(activityId, courtIndex, scoreA, scoreB) {
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
    const handicapTip = getHandicapTip(next.teamAPlayerIds, next.teamBPlayerIds, Object.fromEntries(playerList.map((p) => [p.id, p])), activity.handicapRules || []);
    await CourtMatch.create({
      id: uuid(),
      activityId: id,
      courtIndex: ci,
      teamAPlayerIds: next.teamAPlayerIds,
      teamBPlayerIds: next.teamBPlayerIds,
      handicapTip,
      status: "playing",
    });
    const onCourt = new Set([...next.teamAPlayerIds, ...next.teamBPlayerIds]);
    for (const p of players) {
      await p.update({ restCount: onCourt.has(p.id) ? 0 : (p.restCount || 0) + 1 });
    }
  }
  const state = await getLiveState(id);
  broadcastLive(id, { type: "live", data: state });
  return state;
}

app.post("/api/activities/:id/courts/:courtIndex/score", async (req, res) => {
  try {
    const state = await submitCourtScore(req.params.id, req.params.courtIndex, req.body.scoreA, req.body.scoreB);
    res.json({ code: 0, data: state });
  } catch (e) {
    res.status(400).json({ code: -1, message: e.message });
  }
});

app.post("/api/activities/:id/courts/:courtIndex/end", async (req, res) => {
  try {
    const state = await submitCourtScore(req.params.id, req.params.courtIndex, 0, 0);
    res.json({ code: 0, data: state });
  } catch (e) {
    res.status(400).json({ code: -1, message: e.message });
  }
});

app.get("/api/activities/:id/leaderboard", async (req, res) => {
  try {
    const activity = await Activity.findByPk(req.params.id);
    if (!activity) return res.status(404).json({ code: -1, message: "活动不存在" });
    const players = await ActivityPlayer.findAll({ where: { activityId: req.params.id } });
    const results = await MatchResult.findAll({ where: { activityId: req.params.id } });
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
    res.json({ code: 0, data: { leaderboard, partnerWins } });
  } catch (e) {
    res.status(500).json({ code: -1, message: e.message });
  }
});

app.get("/api/wx_openid", (req, res) => {
  if (req.headers["x-wx-source"]) res.send(req.headers["x-wx-openid"]);
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", (ws, req) => {
  const url = new URL(req.url || "", "http://localhost");
  const activityId = url.searchParams.get("activityId");
  if (!activityId) { ws.close(); return; }
  if (!wsClients.has(activityId)) wsClients.set(activityId, new Set());
  wsClients.get(activityId).add(ws);
  ws.on("close", () => {
    const room = wsClients.get(activityId);
    if (room) { room.delete(ws); if (room.size === 0) wsClients.delete(activityId); }
  });
});

const port = process.env.PORT || 80;
async function bootstrap() {
  await initDB();
  server.listen(port, () => console.log("启动成功", port));
}
bootstrap();
