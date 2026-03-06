# 微信云托管部署用 Dockerfile
# 二开推荐阅读 [如何提高项目构建效率](https://developers.weixin.qq.com/miniprogram/dev/wxcloudrun/src/scene/build/speed.html)
# pnpm@10 需要 Node.js >= 18.12，使用官方 node 镜像
FROM node:18-alpine

# 使用 HTTPS 协议访问容器云调用证书安装
RUN apk add --no-cache ca-certificates

WORKDIR /app

# 安装 pnpm（与项目 packageManager 一致），选用国内 npm 镜像加速
RUN npm config set registry https://mirrors.cloud.tencent.com/npm/ \
  && npm install -g pnpm

# 拷贝根目录包管理文件并安装后端依赖
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# 拷贝后端与前端源码（.dockerignore 已排除 node_modules、dist 等）
COPY . .

# 安装前端依赖并构建，产出到根目录 dist/
RUN pnpm run build

# 容器默认监听 80，与 container.config.json 中 containerPort 一致
EXPOSE 80

CMD ["node", "index.js"]
