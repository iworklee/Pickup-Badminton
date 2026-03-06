const api = require("../../utils/api");

Page({
  data: {
    id: "",
    data: null,
    refreshing: false,
  },

  onLoad(options) {
    const id = options.id || "";
    if (!id) {
      wx.showToast({ title: "缺少活动ID", icon: "none" });
      return;
    }
    this.setData({ id });
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  async load() {
    this.setData({ refreshing: true });
    try {
      const raw = await api.getLeaderboard(this.data.id);
      const leaderboard = (raw.leaderboard || []).map((p) => ({
        ...p,
        winRateText: (p.winRate * 100).toFixed(0),
        pointDiffText: (p.pointDiff >= 0 ? "+" : "") + p.pointDiff,
      }));
      const partnerWins = (raw.partnerWins || []).map((pw) => ({
        ...pw,
        winRateText: (pw.winRate * 100).toFixed(0),
      }));
      this.setData({ data: { leaderboard, partnerWins }, refreshing: false });
    } catch (e) {
      wx.showToast({ title: e.message || "加载失败", icon: "none" });
      this.setData({ refreshing: false });
    }
  },

  rankClass(i) {
    if (i === 0) return "rank-1";
    if (i === 1) return "rank-2";
    if (i === 2) return "rank-3";
    return "";
  },
});
