const { Sequelize, DataTypes } = require("sequelize");

const { MYSQL_USERNAME, MYSQL_PASSWORD, MYSQL_ADDRESS = "" } = process.env;
const [host, port] = MYSQL_ADDRESS.split(":");

const sequelize = new Sequelize("nodejs_demo", MYSQL_USERNAME, MYSQL_PASSWORD, {
  host,
  port,
  dialect: "mysql",
});

// 活动
const Activity = sequelize.define("Activity", {
  id: { type: DataTypes.STRING(36), primaryKey: true },
  title: { type: DataTypes.STRING(128), allowNull: false },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  courtCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  mode: { type: DataTypes.ENUM("fixed", "dynamic"), allowNull: false, defaultValue: "dynamic" },
  handicapRules: { type: DataTypes.JSON, defaultValue: [] }, // [{ name, teamA, teamB, points }] 如 男双让混双 3 分
  status: { type: DataTypes.ENUM("draft", "live", "ended"), allowNull: false, defaultValue: "draft" },
});

// 活动选手
const ActivityPlayer = sequelize.define("ActivityPlayer", {
  id: { type: DataTypes.STRING(36), primaryKey: true },
  activityId: { type: DataTypes.STRING(36), allowNull: false },
  name: { type: DataTypes.STRING(64), allowNull: false },
  gender: { type: DataTypes.ENUM("M", "F"), allowNull: false },
  status: { type: DataTypes.ENUM("active", "left"), allowNull: false, defaultValue: "active" },
  playCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  restCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }, // 连续休息场次，排阵后更新
});

// 当前场地上的比赛（进行中）
const CourtMatch = sequelize.define("CourtMatch", {
  id: { type: DataTypes.STRING(36), primaryKey: true },
  activityId: { type: DataTypes.STRING(36), allowNull: false },
  courtIndex: { type: DataTypes.INTEGER, allowNull: false },
  teamAPlayerIds: { type: DataTypes.JSON, allowNull: false }, // [id, id]
  teamBPlayerIds: { type: DataTypes.JSON, allowNull: false },
  handicapTip: { type: DataTypes.STRING(128), defaultValue: "" },
  status: { type: DataTypes.ENUM("playing", "scoring"), defaultValue: "playing" },
});

// 已结束的场次记录（用于统计与排阵时的“上一场”参考）
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
