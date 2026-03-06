const wsClients = new Map();

function broadcastLive(activityId, payload) {
  const room = wsClients.get(activityId);
  if (!room) return;
  const data = JSON.stringify(payload);
  room.forEach((ws) => { try { ws.send(data); } catch (e) {} });
}

module.exports = { wsClients, broadcastLive };
