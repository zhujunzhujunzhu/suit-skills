# Skills Hub 平台部署手册（CentOS 7 · 复用 Nginx/MySQL）

适用场景：服务器已有 Nginx 与 MySQL 在运行，需要在同一台机器上以子路径 `/skills-hub/` 挂载 Skills Hub 平台，无需新增端口。

---

## 一、环境说明

| 项目 | 本次实际值 | 说明 |
|------|-----------|------|
| 操作系统 | CentOS 7.9 | glibc 2.17，**不兼容** NodeSource/官方 Node.js 18+ |
| Node.js | 20.19.2（非官方 glibc-217 版） | 见下文安装步骤 |
| MySQL | 5.7.39（已有） | 兼容平台 schema，无需升级 |
| Nginx | 自编译，位于 `/usr/local/nginx` | 复用现有进程 |
| 平台目录 | `/data/skills-hub/` | server / web / logs / uploads |
| 访问地址 | `http://<IP>/skills-hub/` | 同 Nginx 80 端口，子路径挂载 |
| API 内部端口 | `4591` | 仅本机监听，不对外暴露 |

---

## 二、构建（在开发机执行）

> 所有构建操作在本地开发机完成，产物通过 scp 上传服务器。

### 2.1 构建前端

**必须使用 PowerShell**（不能用 Git Bash）。Git Bash 会将 `--base=/skills-hub/` 中的 `/` 展开成 Windows 路径，导致构建产物路径错误。

```powershell
# 在项目根目录
npx vite build --config apps/platform-web/vite.config.ts --base=/skills-hub/
```

产物输出到 `dist/platform-web/`。构建后检查 `dist/platform-web/index.html`，资源路径应以 `/skills-hub/assets/` 开头。

`apps/platform-web/src/main.tsx` 中 `BrowserRouter` 必须设置 `basename`：

```tsx
<BrowserRouter basename="/skills-hub">
```

### 2.2 构建 API 服务

```bash
# 使用 esbuild 打包为单文件 ESM bundle
npx esbuild packages/server/src/index.ts \
  --bundle \
  --platform=node \
  --format=esm \
  --outfile=dist/platform-server/server.mjs \
  --external:mysql2 \
  --external:adm-zip
```

产物：`dist/platform-server/server.mjs`（约 134 KB）。

---

## 三、Node.js 安装（仅首次，CentOS 7 专用）

CentOS 7 的 glibc 版本为 2.17，官方 Node.js 18/20 二进制要求 glibc 2.28，**直接安装会报错**。需使用非官方 glibc-217 兼容构建：

```bash
# 下载 glibc-217 兼容的 Node.js 20
cd /usr/local
wget https://unofficial-builds.nodejs.org/download/release/v20.19.2/node-v20.19.2-linux-x64-glibc-217.tar.gz
tar xzf node-v20.19.2-linux-x64-glibc-217.tar.gz

# 验证
/usr/local/node-v20.19.2-linux-x64-glibc-217/bin/node -v
# 输出：v20.19.2
```

> 该构建只含 `node` 二进制，不含 `npm`，无需 npm。

---

## 四、服务器目录准备

```bash
mkdir -p /data/skills-hub/server
mkdir -p /data/skills-hub/web
mkdir -p /data/skills-hub/logs
mkdir -p /data/skills-hub/uploads

# 创建 Nginx 用软链接（供 root 指令使用）
mkdir -p /data/www
ln -sfn /data/skills-hub/web /data/www/skills-hub
```

---

## 五、上传构建产物

在开发机执行（Windows 使用 pscp，需附带服务器 SSH host key 指纹）：

```powershell
$hostkey = "xx:xx:xx:xx:..."   # 替换为实际 host key 指纹
$pw      = "your-root-password"
$ip      = "your.server.ip"

# 上传 API bundle
pscp -batch -hostkey $hostkey -pw $pw `
  dist\platform-server\server.mjs `
  root@${ip}:/data/skills-hub/server/server.mjs

# 上传前端静态文件（含 assets/ 子目录）
pscp -batch -hostkey $hostkey -pw $pw -r `
  dist\platform-web\* `
  root@${ip}:/data/skills-hub/web/
```

---

## 六、MySQL 建库

首次部署需创建数据库，API 启动后会自动建表：

```sql
CREATE DATABASE IF NOT EXISTS platform_web
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

若使用 root 账号直连，跳过授权步骤。若使用专用账号：

```sql
CREATE USER 'platform_user'@'127.0.0.1' IDENTIFIED BY 'strong-password';
GRANT ALL PRIVILEGES ON platform_web.* TO 'platform_user'@'127.0.0.1';
FLUSH PRIVILEGES;
```

---

## 七、systemd 服务配置

创建 `/etc/systemd/system/platform-api.service`：

```ini
[Unit]
Description=Skills Hub API Server
After=network.target mysqld.service
Wants=mysqld.service

[Service]
Type=simple
User=root
WorkingDirectory=/data/skills-hub/server
ExecStart=/usr/local/node-v20.19.2-linux-x64-glibc-217/bin/node /data/skills-hub/server/server.mjs
Restart=on-failure
RestartSec=5s
StandardOutput=append:/data/skills-hub/logs/out.log
StandardError=append:/data/skills-hub/logs/error.log

Environment=PORT=4591
Environment=PLATFORM_DATABASE_URL=mysql2://root:数据库密码@127.0.0.1:3306/platform_web
Environment=PLATFORM_AUTH_SESSION_SECRET=替换为随机32位以上字符串
Environment=PLATFORM_AUTH_MODE=local
Environment=PLATFORM_ADMIN_EMAILS=admin@example.com
Environment=PLATFORM_WEB_APP_URL=http://your.server.ip
Environment=PLATFORM_API_PUBLIC_URL=http://your.server.ip
Environment=PLATFORM_API_CORS_ORIGIN=http://your.server.ip
Environment=PLATFORM_UPLOADS_DIR=/data/skills-hub/uploads

[Install]
WantedBy=multi-user.target
```

> **注意**：`PLATFORM_DATABASE_URL` 协议必须为 `mysql2://`（不是 `mysql://`），否则驱动无法识别。

启用并启动：

```bash
systemctl daemon-reload
systemctl enable --now platform-api
systemctl status platform-api
```

验证 API 正常：

```bash
curl http://127.0.0.1:4591/api/auth/config
# 返回：{"enabled":true,"mode":"local",...}
```

---

## 八、Nginx 配置

在已有的 `server { listen 80; ... }` 块内，**在 `location /` 之前**插入以下两个 location：

```nginx
# Skills Hub 前端静态资源
# 使用 root + 软链接（不用 alias），避免 try_files 路径匹配问题
location /skills-hub {
    root /data/www;
    index index.html;
    try_files $uri $uri/ /skills-hub/index.html;
}

# Skills Hub API 反代
location /api/ {
    proxy_pass         http://127.0.0.1:4591;
    proxy_set_header   Host $host;
    proxy_set_header   X-Real-IP $remote_addr;
    proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
    client_max_body_size 50m;
    proxy_connect_timeout 60s;
    proxy_send_timeout    300s;
    proxy_read_timeout    300s;
}
```

检查并重载：

```bash
/usr/local/nginx/sbin/nginx -t
/usr/local/nginx/sbin/nginx -s reload
```

---

## 九、验证部署

```bash
# 前端首页（应返回 200 text/html）
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://127.0.0.1/skills-hub/

# 静态 JS 资源（应返回 200 application/javascript）
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" \
  http://127.0.0.1/skills-hub/assets/<任意.js文件名>

# API（应返回 JSON）
curl http://127.0.0.1/api/auth/config
```

浏览器访问 `http://<服务器IP>/skills-hub/`，用 `PLATFORM_ADMIN_EMAILS` 中配置的邮箱登录（本地模式密码任意）。

---

## 十、日常运维

### 查看日志

```bash
# 实时查看 API 日志
tail -f /data/skills-hub/logs/out.log
tail -f /data/skills-hub/logs/error.log

# 或通过 systemd
journalctl -u platform-api -f
```

### 重启 API

```bash
systemctl restart platform-api
```

### 更新前端

重新构建后上传，无需重启任何服务（Nginx 直接读文件）：

```powershell
pscp -batch -hostkey $hostkey -pw $pw -r dist\platform-web\* root@${ip}:/data/skills-hub/web/
```

### 更新 API

```bash
# 上传新的 server.mjs 后重启服务
systemctl restart platform-api
```

---

## 十一、常见问题

### JS 文件返回 `text/html`，页面空白

`alias` + `try_files` 在某些 Nginx 版本下路径匹配异常，导致所有请求都 fallback 到 `index.html`。

**解决方案**：改用 `root` + 软链接：

```bash
mkdir -p /data/www
ln -sfn /data/skills-hub/web /data/www/skills-hub
```

Nginx 配置改为：

```nginx
location /skills-hub {
    root /data/www;   # 不用 alias
    ...
}
```

### 前端构建后资源路径含 `Program Files/Git`

使用了 Git Bash 运行 `vite build --base=/skills-hub/`，Bash 将 `/` 转换成了 Windows Git 安装路径。

**解决方案**：改用 PowerShell 执行构建命令。

### 登录后跳转到其他应用

React Router 缺少 `basename`，导致路由跳转到 `/market` 而不是 `/skills-hub/market`。

**解决方案**：`apps/platform-web/src/main.tsx` 中加：

```tsx
<BrowserRouter basename="/skills-hub">
```

重新构建并上传。

### API 启动失败，报 `Cannot find package 'mysql2'`

`server.mjs` 打包时必须保留 `mysql2` 为外部依赖（`--external:mysql2`），并确保服务器 `WorkingDirectory` 下或全局已安装 `mysql2`。

推荐在 `/data/skills-hub/server/` 目录执行一次 `npm install mysql2 adm-zip`（需要 npm，可借用系统 Node.js 自带的 npm）。

### Node.js 启动报 `GLIBC_2.28 not found`

使用了官方 Node.js 二进制，不兼容 CentOS 7 的 glibc 2.17。需按第三节步骤安装非官方 glibc-217 版本。

### 数据库连接失败（密码含特殊字符）

`PLATFORM_DATABASE_URL` 中密码包含 `@`、`#` 等字符时需 URL 编码，例如 `@` 编码为 `%40`：

```
mysql2://root:pass%40word@127.0.0.1:3306/platform_web
```

---

## 附录：文件路径速查

| 文件 | 路径 |
|------|------|
| API 入口 | `/data/skills-hub/server/server.mjs` |
| 前端静态目录 | `/data/skills-hub/web/` |
| Nginx 软链接 | `/data/www/skills-hub → /data/skills-hub/web` |
| 上传文件目录 | `/data/skills-hub/uploads/` |
| API 标准输出日志 | `/data/skills-hub/logs/out.log` |
| API 错误日志 | `/data/skills-hub/logs/error.log` |
| systemd 服务文件 | `/etc/systemd/system/platform-api.service` |
| Nginx 主配置 | `/usr/local/nginx/conf/nginx.conf` |
| Node.js 二进制 | `/usr/local/node-v20.19.2-linux-x64-glibc-217/bin/node` |
