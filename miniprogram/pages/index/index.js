const { getRecent } = require("../../utils/recentActivities");

Page({
  data: {
    activityId: "",
    recentList: [],
  },

  onLoad() {},

  onShow() {
    this.setData({ recentList: getRecent() });
  },

  onActivityIdInput(e) {
    this.setData({ activityId: (e.detail.value || "").trim() });
  },

  goCreate() {
    wx.navigateTo({ url: "/pages/create/create" });
  },

  goLive() {
    const id = this.data.activityId;
    if (!id) {
      wx.showToast({ title: "请输入活动ID", icon: "none" });
      return;
    }
    wx.navigateTo({ url: "/pages/live/live?id=" + encodeURIComponent(id) });
  },

  goLiveById(e) {
    const id = e.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: "/pages/live/live?id=" + encodeURIComponent(id) });
  },
});
