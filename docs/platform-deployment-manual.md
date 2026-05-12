# 平台部署手册

本文档说明 Suit Skills 平台 Web 的两种部署方式：

- 传统部署：Node.js 运行 API、Nginx 承载前端静态资源、MySQL 持久化数据。
- Docker 部署：使用仓库根目录的 `Dockerfile` 与 `docker-compose.yml` 一键启动 MySQL、API、Web。

## 1. 服务组成

| 模块 | 代码位置 | 说明 | 默认端口 |
| --- | --- | --- | --- |
| 平台前端 | `apps/platform-web` | Vite + React，构建产物在 `dist/platform-web` | 由 Nginx 暴露 |
| 平台 API | `packages/server` | Node.js HTTP API，负责登录、技能市场、上传、审核、发布 | `4591` |
| 数据库 | MySQL 8.x | 平台数据持久化，服务启动时自动建库建表 | `3306` |

前端生产环境建议通过 Nginx 同源反代 `/api` 到 API 服务，这样浏览器访问 `http://域名/`，接口请求走 `http://域名/api/...`。

## 2. 环境要求

传统部署需要：

- Node.js 18 或更高版本，建议 Node.js 20 LTS。
- npm，与当前仓库的 `package-lock.json` 配套使用。
- MySQL 8.0 或更高版本。
- Nginx 1.20 或更高版本。
- Git。平台发布技能到 Git 源时会调用 `git clone/commit/push`。

Docker 部署需要：

- Docker 24 或更高版本。
- Docker Compose v2。

## 3. 核心环境变量

| 变量 | 示例 | 说明 |
| --- | --- | --- |
| `PLATFORM_API_HOST` | `0.0.0.0` | API 监听地址 |
| `PLATFORM_API_PORT` 或 `PORT` | `4591` | API 监听端口 |
| `PLATFORM_DATABASE_URL` | `mysql://root:password@127.0.0.1:3306/platform_web` | MySQL 连接地址 |
| `PLATFORM_WEB_APP_URL` | `https://skills.example.com` | 前端访问地址，用于登录后跳转 |
| `PLATFORM_API_PUBLIC_URL` | `https://skills.example.com` | API 对外地址；同源反代时填前端域名 |
| `PLATFORM_API_CORS_ORIGIN` | `https://skills.example.com` | 允许跨域来源；同源反代也建议显式配置 |
| `PLATFORM_AUTH_MODE` | `local` | 本地账号模式；接入 OAuth 时改为 `oauth` |
| `PLATFORM_AUTH_SESSION_SECRET` | 随机长字符串 | Cookie 会话签名密钥，生产环境必须修改 |
| `PLATFORM_ADMIN_EMAILS` | `admin@example.com,ops@example.com` | 管理员邮箱列表 |
| `PLATFORM_ADMIN_DOMAINS` | `example.com` | 管理员邮箱域名列表，可选 |

本地账号模式下，登录用户名使用邮箱，密码当前不做服务端校验，适合内网或受保护环境。公网生产环境建议接入 OAuth，并在网关层启用 HTTPS。

如果数据库密码包含 `@`、`#`、`:`、`/` 等 URL 特殊字符，请在 `PLATFORM_DATABASE_URL` 中做 URL 编码，或改用只包含字母、数字、下划线的数据库密码。

## 4. 传统部署

### 4.1 准备数据库

登录 MySQL 后创建数据库和账号：

```sql
CREATE DATABASE IF NOT EXISTS platform_web
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'platform_user'@'%' IDENTIFIED BY 'replace-with-strong-password';
GRANT ALL PRIVILEGES ON platform_web.* TO 'platform_user'@'%';
FLUSH PRIVILEGES;
```

API 首次启动会自动创建平台业务表，无需手动执行建表脚本。

### 4.2 安装依赖并构建

在仓库根目录执行：

```bash
npm ci
npm run build --workspace @suit-skills/core
npm run build --workspace @suit-skills/server
npm run build --workspace @suit-skills/app-platform-web
```

构建完成后：

- API 入口：`packages/server/dist/index.js`
- 前端静态目录：`dist/platform-web`

### 4.3 配置 API 环境变量

建议在服务器上创建 `/opt/suit-skills-platform/.env`：

```bash
PLATFORM_API_HOST=0.0.0.0
PLATFORM_API_PORT=4591
PLATFORM_DATABASE_URL=mysql://platform_user:replace-with-strong-password@127.0.0.1:3306/platform_web
PLATFORM_WEB_APP_URL=https://skills.example.com
PLATFORM_API_PUBLIC_URL=https://skills.example.com
PLATFORM_API_CORS_ORIGIN=https://skills.example.com
PLATFORM_AUTH_MODE=local
PLATFORM_AUTH_SESSION_SECRET=replace-with-a-long-random-secret
PLATFORM_ADMIN_EMAILS=admin@example.com
```

如果需要持久化上传包目录，可额外指定：

```bash
PLATFORM_API_UPLOAD_DIR=/opt/suit-skills-platform/data/uploads
```

### 4.4 启动 API

开发或临时验证可以直接运行：

```bash
set -a
. /opt/suit-skills-platform/.env
set +a
npm run start:platform-api
```

生产环境建议使用 systemd。示例 `/etc/systemd/system/suit-skills-platform-api.service`：

```ini
[Unit]
Description=Suit Skills Platform API
After=network.target mysql.service

[Service]
Type=simple
WorkingDirectory=/opt/suit-skills-platform
EnvironmentFile=/opt/suit-skills-platform/.env
ExecStart=/usr/bin/npm run start:platform-api
Restart=always
RestartSec=5
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
```

启用服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now suit-skills-platform-api
sudo systemctl status suit-skills-platform-api
```

健康检查：

```bash
curl http://127.0.0.1:4591/api/health
```

### 4.5 配置 Nginx

将 `dist/platform-web` 发布到 `/var/www/suit-skills-platform`，并配置 Nginx：

```nginx
server {
  listen 80;
  server_name skills.example.com;

  root /var/www/suit-skills-platform;
  index index.html;

  client_max_body_size 50m;

  location /api/ {
    proxy_pass http://127.0.0.1:4591;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location /health {
    proxy_pass http://127.0.0.1:4591/health;
  }

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

检查并重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

访问 `http://skills.example.com`，使用 `PLATFORM_ADMIN_EMAILS` 中配置的邮箱登录。

## 5. Docker 部署

仓库已提供：

- `Dockerfile`：包含 `api` 与 `web` 两个构建目标。
- `docker-compose.yml`：编排 MySQL、API、Web。
- `deploy/nginx.conf`：Web 容器内的 Nginx 配置，负责静态资源和 `/api` 反代。

### 5.1 配置环境变量

建议在仓库根目录创建 `.env`：

```bash
MYSQL_ROOT_PASSWORD=replace-with-strong-password
MYSQL_DATABASE=platform_web
MYSQL_USER=platform_user
MYSQL_PASSWORD=replace-with-platform-password

PLATFORM_WEB_APP_URL=http://localhost:8080
PLATFORM_API_PUBLIC_URL=http://localhost:8080
PLATFORM_API_CORS_ORIGIN=http://localhost:8080
PLATFORM_AUTH_MODE=local
PLATFORM_AUTH_SESSION_SECRET=replace-with-a-long-random-secret
PLATFORM_ADMIN_EMAILS=admin@local.dev
```

### 5.2 启动

```bash
docker compose up -d --build
```

启动后访问：

- 平台页面：`http://localhost:8080`
- API 健康检查：`http://localhost:8080/api/health`
- API 直连端口：`http://localhost:4591/api/health`

查看日志：

```bash
docker compose logs -f api
docker compose logs -f web
docker compose logs -f mysql
```

停止服务：

```bash
docker compose down
```

停止并删除数据库卷：

```bash
docker compose down -v
```

### 5.3 Dockerfile

当前 `Dockerfile` 使用多阶段构建：

```dockerfile
# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json .npmrc ./
COPY packages/core/package.json packages/core/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/evaluator/package.json packages/evaluator/package.json
COPY apps/cli/package.json apps/cli/package.json
COPY apps/desktop/package.json apps/desktop/package.json
COPY apps/local-web/package.json apps/local-web/package.json
COPY apps/platform-web/package.json apps/platform-web/package.json
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build --workspace @suit-skills/core \
  && npm run build --workspace @suit-skills/server \
  && npm run build --workspace @suit-skills/app-platform-web

FROM node:20-alpine AS api
WORKDIR /app
ENV NODE_ENV=production \
  PLATFORM_API_HOST=0.0.0.0 \
  PLATFORM_API_PORT=4591

RUN apk add --no-cache git openssh-client
COPY package.json package-lock.json .npmrc ./
COPY packages/core/package.json packages/core/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/evaluator/package.json packages/evaluator/package.json
COPY apps/cli/package.json apps/cli/package.json
COPY apps/desktop/package.json apps/desktop/package.json
COPY apps/local-web/package.json apps/local-web/package.json
COPY apps/platform-web/package.json apps/platform-web/package.json
RUN npm ci --omit=dev --workspaces --include-workspace-root

COPY --from=build /app/packages/core/dist packages/core/dist
COPY --from=build /app/packages/server/dist packages/server/dist

EXPOSE 4591
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PLATFORM_API_PORT}/api/health" >/dev/null || exit 1
CMD ["npm", "run", "start:platform-api"]

FROM nginx:1.27-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/platform-web /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
```

### 5.4 docker-compose.yml

当前 `docker-compose.yml`：

```yaml
services:
  mysql:
    image: mysql:8.4
    container_name: suit-skills-platform-mysql
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:-change-me}
      MYSQL_DATABASE: ${MYSQL_DATABASE:-platform_web}
      MYSQL_USER: ${MYSQL_USER:-platform_user}
      MYSQL_PASSWORD: ${MYSQL_PASSWORD:-platform_pass}
    command:
      - --character-set-server=utf8mb4
      - --collation-server=utf8mb4_unicode_ci
    volumes:
      - mysql_data:/var/lib/mysql
    healthcheck:
      test: ["CMD-SHELL", "mysqladmin ping -h 127.0.0.1 -uroot -p$${MYSQL_ROOT_PASSWORD} --silent"]
      interval: 10s
      timeout: 5s
      retries: 10

  api:
    build:
      context: .
      target: api
    container_name: suit-skills-platform-api
    restart: unless-stopped
    depends_on:
      mysql:
        condition: service_healthy
    environment:
      PLATFORM_API_HOST: 0.0.0.0
      PLATFORM_API_PORT: 4591
      PLATFORM_DATABASE_URL: ${PLATFORM_DATABASE_URL:-mysql://${MYSQL_USER:-platform_user}:${MYSQL_PASSWORD:-platform_pass}@mysql:3306/${MYSQL_DATABASE:-platform_web}}
      PLATFORM_WEB_APP_URL: ${PLATFORM_WEB_APP_URL:-http://localhost:8080}
      PLATFORM_API_PUBLIC_URL: ${PLATFORM_API_PUBLIC_URL:-http://localhost:8080}
      PLATFORM_API_CORS_ORIGIN: ${PLATFORM_API_CORS_ORIGIN:-http://localhost:8080}
      PLATFORM_AUTH_MODE: ${PLATFORM_AUTH_MODE:-local}
      PLATFORM_AUTH_SESSION_SECRET: ${PLATFORM_AUTH_SESSION_SECRET:-change-this-session-secret}
      PLATFORM_ADMIN_EMAILS: ${PLATFORM_ADMIN_EMAILS:-admin@local.dev}
    volumes:
      - platform_uploads:/app/packages/server/data/uploads
    ports:
      - "4591:4591"

  web:
    build:
      context: .
      target: web
    container_name: suit-skills-platform-web
    restart: unless-stopped
    depends_on:
      api:
        condition: service_started
    ports:
      - "8080:80"

volumes:
  mysql_data:
  platform_uploads:
```

## 6. 生产建议

- 将 `PLATFORM_AUTH_SESSION_SECRET`、数据库密码放入服务器密钥管理或 CI/CD Secret，不要提交到 Git。
- 公网部署必须启用 HTTPS，并将 `PLATFORM_WEB_APP_URL`、`PLATFORM_API_PUBLIC_URL` 改为 HTTPS 域名。
- 如果使用 OAuth，补充配置 `OAUTH_CLIENT_ID`、`OAUTH_CLIENT_SECRET`、`OAUTH_AUTHORIZATION_URL`、`OAUTH_TOKEN_URL`、`OAUTH_USERINFO_URL`，并将 `PLATFORM_AUTH_MODE=oauth`。
- 定期备份 MySQL 数据卷或数据库实例。
- 如果平台需要发布技能到私有 Git 仓库，API 容器或服务器需要配置对应 SSH key 或 token。

## 7. 常见问题

### 页面能打开，但接口 401

平台启用了登录保护。访问页面后先登录；管理员账号应配置在 `PLATFORM_ADMIN_EMAILS` 或 `PLATFORM_ADMIN_DOMAINS`。

### 页面能打开，但接口 502

检查 API 是否启动：

```bash
docker compose logs -f api
docker compose ps
```

传统部署下检查：

```bash
curl http://127.0.0.1:4591/api/health
systemctl status suit-skills-platform-api
```

### API 启动时报 MySQL 连接失败

检查 `PLATFORM_DATABASE_URL` 的账号、密码、主机、端口和数据库名。Docker 部署中 API 应连接 `mysql:3306`，不是 `127.0.0.1:3306`。

### 上传包失败或发布失败

确认上传包是 `.zip`，且包内包含 `SKILL.md`。如果发布到 Git 失败，检查平台来源配置、Git 地址、分支、凭据和容器内网络。
