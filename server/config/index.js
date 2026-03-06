module.exports = {
  port: process.env.PORT || 80,
  mysql: {
    username: process.env.MYSQL_USERNAME,
    password: process.env.MYSQL_PASSWORD,
    address: process.env.MYSQL_ADDRESS || "",
  },
};
