import type { IncomingMessage, ServerResponse } from 'node:http';
import type { PlatformApiConfig } from './types.js';

const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
const MAX_JSON_BODY_BYTES = 1024 * 1024;

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

export interface UploadedFile {
  fieldName: string;
  fileName: string;
  contentType: string;
  content: Buffer;
}

export interface MultipartBody {
  fields: Record<string, string>;
  files: UploadedFile[];
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function sendJson(
  res: ServerResponse,
  status: number,
  payload: unknown,
): void {
  res.writeHead(status, {
    'content-type': JSON_CONTENT_TYPE,
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

export function errorBody(code: string, message: string): ApiErrorBody {
  return { error: { code, message } };
}

export function parseCorsOrigins(value: string | undefined): string[] {
  if (!value || value.trim() === '') return ['*'];
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function applyCors(
  req: IncomingMessage,
  res: ServerResponse,
  config: PlatformApiConfig,
): void {
  const requestOrigin = req.headers.origin;
  const allowAll = config.corsOrigins.includes('*');
  const allowedOrigin =
    allowAll || !requestOrigin || config.corsOrigins.includes(requestOrigin)
      ? requestOrigin ?? '*'
      : config.corsOrigins[0];

  res.setHeader('access-control-allow-origin', allowedOrigin);
  res.setHeader('access-control-allow-credentials', 'true');
  res.setHeader('vary', 'Origin');
  res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type, authorization');
}

export function requestUrl(req: IncomingMessage, config: PlatformApiConfig): URL {
  const host = req.headers.host ?? `${config.host}:${config.port}`;
  return new URL(req.url ?? '/', `http://${host}`);
}

export function normalizeResourcePath(pathname: string): string {
  if (pathname.startsWith('/api/reviews')) {
    return `/api/evaluations${pathname.slice('/api/reviews'.length)}`;
  }
  return pathname;
}

export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_JSON_BODY_BYTES) {
      throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body too large');
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ApiError(400, 'INVALID_JSON', `Invalid JSON body: ${message}`);
  }
}

async function readBodyBuffer(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_JSON_BODY_BYTES * 25) {
      throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body too large');
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}

export async function readMultipartBody(
  req: IncomingMessage,
): Promise<MultipartBody> {
  const contentType = req.headers['content-type'] ?? '';
  const boundaryMatch = String(contentType).match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) {
    throw new ApiError(400, 'INVALID_MULTIPART', 'multipart/form-data boundary is required');
  }

  const boundary = boundaryMatch[1] ?? boundaryMatch[2]!;
  const body = await readBodyBuffer(req);
  const delimiter = Buffer.from(`--${boundary}`);
  const fields: Record<string, string> = {};
  const files: UploadedFile[] = [];
  let cursor = 0;

  while (cursor < body.length) {
    const boundaryIndex = body.indexOf(delimiter, cursor);
    if (boundaryIndex < 0) break;
    cursor = boundaryIndex + delimiter.length;
    if (body.subarray(cursor, cursor + 2).toString() === '--') break;
    if (body.subarray(cursor, cursor + 2).toString() === '\r\n') cursor += 2;

    const headerEnd = body.indexOf(Buffer.from('\r\n\r\n'), cursor);
    if (headerEnd < 0) break;
    const headersText = body.subarray(cursor, headerEnd).toString('utf8');
    cursor = headerEnd + 4;
    const nextBoundary = body.indexOf(delimiter, cursor);
    if (nextBoundary < 0) break;
    let content = body.subarray(cursor, nextBoundary);
    if (content.subarray(content.length - 2).toString() === '\r\n') {
      content = content.subarray(0, content.length - 2);
    }
    cursor = nextBoundary;

    const disposition = headersText.match(/content-disposition:\s*form-data;([^\r\n]+)/i)?.[1] ?? '';
    const name = disposition.match(/name="([^"]+)"/)?.[1] ?? '';
    const fileName = disposition.match(/filename="([^"]*)"/)?.[1];
    const partContentType =
      headersText.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() ?? 'application/octet-stream';
    if (!name) continue;
    if (fileName !== undefined && fileName !== '') {
      files.push({
        fieldName: name,
        fileName,
        contentType: partContentType,
        content: Buffer.from(content),
      });
    } else {
      fields[name] = content.toString('utf8');
    }
  }

  return { fields, files };
}
