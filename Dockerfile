# 基础镜像可通过 build arg 覆盖，例如国内机器用镜像加速：
#   docker build --build-arg NODE_IMAGE=registry.example.com/library/node:22-bookworm-slim .
ARG NODE_IMAGE=node:22-bookworm-slim

# ---------- 构建阶段 ----------
FROM ${NODE_IMAGE} AS build
WORKDIR /app

# 装 better-sqlite3 的编译工具链（预编译包不可用时需要源码编译）
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# npm 源可通过 build arg 覆盖
ARG NPM_REGISTRY=https://registry.npmjs.org
COPY package.json package-lock.json* ./
RUN npm config set registry ${NPM_REGISTRY} \
 && npm install --build-from-source --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npx tsc -p tsconfig.json && npm prune --omit=dev

# ---------- 运行阶段 ----------
FROM ${NODE_IMAGE}
WORKDIR /app

ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=8080

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 8080

CMD ["node", "dist/index.js"]
