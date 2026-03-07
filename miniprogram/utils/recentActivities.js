const KEY = "recentActivities";
const MAX = 10;

function getRecent() {
  try {
    const raw = wx.getStorageSync(KEY);
    const list = Array.isArray(raw) ? raw : [];
    return list.slice(0, MAX);
  } catch (e) {
    return [];
  }
}

function addRecent(item) {
  if (!item || !item.id) return;
  const title = item.title || "未命名活动";
  const list = getRecent().filter((x) => x.id !== item.id);
  list.unshift({ id: item.id, title, lastVisited: Date.now() });
  try {
    wx.setStorageSync(KEY, list.slice(0, MAX));
  } catch (e) {}
}

module.exports = { getRecent, addRecent };
