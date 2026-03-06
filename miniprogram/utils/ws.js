const config = require("./config.js");

function wsLive(activityId, onMessage) {
  const base = config.baseUrl || "";
  const url = base.replace(/^http/, "ws") + "/ws?activityId=" + activityId;
  const socket = wx.connectSocket({
    url,
    fail: (err) => console.error("ws connect fail", err),
  });
  socket.onMessage((res) => {
    try {
      const msg = JSON.parse(res.data || "{}");
      if (msg.type === "live" && msg.data) onMessage(msg.data);
    } catch (e) {}
  });
  return socket;
}

module.exports = { wsLive };
