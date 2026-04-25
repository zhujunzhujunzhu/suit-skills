import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { CliContext } from '../../cli/context.js';
import { moduleDir } from '@suit-skills/core';
import {
  fetchDesktopReleaseManifest,
  fetchDesktopReleaseManifestText,
} from './desktop-release-manifest.js';
import {
  addWebInstallTarget,
  addWebSource,
  applyWebInstalledSkillAiEdit,
  copyWebInstalledSkillPackage,
  generateWebInstalledSkillAiEdit,
  getWebAiEditConfig,
  exportWebInstalledSkill,
  getWebSettings,
  getWebInstalledSkillFileContent,
  getWebInstalledSkillFileTree,
  getWebSkillDetail,
  getWebSkillFileContent,
  getWebSkillFileTree,
  getWebTranslationConfig,
  installWebSkill,
  linkWebInstalledSkillToTargets,
  listWebInstallTargets,
  listWebInstalledSkills,
  listWebSkills,
  listWebSources,
  removeWebInstallTarget,
  removeWebSource,
  removeWebInstalledSkill,
  resetWebInstalledSkill,
  resetWebInstalledSkillFile,
  saveWebInstalledSkillFile,
  restoreWebBuiltinSources,
  toApiErrorPayload,
  translateWebText,
  updateWebSettings,
  updateWebAiEditConfig,
  updateWebInstallTarget,
  updateWebSource,
  updateWebTranslationConfig,
  WebApiError,
} from './api.js';

export interface WebServerOptions {
  host?: string;
  port?: number;
  source?: string;
  assetRoot?: string;
}

export interface StartedWebServer {
  server: ReturnType<typeof createServer>;
  url: string;
  host: string;
  port: number;
  /** 初始请求的端口 */
  requestedPort?: number;
  /** 尝试次数（1 表示一次成功） */
  attempts?: number;
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function sendText(
  res: ServerResponse,
  status: number,
  text: string,
  contentType = 'text/plain; charset=utf-8',
): void {
  res.writeHead(status, { 'content-type': contentType });
  res.end(text);
}

const DEFAULT_JSON_BODY_MAX_BYTES = 1024 * 1024;
/** 翻译请求可能携带整份 SKILL.md，单独放宽上限（其余 API 仍用默认 1MB） */
const TRANSLATE_JSON_BODY_MAX_BYTES = 8 * 1024 * 1024;

async function readJsonBody(
  req: IncomingMessage,
  maxBytes = DEFAULT_JSON_BODY_MAX_BYTES,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) {
      throw new WebApiError('PAYLOAD_TOO_LARGE', 'Request body too large', 413);
    }
    chunks.push(buf);
  }
  if (chunks.length === 0) {
    return {};
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new WebApiError('INVALID_JSON', `Invalid JSON body: ${message}`, 400);
  }
}

function routeParam(pathname: string, prefix: string): string | null {
  if (!pathname.startsWith(prefix)) return null;
  const raw = pathname.slice(prefix.length).split('/')[0];
  if (!raw) return null;
  return decodeURIComponent(raw);
}

async function handleApi(
  ctx: CliContext,
  options: WebServerOptions,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  try {
    if (req.method === 'GET' && url.pathname === '/api/health') {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/desktop/latest-release') {
      const body = await fetchDesktopReleaseManifestText();
      if (body === null) {
        sendJson(res, 502, {
          error: {
            code: 'UPSTREAM_FAILED',
            message: 'Could not fetch desktop release manifest from upstream',
          },
        });
        return;
      }
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=120',
      });
      res.end(body);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/desktop/download') {
      const platform = url.searchParams.get('platform');
      if (
        platform !== 'windows-x86_64' &&
        platform !== 'darwin-aarch64' &&
        platform !== 'darwin-x86_64'
      ) {
        sendJson(res, 400, {
          error: {
            code: 'INVALID_PLATFORM',
            message: 'Unsupported desktop download platform',
          },
        });
        return;
      }

      const manifest = await fetchDesktopReleaseManifest();
      const asset = manifest?.platforms[platform];
      if (!asset) {
        sendJson(res, 404, {
          error: {
            code: 'ASSET_NOT_FOUND',
            message: `No desktop asset found for platform "${platform}"`,
          },
        });
        return;
      }

      let upstream: Response;
      try {
        upstream = await fetch(asset.url, {
          redirect: 'follow',
          headers: {
            accept: 'application/octet-stream, */*',
            'user-agent': 'Suit-Skills-Web',
          },
        });
      } catch {
        sendJson(res, 502, {
          error: {
            code: 'UPSTREAM_FAILED',
            message: 'Could not download desktop asset from upstream',
          },
        });
        return;
      }

      if (!upstream.ok || !upstream.body) {
        sendJson(res, 502, {
          error: {
            code: 'UPSTREAM_FAILED',
            message: 'Could not download desktop asset from upstream',
          },
        });
        return;
      }

      const headers: Record<string, string> = {
        'content-type':
          upstream.headers.get('content-type') || 'application/octet-stream',
        'content-disposition':
          `attachment; filename="${asset.filename}"; filename*=UTF-8''${encodeURIComponent(asset.filename)}`,
        'cache-control': 'no-store',
      };
      const contentLength = upstream.headers.get('content-length');
      if (contentLength) {
        headers['content-length'] = contentLength;
      }

      res.writeHead(200, headers);
      await pipeline(
        Readable.fromWeb(upstream.body as globalThis.ReadableStream<Uint8Array>),
        res,
      );
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/settings') {
      sendJson(res, 200, getWebSettings(ctx));
      return;
    }

    if (req.method === 'PATCH' && url.pathname === '/api/settings') {
      sendJson(res, 200, updateWebSettings(ctx, (await readJsonBody(req)) as never));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/sources') {
      sendJson(res, 200, listWebSources(ctx));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/sources') {
      sendJson(res, 200, addWebSource(ctx, (await readJsonBody(req)) as never));
      return;
    }

    if (
      req.method === 'POST' &&
      url.pathname === '/api/sources/restore-builtins'
    ) {
      sendJson(res, 200, restoreWebBuiltinSources(ctx));
      return;
    }

    const sourceName = routeParam(url.pathname, '/api/sources/');
    if (sourceName && req.method === 'DELETE') {
      sendJson(res, 200, removeWebSource(ctx, sourceName));
      return;
    }

    if (sourceName && req.method === 'PATCH') {
      sendJson(
        res,
        200,
        updateWebSource(ctx, sourceName, (await readJsonBody(req)) as never),
      );
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/install-targets') {
      sendJson(res, 200, listWebInstallTargets(ctx));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/install-targets') {
      sendJson(res, 200, addWebInstallTarget(ctx, (await readJsonBody(req)) as never));
      return;
    }

    const installTargetId = routeParam(url.pathname, '/api/install-targets/');
    if (installTargetId && req.method === 'PATCH') {
      sendJson(
        res,
        200,
        updateWebInstallTarget(
          ctx,
          installTargetId,
          (await readJsonBody(req)) as never,
        ),
      );
      return;
    }

    if (installTargetId && req.method === 'DELETE') {
      sendJson(res, 200, removeWebInstallTarget(ctx, installTargetId));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/skills') {
      sendJson(
        res,
        200,
        listWebSkills(ctx, {
          source: url.searchParams.get('source') ?? options.source,
          q: url.searchParams.get('q') ?? undefined,
          tag: url.searchParams.get('tag') ?? undefined,
          refresh: url.searchParams.get('refresh') === 'true',
        }),
      );
      return;
    }

    // /api/skills/:name/files  和  /api/skills/:name/files/:filePath
    const skillFilesMatch = req.method === 'GET'
      ? url.pathname.match(/^\/api\/skills\/([^/]+)\/files(\/.*)?$/)
      : null;
    if (skillFilesMatch) {
      const sName = decodeURIComponent(skillFilesMatch[1]!);
      const rawFilePath = skillFilesMatch[2];
      const sourceOpt = { source: url.searchParams.get('source') ?? options.source ?? undefined };
      if (rawFilePath) {
        const filePath = decodeURIComponent(rawFilePath.slice(1));
        sendJson(res, 200, getWebSkillFileContent(ctx, sName, filePath, sourceOpt));
      } else {
        sendJson(res, 200, getWebSkillFileTree(ctx, sName, sourceOpt));
      }
      return;
    }

    const skillName = routeParam(url.pathname, '/api/skills/');
    if (req.method === 'GET' && skillName) {
      sendJson(
        res,
        200,
        getWebSkillDetail(ctx, skillName, {
          source: url.searchParams.get('source') ?? options.source,
        }),
      );
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/translation-config') {
      sendJson(res, 200, getWebTranslationConfig(ctx));
      return;
    }

    if (req.method === 'PATCH' && url.pathname === '/api/translation-config') {
      sendJson(res, 200, updateWebTranslationConfig(ctx, (await readJsonBody(req)) as never));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/ai-edit-config') {
      sendJson(res, 200, getWebAiEditConfig(ctx));
      return;
    }

    if (req.method === 'PATCH' && url.pathname === '/api/ai-edit-config') {
      sendJson(res, 200, updateWebAiEditConfig(ctx, (await readJsonBody(req)) as never));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/translate') {
      sendJson(
        res,
        200,
        await translateWebText(ctx, (await readJsonBody(req, TRANSLATE_JSON_BODY_MAX_BYTES)) as never),
      );
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/installed') {
      sendJson(
        res,
        200,
        listWebInstalledSkills(ctx, {
          scope: url.searchParams.get('scope') ?? undefined,
          target:
            url.searchParams.get('target') ??
            url.searchParams.get('agent') ??
            undefined,
          q: url.searchParams.get('q') ?? undefined,
        }),
      );
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/install') {
      sendJson(res, 200, installWebSkill(ctx, (await readJsonBody(req)) as never));
      return;
    }

    const resetFileMatch =
      req.method === 'POST'
        ? url.pathname.match(/^\/api\/installed\/([^/]+)\/reset-file$/)
        : null;
    if (resetFileMatch) {
      const sName = decodeURIComponent(resetFileMatch[1]!);
      const body = (await readJsonBody(req)) as {
        target?: string;
        scope?: 'project' | 'global';
        filePath?: string;
      };
      sendJson(
        res,
        200,
        resetWebInstalledSkillFile(ctx, sName, {
          target: body.target ?? '',
          scope: body.scope,
          filePath: body.filePath ?? '',
        }),
      );
      return;
    }

    const resetSkillMatch =
      req.method === 'POST'
        ? url.pathname.match(/^\/api\/installed\/([^/]+)\/reset-skill$/)
        : null;
    if (resetSkillMatch) {
      const sName = decodeURIComponent(resetSkillMatch[1]!);
      const body = (await readJsonBody(req)) as {
        target?: string;
        scope?: 'project' | 'global';
      };
      sendJson(
        res,
        200,
        resetWebInstalledSkill(ctx, sName, {
          target: body.target ?? '',
          scope: body.scope,
        }),
      );
      return;
    }

    const aiEditMatch =
      req.method === 'POST'
        ? url.pathname.match(/^\/api\/installed\/([^/]+)\/ai-edit$/)
        : null;
    if (aiEditMatch) {
      const sName = decodeURIComponent(aiEditMatch[1]!);
      const body = (await readJsonBody(req)) as {
        target?: string;
        scope?: 'project' | 'global';
        mode?: 'file' | 'skill';
        filePath?: string;
        prompt?: string;
      };
      sendJson(
        res,
        200,
        await generateWebInstalledSkillAiEdit(ctx, sName, {
          target: body.target ?? '',
          scope: body.scope,
          mode: body.mode === 'skill' ? 'skill' : 'file',
          filePath: body.filePath,
          prompt: body.prompt ?? '',
        }),
      );
      return;
    }

    const applyAiEditMatch =
      req.method === 'POST'
        ? url.pathname.match(/^\/api\/installed\/([^/]+)\/apply-ai-edit$/)
        : null;
    if (applyAiEditMatch) {
      const sName = decodeURIComponent(applyAiEditMatch[1]!);
      const body = (await readJsonBody(req)) as {
        target?: string;
        scope?: 'project' | 'global';
        files?: Array<{ path?: string; content?: string }>;
      };
      sendJson(
        res,
        200,
        applyWebInstalledSkillAiEdit(ctx, sName, {
          target: body.target ?? '',
          scope: body.scope,
          files:
            body.files?.map((file) => ({
              path: file.path ?? '',
              content: file.content ?? '',
            })) ?? [],
        }),
      );
      return;
    }

    const installedFilesMatch =
      req.method === 'GET' || req.method === 'PUT'
        ? url.pathname.match(/^\/api\/installed\/([^/]+)\/files(\/.*)?$/)
        : null;
    if (installedFilesMatch) {
      const sName = decodeURIComponent(installedFilesMatch[1]!);
      const rawFilePath = installedFilesMatch[2];
      if (req.method === 'GET') {
        const target = url.searchParams.get('target') ?? undefined;
        const scope = url.searchParams.get('scope') ?? undefined;
        if (rawFilePath) {
          const filePath = decodeURIComponent(rawFilePath.slice(1));
          sendJson(
            res,
            200,
            getWebInstalledSkillFileContent(ctx, sName, filePath, {
              target: target ?? '',
              scope: scope === 'global' ? 'global' : 'project',
            }),
          );
        } else {
          sendJson(
            res,
            200,
            getWebInstalledSkillFileTree(ctx, sName, {
              target: target ?? '',
              scope: scope === 'global' ? 'global' : 'project',
            }),
          );
        }
        return;
      }

      if (!rawFilePath) {
        sendJson(res, 404, {
          error: { code: 'NOT_FOUND', message: 'API route not found' },
        });
        return;
      }

      const filePath = decodeURIComponent(rawFilePath.slice(1));
      const body = (await readJsonBody(req)) as {
        target?: string;
        scope?: 'project' | 'global';
        content?: unknown;
      };
      sendJson(
        res,
        200,
        saveWebInstalledSkillFile(ctx, sName, filePath, {
          target: body.target ?? '',
          scope: body.scope,
          content: body.content as string,
        }),
      );
      return;
    }

    const installedName = routeParam(url.pathname, '/api/installed/');
    if (req.method === 'DELETE' && installedName) {
      sendJson(
        res,
        200,
        removeWebInstalledSkill(
          ctx,
          installedName,
          (await readJsonBody(req)) as never,
        ),
      );
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/installed/export') {
      const zip = exportWebInstalledSkill(
        ctx,
        (await readJsonBody(req)) as never,
      );
      res.writeHead(200, {
        'content-type': zip.contentType,
        'content-disposition': `attachment; filename="${zip.fileName}"`,
        'cache-control': 'no-store',
      });
      res.end(zip.body);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/installed/copy-package') {
      sendJson(
        res,
        200,
        copyWebInstalledSkillPackage(ctx, (await readJsonBody(req)) as never),
      );
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/installed/link-targets') {
      sendJson(
        res,
        200,
        linkWebInstalledSkillToTargets(ctx, (await readJsonBody(req)) as never),
      );
      return;
    }

    sendJson(res, 404, {
      error: { code: 'NOT_FOUND', message: 'API route not found' },
    });
  } catch (error) {
    const { status, payload } = toApiErrorPayload(error);
    sendJson(res, status, payload);
  }
}

function defaultAssetCandidates(): string[] {
  const here = moduleDir(import.meta.url);
  return [
    resolve(process.cwd(), 'dist', 'web'),
    resolve(process.cwd(), 'apps', 'local-web', 'dist'),
    resolve(here, '..', '..', '..', '..', '..', 'dist', 'web'),
    resolve(here, '..', '..', 'web'),
  ];
}

export function resolveWebAssetRoot(assetRoot?: string): string | null {
  const candidates = assetRoot ? [assetRoot] : defaultAssetCandidates();
  for (const candidate of candidates) {
    const indexPath = join(candidate, 'index.html');
    if (existsSync(indexPath)) {
      return candidate;
    }
  }
  return null;
}

function isInside(parent: string, child: string): boolean {
  const rel = normalize(child).slice(normalize(parent).length);
  return rel === '' || rel.startsWith(sep);
}

function serveStatic(
  assetRoot: string | null,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): void {
  if (!assetRoot) {
    sendText(
      res,
      503,
      [
        '<!doctype html>',
        '<meta charset="utf-8">',
        '<title>Suit Skills Web</title>',
        '<body style="font-family: system-ui; background: #111316; color: #e2e2e6; padding: 32px">',
        '<h1>Suit Skills Web assets are not built</h1>',
        '<p>Run <code>npm run build:web</code> or <code>npm run build:all</code>, then start <code>suit-skills web</code> again.</p>',
        '</body>',
      ].join(''),
      'text/html; charset=utf-8',
    );
    return;
  }

  const pathname = decodeURIComponent(url.pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
  let filePath = resolve(assetRoot, relative);
  if (!isInside(assetRoot, filePath)) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(assetRoot, 'index.html');
  }

  const ext = extname(filePath);
  res.writeHead(200, {
    'content-type': MIME_TYPES[ext] ?? 'application/octet-stream',
  });
  createReadStream(filePath).pipe(res);
}

export function createWebServer(
  ctx: CliContext,
  options: WebServerOptions = {},
): ReturnType<typeof createServer> {
  const assetRoot = resolveWebAssetRoot(options.assetRoot);
  return createServer((req, res) => {
    const host = req.headers.host ?? `${options.host ?? '127.0.0.1'}:${options.port ?? 4587}`;
    const url = new URL(req.url ?? '/', `http://${host}`);
    if (url.pathname.startsWith('/api/')) {
      void handleApi(ctx, options, req, res, url);
      return;
    }
    serveStatic(assetRoot, req, res, url);
  });
}

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
          requestedPort,
          attempts: attempt + 1,
        });
      });
    };

    tryListen();
  });
}
