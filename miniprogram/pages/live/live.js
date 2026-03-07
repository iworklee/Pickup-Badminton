const api = require("../../utils/api");
const { wsLive } = require("../../utils/ws");
const { addRecent } = require("../../utils/recentActivities");

function teamNames(ids, playersById) {
  if (!ids || !ids.length || !playersById) return "-";
  return ids.map((id) => playersById[id]?.name || "?").join(" / ");
}

function enrichState(state) {
  if (!state || !state.players) return state;
  const map = {};
  state.players.forEach((p) => (map[p.id] = p));
  const names = (ids) => teamNames(ids, map);
  const courtMatches = (state.courtMatches || []).map((m) => ({
    ...m,
    teamANames: names(m.teamAPlayerIds),
    teamBNames: names(m.teamBPlayerIds),
  }));
  const nextUp = state.nextUp
    ? { ...state.nextUp, teamANames: names(state.nextUp.teamAPlayerIds), teamBNames: names(state.nextUp.teamBPlayerIds) }
    : null;
  const recentResults = (state.recentResults || []).map((r) => ({
    ...r,
    teamANames: names(r.teamAPlayerIds),
    teamBNames: names(r.teamBPlayerIds),
  }));
  return { ...state, courtMatches, nextUp, recentResults };
}

Page({
  data: {
    id: "",
    state: null,
    refreshing: false,
    showAddPlayer: false,
    showScore: false,
    showEditScore: false,
    showLeave: false,
    newPlayer: { name: "", gender: "M" },
    scoreForm: { scoreA: "", scoreB: "" },
    editScoreForm: { scoreA: "", scoreB: "" },
    currentCourt: null,
    editingResult: null,
  },

  socket: null,

  onLoad(options) {
    const id = options.id || "";
    if (!id) {
      wx.showToast({ title: "缺少活动ID", icon: "none" });
      return;
    }
    this.setData({ id });
    this.fetchLive();
    this.socket = wsLive(id, (data) => this.setData({ state: enrichState(data) }));
  },

  onUnload() {
    if (this.socket && this.socket.close) this.socket.close();
  },

  onPullDownRefresh() {
    this.fetchLive().then(() => wx.stopPullDownRefresh());
  },

  async fetchLive() {
    try {
      const raw = await api.getLive(this.data.id);
      this.setData({ state: enrichState(raw) });
      if (raw && raw.activity) addRecent({ id: raw.activity.id, title: raw.activity.title });
    } catch (e) {
      wx.showToast({ title: e.message || "加载失败", icon: "none" });
    }
  },

  async onRefresh() {
    this.setData({ refreshing: true });
    await this.fetchLive();
    this.setData({ refreshing: false });
  },

  goBack() {
    wx.redirectTo({ url: "/pages/create/create" });
  },

  goLeaderboard() {
    wx.navigateTo({ url: "/pages/leaderboard/leaderboard?id=" + this.data.id });
  },

  openScore(e) {
    const index = parseInt(e.currentTarget.dataset.index, 10);
    const m = (this.data.state?.courtMatches || [])[index];
    if (!m) return;
    this.setData({
      currentCourt: m,
      scoreForm: { scoreA: "", scoreB: "" },
      showScore: true,
    });
  },

  onScoreAInput(e) {
    const raw = (e.detail.value || "").replace(/\D/g, "").slice(0, 2);
    this.setData({ "scoreForm.scoreA": raw });
  },

  onScoreBInput(e) {
    const raw = (e.detail.value || "").replace(/\D/g, "").slice(0, 2);
    this.setData({ "scoreForm.scoreB": raw });
  },

  async submitScore() {
    const court = this.data.currentCourt;
    if (!court) return;
    const scoreA = parseInt(this.data.scoreForm.scoreA, 10) || 0;
    const scoreB = parseInt(this.data.scoreForm.scoreB, 10) || 0;
    try {
      const raw = await api.submitScore(this.data.id, court.courtIndex, scoreA, scoreB);
      this.setData({ state: enrichState(raw), showScore: false });
      wx.showToast({ title: "已录入", icon: "success" });
    } catch (e) {
      wx.showToast({ title: e.message || "提交失败", icon: "none" });
    }
  },

  async endCourt(e) {
    const index = parseInt(e.currentTarget.dataset.index, 10);
    const m = (this.data.state?.courtMatches || [])[index];
    if (!m) return;
    try {
      const raw = await api.endCourt(this.data.id, m.courtIndex);
      this.setData({ state: enrichState(raw) });
      wx.showToast({ title: "已结束本局", icon: "success" });
    } catch (e) {
      wx.showToast({ title: e.message || "操作失败", icon: "none" });
    }
  },

  openEditResult(e) {
    const index = parseInt(e.currentTarget.dataset.index, 10);
    const r = (this.data.state?.recentResults || [])[index];
    if (!r || !r.id) return;
    this.setData({
      editingResult: r,
      editScoreForm: { scoreA: String(r.scoreA ?? 0), scoreB: String(r.scoreB ?? 0) },
      showEditScore: true,
    });
  },

  onEditScoreAInput(e) {
    const raw = (e.detail.value || "").replace(/\D/g, "").slice(0, 2);
    this.setData({ "editScoreForm.scoreA": raw });
  },

  onEditScoreBInput(e) {
    const raw = (e.detail.value || "").replace(/\D/g, "").slice(0, 2);
    this.setData({ "editScoreForm.scoreB": raw });
  },

  async submitEditScore() {
    const r = this.data.editingResult;
    if (!r || !r.id) return;
    const scoreA = parseInt(this.data.editScoreForm.scoreA, 10) || 0;
    const scoreB = parseInt(this.data.editScoreForm.scoreB, 10) || 0;
    try {
      const raw = await api.updateResult(this.data.id, r.id, scoreA, scoreB);
      this.setData({ state: enrichState(raw), showEditScore: false, editingResult: null });
      wx.showToast({ title: "已修改", icon: "success" });
    } catch (e) {
      wx.showToast({ title: e.message || "修改失败", icon: "none" });
    }
  },

  onNewPlayerName(e) {
    this.setData({ "newPlayer.name": e.detail.value || "" });
  },

  onNewPlayerGender(e) {
    this.setData({ "newPlayer.gender": e.detail.value || "M" });
  },

  async addPlayer() {
    const name = (this.data.newPlayer?.name || "").trim();
    if (!name) {
      wx.showToast({ title: "请输入姓名", icon: "none" });
      return;
    }
    try {
      await api.addPlayer(this.data.id, name, this.data.newPlayer.gender || "M");
      const raw = await api.getLive(this.data.id);
      this.setData({ state: enrichState(raw), showAddPlayer: false, newPlayer: { name: "", gender: "M" } });
      wx.showToast({ title: "已加入候补", icon: "success" });
    } catch (e) {
      wx.showToast({ title: e.message || "添加失败", icon: "none" });
    }
  },

  async setLeave(e) {
    const playerId = e.currentTarget.dataset.playerId;
    const playerName = e.currentTarget.dataset.playerName || "";
    if (!playerId) return;
    try {
      await api.setPlayerLeft(this.data.id, playerId);
      const raw = await api.getLive(this.data.id);
      this.setData({ state: enrichState(raw), showLeave: false });
      wx.showToast({ title: playerName + " 已设为离场", icon: "success" });
    } catch (e) {
      wx.showToast({ title: e.message || "操作失败", icon: "none" });
    }
  },

  showAdd() {
    this.setData({ showAddPlayer: true });
  },

  showLeaveList() {
    this.setData({ showLeave: true });
  },

  preventClose() {
    // 阻止点击弹窗内容时冒泡到 mask，避免误关
  },

  closeAdd() {
    this.setData({ showAddPlayer: false });
  },

  closeScore() {
    this.setData({ showScore: false });
  },

  closeEditScore() {
    this.setData({ showEditScore: false, editingResult: null });
  },

  closeLeave() {
    this.setData({ showLeave: false });
  },
});
