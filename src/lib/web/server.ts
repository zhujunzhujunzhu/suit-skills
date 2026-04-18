import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { CliContext } from '../../cli/context.js';
import { moduleDir } from '../../utils/module.js';
import {
  addWebSource,
  exportWebInstalledSkill,
  getWebSkillDetail,
  installWebSkill,
  listWebInstalledSkills,
  listWebSkills,
  listWebSources,
  removeWebSource,
  removeWebInstalledSkill,
  toApiErrorPayload,
  updateWebSource,
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

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > 1024 * 1024) {
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

    if (req.method === 'GET' && url.pathname === '/api/sources') {
      sendJson(res, 200, listWebSources(ctx));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/sources') {
      sendJson(res, 200, addWebSource(ctx, (await readJsonBody(req)) as never));
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
    resolve(process.cwd(), 'web', 'dist'),
    resolve(process.cwd(), 'dist', 'web'),
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

  return new Promise((resolvePromise, reject) => {
    const server = createWebServer(ctx, options);
    server.once('error', reject);
    server.listen(requestedPort, host, () => {
      const address = server.address();
      const port =
        typeof address === 'object' && address !== null
          ? address.port
          : requestedPort;
      server.off('error', reject);
      resolvePromise({
        server,
        host,
        port,
        url: `http://${host}:${port}`,
      });
    });
  });
}
