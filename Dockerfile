# 微信云托管部署用 Dockerfile
# 项目结构：server/ 后端，frontend/ 构建 H5 到 dist/，miniprogram/ 仅本地/开发者工具使用不参与镜像构建
# 二开推荐阅读 [如何提高项目构建效率](https://developers.weixin.qq.com/miniprogram/dev/wxcloudrun/src/scene/build/speed.html)
# pnpm@10 需 Node.js >= 18.12
FROM node:18-alpine

RUN apk add --no-cache ca-certificates

WORKDIR /app

RUN npm config set registry https://mirrors.cloud.tencent.com/npm/ \
  && npm install -g pnpm

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

EXPOSE 80

CMD ["node", "server/app.js"]
