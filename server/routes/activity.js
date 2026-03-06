const express = require("express");
const router = express.Router();
const activityController = require("../controller/activityController");

router.post("/activities", activityController.create);
router.get("/activities/:id", activityController.getLive);
router.get("/activities/:id/live", activityController.getLive);
router.post("/activities/:id/start", activityController.start);
router.post("/activities/:id/players", activityController.addPlayer);
router.patch("/activities/:id/players/:playerId", activityController.updatePlayer);
router.post("/activities/:id/courts/:courtIndex/score", activityController.submitScore);
router.post("/activities/:id/courts/:courtIndex/end", activityController.endCourt);
router.patch("/activities/:id/results/:resultId", activityController.updateResult);
router.get("/activities/:id/leaderboard", activityController.leaderboard);
router.get("/wx_openid", activityController.wxOpenId);

module.exports = router;
