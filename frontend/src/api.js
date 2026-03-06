const BASE = "";

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data.code === 0) return data.data;
  throw new Error(data.message || "请求失败");
}

export function createActivity(body) {
  return request("/api/activities", { method: "POST", body: JSON.stringify(body) });
}

export function getActivity(id) {
  return request(`/api/activities/${id}`);
}

export function getLive(id) {
  return request(`/api/activities/${id}/live`);
}

export function startActivity(id) {
  return request(`/api/activities/${id}/start`, { method: "POST" });
}

export function addPlayer(activityId, name, gender) {
  return request(`/api/activities/${activityId}/players`, { method: "POST", body: JSON.stringify({ name, gender }) });
}

export function setPlayerLeft(activityId, playerId) {
  return request(`/api/activities/${activityId}/players/${playerId}`, { method: "PATCH", body: JSON.stringify({ status: "left" }) });
}

export function submitScore(activityId, courtIndex, scoreA, scoreB) {
  return request(`/api/activities/${activityId}/courts/${courtIndex}/score`, { method: "POST", body: JSON.stringify({ scoreA, scoreB }) });
}

export function endCourt(activityId, courtIndex) {
  return request(`/api/activities/${activityId}/courts/${courtIndex}/end`, { method: "POST" });
}

export function getLeaderboard(activityId) {
  return request(`/api/activities/${activityId}/leaderboard`);
}

export function wsLive(activityId, onMessage) {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${proto}//${location.host}${BASE}/ws?activityId=${activityId}`);
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === "live" && msg.data) onMessage(msg.data);
    } catch (_) {}
  };
  return ws;
}
