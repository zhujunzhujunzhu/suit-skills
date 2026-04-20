# 端口占用自动重试功能

## 问题描述

当前 `suit-skills web` 命令启动时，如果指定端口（默认 4587）被占用，会直接抛出错误：

```
EADDRINUSE: address already in use 127.0.0.1:4587
```

用户体验较差，需要手动查找可用端口并重新指定。

## 需求目标

启动时检测端口占用，自动尝试 +1 递增的下一个端口，直到找到可用端口为止。

## 技术细节

| 项目 | 说明 |
|------|------|
| 涉及文件 | `src/lib/web/server.ts`（`startWebServer` 函数）、`src/commands/web.ts`（CLI 命令） |
| 默认端口 | 4587 |
| 重试策略 | 端口 +1 递增 |
| 最大重试次数 | 3 次 |
| 用户指定端口 | `--port` 显式指定时也启用自动 +1 重试 |

## 期望行为

1. 尝试在请求的端口启动服务
2. 如果收到 `EADDRINUSE` 错误：
   - 尝试 `port + 1`
   - 继续递增直到找到可用端口或达到最大重试次数
3. 如果超过最大重试次数仍失败，抛出错误
4. 启动成功后告知用户实际使用的端口

## 用户提示示例

```
✓ Suit Skills Web started
Local: http://127.0.0.1:4589
(端口 4587 被占用，已自动尝试到 4589)
```

## 边界情况

- 最大尝试 3 次（即最多试到 `requestedPort + 2`）
- 不超过端口范围上限 65535
- 仅对 `EADDRINUSE` 错误进行重试，其他错误直接抛出

## 实现方案

### 修改 `src/lib/web/server.ts`

```typescript
export function startWebServer(
  ctx: CliContext,
  options: WebServerOptions = {},
): Promise<StartedWebServer> {
  const host = options.host ?? '127.0.0.1';
  const requestedPort = options.port ?? 4587;
  const maxAttempts = 3;

  return new Promise((resolvePromise, rejectPromise) => {
    let attempt = 0;
    let currentPort = requestedPort;

    const tryListen = () => {
      const server = createWebServer(ctx, options);
      
      server.once('error', (error: NodeJS.ErrnoException) => {
        if (
          error.code === 'EADDRINUSE' &&
          attempt < maxAttempts &&
          currentPort < 65535
        ) {
          attempt++;
          currentPort++;
          server.close();
          tryListen();
        } else {
          rejectPromise(error);
        }
      });

      server.listen(currentPort, host, () => {
        const address = server.address();
        const port =
          typeof address === 'object' && address !== null
            ? address.port
            : currentPort;
        resolvePromise({
          server,
          host,
          port,
          url: `http://${host}:${port}`,
          attemptedPort: requestedPort,
          attempts: attempt + 1,
        });
      });
    };

    tryListen();
  });
}
```

### 修改 `src/commands/web.ts`

```typescript
.action(
  async (opts: {
    host: string;
    port: number;
    source?: string;
    open?: boolean;
  }) => {
    const started = await startWebServer(ctx, {
      host: opts.host,
      port: opts.port,
      source: opts.source,
    });
    success('Suit Skills Web started');
    console.log(`Local: ${started.url}`);
    if (started.attempts > 1) {
      console.log(`(端口 ${started.attemptedPort} 被占用，已自动尝试到 ${started.port})`);
    }
    if (opts.open !== false) {
      openBrowser(started.url);
    }
  },
);
```

## 测试用例

| 场景 | 预期结果 |
|------|----------|
| 默认端口 4587 可用 | 直接在 4587 启动，无额外提示 |
| 4587 被占用，4588 可用 | 在 4588 启动，提示"端口 4587 被占用，已自动尝试到 4588" |
| 4587、4588 被占用，4589 可用 | 在 4589 启动，提示"端口 4587 被占用，已自动尝试到 4589" |
| 4587、4588、4589 都被占用 | 启动失败，抛出 EADDRINUSE 错误 |
| 用户指定 `--port 8080`，8080 被占用 | 在 8081 启动，提示"端口 8080 被占用，已自动尝试到 8081" |

## 实现优先级

- [x] 修改 `startWebServer` 函数，支持端口重试
- [x] 修改 `web` 命令，显示端口重试提示信息
- [x] 修改 `scripts/dev-web.mjs`，支持开发环境端口自动重试
- [x] 修改 `web/vite.config.ts`，支持动态 API 端口配置
- [x] 测试用例验证

## 实现状态

✅ **已完成**

### 生产环境
- 后端 server 支持端口自动 +1 重试（最多 3 次）
- 前端使用相对路径 API，自动跟随后端端口
- 启动成功后显示提示信息

### 开发环境
- `scripts/dev-web.mjs` 先启动后端，获取实际端口后启动 Vite
- `web/vite.config.ts` 从环境变量 `SUIT_SKILLS_API_PORT` 读取 API 端口
- Vite 代理自动连接到正确的后端端口
