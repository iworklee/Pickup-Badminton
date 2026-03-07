const api = require("../../utils/api");
const { addRecent } = require("../../utils/recentActivities");

Page({
  data: {
    title: "羽毛球活动",
    date: "",
    courtCount: 1,
    mode: "dynamic",
    players: [{ name: "", gender: "M" }],
    pasteText: "",
    handicapPoints: "",
    loading: false,
  },

  onLoad() {
    const d = new Date();
    const date = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    this.setData({ date });
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value || "羽毛球活动" });
  },

  onDateChange(e) {
    this.setData({ date: e.detail.value });
  },

  onCourtChange(e) {
    const val = e.currentTarget.dataset.val != null ? e.currentTarget.dataset.val : e.detail;
    const v = Math.max(1, Math.min(10, parseInt(val, 10) || 1));
    this.setData({ courtCount: v });
  },

  onModeChange(e) {
    this.setData({ mode: e.detail.value || "dynamic" });
  },

  onPasteInput(e) {
    this.setData({ pasteText: e.detail.value || "" });
  },

  parsePaste() {
    const text = (this.data.pasteText || "").trim();
    const lines = text.split(/\n/).map((s) => s.replace(/^\d+[\.\s]+/, "").trim()).filter(Boolean);
    const players = [];
    for (const line of lines) {
      const parts = line.split(/\s+/);
      const name = (parts[0] || "").trim();
      const g = (parts[1] || "").replace(/[男女]/g, (c) => (c === "男" ? "M" : "F"));
      if (name && (g === "M" || g === "F")) players.push({ name, gender: g });
    }
    if (players.length) {
      this.setData({ players });
      wx.showToast({ title: "已解析 " + players.length + " 人", icon: "none" });
    } else {
      wx.showToast({ title: "未能解析到有效选手", icon: "none" });
    }
  },

  addPlayer() {
    const players = [...(this.data.players || []), { name: "", gender: "M" }];
    this.setData({ players });
  },

  onPlayerNameInput(e) {
    const i = parseInt(e.currentTarget.dataset.i, 10);
    const players = [...this.data.players];
    players[i] = { ...players[i], name: e.detail.value || "" };
    this.setData({ players });
  },

  onPlayerGenderChange(e) {
    const i = parseInt(e.currentTarget.dataset.i, 10);
    const players = [...this.data.players];
    players[i] = { ...players[i], gender: e.detail.value || "M" };
    this.setData({ players });
  },

  deletePlayer(e) {
    const i = parseInt(e.currentTarget.dataset.i, 10);
    const players = this.data.players.filter((_, idx) => idx !== i);
    this.setData({ players: players.length ? players : [{ name: "", gender: "M" }] });
  },

  onHandicapInput(e) {
    this.setData({ handicapPoints: e.detail.value || "" });
  },

  validPlayerCount() {
    return (this.data.players || []).filter(
      (p) => p.name && (p.gender === "M" || p.gender === "F")
    ).length;
  },

  async submit() {
    const valid = this.validPlayerCount();
    if (valid < 4) {
      wx.showToast({ title: "至少需要 4 名选手", icon: "none" });
      return;
    }
    const courtCount = Math.max(1, parseInt(this.data.courtCount, 10) || 1);
    const totalEst = courtCount * Math.ceil(valid / 4) * 2;
    const ok = await new Promise((resolve) => {
      wx.showModal({
        title: "开始活动",
        content: `当前选手 ${valid} 人，场地 ${courtCount} 个。\n预计总场数约 ${totalEst} 场。\n确定开始？`,
        confirmText: "确定开始",
        cancelText: "取消",
        success: (res) => resolve(!!res.confirm),
      });
    });
    if (!ok) return;

    this.setData({ loading: true });
    try {
      const handicapRules = [];
      const pts = parseInt(this.data.handicapPoints, 10);
      if (!isNaN(pts) && pts > 0) handicapRules.push({ name: "男双让混双", points: pts });

      const players = (this.data.players || []).filter(
        (p) => p.name && (p.gender === "M" || p.gender === "F")
      );
      const data = await api.createActivity({
        title: this.data.title || "未命名活动",
        date: this.data.date,
        courtCount,
        mode: this.data.mode,
        handicapRules,
        players,
      });
      await api.startActivity(data.activity.id);
      addRecent({ id: data.activity.id, title: data.activity.title });
      wx.showToast({ title: "活动已开始", icon: "success" });
      wx.redirectTo({ url: "/pages/live/live?id=" + data.activity.id });
    } catch (e) {
      wx.showToast({ title: e.message || "创建失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },
});
