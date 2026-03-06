module.exports = function errorHandler(err, req, res, next) {
  console.error(err);
  res.status(err.status || 500).json({
    code: -1,
    message: err.message || "服务器错误",
  });
};
