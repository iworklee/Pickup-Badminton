const { Sequelize, DataTypes } = require("sequelize");
const config = require("../config");

const { username, password, address } = config.mysql;
const [host, port] = (address || "").split(":");

const sequelize = new Sequelize("nodejs_demo", username, password, {
  host,
  port,
  dialect: "mysql",
});

const Activity = sequelize.define("Activity", {
  id: { type: DataTypes.STRING(36), primaryKey: true },
  title: { type: DataTypes.STRING(128), allowNull: false },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  courtCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  mode: { type: DataTypes.ENUM("fixed", "dynamic"), allowNull: false, defaultValue: "dynamic" },
  handicapRules: { type: DataTypes.JSON, defaultValue: [] },
  status: { type: DataTypes.ENUM("draft", "live", "ended"), allowNull: false, defaultValue: "draft" },
});

const ActivityPlayer = sequelize.define("ActivityPlayer", {
  id: { type: DataTypes.STRING(36), primaryKey: true },
  activityId: { type: DataTypes.STRING(36), allowNull: false },
  name: { type: DataTypes.STRING(64), allowNull: false },
  gender: { type: DataTypes.ENUM("M", "F"), allowNull: false },
  status: { type: DataTypes.ENUM("active", "left"), allowNull: false, defaultValue: "active" },
  playCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  restCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  consecutivePlay: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  consecutiveRest: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
});

const CourtMatch = sequelize.define("CourtMatch", {
  id: { type: DataTypes.STRING(36), primaryKey: true },
  activityId: { type: DataTypes.STRING(36), allowNull: false },
  courtIndex: { type: DataTypes.INTEGER, allowNull: false },
  teamAPlayerIds: { type: DataTypes.JSON, allowNull: false },
  teamBPlayerIds: { type: DataTypes.JSON, allowNull: false },
  handicapTip: { type: DataTypes.STRING(128), defaultValue: "" },
  status: { type: DataTypes.ENUM("playing", "scoring"), defaultValue: "playing" },
});

const MatchResult = sequelize.define("MatchResult", {
  id: { type: DataTypes.STRING(36), primaryKey: true },
  activityId: { type: DataTypes.STRING(36), allowNull: false },
  courtIndex: { type: DataTypes.INTEGER, allowNull: false },
  teamAPlayerIds: { type: DataTypes.JSON, allowNull: false },
  teamBPlayerIds: { type: DataTypes.JSON, allowNull: false },
  scoreA: { type: DataTypes.INTEGER, allowNull: false },
  scoreB: { type: DataTypes.INTEGER, allowNull: false },
  handicapTip: { type: DataTypes.STRING(128), defaultValue: "" },
});

Activity.hasMany(ActivityPlayer, { foreignKey: "activityId" });
Activity.hasMany(CourtMatch, { foreignKey: "activityId" });
Activity.hasMany(MatchResult, { foreignKey: "activityId" });

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function init() {
  await Activity.sync({ alter: true });
  await ActivityPlayer.sync({ alter: true });
  await CourtMatch.sync({ alter: true });
  await MatchResult.sync({ alter: true });
}

module.exports = {
  init,
  sequelize,
  uuid,
  Activity,
  ActivityPlayer,
  CourtMatch,
  MatchResult,
};
