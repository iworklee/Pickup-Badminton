const config = require("./config.js");

function request(path, options = {}) {
  const { method = "GET", data } = options;
  const url = config.baseUrl + path;
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method,
      data: data,
      header: {
        "Content-Type": "application/json",
        ...options.header,
      },
      success: (res) => {
        const body = typeof res.data === "string" ? JSON.parse(res.data || "{}") : (res.data || {});
        if (res.statusCode >= 200 && res.statusCode < 300 && body.code === 0) {
          resolve(body.data);
        } else {
          reject(new Error(body.message || "请求失败"));
        }
      },
      fail: (err) => reject(err.errMsg || new Error("网络错误")),
    });
  });
}

function createActivity(body) {
  return request("/api/activities", { method: "POST", data: body });
}

function getActivity(id) {
  return request(`/api/activities/${id}`);
}

function getLive(id) {
  return request(`/api/activities/${id}/live`);
}

function startActivity(id) {
  return request(`/api/activities/${id}/start`, { method: "POST" });
}

function addPlayer(activityId, name, gender) {
  return request(`/api/activities/${activityId}/players`, {
    method: "POST",
    data: { name, gender },
  });
}

function setPlayerLeft(activityId, playerId) {
  return request(`/api/activities/${activityId}/players/${playerId}`, {
    method: "PATCH",
    data: { status: "left" },
  });
}

function submitScore(activityId, courtIndex, scoreA, scoreB) {
  return request(`/api/activities/${activityId}/courts/${courtIndex}/score`, {
    method: "POST",
    data: { scoreA, scoreB },
  });
}

function endCourt(activityId, courtIndex) {
  return request(`/api/activities/${activityId}/courts/${courtIndex}/end`, {
    method: "POST",
  });
}

function updateResult(activityId, resultId, scoreA, scoreB) {
  return request(`/api/activities/${activityId}/results/${resultId}`, {
    method: "PATCH",
    data: { scoreA, scoreB },
  });
}

function getLeaderboard(activityId) {
  return request(`/api/activities/${activityId}/leaderboard`);
}

module.exports = {
  request,
  createActivity,
  getActivity,
  getLive,
  startActivity,
  addPlayer,
  setPlayerLeft,
  submitScore,
  endCourt,
  updateResult,
  getLeaderboard,
};
