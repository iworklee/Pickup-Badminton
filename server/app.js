const http = require("http");
const express = require("express");
const morgan = require("morgan");
const { WebSocketServer } = require("ws");
const cors = require("./middleware/cors");
const errorHandler = require("./middleware/errorHandler");
const routes = require("./routes");
const config = require("./config");
const { init: initDB } = require("./model/db");
const { wsClients } = require("./ws");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cors);
app.use(morgan("tiny"));
app.use(routes);
app.use(errorHandler);

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

async function bootstrap() {
  await initDB();
  server.listen(config.port, () => console.log("启动成功", config.port));
}
bootstrap();
