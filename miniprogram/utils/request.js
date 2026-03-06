const config = require("./config.js");

function request(options) {
  const { url, method = "GET", data = {} } = options;
  return new Promise((resolve, reject) => {
    wx.request({
      url: config.baseUrl + url,
      method,
      data,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          reject(new Error(res.data?.message || "请求失败"));
        }
      },
      fail: reject,
    });
  });
}

module.exports = { request };
